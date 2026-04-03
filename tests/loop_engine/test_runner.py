"""Tests for the loop runner."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "services/loop-engine/src"))

from loop_engine.config import LoopConfig
from loop_engine.runner import LoopRunner


class TestLoopConfig:
    def test_defaults(self):
        config = LoopConfig()
        assert config.backend_url == "http://localhost:8000"
        assert config.poll_interval == 10
        assert config.max_retries == 3
        assert config.heartbeat_interval == 30
        assert config.max_backoff == 300

    def test_from_env(self, monkeypatch):
        monkeypatch.setenv("LOOP_RUNNER_BACKEND_URL", "http://custom:9000")
        monkeypatch.setenv("LOOP_RUNNER_POLL_INTERVAL", "30")
        config = LoopConfig.from_env()
        assert config.backend_url == "http://custom:9000"
        assert config.poll_interval == 30


class TestLoopRunner:
    def _make_runner(self, tmp_path) -> LoopRunner:
        config = LoopConfig(
            backend_url="http://test:8000",
            repo_dir=str(tmp_path),
            poll_interval=1,
            log_dir=tmp_path / "logs",
            max_retries=2,
        )
        return LoopRunner(config)

    def test_init_creates_log_dir(self, tmp_path):
        runner = self._make_runner(tmp_path)
        assert runner.config.log_dir.exists()

    def test_handle_signal_stops_runner(self, tmp_path):
        runner = self._make_runner(tmp_path)
        assert runner._running
        runner._handle_signal(2, None)  # SIGINT
        assert not runner._running

    def test_handle_failure_tracks_retries(self, tmp_path):
        runner = self._make_runner(tmp_path)
        runner._handle_failure("DEV-1", "Fix login", "timeout")
        assert runner._retry_counts["DEV-1"] == 1

    def test_handle_failure_moves_to_dlq_after_max_retries(self, tmp_path):
        runner = self._make_runner(tmp_path)
        runner._handle_failure("DEV-1", "Fix login", "err1")
        runner._handle_failure("DEV-1", "Fix login", "err2")
        # After 2 retries (max_retries=2), should be in DLQ
        assert runner._dlq.contains("DEV-1")
        assert "DEV-1" not in runner._retry_counts

    def test_poll_queue_returns_none_on_empty(self, tmp_path):
        runner = self._make_runner(tmp_path)
        with patch("loop_engine.runner.urllib.request.urlopen") as mock_open:
            mock_resp = MagicMock()
            mock_resp.__enter__ = MagicMock(return_value=mock_resp)
            mock_resp.__exit__ = MagicMock(return_value=False)
            mock_resp.read.return_value = b"[]"
            mock_open.return_value = mock_resp
            result = runner._poll_queue()
            assert result is None

    def test_poll_queue_returns_ticket(self, tmp_path):
        runner = self._make_runner(tmp_path)
        with patch("loop_engine.runner.urllib.request.urlopen") as mock_open:
            mock_resp = MagicMock()
            mock_resp.__enter__ = MagicMock(return_value=mock_resp)
            mock_resp.__exit__ = MagicMock(return_value=False)
            mock_resp.read.return_value = b'[{"key": "DEV-1", "summary": "Fix login"}]'
            mock_open.return_value = mock_resp
            result = runner._poll_queue()
            assert result == {"key": "DEV-1", "summary": "Fix login"}

    def test_poll_queue_skips_dlq_ticket(self, tmp_path):
        runner = self._make_runner(tmp_path)
        runner._dlq.add("DEV-1", "Fix login", 3, "exhausted")
        with patch("loop_engine.runner.urllib.request.urlopen") as mock_open:
            mock_resp = MagicMock()
            mock_resp.__enter__ = MagicMock(return_value=mock_resp)
            mock_resp.__exit__ = MagicMock(return_value=False)
            mock_resp.read.return_value = b'[{"key": "DEV-1", "summary": "Fix login"}]'
            mock_open.return_value = mock_resp
            result = runner._poll_queue()
            assert result is None

    def test_notify_methods_are_fire_and_forget(self, tmp_path):
        runner = self._make_runner(tmp_path)
        # Should not raise even when backend is down
        runner._notify_started("DEV-1")
        runner._notify_completed("DEV-1", True)
