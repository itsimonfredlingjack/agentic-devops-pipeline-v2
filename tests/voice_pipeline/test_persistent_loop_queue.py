"""Tests for the PersistentLoopQueue with SQLite-backed storage.

Verifies that queue entries survive process restarts, deduplication
works across instances, and all CRUD operations persist to disk.
"""

from pathlib import Path

from src.voice_pipeline.loop_queue import LoopQueue, TicketStatus


class TestPersistentLoopQueuePersistence:
    """Tests that verify data survives across PersistentLoopQueue instances."""

    def test_enqueue_persists_across_instances(self, tmp_path: Path) -> None:
        """Items enqueued in one instance should appear in a new instance."""
        from src.voice_pipeline.persistent_loop_queue import PersistentLoopQueue

        db_path = tmp_path / "queue.db"

        # Instance 1: add tickets
        q1 = PersistentLoopQueue(db_path=db_path)
        q1.add_ticket("DEV-1", "Build login")
        q1.add_ticket("DEV-2", "Fix logout")

        # Instance 2: should see both tickets
        q2 = PersistentLoopQueue(db_path=db_path)
        pending = q2.get_pending()
        keys = {item["key"] for item in pending}
        assert keys == {"DEV-1", "DEV-2"}

    def test_restart_recovery_preserves_status(self, tmp_path: Path) -> None:
        """Items in various states should be recoverable after restart."""
        from src.voice_pipeline.persistent_loop_queue import PersistentLoopQueue

        db_path = tmp_path / "queue.db"

        q1 = PersistentLoopQueue(db_path=db_path)
        q1.add_ticket("DEV-1", "Pending ticket")
        q1.add_ticket("DEV-2", "Started ticket")
        q1.add_ticket("DEV-3", "Completed ticket")
        q1.add_ticket("DEV-4", "Failed ticket")
        q1.mark_started("DEV-2")
        q1.mark_started("DEV-3")
        q1.mark_completed("DEV-3", success=True)
        q1.mark_started("DEV-4")
        q1.mark_completed("DEV-4", success=False)

        # New instance should recover all states
        q2 = PersistentLoopQueue(db_path=db_path)
        pending = q2.get_pending()
        pending_keys = {item["key"] for item in pending}
        assert pending_keys == {"DEV-1"}

        # Verify internal entries have correct statuses
        assert q2._entries["DEV-1"].status == TicketStatus.PENDING
        assert q2._entries["DEV-2"].status == TicketStatus.STARTED
        assert q2._entries["DEV-3"].status == TicketStatus.COMPLETED
        assert q2._entries["DEV-3"].success is True
        assert q2._entries["DEV-4"].status == TicketStatus.FAILED
        assert q2._entries["DEV-4"].success is False

    def test_deduplication_across_instances(self, tmp_path: Path) -> None:
        """Enqueueing the same ticket_key twice should not create duplicates."""
        from src.voice_pipeline.persistent_loop_queue import PersistentLoopQueue

        db_path = tmp_path / "queue.db"

        q1 = PersistentLoopQueue(db_path=db_path)
        assert q1.add_ticket("DEV-1", "Build login") is True
        # Same key, same instance - should be deduplicated
        assert q1.add_ticket("DEV-1", "Build login again") is False

        # New instance - ticket still exists, should still be dedup'd
        q2 = PersistentLoopQueue(db_path=db_path)
        assert q2.add_ticket("DEV-1", "Build login yet again") is False
        pending = q2.get_pending()
        assert len(pending) == 1
        assert pending[0]["summary"] == "Build login"


class TestPersistentLoopQueueCRUD:
    """Tests for all CRUD operations backed by SQLite."""

    def test_add_and_get_pending(self, tmp_path: Path) -> None:
        """Basic add_ticket and get_pending should work with SQLite backing."""
        from src.voice_pipeline.persistent_loop_queue import PersistentLoopQueue

        db_path = tmp_path / "queue.db"
        q = PersistentLoopQueue(db_path=db_path)
        q.add_ticket("DEV-10", "Implement feature X")
        pending = q.get_pending()
        assert len(pending) == 1
        assert pending[0]["key"] == "DEV-10"
        assert pending[0]["summary"] == "Implement feature X"

    def test_mark_started_persists(self, tmp_path: Path) -> None:
        """mark_started should persist to SQLite."""
        from src.voice_pipeline.persistent_loop_queue import PersistentLoopQueue

        db_path = tmp_path / "queue.db"
        q1 = PersistentLoopQueue(db_path=db_path)
        q1.add_ticket("DEV-5", "Some work")
        q1.mark_started("DEV-5")

        q2 = PersistentLoopQueue(db_path=db_path)
        pending = q2.get_pending()
        assert len(pending) == 0
        assert q2._entries["DEV-5"].status == TicketStatus.STARTED

    def test_mark_completed_persists(self, tmp_path: Path) -> None:
        """mark_completed should persist success/failure to SQLite."""
        from src.voice_pipeline.persistent_loop_queue import PersistentLoopQueue

        db_path = tmp_path / "queue.db"
        q1 = PersistentLoopQueue(db_path=db_path)
        q1.add_ticket("DEV-6", "Bugfix")
        q1.mark_started("DEV-6")
        q1.mark_completed("DEV-6", success=True)

        q2 = PersistentLoopQueue(db_path=db_path)
        entry = q2._entries["DEV-6"]
        assert entry.status == TicketStatus.COMPLETED
        assert entry.success is True

    def test_mark_unknown_key_no_error(self, tmp_path: Path) -> None:
        """Marking an unknown key should not raise, matching LoopQueue behavior."""
        from src.voice_pipeline.persistent_loop_queue import PersistentLoopQueue

        db_path = tmp_path / "queue.db"
        q = PersistentLoopQueue(db_path=db_path)
        q.mark_started("NONEXISTENT")
        q.mark_completed("NONEXISTENT", success=True)
        # Should reach here without error

    def test_multiple_tickets_crud(self, tmp_path: Path) -> None:
        """Full lifecycle with multiple tickets across restart."""
        from src.voice_pipeline.persistent_loop_queue import PersistentLoopQueue

        db_path = tmp_path / "queue.db"
        q1 = PersistentLoopQueue(db_path=db_path)

        q1.add_ticket("DEV-A", "Task A")
        q1.add_ticket("DEV-B", "Task B")
        q1.add_ticket("DEV-C", "Task C")
        q1.mark_started("DEV-A")
        q1.mark_completed("DEV-A", success=True)

        q2 = PersistentLoopQueue(db_path=db_path)
        pending = q2.get_pending()
        pending_keys = sorted(item["key"] for item in pending)
        assert pending_keys == ["DEV-B", "DEV-C"]


class TestPersistentLoopQueueIsDropIn:
    """Verify PersistentLoopQueue is a drop-in replacement for LoopQueue."""

    def test_is_subclass_of_loop_queue(self) -> None:
        """PersistentLoopQueue should extend LoopQueue."""
        from src.voice_pipeline.persistent_loop_queue import PersistentLoopQueue

        assert issubclass(PersistentLoopQueue, LoopQueue)

    def test_settings_queue_db_path(self) -> None:
        """Settings should have a queue_db_path field with a default value."""
        from src.voice_pipeline.config import Settings

        settings = Settings(
            jira_url="https://test.atlassian.net",
            jira_email="test@example.com",
            jira_api_token="fake-token",
            jira_project_key="TEST",
        )
        assert hasattr(settings, "queue_db_path")
        assert settings.queue_db_path == "loop_queue.db"
