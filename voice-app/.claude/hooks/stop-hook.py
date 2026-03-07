#!/usr/bin/env python3
"""
Ralph Loop Stop-Hook

Goal: prevent the agent from exiting until completion is verifiable.

Enforcement rules:
- When on a Jira-style task branch (e.g. feature/GE-123-...), the hook enforces even if the agent deletes the loop-flag.
- When on main/master, the hook does not enforce (utility commands should not be blocked).
- Outside a git repo (e.g. tests using tmp dirs), enforcement requires the loop flag file.

Exit codes:
- 0: allow exit
- 2: block exit (continue working)
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

HOOKS_DIR = Path(__file__).resolve().parent
if str(HOOKS_DIR) not in sys.path:
    sys.path.insert(0, str(HOOKS_DIR))

# Monitor integration - sends real-time updates to the dashboard
try:
    from monitor_client import (
        activate_actions,
        activate_claude,
        activate_jira,
        complete_task,
        start_task,
    )

    MONITOR_AVAILABLE = True
except ImportError:
    MONITOR_AVAILABLE = False

DEFAULT_PROMISE = "<promise>DONE</promise>"
JIRA_KEY_RE = re.compile(r"[A-Z]+-[0-9]+")


LOOP_FLAG = Path.cwd() / ".claude" / ".ralph_loop_active"
STATE_FILE = Path.cwd() / ".claude" / "ralph-state.json"
PROMISE_FLAG_FILE = Path.cwd() / ".claude" / ".promise_done"
DEBUG_LOG = Path.cwd() / ".claude" / "stop-hook-debug.log"
GIT_GUARD_FILE = Path.cwd() / ".git" / "info" / "ralph-loop-active.json"


def _debug(msg: str) -> None:
    if os.environ.get("RALPH_STOP_HOOK_DEBUG") != "1":
        return
    DEBUG_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(DEBUG_LOG, "a") as f:
        f.write(msg.rstrip() + "\n")


def _repo_id() -> str:
    try:
        return str(Path.cwd().resolve())
    except Exception:
        return str(Path.cwd())


def _read_json_dict(path: Path) -> dict[str, Any]:
    try:
        if not path.exists():
            return {}
        with open(path) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_json_dict(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    tmp.replace(path)


def loop_guard_active() -> bool:
    """True if a loop has been activated and not cleared.

    This is intentionally independent of `.claude/.ralph_loop_active` so deleting
    that file cannot bypass enforcement once the loop has started.
    """
    state = _read_json_dict(STATE_FILE)
    if state.get("loop_active") is True:
        return True

    guard = _read_json_dict(GIT_GUARD_FILE)
    return guard.get("repo_id") == _repo_id() and guard.get("loop_active") is True


def ensure_loop_guard(hook_input: dict[str, Any]) -> None:
    """Persist loop-active state in STATE_FILE and (when available) GIT_GUARD_FILE."""
    state = _read_json_dict(STATE_FILE)
    state.setdefault("started_at", datetime.now().isoformat())
    state["loop_active"] = True
    transcript_path = hook_input.get("transcript_path") or hook_input.get("transcriptPath")
    if isinstance(transcript_path, str) and transcript_path:
        state["last_seen_transcript_path"] = transcript_path
    _write_json_dict(STATE_FILE, state)

    if GIT_GUARD_FILE.parent.exists():
        _write_json_dict(
            GIT_GUARD_FILE,
            {
                "repo_id": _repo_id(),
                "loop_active": True,
                "updated_at": datetime.now().isoformat(),
            },
        )

    # If the primary flag was deleted mid-loop, recreate it to prevent bypass.
    if not LOOP_FLAG.exists():
        try:
            LOOP_FLAG.parent.mkdir(parents=True, exist_ok=True)
            LOOP_FLAG.touch(exist_ok=True)
        except Exception:
            pass


def clear_loop_guard() -> None:
    """Clear persisted loop-active state after completion (or timeout)."""
    state = _read_json_dict(STATE_FILE)
    if state:
        state["loop_active"] = False
        state["completed_at"] = datetime.now().isoformat()
        _write_json_dict(STATE_FILE, state)

    for path in (GIT_GUARD_FILE, LOOP_FLAG, PROMISE_FLAG_FILE):
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        except Exception:
            # Cleanup is best-effort; never block exit due to cleanup failures.
            pass


def load_config() -> tuple[dict[str, Any], bool]:
    """Load exit policy config. Returns (policy, has_explicit_config)."""
    config_paths = [
        Path(__file__).parent.parent / "ralph-config.json",
        Path.cwd() / ".claude" / "ralph-config.json",
        Path.cwd() / "ralph-config.json",
    ]

    for config_path in config_paths:
        if not config_path.exists():
            continue

        with open(config_path) as f:
            config = json.load(f)

        if "profiles" in config:
            active_profile = config.get("active_profile", "template_repo")
            profile = (config.get("profiles") or {}).get(active_profile, {}) or {}
            return (profile.get("exit_policy") or {}), True

        # Legacy / flat format
        return (config.get("exit_policy") or config), True

    # Default is permissive so temp-dir tests and utility contexts don't get stuck.
    return (
        {
            "completion_promise": DEFAULT_PROMISE,
            "max_iterations": 25,
            "scan_length": 5000,
            "requirements": {"tests_must_pass": False, "lint_must_pass": False},
        },
        False,
    )


def is_git_repo() -> bool:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
        return result.returncode == 0 and result.stdout.strip() == "true"
    except Exception:
        return False


def get_git_branch() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
        if result.returncode != 0:
            return None
        return result.stdout.strip()
    except Exception:
        return None


def should_enforce_exit_policy(hook_input: dict[str, Any]) -> bool:
    """Return True if enforcement should be active."""
    # Strongest signal: a persisted guard from an active loop.
    if loop_guard_active():
        return True

    # Strong signal that we're inside a loop: the hook input includes a completion promise.
    if hook_input.get("completion_promise"):
        return True

    if LOOP_FLAG.exists():
        return True

    if not is_git_repo():
        return False

    branch = get_git_branch() or ""
    if branch in {"main", "master"}:
        return False

    # Enforce on branches that look like Jira task branches.
    return bool(JIRA_KEY_RE.search(branch))


def get_transcript_text(hook_input: dict[str, Any], scan_length: int) -> str:
    """Extract transcript content (prefers transcript_path tail for performance)."""
    transcript = hook_input.get("transcript")
    if isinstance(transcript, str) and transcript:
        return transcript

    transcript_path = hook_input.get("transcript_path") or hook_input.get("transcriptPath")
    if not transcript_path:
        return ""

    try:
        path = Path(str(transcript_path)).expanduser()
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        if not path.exists() or not path.is_file():
            return ""

        with open(path, "rb") as f:
            if scan_length and scan_length > 0:
                f.seek(0, 2)
                size = f.tell()
                f.seek(max(size - scan_length, 0))
            data = f.read()

        return data.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def run_cmd(cmd: list[str], timeout_s: int) -> tuple[int, str]:
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout_s,
        check=False,
    )
    out = ((result.stdout or "") + (result.stderr or "")).strip()
    if len(out) > 1500:
        out = out[:1500] + "\n...(truncated)"
    return result.returncode, out


def resolve_tools() -> dict[str, list[str]]:
    """Resolve pytest/ruff commands; prefer ./venv when present."""
    venv_bin = Path.cwd() / "venv" / "bin"

    python = "python3"
    if (venv_bin / "python").exists():
        python = str(venv_bin / "python")
    elif (venv_bin / "python3").exists():
        python = str(venv_bin / "python3")

    pytest_cmd = [python, "-m", "pytest"]
    if (venv_bin / "pytest").exists():
        pytest_cmd = [str(venv_bin / "pytest")]

    ruff_cmd = ["ruff"]
    if (venv_bin / "ruff").exists():
        ruff_cmd = [str(venv_bin / "ruff")]

    return {"pytest": pytest_cmd, "ruff": ruff_cmd}


def increment_iteration() -> int:
    state = _read_json_dict(STATE_FILE)
    state.setdefault("started_at", datetime.now().isoformat())
    state["loop_active"] = True
    state["iterations"] = int(state.get("iterations", 0) or 0) + 1
    state["last_check"] = datetime.now().isoformat()
    _write_json_dict(STATE_FILE, state)
    return int(state["iterations"])


def check_promise_flag_file(promise: str) -> bool:
    if not PROMISE_FLAG_FILE.exists():
        return False
    try:
        return PROMISE_FLAG_FILE.read_text().strip() == promise
    except Exception:
        return False


def write_promise_flag(promise: str) -> None:
    PROMISE_FLAG_FILE.parent.mkdir(parents=True, exist_ok=True)
    PROMISE_FLAG_FILE.write_text(promise)


def build_continue_message(reason: str, suggestions: list[str]) -> dict[str, Any]:
    return {
        "decision": "block",
        "action": "continue",
        "reason": reason,
        "suggestions": suggestions,
        "timestamp": datetime.now().isoformat(),
    }


def _save_progress_on_max_iterations(max_iterations: int) -> None:
    """Best-effort: commit WIP, push, and create a draft PR when max iterations hit."""
    try:
        branch = get_git_branch()
        if not branch or branch in ("main", "master"):
            return

        # Log progress to state file
        state = _read_json_dict(STATE_FILE)
        state["exit_reason"] = "max_iterations"
        state["max_iterations"] = max_iterations
        state["exited_at"] = datetime.now().isoformat()
        _write_json_dict(STATE_FILE, state)

        # Check for uncommitted changes
        status_result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if status_result.returncode != 0:
            return

        has_changes = bool(status_result.stdout.strip())
        if has_changes:
            subprocess.run(
                ["git", "add", "-u"],
                capture_output=True,
                timeout=10,
                check=False,
            )
            subprocess.run(
                [
                    "git",
                    "commit",
                    "-m",
                    f"WIP: max iterations ({max_iterations}) reached - saving progress",
                ],
                capture_output=True,
                timeout=10,
                check=False,
            )

        # Push the branch
        subprocess.run(
            ["git", "push", "-u", "origin", branch],
            capture_output=True,
            timeout=30,
            check=False,
        )

        # Create draft PR
        task_match = JIRA_KEY_RE.search(branch)
        task_id = task_match.group() if task_match else "TASK"
        pr_title = f"WIP: {task_id} - max iterations reached"
        pr_body = (
            f"## Auto-created draft PR\n\n"
            f"The Ralph loop reached {max_iterations} iterations without completing.\n"
            f"This draft PR preserves the work done so far.\n\n"
            f"**Iterations completed:** {max_iterations}\n"
            f"**Branch:** {branch}\n"
        )

        subprocess.run(
            ["gh", "pr", "create", "--draft", "--title", pr_title, "--body", pr_body],
            capture_output=True,
            timeout=30,
            check=False,
        )
    except Exception:
        # Best-effort only — never prevent exit
        pass


def check_pr_merged() -> tuple[bool, str]:
    """Verify that an open PR for this branch is merged or has auto-merge enabled.

    Returns (ok, message). ok=False means the PR is not merged and the loop
    should be blocked from exiting.
    """
    branch = get_git_branch() or ""
    if not branch or branch in ("main", "master"):
        return True, ""

    try:
        # Check if a PR exists for this branch
        result = subprocess.run(
            ["gh", "pr", "view", "--json", "state,autoMergeRequest,url"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if result.returncode != 0:
            # No PR found or gh not available — don't block
            return True, ""

        pr_data = json.loads(result.stdout.strip())
        pr_state = pr_data.get("state", "")
        pr_url = pr_data.get("url", "")
        auto_merge = pr_data.get("autoMergeRequest")

        if pr_state == "MERGED":
            return True, ""

        if auto_merge is not None:
            # Auto-merge is enabled — GitHub will merge when checks pass
            return True, ""

        if pr_state == "OPEN":
            return False, (
                f"PR MERGE GATE BLOCKED EXIT: PR {pr_url} is still OPEN and "
                f"auto-merge is NOT enabled. The PR must be merged for code to "
                f'reach main. Try: gh pr merge --squash --admin "{pr_url}" '
                f'or gh pr merge --squash "{pr_url}"'
            )

        # CLOSED without merge or other state — warn but don't block
        return True, ""
    except Exception:
        # If we can't check, don't block (fail-open for this gate)
        return True, ""


def main() -> None:
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            # If a loop is already active, missing input must not allow a bypass.
            if loop_guard_active() or LOOP_FLAG.exists():
                response = build_continue_message(
                    "Stop-hook invoked without input while loop is active.",
                    ["Try again and ensure a transcript is available."],
                )
                json.dump(response, sys.stderr)
                sys.exit(2)
            sys.exit(0)

        try:
            hook_input = json.loads(input_data)
        except json.JSONDecodeError:
            if loop_guard_active() or LOOP_FLAG.exists():
                response = build_continue_message(
                    "Stop-hook received invalid JSON while loop is active.",
                    ["Try again; do not attempt to bypass by breaking hook input."],
                )
                json.dump(response, sys.stderr)
                sys.exit(2)
            sys.exit(0)

        if not should_enforce_exit_policy(hook_input):
            sys.exit(0)

        active_loop = bool(
            loop_guard_active() or LOOP_FLAG.exists() or hook_input.get("completion_promise")
        )
        if active_loop:
            ensure_loop_guard(hook_input)

        config, has_explicit_config = load_config()
        requirements = (config.get("requirements") or {}) if isinstance(config, dict) else {}

        completion_promise = (
            hook_input.get("completion_promise")
            or config.get("completion_promise")
            or DEFAULT_PROMISE
        )
        max_iterations = int(config.get("max_iterations", 25))
        scan_length = int(config.get("scan_length", 5000))

        current_iteration = increment_iteration()
        _debug(f"{datetime.now().isoformat()} iteration={current_iteration} enforce=true")

        # Monitor integration: Send status updates to the dashboard
        if MONITOR_AVAILABLE:
            # Extract task ID from branch name if possible
            branch = get_git_branch() or ""
            task_match = JIRA_KEY_RE.search(branch)
            task_id = task_match.group() if task_match else "TASK"

            if current_iteration == 1:
                # First iteration - start task and activate JIRA
                start_task(task_id, f"Working on {task_id}")
                activate_jira(f"Starting {task_id}...")
            else:
                # Subsequent iterations - Claude is working
                activate_claude(f"Iteration {current_iteration}: Coding...")

        if current_iteration >= max_iterations:
            # Try to save work before forced exit
            _save_progress_on_max_iterations(max_iterations)

            json.dump(
                {
                    "decision": "allow",
                    "reason": f"Max iterations ({max_iterations}) reached. Forcing exit. Draft PR created if possible.",
                    "timestamp": datetime.now().isoformat(),
                },
                sys.stderr,
            )
            if active_loop:
                clear_loop_guard()
            sys.exit(0)

        transcript = get_transcript_text(hook_input, scan_length)
        promise_found = isinstance(transcript, str) and completion_promise in transcript
        flag_found = active_loop and check_promise_flag_file(completion_promise)

        if not (promise_found or flag_found):
            response = build_continue_message(
                f"Completion criteria not met (iteration {current_iteration}/{max_iterations})",
                [
                    "Read CURRENT_TASK.md to review acceptance criteria",
                    "Run: pytest -q",
                    "Run: ruff check .",
                    "Run: ruff format --check .",
                    f"When all criteria are met, output: {completion_promise}",
                ],
            )
            json.dump(response, sys.stderr)
            sys.exit(2)

        # Promise is present -> verify required quality gates before allowing exit.
        tools = resolve_tools()
        enforce_tools = has_explicit_config or is_git_repo()

        failures: list[str] = []
        suggestions: list[str] = []

        tests_required = bool(requirements.get("tests_must_pass"))
        lint_required = bool(requirements.get("lint_must_pass"))
        coverage_threshold = requirements.get("coverage_threshold")
        if coverage_threshold is not None:
            try:
                coverage_threshold = int(coverage_threshold)
            except Exception:
                coverage_threshold = None

        if tests_required and enforce_tools:
            # Monitor: Show that we're running tests
            if MONITOR_AVAILABLE:
                activate_actions("Running pytest...")

            pytest_cmd = [*tools["pytest"], "-q"]
            if coverage_threshold is not None:
                pytest_cmd.extend(
                    [
                        "--cov=.",
                        "--cov-report=term-missing",
                        f"--cov-fail-under={coverage_threshold}",
                    ]
                )
            code, out = run_cmd(pytest_cmd, timeout_s=180)
            if code != 0:
                failures.append("pytest failed")
                suggestions.append(f"Fix failing tests:\n{out}")

        if lint_required and enforce_tools:
            # Monitor: Show that we're running lint
            if MONITOR_AVAILABLE:
                activate_actions("Running ruff check...")

            code, out = run_cmd([*tools["ruff"], "check", "."], timeout_s=120)
            if code != 0:
                failures.append("ruff check . failed")
                suggestions.append(f"Fix Ruff lint:\n{out}")

            code, out = run_cmd([*tools["ruff"], "format", "--check", "."], timeout_s=120)
            if code != 0:
                failures.append("ruff format --check . failed")
                suggestions.append(f"Run formatter:\n{out}")

        if failures:
            response = build_continue_message(
                f"Completion promise found, but quality gates failed "
                f"(iteration {current_iteration}/{max_iterations}): {', '.join(failures)}",
                suggestions
                or [
                    "Run the required checks locally and fix failures",
                    f"When all criteria are met, output: {completion_promise}",
                ],
            )
            json.dump(response, sys.stderr)
            sys.exit(2)

        # PR merge verification — prevents DONE when PR is not merged
        pr_ok, pr_msg = check_pr_merged()
        if not pr_ok:
            response = build_continue_message(
                f"PR merge check failed (iteration {current_iteration}/{max_iterations}): {pr_msg}",
                [
                    "Your PR is NOT merged! Code has not reached main.",
                    "Try: gh pr merge --squash --admin <PR_URL>",
                    "Or: gh pr merge --squash <PR_URL>",
                    "Verify with: gh pr view --json state -q '.state'",
                    f"When PR is merged, output: {completion_promise}",
                ],
            )
            json.dump(response, sys.stderr)
            sys.exit(2)

        # Monitor: Task completed successfully!
        if MONITOR_AVAILABLE:
            complete_task()

        if active_loop:
            clear_loop_guard()
        sys.exit(0)
    except Exception as e:
        # Fail-closed when enforcing (bypass vector); fail-open otherwise.
        if loop_guard_active() or LOOP_FLAG.exists():
            response = build_continue_message(
                "Stop-hook error while loop is active; continuing to avoid bypass.",
                [f"Error: {e}", "Fix the error and try again."],
            )
            json.dump(response, sys.stderr)
            sys.exit(2)

        json.dump(
            {"decision": "allow", "action": "allow_exit_on_error", "error": str(e)}, sys.stderr
        )
        sys.exit(0)


if __name__ == "__main__":
    main()
