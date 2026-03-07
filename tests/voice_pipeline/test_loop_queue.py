"""Tests for the LoopQueue ticket queue and auto-dispatch integration."""

import time
from unittest.mock import AsyncMock

import pytest

from src.voice_pipeline.config import Settings
from src.voice_pipeline.loop_queue import LoopQueue, TicketStatus
from src.voice_pipeline.pipeline.orchestrator import PipelineOrchestrator, PipelineResult
from src.voice_pipeline.pipeline.status import MonitorService


class TestLoopQueue:
    def test_add_ticket(self):
        """Adding a ticket should make it appear in pending."""
        queue = LoopQueue()
        result = queue.add_ticket("DEV-1", "Build login")
        assert result is True
        pending = queue.get_pending()
        assert len(pending) == 1
        assert pending[0]["key"] == "DEV-1"
        assert pending[0]["summary"] == "Build login"

    def test_dedup_within_window(self):
        """Same key within dedup window should be rejected."""
        queue = LoopQueue(dedup_window=300)
        assert queue.add_ticket("DEV-1", "Build login") is True
        assert queue.add_ticket("DEV-1", "Build login again") is False
        pending = queue.get_pending()
        assert len(pending) == 1

    def test_dedup_after_window(self):
        """Same key after dedup window should be accepted."""
        queue = LoopQueue(dedup_window=0.01)  # 10ms window
        assert queue.add_ticket("DEV-1", "Build login") is True
        time.sleep(0.02)  # Wait past window
        assert queue.add_ticket("DEV-1", "Build login v2") is True
        # The entry is replaced, so still 1 pending
        pending = queue.get_pending()
        assert len(pending) == 1
        assert pending[0]["summary"] == "Build login v2"

    def test_mark_started(self):
        """Started ticket should disappear from pending."""
        queue = LoopQueue()
        queue.add_ticket("DEV-1", "Build login")
        queue.mark_started("DEV-1")
        pending = queue.get_pending()
        assert len(pending) == 0
        assert queue._entries["DEV-1"].status == TicketStatus.STARTED

    def test_mark_completed_success(self):
        """Completed ticket should have correct status and success flag."""
        queue = LoopQueue()
        queue.add_ticket("DEV-1", "Build login")
        queue.mark_started("DEV-1")
        queue.mark_completed("DEV-1", success=True)
        entry = queue._entries["DEV-1"]
        assert entry.status == TicketStatus.COMPLETED
        assert entry.success is True

    def test_mark_completed_failure(self):
        """Failed ticket should have FAILED status."""
        queue = LoopQueue()
        queue.add_ticket("DEV-1", "Build login")
        queue.mark_started("DEV-1")
        queue.mark_completed("DEV-1", success=False)
        entry = queue._entries["DEV-1"]
        assert entry.status == TicketStatus.FAILED
        assert entry.success is False

    def test_multiple_tickets(self):
        """Multiple different tickets should all be pending."""
        queue = LoopQueue()
        queue.add_ticket("DEV-1", "First")
        queue.add_ticket("DEV-2", "Second")
        queue.add_ticket("DEV-3", "Third")
        pending = queue.get_pending()
        assert len(pending) == 3

    def test_mark_started_unknown_key(self):
        """Marking unknown key should not raise."""
        queue = LoopQueue()
        queue.mark_started("NONEXISTENT")  # Should not raise

    def test_mark_completed_unknown_key(self):
        """Marking unknown key completed should not raise."""
        queue = LoopQueue()
        queue.mark_completed("NONEXISTENT", success=True)  # Should not raise


# ---------------------------------------------------------------------------
# Auto-dispatch integration tests (orchestrator + queue)
# ---------------------------------------------------------------------------


def _make_settings(**overrides) -> Settings:
    defaults = {
        "jira_url": "https://test.atlassian.net",
        "jira_email": "test@example.com",
        "jira_api_token": "fake-token",
        "jira_project_key": "TEST",
    }
    defaults.update(overrides)
    return Settings(**defaults)


