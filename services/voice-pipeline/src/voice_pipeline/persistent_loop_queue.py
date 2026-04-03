"""SQLite-backed persistent ticket queue for Ralph Loop dispatch.

Extends LoopQueue with durable storage so that pending tickets survive
server restarts.  Uses Python's stdlib sqlite3 -- zero new dependencies.
"""

import logging
import sqlite3
from pathlib import Path

from .loop_queue import (
    DEDUP_WINDOW_SECONDS,
    LoopQueue,
    QueueEntry,
    TicketStatus,
)

logger = logging.getLogger(__name__)

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS queue_entries (
    key         TEXT PRIMARY KEY,
    summary     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    queued_at   REAL NOT NULL,
    started_at  REAL,
    completed_at REAL,
    success     INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0
);
"""

_MIGRATION_SQL = """
ALTER TABLE queue_entries ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
"""


class PersistentLoopQueue(LoopQueue):
    """Drop-in replacement for LoopQueue with SQLite persistence.

    On startup the queue restores all rows from the database into the
    in-memory dict inherited from LoopQueue so that every existing
    method (get_pending, mark_started, ...) keeps working without changes.

    Every mutation (add / mark_started / mark_completed) is written through
    to SQLite so that a fresh instance always starts from the last known state.

    Args:
        db_path: Filesystem path for the SQLite database file.
        dedup_window: Seconds within which duplicate ticket keys are rejected.
    """

    def __init__(
        self,
        db_path: str | Path = "loop_queue.db",
        dedup_window: float = DEDUP_WINDOW_SECONDS,
    ) -> None:
        super().__init__(dedup_window=dedup_window)
        self._db_path = Path(db_path)
        self._conn = self._open_db()
        self._restore_entries()

    # ------------------------------------------------------------------
    # Database helpers
    # ------------------------------------------------------------------

    def _open_db(self) -> sqlite3.Connection:
        """Open (or create) the SQLite database and ensure the schema exists."""
        conn = sqlite3.connect(str(self._db_path))
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.executescript(_SCHEMA_SQL)
        # Migrate: add retry_count column if missing (idempotent)
        try:
            conn.execute(_MIGRATION_SQL)
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Column already exists
        return conn

    def _restore_entries(self) -> None:
        """Load all rows from the database into the in-memory dict."""
        cursor = self._conn.execute(
            "SELECT key, summary, status, queued_at, started_at, completed_at, success, retry_count "
            "FROM queue_entries"
        )
        for row in cursor:
            key, summary, status, queued_at, started_at, completed_at, success_int, retry_count = (
                row
            )
            entry = QueueEntry(
                key=key,
                summary=summary,
                status=TicketStatus(status),
                queued_at=queued_at,
                started_at=started_at,
                completed_at=completed_at,
                success=None if success_int is None else bool(success_int),
                retry_count=retry_count or 0,
            )
            self._entries[key] = entry
        count = len(self._entries)
        if count:
            logger.info("Restored %d entries from %s", count, self._db_path)

    def _upsert(self, entry: QueueEntry) -> None:
        """Insert or replace a single entry in the database."""
        self._conn.execute(
            "INSERT OR REPLACE INTO queue_entries "
            "(key, summary, status, queued_at, started_at, completed_at, success, retry_count) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                entry.key,
                entry.summary,
                entry.status.value,
                entry.queued_at,
                entry.started_at,
                entry.completed_at,
                None if entry.success is None else int(entry.success),
                entry.retry_count,
            ),
        )
        self._conn.commit()

    # ------------------------------------------------------------------
    # Overridden LoopQueue methods (add write-through to SQLite)
    # ------------------------------------------------------------------

    def add_ticket(self, key: str, summary: str) -> bool:
        """Add a ticket to the queue and persist it. Returns False if deduplicated."""
        added = super().add_ticket(key, summary)
        if added:
            self._upsert(self._entries[key])
        return added

    def mark_started(self, key: str) -> None:
        """Mark a ticket as started and persist the change."""
        super().mark_started(key)
        entry = self._entries.get(key)
        if entry is not None:
            self._upsert(entry)

    def mark_completed(self, key: str, success: bool) -> None:
        """Mark a ticket as completed and persist the change."""
        super().mark_completed(key, success)
        entry = self._entries.get(key)
        if entry is not None:
            self._upsert(entry)

    def reset_to_pending(self, key: str) -> bool:
        """Reset a failed ticket to pending and persist the change."""
        result = super().reset_to_pending(key)
        if result:
            entry = self._entries.get(key)
            if entry is not None:
                self._upsert(entry)
        return result
