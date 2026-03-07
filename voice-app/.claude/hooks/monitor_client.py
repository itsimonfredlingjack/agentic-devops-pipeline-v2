#!/usr/bin/env python3
"""
Monitor Client - Sends real-time updates to the Agentic Loop Monitor.

This module provides a simple interface for hooks to send state updates
to the monitor dashboard, triggering visualizations like the Ralph high-five.
"""

import json
import os
import sys
import urllib.error
import urllib.request

# Monitor server configuration
MONITOR_ENABLED = os.environ.get("MONITOR_ENABLED", "1") == "1"
MONITOR_URL = os.environ.get(
    "MONITOR_URL",
    os.environ.get(
        "MONITOR_API_URL",
        "https://grupp-ett-monitor-api.fredlingjacksimon.workers.dev",
    ),
)
API_SECRET = os.environ.get("MONITOR_API_SECRET", os.environ.get("MONITOR_API_KEY", ""))
USER_AGENT = os.environ.get("MONITOR_USER_AGENT", "AgenticLoop-Monitor/1.0")
MONITOR_DEBUG = os.environ.get("MONITOR_DEBUG", "0") == "1"

# Node mappings for different activities
NODE_JIRA = "jira"
NODE_CLAUDE = "claude"
NODE_GITHUB = "github"
NODE_JULES = "jules"
NODE_ACTIONS = "actions"


def _headers() -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
    if API_SECRET:
        headers["Authorization"] = f"Bearer {API_SECRET}"
    return headers


def _debug(message: str) -> None:
    if MONITOR_DEBUG:
        print(f"[monitor_client] {message}", file=sys.stderr)


def _post(path: str, payload: dict, timeout: float = 5.0) -> bool:
    """POST JSON to monitor API. Fails silently."""
    if not MONITOR_ENABLED:
        _debug("Monitoring disabled via MONITOR_ENABLED=0")
        return False

    url = f"{MONITOR_URL.rstrip('/')}{path}"
    data = json.dumps(payload).encode("utf-8")

    try:
        req = urllib.request.Request(
            url,
            data=data,
            headers=_headers(),
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            ok = resp.status == 200
            if not ok:
                _debug(f"Unexpected HTTP status {resp.status} from {url}")
            return ok
    except urllib.error.HTTPError as exc:
        _debug(f"HTTP {exc.code} from {url}")
        return False
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        _debug(f"Request failed to {url}: {exc}")
        return False


def send_update(
    node: str,
    state: str = "active",
    message: str = "",
    timeout: float = 5.0,
) -> bool:
    """
    Send a state update to the monitor.

    Args:
        node: One of 'jira', 'claude', 'github', 'jules', 'actions'
        state: 'active' or 'idle'
        message: Optional message to display
        timeout: Request timeout in seconds

    Returns:
        True if update was sent successfully, False otherwise
    """
    return _post(
        "/api/monitor/state",
        {"node": node, "state": state, "message": message},
        timeout,
    )


def start_task(task_id: str, title: str, timeout: float = 5.0) -> bool:
    """
    Signal that a new task is starting.

    Args:
        task_id: The Jira ticket ID (e.g., 'GE-35')
        title: The task title

    Returns:
        True if update was sent successfully
    """
    return _post(
        "/api/monitor/task",
        {"action": "start", "task_id": task_id, "title": title},
        timeout,
    )


def complete_task(timeout: float = 5.0) -> bool:
    """Signal that the current task is complete."""
    return _post("/api/monitor/task", {"action": "complete"}, timeout)


def detect_phase_from_tool(tool_name: str, tool_input: dict) -> tuple[str, str] | None:
    """
    Detect which phase the agent is in based on the tool being used.

    Args:
        tool_name: The name of the tool (e.g., 'Bash', 'Edit', 'Read')
        tool_input: The tool's input parameters

    Returns:
        Tuple of (node, message) or None if no phase detected
    """
    if tool_name == "Bash":
        command = tool_input.get("command", "")

        # Git operations -> GitHub
        if any(cmd in command for cmd in ["git push", "git commit", "gh pr"]):
            return (NODE_GITHUB, f"Git: {command[:50]}...")

        # Test operations -> Actions
        if any(cmd in command for cmd in ["pytest", "npm test", "ruff check"]):
            return (NODE_ACTIONS, f"Testing: {command[:50]}...")

        # Jira operations -> Jira
        if "jira" in command.lower():
            return (NODE_JIRA, "Fetching from Jira...")

    elif tool_name in ("Edit", "Write"):
        # Editing code -> Claude is coding
        file_path = tool_input.get("file_path", "")
        return (NODE_CLAUDE, f"Editing: {file_path.split('/')[-1]}")

    elif tool_name == "Read":
        # Reading files -> Claude is analyzing
        file_path = tool_input.get("file_path", "")
        if file_path:
            return (NODE_CLAUDE, f"Reading: {file_path.split('/')[-1]}")

    return None


# Quick activation functions for each node
def activate_jira(message: str = "Fetching ticket...") -> bool:
    return send_update(NODE_JIRA, "active", message)


def activate_claude(message: str = "Coding...") -> bool:
    return send_update(NODE_CLAUDE, "active", message)


def activate_github(message: str = "Pushing changes...") -> bool:
    return send_update(NODE_GITHUB, "active", message)


def activate_jules(message: str = "Code review...") -> bool:
    return send_update(NODE_JULES, "active", message)


def activate_actions(message: str = "Running CI/CD...") -> bool:
    return send_update(NODE_ACTIONS, "active", message)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        node = sys.argv[1]
        message = sys.argv[2] if len(sys.argv) > 2 else "Test update"
        result = send_update(node, "active", message)
        print(f"Sent to {MONITOR_URL}: node={node} -> {'OK' if result else 'FAILED'}")
    else:
        print(f"Monitor client targeting: {MONITOR_URL}")
        print(f"Enabled: {MONITOR_ENABLED}")
        print(f"User-Agent: {USER_AGENT}")
        print(f"API secret configured: {bool(API_SECRET)}")
        print("Usage: python monitor_client.py <node> [message]")
        print("Nodes: jira, claude, github, jules, actions")