@pytest.mark.asyncio
class TestAutoDispatch:
    async def test_auto_dispatch_enabled(self):
        """When auto_dispatch_loop=True, ticket should be queued + broadcast sent."""
        from src.voice_pipeline.intent.models import JiraTicketIntent
        from src.voice_pipeline.jira.client import JiraIssue

        settings = _make_settings(auto_dispatch_loop=True)
        monitor = MonitorService()
        broadcast = AsyncMock()
        queue = LoopQueue()

        orchestrator = PipelineOrchestrator(
            settings=settings,
            monitor=monitor,
            broadcast=broadcast,
            loop_queue=queue,
        )

        intent = JiraTicketIntent(
            summary="Build OAuth",
            description="Implement OAuth login",
            acceptance_criteria="Login works",
            issue_type="Story",
            priority="High",
            ambiguity_score=0.1,
            clarification_questions=[],
            labels=["auth"],
        )
        mock_extractor = AsyncMock()
        mock_extractor.extract = AsyncMock(return_value=intent)
        orchestrator._extractor = mock_extractor

        issue = JiraIssue(
            key="TEST-99",
            summary="Build OAuth",
            description="Implement OAuth login",
            issue_type="Story",
            status="To Do",
            priority="High",
            labels=["auth", "VOICE_INITIATED"],
            url="https://test.atlassian.net/browse/TEST-99",
            raw={},
        )
        mock_jira = AsyncMock()
        mock_jira.create_issue = AsyncMock(return_value=issue)
        orchestrator._jira = mock_jira

        result = await orchestrator.run_from_text("Build OAuth login")

        assert isinstance(result, PipelineResult)
        assert result.ticket_key == "TEST-99"

        # Verify ticket was queued
        pending = queue.get_pending()
        assert len(pending) == 1
        assert pending[0]["key"] == "TEST-99"

        # Verify ticket_queued broadcast was sent
        queued_calls = [
            c
            for c in broadcast.call_args_list
            if isinstance(c.args[0], dict) and c.args[0].get("type") == "ticket_queued"
        ]
        assert len(queued_calls) == 1
        assert queued_calls[0].args[0]["issue_key"] == "TEST-99"

    async def test_auto_dispatch_disabled(self):
        """When auto_dispatch_loop=False, ticket should NOT be queued."""
        from src.voice_pipeline.intent.models import JiraTicketIntent
        from src.voice_pipeline.jira.client import JiraIssue

        settings = _make_settings(auto_dispatch_loop=False)
        monitor = MonitorService()
        broadcast = AsyncMock()
        queue = LoopQueue()

        orchestrator = PipelineOrchestrator(
            settings=settings,
            monitor=monitor,
            broadcast=broadcast,
            loop_queue=queue,
        )

        intent = JiraTicketIntent(
            summary="Build OAuth",
            description="Implement OAuth login",
            acceptance_criteria="Login works",
            issue_type="Story",
            priority="High",
            ambiguity_score=0.1,
            clarification_questions=[],
            labels=["auth"],
        )
        mock_extractor = AsyncMock()
        mock_extractor.extract = AsyncMock(return_value=intent)
        orchestrator._extractor = mock_extractor

        issue = JiraIssue(
            key="TEST-99",
            summary="Build OAuth",
            description="Implement OAuth login",
            issue_type="Story",
            status="To Do",
            priority="High",
            labels=["auth", "VOICE_INITIATED"],
            url="https://test.atlassian.net/browse/TEST-99",
            raw={},
        )
        mock_jira = AsyncMock()
        mock_jira.create_issue = AsyncMock(return_value=issue)
        orchestrator._jira = mock_jira

        result = await orchestrator.run_from_text("Build OAuth login")

        assert isinstance(result, PipelineResult)

        # Verify ticket was NOT queued
        pending = queue.get_pending()
        assert len(pending) == 0

        # No ticket_queued broadcast
        queued_calls = [
            c
            for c in broadcast.call_args_list
            if isinstance(c.args[0], dict) and c.args[0].get("type") == "ticket_queued"
        ]
        assert len(queued_calls) == 0
