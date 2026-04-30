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
        assert config.signal_poll_interval == 2
        assert config.max_backoff == 300
        assert config.api_token == ""

    def test_from_env(self, monkeypatch):
        monkeypatch.setenv("LOOP_RUNNER_BACKEND_URL", "http://custom:9000")
        monkeypatch.setenv("LOOP_RUNNER_POLL_INTERVAL", "30")
        monkeypatch.setenv("LOOP_RUNNER_SIGNAL_POLL_INTERVAL", "5")
        monkeypatch.setenv("SEJFA_LOCAL_API_TOKEN", "test-local-token")
        config = LoopConfig.from_env()
        assert config.backend_url == "http://custom:9000"
        assert config.poll_interval == 30
        assert config.signal_poll_interval == 5
        assert config.api_token == "test-local-token"


class TestLoopRunner:
    def _make_runner(self, tmp_path) -> LoopRunner:
        config = LoopConfig(
            backend_url="http://test:8000",
            monitor_url="http://test-monitor:8110",
            repo_dir=str(tmp_path),
            poll_interval=1,
            signal_poll_interval=1,
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

    def test_poll_queue_returns_task_ref_first_entry(self, tmp_path):
        runner = self._make_runner(tmp_path)
        with patch("loop_engine.runner.urllib.request.urlopen") as mock_open:
            mock_resp = MagicMock()
            mock_resp.__enter__ = MagicMock(return_value=mock_resp)
            mock_resp.__exit__ = MagicMock(return_value=False)
            mock_resp.read.return_value = b'[{"task_ref": "SEJ-1", "summary": "Fix login"}]'
            mock_open.return_value = mock_resp
            result = runner._poll_queue()
            assert result == {"task_ref": "SEJ-1", "summary": "Fix login"}

    def test_poll_queue_skips_dlq_task(self, tmp_path):
        runner = self._make_runner(tmp_path)
        runner._dlq.add("DEV-1", "Fix login", 3, "exhausted")
        with patch("loop_engine.runner.urllib.request.urlopen") as mock_open:
            mock_resp = MagicMock()
            mock_resp.__enter__ = MagicMock(return_value=mock_resp)
            mock_resp.__exit__ = MagicMock(return_value=False)
            mock_resp.read.return_value = b'[{"task_ref": "DEV-1", "summary": "Fix login"}]'
            mock_open.return_value = mock_resp
            result = runner._poll_queue()
            assert result is None

    def test_build_start_prompt_uses_task_ref_and_guidance(self, tmp_path):
        runner = self._make_runner(tmp_path)
        runner._queue_task_guidance("SEJ-42", "Check deploy config before retry.")
        prompt = runner._build_start_prompt("SEJ-42")
        assert prompt.startswith("/start-task SEJ-42")
        assert "Check deploy config before retry." in prompt

    def test_poll_session_signals_returns_json_dict(self, tmp_path):
        runner = self._make_runner(tmp_path)
        with patch("loop_engine.runner.urllib.request.urlopen") as mock_open:
            mock_resp = MagicMock()
            mock_resp.__enter__ = MagicMock(return_value=mock_resp)
            mock_resp.__exit__ = MagicMock(return_value=False)
            mock_resp.read.return_value = b'{"abort": true, "instruction": "Use smaller diff"}'
            mock_open.return_value = mock_resp
            signals = runner._poll_session_signals("sess-1")
            assert signals == {"abort": True, "instruction": "Use smaller diff"}

    def test_poll_session_signals_sends_monitor_auth_header(self, tmp_path):
        config = LoopConfig(
            backend_url="http://test:8000",
            monitor_url="http://test-monitor:8110",
            repo_dir=str(tmp_path),
            log_dir=tmp_path / "logs",
            api_token="test-local-token",
        )
        runner = LoopRunner(config)
        with patch("loop_engine.runner.urllib.request.urlopen") as mock_open:
            mock_resp = MagicMock()
            mock_resp.__enter__ = MagicMock(return_value=mock_resp)
            mock_resp.__exit__ = MagicMock(return_value=False)
            mock_resp.read.return_value = b"{}"
            mock_open.return_value = mock_resp

            runner._poll_session_signals("sess-1")

        request = mock_open.call_args.args[0]
        assert request.headers["Authorization"] == "Bearer test-local-token"

    def test_notify_methods_and_outcome_posts_are_fire_and_forget(self, tmp_path):
        runner = self._make_runner(tmp_path)
        runner._notify_started("DEV-1")
        runner._notify_completed("DEV-1", True)
        runner._post_session_outcome("sess-1", "DEV-1", "blocked", "waiting on operator")

    def test_request_retry_posts_retry_endpoint(self, tmp_path):
        runner = self._make_runner(tmp_path)
        with patch.object(runner, "_post") as mock_post:
            runner._request_retry("SEJ-77")
        mock_post.assert_called_once()
        assert mock_post.call_args.args[0] == "http://test:8000/api/loop/retry/SEJ-77"
        assert mock_post.call_args.args[1] == {}
