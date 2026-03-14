"""In-memory ticket queue for Ralph Loop dispatch.

Tracks tickets created by the voice pipeline and queues them
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
    key: str
    summary: str
    status: TicketStatus = TicketStatus.PENDING
    queued_at: float = field(default_factory=time.monotonic)
    started_at: float | None = None
    completed_at: float | None = None
    success: bool | None = None


class LoopQueue:
    """Thread-safe in-memory queue for Ralph Loop ticket dispatch.

    Provides deduplication within a configurable time window and
    status tracking for queued tickets.
    """

    def __init__(self, dedup_window: float = DEDUP_WINDOW_SECONDS) -> None:
        self._entries: dict[str, QueueEntry] = {}
        self._dedup_window = dedup_window

    def add_ticket(self, key: str, summary: str) -> bool:
        """Add a ticket to the queue. Returns False if deduplicated."""
        now = time.monotonic()
        existing = self._entries.get(key)

        if existing is not None:
            elapsed = now - existing.queued_at
            if elapsed < self._dedup_window:
                logger.debug("Dedup: %s already queued %.0fs ago", key, elapsed)
                return False

        self._entries[key] = QueueEntry(key=key, summary=summary, queued_at=now)
        logger.info("Queued ticket %s: %s", key, summary)
        return True

    def get_pending(self) -> list[dict[str, str]]:
        """Return all pending tickets as dicts with key and summary."""
        return [
            {"key": e.key, "summary": e.summary}
            for e in self._entries.values()
            if e.status == TicketStatus.PENDING
        ]

    def mark_started(self, key: str) -> None:
        """Mark a ticket as started by the loop runner."""
        entry = self._entries.get(key)
        if entry is not None:
            entry.status = TicketStatus.STARTED
            entry.started_at = time.monotonic()
            logger.info("Loop started for %s", key)

    def mark_completed(self, key: str, success: bool) -> None:
        """Mark a ticket as completed (success or failure)."""
        entry = self._entries.get(key)
        if entry is not None:
            entry.status = TicketStatus.COMPLETED if success else TicketStatus.FAILED
            entry.completed_at = time.monotonic()
            entry.success = success
            logger.info("Loop completed for %s (success=%s)", key, success)
