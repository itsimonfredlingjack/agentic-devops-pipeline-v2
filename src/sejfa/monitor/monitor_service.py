"""
MonitorService: Manages workflow state and event logging for Claude Code monitoring.

Tracks which node is currently active in the agentic loop
(JIRA, CLAUDE, GITHUB, JULES, ACTIONS) and maintains a real-time
event log for dashboard visualization.
"""

from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any


@dataclass
class WorkflowNode:
    """Represents a single node in the workflow."""

    active: bool = False
    last_active: str | None = None
    message: str = ""


class MonitorService:
    """Manages real-time monitoring state for the Claude Code agentic loop."""

    # Valid node IDs in the workflow
    VALID_NODES = {"jira", "claude", "github", "jules", "actions"}

    def __init__(self, max_events: int = 100):
        """
        Initialize the monitor service.

        Args:
            max_events: Maximum number of events to retain in the log
        """
        self.max_events = max_events
        self.current_node: str | None = None
        self.nodes: dict[str, WorkflowNode] = {
            node_id: WorkflowNode() for node_id in self.VALID_NODES
        }
        self.event_log: list[dict[str, Any]] = []
        self.task_info: dict[str, Any] = {
            "title": "Waiting for task...",
            "status": "idle",
            "start_time": None,
        }

    def update_node(self, node_id: str, state: str, message: str = "") -> bool:
        """
        Update the active node and log the transition.

        Args:
            node_id: Node identifier (jira, claude, github, jules, actions)
            state: Node state (active, inactive)
            message: Status message for the node

        Returns:
            True if update was successful, False otherwise
        """
        if node_id not in self.VALID_NODES:
            return False

        is_active = state.lower() == "active"

        # Deactivate previous node if different
        if is_active and self.current_node and self.current_node != node_id:
            self.nodes[self.current_node].active = False

        # Update node
        self.nodes[node_id].active = is_active
        if is_active:
            self.nodes[node_id].last_active = self._get_timestamp()
            self.current_node = node_id
        self.nodes[node_id].message = message[:200]  # Truncate message to 200 chars

        # Add to event log
        self.add_event(node_id, message)

        return True

    def get_state(self) -> dict[str, Any]:
        """
        Get the current workflow state snapshot.

        Returns:
            Dict with current node, nodes status, event log, and task info
        """
        return {
            "current_node": self.current_node,
            "nodes": {node_id: asdict(node) for node_id, node in self.nodes.items()},
            "event_log": self.event_log,
            "task_info": self.task_info,
        }

    def add_event(self, node_id: str, message: str) -> None:
        """
        Add an event to the event log.

        Args:
            node_id: Node identifier
            message: Event message
        """
        event = {
            "timestamp": self._get_timestamp(),
            "node": node_id,
            "message": message[:200],  # Truncate to 200 chars
        }
        self.event_log.append(event)

        # Keep log size manageable
        if len(self.event_log) > self.max_events:
            self.event_log = self.event_log[-self.max_events :]

    def reset(self) -> None:
        """Reset all monitoring state."""
        self.current_node = None
        self.nodes = {node_id: WorkflowNode() for node_id in self.VALID_NODES}
        self.event_log = []
        self.task_info = {
            "title": "Waiting for task...",
            "status": "idle",
            "start_time": None,
        }

    def set_task_info(
        self, title: str = "", status: str = "", start_time: str | None = None
    ) -> None:
        """
        Update task information.

        Args:
            title: Task title
            status: Task status (idle, running, completed, failed)
            start_time: ISO timestamp when task started
        """
        if title:
            self.task_info["title"] = title[:100]  # Truncate to 100 chars
        if status:
            self.task_info["status"] = status
        if start_time:
            self.task_info["start_time"] = start_time

    def get_task_info(self) -> dict[str, Any]:
        """Get current task information."""
        return self.task_info.copy()

    @staticmethod
    def _get_timestamp() -> str:
        """Get current timestamp in ISO format."""
        return datetime.utcnow().isoformat() + "Z"
