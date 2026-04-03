"""Tests for stuck detection."""

from src.monitor.stuck_detector import StuckDetector


def make_event(tool_name: str = "Bash", args_hash: str = "abc123", **kwargs):
    return {
        "session_id": "test-session",
        "tool_name": tool_name,
        "tool_args_hash": args_hash,
        "tool_args_summary": f"{tool_name} test command",
        "timestamp": "2026-02-24T14:00:00Z",
        "tokens": {"input": 500, "output": 200},
        **kwargs,
    }


class TestStuckDetector:
    def test_no_alert_under_threshold(self):
        detector = StuckDetector(window_size=10, threshold=3)
        assert detector.check(make_event()) is None
        assert detector.check(make_event()) is None

    def test_alert_at_threshold(self):
        detector = StuckDetector(window_size=10, threshold=3)
        detector.check(make_event())
        detector.check(make_event())
        alert = detector.check(make_event())
        assert alert is not None
        assert alert.repeat_count == 3
        assert "Bash" in alert.pattern

    def test_no_duplicate_alert(self):
        detector = StuckDetector(window_size=10, threshold=3)
        for _ in range(3):
            detector.check(make_event())
        # 4th identical call should NOT re-alert (already alerted)
        alert = detector.check(make_event())
        assert alert is None

    def test_different_events_no_alert(self):
        detector = StuckDetector(window_size=10, threshold=3)
        detector.check(make_event(args_hash="aaa"))
        detector.check(make_event(args_hash="bbb"))
        alert = detector.check(make_event(args_hash="ccc"))
        assert alert is None

    def test_reset_after_new_unique(self):
        detector = StuckDetector(window_size=10, threshold=3)
        # Trigger first alert
        for _ in range(3):
            detector.check(make_event(args_hash="stuck1"))
        # New unique call resets alert flag
        detector.check(make_event(args_hash="unique"))
        # New pattern triggers second alert
        for _ in range(2):
            detector.check(make_event(args_hash="stuck2"))
        alert = detector.check(make_event(args_hash="stuck2"))
        assert alert is not None
        assert alert.repeat_count == 3

    def test_two_alerts_total(self):
        detector = StuckDetector(window_size=10, threshold=3)
        alerts = []
        # First stuck pattern
        for _ in range(3):
            a = detector.check(make_event(args_hash="p1"))
            if a:
                alerts.append(a)
        # Break pattern
        detector.check(make_event(args_hash="break"))
        # Second stuck pattern
        for _ in range(3):
            a = detector.check(make_event(args_hash="p2"))
            if a:
                alerts.append(a)
        assert len(alerts) == 2

    def test_reset_clears_state(self):
        detector = StuckDetector(window_size=10, threshold=3)
        detector.check(make_event())
        detector.check(make_event())
        detector.reset("test-session")
        # After reset, counter restarts
        assert detector.check(make_event()) is None
        assert detector.check(make_event()) is None
        alert = detector.check(make_event())
        assert alert is not None
