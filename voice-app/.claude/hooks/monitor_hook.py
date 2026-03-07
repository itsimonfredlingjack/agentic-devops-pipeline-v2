#!/usr/bin/env python3
"""
Monitor PreToolUse Hook - Sends real-time updates based on tool usage.

This hook runs before each tool use and sends updates to the monitor
dashboard, enabling real-time visualization of the agent's activities.

The Ralph high-five animation triggers when Claude node becomes active!
"""

import json
import sys
import os
from pathlib import Path
from typing import Optional

# Only run if monitor is enabled
if os.environ.get("MONITOR_ENABLED", "1") != "1":
    sys.exit(0)

HOOKS_DIR = Path(__file__).resolve().parent
if str(HOOKS_DIR) not in sys.path:
    sys.path.insert(0, str(HOOKS_DIR))

try:
    from monitor_client import (
        send_update,
        NODE_JIRA,
        NODE_CLAUDE,
        NODE_GITHUB,
        NODE_JULES,
        NODE_ACTIONS,
    )
except ImportError:
    # Monitor client not available, skip
    sys.exit(0)


def get_node_for_tool(tool_name: str, tool_input: dict) -> Optional[tuple[str, str]]:
    """
    Determine which node should be active based on the tool being used.

    Returns:
        Tuple of (node_name, message) or None
    """
    if tool_name == "Bash":
        command = tool_input.get("command", "")

        # Git push/commit/PR -> GitHub
        if any(x in command for x in ["git push", "git commit", "gh pr", "gh issue"]):
            return (NODE_GITHUB, f"Git: {command[:40]}...")

        # Tests -> Actions
        if any(x in command for x in ["pytest", "npm test", "vitest", "jest"]):
            return (NODE_ACTIONS, "Running tests...")

        # Lint -> Actions
        if any(x in command for x in ["ruff", "eslint", "lint"]):
            return (NODE_ACTIONS, "Linting code...")

        # Jira CLI or API -> Jira
        if "jira" in command.lower():
            return (NODE_JIRA, "Jira operation...")

        # Other bash commands -> Claude is executing
        return (NODE_CLAUDE, f"Running: {command[:40]}...")

    elif tool_name in ("Edit", "Write"):
        # Editing files -> Claude is coding!
        file_path = tool_input.get("file_path", "unknown")
        filename = file_path.split("/")[-1] if file_path else "file"
        return (NODE_CLAUDE, f"Editing: {filename}")

    elif tool_name == "Read":
        # Reading files -> Claude is analyzing
        file_path = tool_input.get("file_path", "unknown")
        filename = file_path.split("/")[-1] if file_path else "file"
        return (NODE_CLAUDE, f"Reading: {filename}")

    elif tool_name == "Glob":
        # Searching files -> Claude is exploring
        pattern = tool_input.get("pattern", "*")
        return (NODE_CLAUDE, f"Searching: {pattern}")

    elif tool_name == "Grep":
        # Searching content -> Claude is analyzing
        pattern = tool_input.get("pattern", "...")
        return (NODE_CLAUDE, f"Grep: {pattern[:30]}...")

    elif tool_name == "WebFetch":
        # Fetching web content -> could be docs or Jira
        url = tool_input.get("url", "")
        if "jira" in url.lower() or "atlassian" in url.lower():
            return (NODE_JIRA, "Fetching from Jira...")
        return (NODE_CLAUDE, "Fetching web content...")

    elif tool_name == "Task":
        # Spawning subagent -> Claude is delegating
        desc = tool_input.get("description", "subtask")
        return (NODE_CLAUDE, f"Subagent: {desc}")

    return None


def main():
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            sys.exit(0)

        hook_input = json.loads(input_data)
        tool_name = hook_input.get("tool_name", "")
        tool_input = hook_input.get("tool_input", {})

        result = get_node_for_tool(tool_name, tool_input)
        if result:
            node, message = result
            send_update(node, "active", message)

    except Exception:
        # Never block tool execution due to monitor errors
        pass

    sys.exit(0)


if __name__ == "__main__":
    main()
