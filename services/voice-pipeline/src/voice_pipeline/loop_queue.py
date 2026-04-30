"""In-memory task queue for Ralph Loop dispatch.

Tracks tasks created by the voice pipeline and queues them
for automatic pickup by the loop-runner script.
"""

import logging
import time
from dataclasses import dataclass, field
from enum import StrEnum

logger = logging.getLogger(__name__)

DEDUP_WINDOW_SECONDS = 300  # 5 minutes


class TicketStatus(StrEnum):
    PENDING = "pending"
    STARTED = "started"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class QueueEntry:
    task_ref: str
    summary: str
    status: TicketStatus = TicketStatus.PENDING
    queued_at: float = field(default_factory=time.monotonic)
    started_at: float | None = None
    completed_at: float | None = None
    success: bool | None = None
    retry_count: int = 0


class LoopQueue:
    """Thread-safe in-memory queue for Ralph Loop task dispatch.

    Provides deduplication within a configurable time window and
    status tracking for queued tasks.
    """

    def __init__(self, dedup_window: float = DEDUP_WINDOW_SECONDS) -> None:
        self._entries: dict[str, QueueEntry] = {}
        self._dedup_window = dedup_window

    def add_task(self, task_ref: str, summary: str) -> bool:
        """Add a task to the queue. Returns False if deduplicated."""
        now = time.monotonic()
        existing = self._entries.get(task_ref)

        if existing is not None:
            elapsed = now - existing.queued_at
            if elapsed < self._dedup_window:
                logger.debug("Dedup: %s already queued %.0fs ago", task_ref, elapsed)
                return False

        self._entries[task_ref] = QueueEntry(task_ref=task_ref, summary=summary, queued_at=now)
        logger.info("Queued task %s: %s", task_ref, summary)
        return True

    def add_ticket(self, key: str, summary: str) -> bool:
        """Legacy wrapper for add_task during queue migration."""
        return self.add_task(key, summary)

    def get_pending(self) -> list[dict[str, str]]:
        """Return all pending tasks."""
        return [
            {"task_ref": e.task_ref, "summary": e.summary}
            for e in self._entries.values()
            if e.status == TicketStatus.PENDING
        ]

    def mark_started(self, task_ref: str) -> None:
        """Mark a task as started by the loop runner."""
        entry = self._entries.get(task_ref)
        if entry is not None:
            entry.status = TicketStatus.STARTED
            entry.started_at = time.monotonic()
            logger.info("Loop started for %s", task_ref)

    def mark_completed(self, task_ref: str, success: bool) -> None:
        """Mark a task as completed (success or failure)."""
        entry = self._entries.get(task_ref)
        if entry is not None:
            entry.status = TicketStatus.COMPLETED if success else TicketStatus.FAILED
            entry.completed_at = time.monotonic()
            entry.success = success
            if not success:
                entry.retry_count += 1
            logger.info("Loop completed for %s (success=%s)", task_ref, success)

    def get_failed(self) -> list[dict]:
        """Return all failed tasks with retry counts."""
        return [
            {
                "task_ref": e.task_ref,
                "summary": e.summary,
                "retry_count": e.retry_count,
            }
            for e in self._entries.values()
            if e.status == TicketStatus.FAILED
        ]

    def reset_to_pending(self, task_ref: str) -> bool:
        """Reset a failed task back to pending for retry."""
        entry = self._entries.get(task_ref)
        if entry is not None and entry.status == TicketStatus.FAILED:
            entry.status = TicketStatus.PENDING
            entry.started_at = None
            entry.completed_at = None
            entry.success = None
            logger.info("Reset %s to pending (retry_count=%d)", task_ref, entry.retry_count)
            return True
        return False
