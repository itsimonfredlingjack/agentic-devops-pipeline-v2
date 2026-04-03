"""SQLite-backed dead-letter queue for failed loop tickets."""

from __future__ import annotations

import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass
class DeadLetterEntry:
    key: str
    summary: str
    attempts: int
    last_error: str
    moved_at: float


class DeadLetterQueue:
    """Persists tickets that have exhausted retry attempts."""

    def __init__(self, db_path: str | Path = "data/dead_letter.db") -> None:
        self._db_path = str(db_path)
        self._conn = sqlite3.connect(self._db_path)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS dead_letter (
                key TEXT PRIMARY KEY,
                summary TEXT NOT NULL DEFAULT '',
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT NOT NULL DEFAULT '',
                moved_at REAL NOT NULL
            )
            """
        )
        self._conn.commit()

    def add(self, key: str, summary: str, attempts: int, last_error: str) -> None:
        """Move a ticket to the dead-letter queue."""
        self._conn.execute(
            """
            INSERT OR REPLACE INTO dead_letter (key, summary, attempts, last_error, moved_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (key, summary, attempts, last_error, time.time()),
        )
        self._conn.commit()

    def list_all(self) -> list[DeadLetterEntry]:
        """Return all dead-letter entries."""
        rows = self._conn.execute(
            "SELECT key, summary, attempts, last_error, moved_at FROM dead_letter ORDER BY moved_at DESC"
        ).fetchall()
        return [DeadLetterEntry(*row) for row in rows]

    def remove(self, key: str) -> bool:
        """Remove a ticket from the DLQ (e.g., for manual retry)."""
        cursor = self._conn.execute("DELETE FROM dead_letter WHERE key = ?", (key,))
        self._conn.commit()
        return cursor.rowcount > 0

    def contains(self, key: str) -> bool:
        """Check if a ticket is in the DLQ."""
        row = self._conn.execute("SELECT 1 FROM dead_letter WHERE key = ?", (key,)).fetchone()
        return row is not None

    def close(self) -> None:
        self._conn.close()
