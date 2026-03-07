#!/usr/bin/env python3
"""
PostToolUse Monitor Hook

Posts events to the agent monitor API after Claude performs actions.
Uses non-blocking requests to avoid slowing down Claude.
Handles failures gracefully - Claude continues even if monitor is down.

Step inference is handled server-side (state-aware, prevents backward jumps).

Exit codes:
- 0: Always (never blocks Claude)
"""

import json
import sys
import os
import re
from pathlib import Path

# Add utils to path for monitor_client
sys.path.insert(0, str(Path(__file__).parent.parent / "utils"))
try:
    from monitor_client import send_event
except ImportError:
    # Fallback: define no-op if monitor_client not available
    def send_event(*a, **kw): pass


# ============================================================================
# CONFIGURATION
# ============================================================================

SOURCE = "claude"

# Map tool names to human-readable descriptions
TOOL_DESCRIPTIONS = {
    "bash": "Running command",
    "read": "Reading file",
    "write": "Writing to",
    "edit": "Editing",
    "glob": "Searching for files",
    "grep": "Searching in files",
    "webfetch": "Fetching web content",
    "websearch": "Searching the web",
    "task": "Delegating to agent",
}

# Map operations to event types
OPERATION_EVENT_TYPES = {
    "read": "info",
    "glob": "info",
    "grep": "info",
    "write": "info",
    "edit": "info",
    "bash": "info",
    "webfetch": "info",
    "websearch": "info",
    "task": "info",
}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_task_id():
    """Extract task_id from environment or CURRENT_TASK.md if available."""
    # Check environment first
    task_id = os.environ.get("TASK_ID") or os.environ.get("JIRA_TASK_ID")
    if task_id:
        return task_id

    # Try to extract from CURRENT_TASK.md
    current_task_paths = [
        Path.cwd() / "docs" / "CURRENT_TASK.md",
        Path.cwd() / "CURRENT_TASK.md",
    ]

    for task_path in current_task_paths:
        if task_path.exists():
            try:
                content = task_path.read_text()
                match = re.search(r"([A-Z]+-\d+)", content)
                if match:
                    return match.group(1)
            except Exception:
                pass

    return None


def format_message(tool_name: str, tool_input: dict) -> str:
    """Format a human-readable message for the event."""
    tool_lower = tool_name.lower()
    description = TOOL_DESCRIPTIONS.get(tool_lower, f"Using {tool_name}")

    # Extract relevant details based on tool type
    if tool_lower in ["read", "write", "edit"]:
        file_path = tool_input.get("file_path", "") or tool_input.get("path", "")
        if file_path:
            path_obj = Path(file_path)
            short_path = str(path_obj.name) if len(file_path) > 50 else file_path
            return f"{description} {short_path}"

    elif tool_lower == "bash":
        command = tool_input.get("command", "")
        if command:
            main_cmd = command.split()[0] if command.split() else command
            if len(command) > 60:
                command = command[:57] + "..."

            if main_cmd in ["git", "pytest", "npm", "ruff", "eslint", "gh"]:
                return f"{main_cmd} {' '.join(command.split()[1:3])}"
            return f"{description}: {command[:60]}"

    elif tool_lower == "glob":
        pattern = tool_input.get("pattern", "")
        return f"{description} matching {pattern}"

    elif tool_lower == "grep":
        pattern = tool_input.get("pattern", "")
        return f"{description} for '{pattern[:30]}'"

    return description


def get_event_type(tool_name: str, tool_result: dict) -> str:
    """Determine event type based on tool and result."""
    tool_lower = tool_name.lower()

    # Check if there was an error in the result
    if tool_result:
        error = tool_result.get("error") or tool_result.get("stderr", "")
        if error and "error" in str(error).lower():
            return "warning"

    return OPERATION_EVENT_TYPES.get(tool_lower, "info")


# ============================================================================
# MAIN
# ============================================================================

def main():
    """Main hook logic."""
    try:
        # Read input from stdin
        input_data = sys.stdin.read()

        if not input_data.strip():
            sys.exit(0)

        try:
            hook_input = json.loads(input_data)
        except json.JSONDecodeError:
            sys.exit(0)

        tool_name = hook_input.get("tool_name", "")
        tool_input = hook_input.get("tool_input", {})
        tool_result = hook_input.get("tool_result", {})

        if not tool_name:
            sys.exit(0)

        # Build the event
        message = format_message(tool_name, tool_input)
        event_type = get_event_type(tool_name, tool_result)
        task_id = get_task_id()
        metadata = {
            "tool": tool_name,
        }

        # Send event to monitor (non-blocking)
        # Step inference is handled server-side (state-aware, prevents backward jumps)
        send_event(
            event_type=event_type,
            message=message,
            source=SOURCE,
            task_id=task_id,
            metadata=metadata,
        )

        # Always exit successfully
        sys.exit(0)

    except Exception:
        sys.exit(0)


if __name__ == "__main__":
    main()
