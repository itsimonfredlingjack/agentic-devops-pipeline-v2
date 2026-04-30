"""SQLite-backed persistent task queue for Ralph Loop dispatch.

Extends LoopQueue with durable storage so that pending tasks survive
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
    task_ref    TEXT,
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

_TASK_REF_MIGRATION_SQL = """
ALTER TABLE queue_entries ADD COLUMN task_ref TEXT;
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
        dedup_window: Seconds within which duplicate task refs are rejected.
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
        try:
            conn.execute(_TASK_REF_MIGRATION_SQL)
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Column already exists

        conn.execute(
            """
            UPDATE queue_entries
            SET task_ref = key
            WHERE task_ref IS NULL AND key IS NOT NULL
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS ix_queue_entries_task_ref ON queue_entries (task_ref)"
        )
        conn.commit()
        return conn

    def _restore_entries(self) -> None:
        """Load all rows from the database into the in-memory dict."""
        cursor = self._conn.execute(
            "SELECT COALESCE(task_ref, key), summary, status, queued_at, started_at, completed_at, success, retry_count "
            "FROM queue_entries"
        )
        for row in cursor:
            (
                task_ref,
                summary,
                status,
                queued_at,
                started_at,
                completed_at,
                success_int,
                retry_count,
            ) = row
            entry = QueueEntry(
                task_ref=task_ref,
                summary=summary,
                status=TicketStatus(status),
                queued_at=queued_at,
                started_at=started_at,
                completed_at=completed_at,
                success=None if success_int is None else bool(success_int),
                retry_count=retry_count or 0,
            )
            self._entries[entry.task_ref] = entry
        count = len(self._entries)
        if count:
            logger.info("Restored %d entries from %s", count, self._db_path)

    def _upsert(self, entry: QueueEntry) -> None:
        """Insert or replace a single entry in the database."""
        self._conn.execute(
            "INSERT OR REPLACE INTO queue_entries "
            "(key, task_ref, summary, status, queued_at, started_at, completed_at, success, retry_count) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                entry.task_ref,
                entry.task_ref,
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

    def add_task(self, task_ref: str, summary: str) -> bool:
        """Add a task to the queue and persist it. Returns False if deduplicated."""
        added = super().add_task(task_ref, summary)
        if added:
            self._upsert(self._entries[task_ref])
        return added

    def add_ticket(self, key: str, summary: str) -> bool:
        """Legacy wrapper for add_task during queue migration."""
        return self.add_task(key, summary)

    def mark_started(self, task_ref: str) -> None:
        """Mark a task as started and persist the change."""
        super().mark_started(task_ref)
        entry = self._entries.get(task_ref)
        if entry is not None:
            self._upsert(entry)

    def mark_completed(self, task_ref: str, success: bool) -> None:
        """Mark a task as completed and persist the change."""
        super().mark_completed(task_ref, success)
        entry = self._entries.get(task_ref)
        if entry is not None:
            self._upsert(entry)

    def reset_to_pending(self, task_ref: str) -> bool:
        """Reset a failed task to pending and persist the change."""
        result = super().reset_to_pending(task_ref)
        if result:
            entry = self._entries.get(task_ref)
            if entry is not None:
                self._upsert(entry)
        return result
