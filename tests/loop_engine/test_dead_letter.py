"""Tests for the dead-letter queue."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "services/loop-engine/src"))

from loop_engine.dead_letter import DeadLetterQueue


class TestDeadLetterQueue:
    def test_add_and_list(self, tmp_path):
        dlq = DeadLetterQueue(tmp_path / "dlq.db")
        dlq.add("DEV-1", "Fix login", 3, "timeout")
        entries = dlq.list_all()
        assert len(entries) == 1
        assert entries[0].key == "DEV-1"
        assert entries[0].summary == "Fix login"
        assert entries[0].attempts == 3
        assert entries[0].last_error == "timeout"
        dlq.close()

    def test_contains(self, tmp_path):
        dlq = DeadLetterQueue(tmp_path / "dlq.db")
        assert not dlq.contains("DEV-1")
        dlq.add("DEV-1", "Fix login", 1, "error")
        assert dlq.contains("DEV-1")
        dlq.close()

    def test_remove(self, tmp_path):
        dlq = DeadLetterQueue(tmp_path / "dlq.db")
        dlq.add("DEV-1", "Fix login", 1, "error")
        assert dlq.remove("DEV-1")
        assert not dlq.contains("DEV-1")
        assert not dlq.remove("DEV-1")
        dlq.close()

    def test_add_replaces_existing(self, tmp_path):
        dlq = DeadLetterQueue(tmp_path / "dlq.db")
        dlq.add("DEV-1", "Fix login", 1, "first error")
        dlq.add("DEV-1", "Fix login", 3, "third error")
        entries = dlq.list_all()
        assert len(entries) == 1
        assert entries[0].attempts == 3
        assert entries[0].last_error == "third error"
        dlq.close()

    def test_persists_across_instances(self, tmp_path):
        db_path = tmp_path / "dlq.db"
        dlq1 = DeadLetterQueue(db_path)
        dlq1.add("DEV-1", "Fix login", 2, "error")
        dlq1.close()

        dlq2 = DeadLetterQueue(db_path)
        assert dlq2.contains("DEV-1")
        entries = dlq2.list_all()
        assert len(entries) == 1
        dlq2.close()

    def test_list_ordered_by_newest_first(self, tmp_path):
        import time

        dlq = DeadLetterQueue(tmp_path / "dlq.db")
        dlq.add("DEV-1", "First", 1, "e1")
        time.sleep(0.01)
        dlq.add("DEV-2", "Second", 1, "e2")
        entries = dlq.list_all()
        assert entries[0].key == "DEV-2"
        assert entries[1].key == "DEV-1"
        dlq.close()
