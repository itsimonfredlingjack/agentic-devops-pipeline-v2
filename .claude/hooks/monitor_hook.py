#!/usr/bin/env python3
"""Claude Code hook: sends tool use events to Monitor API.

Registered for PreToolUse, PostToolUse, and Stop hook types.
Reads JSON from stdin, extracts tool info, POSTs to Monitor API.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
import uuid
from typing import Any

# Ensure monitor_client is importable regardless of cwd
sys.path.insert(0, os.path.dirname(__file__))

from monitor_client import post_event

# Session ID: prefer env var, fallback to generated per-process
SESSION_ID = os.environ.get("CLAUDE_SESSION_ID", str(uuid.uuid4()))

# Cache: track pre_tool_use start times for duration calculation
_pending_events: dict[str, dict[str, Any]] = {}


def _get_ticket_id() -> str | None:
    """Extract ticket ID from git branch name (e.g., feature/DEV-42-foo -> DEV-42)."""
    try:
        branch = (
            subprocess.check_output(
                ["git", "branch", "--show-current"],
                stderr=subprocess.DEVNULL,
                timeout=2,
            )
            .decode()
            .strip()
        )
        # Match common patterns: DEV-42, JIRA-123, etc.
        match = re.search(r"([A-Z]+-\d+)", branch)
        return match.group(1) if match else None
    except Exception:
        return None


def _hash_args(args: Any) -> str:
    """SHA256 hash of sorted JSON args, truncated to 16 chars."""
    try:
        serialized = json.dumps(args, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode()).hexdigest()[:16]
    except Exception:
        return "unknown"


def _summarize_args(args: Any) -> str:
    """Truncate tool args to 200 chars."""
    try:
        text = json.dumps(args, default=str)
        return text[:200]
    except Exception:
        return ""


def handle_pre_tool_use(hook_input: dict[str, Any]) -> None:
    """Handle PreToolUse: capture tool start, send event."""
    tool_name = hook_input.get("tool_name", "unknown")
    tool_input = hook_input.get("tool_input", {})
    event_id = str(uuid.uuid4())
    now = time.time()

    # Store for duration calculation in PostToolUse
    _pending_events[tool_name] = {
        "event_id": event_id,
        "start_time": now,
    }

    event = {
        "event_id": event_id,
        "session_id": SESSION_ID,
        "ticket_id": _get_ticket_id(),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "event_type": "pre_tool_use",
        "tool_name": tool_name,
        "tool_args_hash": _hash_args(tool_input),
        "tool_args_summary": _summarize_args(tool_input),
        "success": None,
        "duration_ms": None,
        "tokens": None,
        "cost_usd": None,
        "error": None,
    }
    post_event(event)


def handle_post_tool_use(hook_input: dict[str, Any]) -> None:
    """Handle PostToolUse: capture result, compute duration, send event."""
    tool_name = hook_input.get("tool_name", "unknown")
    tool_input = hook_input.get("tool_input", {})
    tool_result = hook_input.get("tool_result", {})

    pending = _pending_events.pop(tool_name, None)
    event_id = pending["event_id"] if pending else str(uuid.uuid4())
    duration_ms = int((time.time() - pending["start_time"]) * 1000) if pending else None

    # Determine success from result
    is_error = False
    error_msg = None
    if isinstance(tool_result, dict):
        is_error = tool_result.get("is_error", False)
        if is_error:
            error_msg = str(tool_result.get("content", ""))[:500]

    event = {
        "event_id": event_id,
        "session_id": SESSION_ID,
        "ticket_id": _get_ticket_id(),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "event_type": "post_tool_use",
        "tool_name": tool_name,
        "tool_args_hash": _hash_args(tool_input),
        "tool_args_summary": _summarize_args(tool_input),
        "success": not is_error,
        "duration_ms": duration_ms,
        "tokens": None,
        "cost_usd": None,
        "error": error_msg,
    }
    post_event(event)


def handle_stop(hook_input: dict[str, Any]) -> None:
    """Handle Stop: send session end event."""
    event = {
        "event_id": str(uuid.uuid4()),
        "session_id": SESSION_ID,
        "ticket_id": _get_ticket_id(),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "event_type": "stop",
        "tool_name": "session",
        "tool_args_hash": "",
        "tool_args_summary": "Session ended",
        "success": True,
        "duration_ms": None,
        "tokens": None,
        "cost_usd": None,
        "error": None,
    }
    post_event(event)


def main() -> None:
    """Read hook input from stdin and dispatch to handler."""
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return
        hook_input = json.loads(raw)
    except (json.JSONDecodeError, Exception):
        return

    hook_type = hook_input.get("hook_type", "")

    if hook_type == "PreToolUse":
        handle_pre_tool_use(hook_input)
    elif hook_type == "PostToolUse":
        handle_post_tool_use(hook_input)
    elif hook_type == "Stop":
        handle_stop(hook_input)


if __name__ == "__main__":
    main()
