#!/usr/bin/env python3
"""PreToolUse hook to block pushes for no-push smoke tasks.

Fail-open by default: if input is missing/unknown, allow the tool to run.
Block only when we confidently detect a push/PR command AND CURRENT_TASK.md
explicitly states that pushing is forbidden (e.g. "MUST NOT: git push").
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

GIT_PUSH_RE = re.compile(r"(^|[;&|]\s*)git\s+push\b", re.IGNORECASE)
GH_PR_CREATE_RE = re.compile(r"(^|[;&|]\s*)gh\s+pr\s+create\b", re.IGNORECASE)

NO_PUSH_MARKERS = (
    "MUST NOT: git push",
    "NO git push",
    "FÅR INTE: git push",
    "no-push",
    "loop-smoke",
)

ALLOW_PUSH_MARKERS = (
    "push-ok",
    "ALLOW_PUSH",
)


def load_current_task_text() -> str:
    try:
        return Path.cwd().joinpath("CURRENT_TASK.md").read_text(errors="ignore")
    except Exception:
        return ""


def find_command(obj: object) -> str | None:
    """Best-effort extraction of a command string from hook input."""
    if isinstance(obj, dict):
        for key in ("command", "cmd"):
            val = obj.get(key)
            if isinstance(val, str) and val.strip():
                return val
        # Common nested shapes: {"tool_input": {"command": "..."}}
        for key in ("input", "tool_input", "toolInput"):
            val = obj.get(key)
            cmd = find_command(val)
            if cmd:
                return cmd
    elif isinstance(obj, list):
        for item in obj:
            cmd = find_command(item)
            if cmd:
                return cmd
    return None


def block(reason: str) -> None:
    json.dump(
        {
            "decision": "block",
            "reason": reason,
            "suggestions": [
                "This ticket is a smoke/no-push test. Do not push or open PRs.",
                "If this is intended, remove the no-push requirement or add 'push-ok' to CURRENT_TASK.md.",
            ],
        },
        sys.stderr,
    )
    sys.exit(2)


def main() -> None:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            sys.exit(0)
        hook_input = json.loads(raw)
    except Exception:
        # Fail open: unknown input schema.
        sys.exit(0)

    cmd = find_command(hook_input)
    if not cmd:
        sys.exit(0)

    # Normalize whitespace to prevent bypass via double spaces/tabs
    cmd = " ".join(cmd.split())

    is_push = bool(GIT_PUSH_RE.search(cmd))
    is_pr = bool(GH_PR_CREATE_RE.search(cmd))
    if not (is_push or is_pr):
        sys.exit(0)

    task_text = load_current_task_text()
    if any(marker in task_text for marker in ALLOW_PUSH_MARKERS):
        sys.exit(0)

    if any(marker in task_text for marker in NO_PUSH_MARKERS):
        if is_push:
            block("Blocked git push: CURRENT_TASK.md indicates no-push.")
        block("Blocked PR creation: CURRENT_TASK.md indicates no-push.")

    sys.exit(0)


if __name__ == "__main__":
    main()

