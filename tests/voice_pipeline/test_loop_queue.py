"""Tests for the LoopQueue ticket queue and auto-dispatch integration."""

import time
from unittest.mock import AsyncMock

import pytest

from src.voice_pipeline.config import Settings
from src.voice_pipeline.loop_queue import LoopQueue, TicketStatus
from src.voice_pipeline.pipeline.orchestrator import PipelineOrchestrator, PipelineResult
from src.voice_pipeline.pipeline.status import MonitorService


class TestLoopQueue:
    def test_add_task(self):
        """Adding a task should make it appear in pending."""
        queue = LoopQueue()
        result = queue.add_task("DEV-1", "Build login")
        assert result is True
        pending = queue.get_pending()
        assert len(pending) == 1
        assert pending[0] == {"task_ref": "DEV-1", "summary": "Build login"}

    def test_dedup_within_window(self):
        """Same task ref within dedup window should be rejected."""
        queue = LoopQueue(dedup_window=300)
        assert queue.add_task("DEV-1", "Build login") is True
        assert queue.add_task("DEV-1", "Build login again") is False
        pending = queue.get_pending()
        assert len(pending) == 1

    def test_dedup_after_window(self):
        """Same task ref after dedup window should be accepted."""
        queue = LoopQueue(dedup_window=0.01)  # 10ms window
        assert queue.add_task("DEV-1", "Build login") is True
        time.sleep(0.02)  # Wait past window
        assert queue.add_task("DEV-1", "Build login v2") is True
        # The entry is replaced, so still 1 pending
        pending = queue.get_pending()
        assert len(pending) == 1
        assert pending[0]["summary"] == "Build login v2"

    def test_mark_started(self):
        """Started task should disappear from pending."""
        queue = LoopQueue()
        queue.add_task("DEV-1", "Build login")
        queue.mark_started("DEV-1")
        pending = queue.get_pending()
        assert len(pending) == 0
        assert queue._entries["DEV-1"].status == TicketStatus.STARTED

    def test_mark_completed_success(self):
        """Completed task should have correct status and success flag."""
        queue = LoopQueue()
        queue.add_task("DEV-1", "Build login")
        queue.mark_started("DEV-1")
        queue.mark_completed("DEV-1", success=True)
        entry = queue._entries["DEV-1"]
        assert entry.status == TicketStatus.COMPLETED
        assert entry.success is True

    def test_mark_completed_failure(self):
        """Failed task should have FAILED status."""
        queue = LoopQueue()
        queue.add_task("DEV-1", "Build login")
        queue.mark_started("DEV-1")
        queue.mark_completed("DEV-1", success=False)
        entry = queue._entries["DEV-1"]
        assert entry.status == TicketStatus.FAILED
        assert entry.success is False

    def test_multiple_tasks(self):
        """Multiple different tasks should all be pending."""
        queue = LoopQueue()
        queue.add_task("DEV-1", "First")
        queue.add_task("DEV-2", "Second")
        queue.add_task("DEV-3", "Third")
        pending = queue.get_pending()
        assert len(pending) == 3

    def test_mark_started_unknown_task_ref(self):
        """Marking unknown task ref should not raise."""
        queue = LoopQueue()
        queue.mark_started("NONEXISTENT")  # Should not raise

    def test_mark_completed_unknown_task_ref(self):
        """Marking unknown task ref completed should not raise."""
        queue = LoopQueue()
        queue.mark_completed("NONEXISTENT", success=True)  # Should not raise


# ---------------------------------------------------------------------------
# Auto-dispatch integration tests (orchestrator + queue)
# ---------------------------------------------------------------------------


def _make_settings(**overrides) -> Settings:
    defaults = {
        "linear_api_key": "linear-test-token",
        "linear_team_key": "SEJ",
    }
    defaults.update(overrides)
    return Settings(**defaults)


@pytest.mark.asyncio
class TestAutoDispatch:
    async def test_auto_dispatch_enabled(self):
        """When auto_dispatch_loop=True, ticket should be queued + broadcast sent."""
        from src.voice_pipeline.intent.models import TaskIntent
        from src.voice_pipeline.linear.client import LinearIssue

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

        intent = TaskIntent(
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

        issue = LinearIssue(
            id="linear-99",
            identifier="99",
            team_key="SEJ",
            team_name="SEJFA",
            title="Build OAuth",
            description="Implement OAuth login",
            url="https://linear.app/sejfa/issue/SEJ-99/build-oauth",
            priority=2,
            state_name="Todo",
            state_type="unstarted",
            assignee=None,
            labels=["auth"],
        )
        mock_linear = AsyncMock()
        mock_linear.create_issue = AsyncMock(return_value=issue)
        orchestrator._linear = mock_linear

        result = await orchestrator.run_from_text("Build OAuth login")

        from src.voice_pipeline.pipeline.orchestrator import PreviewNeeded

        assert isinstance(result, PreviewNeeded)
        assert result.summary == "Build OAuth"

        # Simulate human approval
        result = await orchestrator.continue_with_approval(result.session_id)

        assert isinstance(result, PipelineResult)
        assert result.task_ref == "SEJ-99"

        # Verify ticket was queued
        pending = queue.get_pending()
        assert len(pending) == 1
        assert pending[0]["task_ref"] == "SEJ-99"

        # Verify task_queued broadcast was sent
        queued_calls = [
            c
            for c in broadcast.call_args_list
            if isinstance(c.args[0], dict) and c.args[0].get("type") == "task_queued"
        ]
        assert len(queued_calls) == 1
        assert queued_calls[0].args[0]["task_ref"] == "SEJ-99"
        assert "issue_key" not in queued_calls[0].args[0]

    async def test_auto_dispatch_disabled(self):
        """When auto_dispatch_loop=False, ticket should NOT be queued."""
        from src.voice_pipeline.intent.models import TaskIntent
        from src.voice_pipeline.linear.client import LinearIssue

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

        intent = TaskIntent(
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

        issue = LinearIssue(
            id="linear-99",
            identifier="99",
            team_key="SEJ",
            team_name="SEJFA",
            title="Build OAuth",
            description="Implement OAuth login",
            url="https://linear.app/sejfa/issue/SEJ-99/build-oauth",
            priority=2,
            state_name="Todo",
            state_type="unstarted",
            assignee=None,
            labels=["auth"],
        )
        mock_linear = AsyncMock()
        mock_linear.create_issue = AsyncMock(return_value=issue)
        orchestrator._linear = mock_linear

        result = await orchestrator.run_from_text("Build OAuth login")

        from src.voice_pipeline.pipeline.orchestrator import PreviewNeeded

        assert isinstance(result, PreviewNeeded)

        # Simulate human approval
        result = await orchestrator.continue_with_approval(result.session_id)

        assert isinstance(result, PipelineResult)

        # Verify task was NOT queued
        pending = queue.get_pending()
        assert len(pending) == 0

        # No task_queued broadcast
        queued_calls = [
            c
            for c in broadcast.call_args_list
            if isinstance(c.args[0], dict) and c.args[0].get("type") == "task_queued"
        ]
        assert len(queued_calls) == 0
