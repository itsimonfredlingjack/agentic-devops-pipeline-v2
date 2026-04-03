"""Loop runner — polls voice pipeline queue and dispatches Ralph Loop tasks.

Replaces the original 65-line loop-runner.sh with Python for proper error
handling, exponential backoff, dead-letter queue, and heartbeat reporting.
"""

from __future__ import annotations

import json
import logging
import signal
import subprocess
import time
import urllib.error
import urllib.request
import uuid

from loop_engine.config import LoopConfig
from loop_engine.dead_letter import DeadLetterQueue
from loop_engine.heartbeat import HeartbeatReporter

logger = logging.getLogger(__name__)


class LoopRunner:
    """Polls for pending tickets and dispatches them to Claude Code."""

    def __init__(self, config: LoopConfig | None = None) -> None:
        self.config = config or LoopConfig.from_env()
        self.config.log_dir.mkdir(parents=True, exist_ok=True)
        self._dlq = DeadLetterQueue(self.config.log_dir.parent / "dead_letter.db")
        self._retry_counts: dict[str, int] = {}
        self._running = True
        self._current_backoff = self.config.poll_interval

    def run(self) -> None:
        """Main loop: poll → pick up → execute → report. Runs until stopped."""
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
                ticket = self._poll_queue()
                if ticket:
                    self._current_backoff = self.config.poll_interval
                    self._process_ticket(ticket)
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
        """Fetch the first pending ticket from the voice pipeline queue."""
        url = f"{self.config.backend_url}/api/loop/queue"
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
                if data and isinstance(data, list) and len(data) > 0:
                    ticket = data[0]
                    key = ticket.get("key", "")
                    if self._dlq.contains(key):
                        logger.debug("Skipping %s (in dead-letter queue)", key)
                        return None
                    return ticket
        except urllib.error.URLError:
            logger.debug("Backend unreachable at %s", url)
        except Exception:
            logger.exception("Failed to poll queue")
        return None

    def _process_ticket(self, ticket: dict) -> None:
        """Execute the Ralph Loop for a single ticket."""
        key = ticket.get("key", "unknown")
        summary = ticket.get("summary", "")
        logger.info("Processing ticket: %s — %s", key, summary)

        self._notify_started(key)

        session_id = f"ralph-{key}-{uuid.uuid4().hex[:8]}"
        heartbeat = HeartbeatReporter(
            self.config.monitor_url, session_id, self.config.heartbeat_interval
        )
        heartbeat.start()

        log_file = self.config.log_dir / f"{key}.log"
        success = False
        error_msg = ""

        try:
            result = subprocess.run(
                ["claude", "--print", f"/start-task {key}"],
                cwd=self.config.repo_dir,
                capture_output=True,
                text=True,
                timeout=3600,  # 1 hour max per task
            )

            log_file.write_text(
                f"--- stdout ---\n{result.stdout}\n--- stderr ---\n{result.stderr}\n",
                encoding="utf-8",
            )

            if result.returncode == 0 and "<result>DONE</result>" in result.stdout:
                success = True
                self._retry_counts.pop(key, None)
                logger.info("Task %s completed successfully", key)
            elif "<result>BLOCKED" in result.stdout:
                error_msg = "BLOCKED by Claude Code"
                logger.warning("Task %s blocked: %s", key, error_msg)
                self._handle_failure(key, summary, error_msg)
            else:
                error_msg = f"exit_code={result.returncode}"
                logger.warning("Task %s failed: %s", key, error_msg)
                self._handle_failure(key, summary, error_msg)

        except subprocess.TimeoutExpired:
            error_msg = "Execution timeout (1h)"
            logger.error("Task %s timed out", key)
            self._handle_failure(key, summary, error_msg)
        except FileNotFoundError:
            error_msg = "claude CLI not found"
            logger.error("claude command not found — is Claude Code installed?")
            self._handle_failure(key, summary, error_msg)
        except Exception as e:
            error_msg = str(e)
            logger.exception("Unexpected error processing %s", key)
            self._handle_failure(key, summary, error_msg)
        finally:
            heartbeat.stop()
            self._notify_completed(key, success)

    def _handle_failure(self, key: str, summary: str, error: str) -> None:
        """Track retries and move to DLQ if exhausted."""
        count = self._retry_counts.get(key, 0) + 1
        self._retry_counts[key] = count

        if count >= self.config.max_retries:
            logger.warning("Moving %s to dead-letter queue after %d attempts", key, count)
            self._dlq.add(key, summary, count, error)
            self._retry_counts.pop(key, None)
        else:
            logger.info(
                "Ticket %s failed (attempt %d/%d), will retry",
                key,
                count,
                self.config.max_retries,
            )

    def _notify_started(self, key: str) -> None:
        """Tell the voice pipeline that we're starting this ticket."""
        self._post(
            f"{self.config.backend_url}/api/loop/started",
            {"key": key},
        )

    def _notify_completed(self, key: str, success: bool) -> None:
        """Tell the voice pipeline that we're done with this ticket."""
        self._post(
            f"{self.config.backend_url}/api/loop/completed",
            {"key": key, "success": success},
        )

    def _post(self, url: str, data: dict) -> None:
        """Fire-and-forget POST to backend."""
        payload = json.dumps(data).encode()
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5):
                pass
        except Exception:
            logger.debug("POST to %s failed (non-fatal)", url)


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
