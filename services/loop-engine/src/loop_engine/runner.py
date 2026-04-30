"""Loop runner — polls the task queue and dispatches Ralph Loop sessions."""

from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from loop_engine.config import LoopConfig
from loop_engine.dead_letter import DeadLetterQueue
from loop_engine.heartbeat import HeartbeatReporter

logger = logging.getLogger(__name__)


class LoopRunner:
    """Polls for pending tasks and dispatches them to Claude Code."""

    def __init__(self, config: LoopConfig | None = None) -> None:
        self.config = config or LoopConfig.from_env()
        self.config.log_dir.mkdir(parents=True, exist_ok=True)
        self._dlq = DeadLetterQueue(self.config.log_dir.parent / "dead_letter.db")
        self._retry_counts: dict[str, int] = {}
        self._task_guidance: dict[str, list[str]] = {}
        self._running = True
        self._current_backoff = self.config.poll_interval

    def run(self) -> None:
        """Main loop: poll -> pick up -> execute -> report. Runs until stopped."""
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

        logger.info(
            "Loop runner started  backend=%s  repo=%s  poll=%ds",
            self.config.backend_url,
            self.config.repo_dir,
            self.config.poll_interval,
        )

        while self._running:
            try:
                task = self._poll_queue()
                if task:
                    self._current_backoff = self.config.poll_interval
                    self._process_task(task)
                else:
                    self._current_backoff = self.config.poll_interval
            except Exception:
                logger.exception("Poll cycle error")
                self._current_backoff = min(self._current_backoff * 2, self.config.max_backoff)
                logger.info("Backing off for %ds", self._current_backoff)

            if self._running:
                time.sleep(self._current_backoff)

        logger.info("Loop runner stopped gracefully")
        self._dlq.close()

    def _handle_signal(self, signum: int, _frame: object) -> None:
        sig_name = signal.Signals(signum).name
        logger.info("Received %s, shutting down...", sig_name)
        self._running = False

    def _poll_queue(self) -> dict | None:
        """Fetch the first pending task from the voice pipeline queue."""
        url = f"{self.config.backend_url}/api/loop/queue"
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
                if data and isinstance(data, list):
                    for task in data:
                        task_ref = self._task_ref_from_payload(task)
                        if not task_ref:
                            continue
                        if self._dlq.contains(task_ref):
                            logger.debug("Skipping %s (in dead-letter queue)", task_ref)
                            continue
                        return task
        except urllib.error.URLError:
            logger.debug("Backend unreachable at %s", url)
        except Exception:
            logger.exception("Failed to poll queue")
        return None

    def _process_task(self, task: dict) -> None:
        """Execute the Ralph Loop for a single task ref."""
        task_ref = self._task_ref_from_payload(task) or "unknown"
        summary = str(task.get("summary", ""))
        logger.info("Processing task: %s — %s", task_ref, summary)

        self._notify_started(task_ref)

        session_id = f"ralph-{task_ref}-{uuid.uuid4().hex[:8]}"
        heartbeat = HeartbeatReporter(
            self.config.monitor_url,
            session_id,
            self.config.heartbeat_interval,
            self.config.api_token,
        )
        heartbeat.start()
        run_env = os.environ.copy()
        run_env["CLAUDE_SESSION_ID"] = session_id
        run_env.setdefault("SEJFA_MONITOR_API_URL", self.config.monitor_url)
        run_env.setdefault("SEJFA_MONITOR_URL", self.config.monitor_url)
        run_env.setdefault("MONITOR_URL", self.config.monitor_url)
        if self.config.api_token:
            run_env.setdefault("SEJFA_LOCAL_API_TOKEN", self.config.api_token)
            run_env.setdefault("MONITOR_API_SECRET", self.config.api_token)

        log_file = self.config.log_dir / f"{task_ref}.log"
        outcome = "failed"
        error_msg = ""
        retry_requested = False
        abort_requested = False

        try:
            prompt = self._build_start_prompt(task_ref)
            with log_file.open("w", encoding="utf-8") as log_handle:
                process = subprocess.Popen(
                    ["claude", "--print", prompt],
                    cwd=self.config.repo_dir,
                    stdout=log_handle,
                    stderr=subprocess.STDOUT,
                    text=True,
                    env=run_env,
                    start_new_session=True,
                )

                while process.poll() is None and self._running:
                    signals = self._poll_session_signals(session_id)
                    if signals:
                        retry_requested = retry_requested or bool(signals.get("retry"))
                        if signals.get("instruction"):
                            self._queue_task_guidance(task_ref, str(signals["instruction"]))
                        if signals.get("clarify"):
                            clarification = signals["clarify"]
                            note = (
                                str(clarification)
                                if isinstance(clarification, str)
                                else "Clarification requested by operator."
                            )
                            self._queue_task_guidance(task_ref, f"Clarification: {note}")
                        if signals.get("abort"):
                            abort_requested = True
                            self._terminate_process(process)
                            break

                    time.sleep(self.config.signal_poll_interval)

                if process.poll() is None:
                    self._terminate_process(process)

                process.wait(timeout=15)

            output = log_file.read_text(encoding="utf-8")

            if abort_requested:
                outcome = "aborted"
                error_msg = "Aborted by operator"
                logger.warning("Task %s aborted by operator", task_ref)
            elif process.returncode == 0 and "<result>DONE</result>" in output:
                outcome = "done"
                self._retry_counts.pop(task_ref, None)
                self._task_guidance.pop(task_ref, None)
                logger.info("Task %s completed successfully", task_ref)
            elif "<result>BLOCKED" in output:
                outcome = "blocked"
                error_msg = "BLOCKED by Claude Code"
                logger.warning("Task %s blocked: %s", task_ref, error_msg)
                self._handle_failure(task_ref, summary, error_msg)
            else:
                outcome = "failed"
                error_msg = f"exit_code={process.returncode}"
                logger.warning("Task %s failed: %s", task_ref, error_msg)
                self._handle_failure(task_ref, summary, error_msg)

        except subprocess.TimeoutExpired:
            outcome = "failed"
            error_msg = "Execution timeout"
            logger.error("Task %s timed out", task_ref)
            self._handle_failure(task_ref, summary, error_msg)
        except FileNotFoundError:
            outcome = "failed"
            error_msg = "claude CLI not found"
            logger.error("claude command not found — is Claude Code installed?")
            self._handle_failure(task_ref, summary, error_msg)
        except Exception as exc:
            outcome = "failed"
            error_msg = str(exc)
            logger.exception("Unexpected error processing %s", task_ref)
            self._handle_failure(task_ref, summary, error_msg)
        finally:
            heartbeat.stop()
            self._post_session_outcome(session_id, task_ref, outcome, error_msg or None)
            self._notify_completed(task_ref, outcome == "done")
            if retry_requested and outcome in {"failed", "blocked"}:
                self._request_retry(task_ref)

    def _task_ref_from_payload(self, payload: dict) -> str | None:
        task_ref = payload.get("task_ref") or payload.get("key")
        return str(task_ref) if isinstance(task_ref, str) and task_ref else None

    def _build_start_prompt(self, task_ref: str) -> str:
        guidance = self._task_guidance.get(task_ref, [])
        if not guidance:
            return f"/start-task {task_ref}"

        notes = "\n".join(f"- {line}" for line in guidance)
        return f"/start-task {task_ref}\n\nOperator notes for the next safe boundary:\n{notes}"

    def _queue_task_guidance(self, task_ref: str, note: str) -> None:
        normalized = note.strip()
        if not normalized:
            return
        bucket = self._task_guidance.setdefault(task_ref, [])
        if normalized not in bucket:
            bucket.append(normalized)
            logger.info("Queued operator guidance for %s", task_ref)

    def _poll_session_signals(self, session_id: str) -> dict[str, object]:
        url = f"{self.config.monitor_url.rstrip('/')}/sessions/{session_id}/signals"
        try:
            req = urllib.request.Request(url, headers=self._auth_headers(), method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read())
                return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _terminate_process(self, process: subprocess.Popen[str]) -> None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=10)
        except Exception:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except Exception:
                pass

    def _handle_failure(self, task_ref: str, summary: str, error: str) -> None:
        """Track retries and move to the dead-letter queue if exhausted."""
        count = self._retry_counts.get(task_ref, 0) + 1
        self._retry_counts[task_ref] = count

        if count >= self.config.max_retries:
            logger.warning("Moving %s to dead-letter queue after %d attempts", task_ref, count)
            self._dlq.add(task_ref, summary, count, error)
            self._retry_counts.pop(task_ref, None)
        else:
            logger.info(
                "Task %s failed (attempt %d/%d), will remain retryable",
                task_ref,
                count,
                self.config.max_retries,
            )

    def _notify_started(self, task_ref: str) -> None:
        """Tell the voice pipeline that we're starting this task."""
        self._post(
            f"{self.config.backend_url}/api/loop/started",
            {"task_ref": task_ref},
        )

    def _notify_completed(self, task_ref: str, success: bool) -> None:
        """Tell the voice pipeline that we're done with this task."""
        self._post(
            f"{self.config.backend_url}/api/loop/completed",
            {"task_ref": task_ref, "success": success},
        )

    def _request_retry(self, task_ref: str) -> None:
        """Reset a failed or blocked task back to pending after operator retry."""
        encoded_ref = urllib.parse.quote(task_ref, safe="")
        self._post(
            f"{self.config.backend_url}/api/loop/retry/{encoded_ref}",
            {},
        )

    def _post_session_outcome(
        self, session_id: str, task_ref: str, outcome: str, details: str | None = None
    ) -> None:
        """Persist the explicit runner-reported outcome in the monitor API."""
        payload = {"task_ref": task_ref, "outcome": outcome}
        if details:
            payload["details"] = details

        self._post(
            f"{self.config.monitor_url.rstrip('/')}/sessions/{session_id}/outcome",
            payload,
        )

    def _post(self, url: str, data: dict[str, object]) -> None:
        """Fire-and-forget POST to backend services."""
        payload = json.dumps(data).encode()
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json", **self._auth_headers()},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5):
                pass
        except Exception:
            logger.debug("POST to %s failed (non-fatal)", url)

    def _auth_headers(self) -> dict[str, str]:
        if not self.config.api_token:
            return {}
        return {"Authorization": f"Bearer {self.config.api_token}"}


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(levelname)s %(name)s — %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    runner = LoopRunner()
    runner.run()


if __name__ == "__main__":
    main()
