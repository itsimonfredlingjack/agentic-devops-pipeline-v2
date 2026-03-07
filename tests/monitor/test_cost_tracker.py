"""Tests for cost tracking."""

import pytest

from src.monitor.cost_tracker import CostTracker


def make_event(
    session_id: str = "test-session",
    input_t: int = 1000,
    output_t: int = 500,
    cache_t: int = 2000,
):
    return {
        "session_id": session_id,
        "tokens": {
            "input": input_t,
            "output": output_t,
            "cache_read": cache_t,
        },
    }


class TestCostTracker:
    def test_single_event_cost(self):
        tracker = CostTracker()
        update = tracker.add_event(make_event(input_t=1_000_000, output_t=0, cache_t=0))
        # 1M input tokens at $15/1M = $15.00
        assert update.total_usd == pytest.approx(15.0, abs=0.01)
        assert update.breakdown.input_usd == pytest.approx(15.0, abs=0.01)

    def test_accumulation(self):
        tracker = CostTracker()
        tracker.add_event(make_event(input_t=500_000, output_t=0, cache_t=0))
        update = tracker.add_event(make_event(input_t=500_000, output_t=0, cache_t=0))
        assert update.total_usd == pytest.approx(15.0, abs=0.01)

    def test_full_breakdown(self):
        tracker = CostTracker()
        update = tracker.add_event(
            make_event(
                input_t=1_000_000,
                output_t=1_000_000,
                cache_t=1_000_000,
            )
        )
        assert update.breakdown.input_usd == pytest.approx(15.0, abs=0.01)
        assert update.breakdown.output_usd == pytest.approx(75.0, abs=0.01)
        assert update.breakdown.cache_usd == pytest.approx(1.5, abs=0.01)
        assert update.total_usd == pytest.approx(91.5, abs=0.01)

    def test_separate_sessions(self):
        tracker = CostTracker()
        tracker.add_event(make_event(session_id="s1", input_t=1_000_000))
        tracker.add_event(make_event(session_id="s2", input_t=2_000_000))
        s1 = tracker.get_session_cost("s1")
        s2 = tracker.get_session_cost("s2")
        assert s1.total_usd < s2.total_usd

    def test_no_tokens_no_crash(self):
        tracker = CostTracker()
        update = tracker.add_event({"session_id": "s1", "tokens": None})
        assert update.total_usd == 0.0

    def test_reset_session(self):
        tracker = CostTracker()
        tracker.add_event(make_event(session_id="s1", input_t=1_000_000))
        tracker.reset("s1")
        cost = tracker.get_session_cost("s1")
        assert cost.total_usd == 0.0
