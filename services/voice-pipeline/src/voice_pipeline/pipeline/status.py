"""Pipeline monitoring service.

Adapted from grupp-ett-github/src/sejfa/monitor/monitor_service.py.
Changed VALID_NODES to voice-pipeline stages:
  recording → transcribing → extracting → creating → done / error
"""

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any


class PipelineStatus(StrEnum):
    """Voice pipeline execution stages."""

    RECORDING = "recording"
    TRANSCRIBING = "transcribing"
    EXTRACTING = "extracting"
    CLARIFYING = "clarifying"
    CREATING = "creating"
    DONE = "done"
    ERROR = "error"
    IDLE = "idle"


@dataclass
class WorkflowNode:
    """Represents a single stage in the voice pipeline."""

    active: bool = False
    last_active: str | None = None
    message: str = ""


class MonitorService:
    """Manages real-time monitoring state for the voice pipeline.

    Tracks which stage is currently active and maintains a bounded event log.
    Thread-safe for single-process use; extend with asyncio.Lock for concurrency.
    """

    # Pipeline stages understood by this service
    VALID_NODES = {
        PipelineStatus.RECORDING,
        PipelineStatus.TRANSCRIBING,
        PipelineStatus.EXTRACTING,
        PipelineStatus.CLARIFYING,
        PipelineStatus.CREATING,
        PipelineStatus.DONE,
        PipelineStatus.ERROR,
    }

    def __init__(self, max_events: int = 100) -> None:
        """Initialise the monitor service.

        Args:
            max_events: Maximum number of events to retain in the log.
        """
        self.max_events = max_events
        self.current_node: PipelineStatus | None = None
        self.nodes: dict[PipelineStatus, WorkflowNode] = {
            stage: WorkflowNode() for stage in self.VALID_NODES
        }
        self.event_log: list[dict[str, Any]] = []
        self.task_info: dict[str, Any] = {
            "title": "Waiting for task...",
            "status": "idle",
            "start_time": None,
        }

    def update_node(self, node_id: PipelineStatus | str, state: str, message: str = "") -> bool:
        """Update the active pipeline stage and log the transition.

        Args:
            node_id: Stage identifier (PipelineStatus or string value).
            state: "active" or "inactive".
            message: Human-readable status message.

        Returns:
            True if update was successful, False if node_id is invalid.
        """
        # Accept string values for convenience
        if isinstance(node_id, str):
            try:
                node_id = PipelineStatus(node_id)
            except ValueError:
                return False

        if node_id not in self.VALID_NODES:
            return False

        is_active = state.lower() == "active"

        # Deactivate previous node if switching
        if is_active and self.current_node and self.current_node != node_id:
            self.nodes[self.current_node].active = False

        self.nodes[node_id].active = is_active
        if is_active:
            self.nodes[node_id].last_active = self._timestamp()
            self.current_node = node_id
        self.nodes[node_id].message = message[:200]

        self.add_event(node_id, message)
        return True

    def get_state(self) -> dict[str, Any]:
        """Return current pipeline state snapshot.

        Returns:
            Dict with current_node, per-stage status, event_log, and task_info.
        """
        return {
            "current_node": self.current_node.value if self.current_node else None,
            "nodes": {stage.value: asdict(node) for stage, node in self.nodes.items()},
            "event_log": self.event_log,
            "task_info": self.task_info,
        }

    def add_event(self, node_id: PipelineStatus | str, message: str) -> None:
        """Append an event to the bounded event log.

        Args:
            node_id: Stage that generated the event.
            message: Event message (truncated to 200 chars).
        """
        node_str = node_id.value if isinstance(node_id, PipelineStatus) else str(node_id)
        event = {
            "timestamp": self._timestamp(),
            "node": node_str,
            "message": message[:200],
        }
        self.event_log.append(event)

        if len(self.event_log) > self.max_events:
            self.event_log = self.event_log[-self.max_events :]

    def reset(self) -> None:
        """Reset all monitoring state to idle."""
        self.current_node = None
        self.nodes = {stage: WorkflowNode() for stage in self.VALID_NODES}
        self.event_log = []
        self.task_info = {
            "title": "Waiting for task...",
            "status": "idle",
            "start_time": None,
        }

    def set_task_info(
        self, title: str = "", status: str = "", start_time: str | None = None
    ) -> None:
        """Update task metadata.

        Args:
            title: Task title (truncated to 100 chars).
            status: Status string (idle/running/completed/failed).
            start_time: ISO 8601 start timestamp.
        """
        if title:
            self.task_info["title"] = title[:100]
        if status:
            self.task_info["status"] = status
        if start_time is not None:
            self.task_info["start_time"] = start_time

    @staticmethod
    def _timestamp() -> str:
        """Return current UTC timestamp in ISO 8601 format."""
        return datetime.now(tz=UTC).isoformat()
