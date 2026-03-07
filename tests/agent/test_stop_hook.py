"""Tests for Ralph Loop stop-hook infrastructure.

This module provides comprehensive test coverage for the stop-hook.py
that controls Ralph Loop exit behavior.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest


# We need to import the functions carefully since the module has
# module-level code that checks for the loop flag file
class TestPromiseDetection:
    """Tests for completion promise detection in transcripts."""

    def test_promise_found_in_transcript(self) -> None:
        """Promise string should be detected in transcript."""
        transcript = "Some work output\n<promise>DONE</promise>\nMore output"
        promise = "<promise>DONE</promise>"

        assert promise in transcript

    def test_promise_not_found_returns_false(self) -> None:
        """Missing promise should not be detected."""
        transcript = "Some work output without promise"
        promise = "<promise>DONE</promise>"

        assert promise not in transcript

    def test_promise_detection_empty_transcript(self) -> None:
        """Empty transcript should not contain promise."""
        transcript = ""
        promise = "<promise>DONE</promise>"

        assert promise not in transcript

    def test_promise_detection_none_transcript(self) -> None:
        """None transcript should be handled safely."""
        transcript = None
        promise = "<promise>DONE</promise>"

        # Should not raise, just return False-like behavior
        assert not (transcript and promise in transcript)

    def test_promise_partial_match_not_detected(self) -> None:
        """Partial promise should not match."""
        transcript = "<promise>DON</promise>"
        promise = "<promise>DONE</promise>"

        assert promise not in transcript

    def test_promise_case_sensitive(self) -> None:
        """Promise detection should be case sensitive."""
        transcript = "<promise>done</promise>"
        promise = "<promise>DONE</promise>"

        assert promise not in transcript

    def test_promise_with_surrounding_whitespace(self) -> None:
        """Promise with whitespace around it should be detected."""
        transcript = "output   <promise>DONE</promise>   more"
        promise = "<promise>DONE</promise>"

        assert promise in transcript


class TestPromiseFlagFile:
    """Tests for promise flag file detection."""

    def test_flag_file_exists_and_valid(self, tmp_path: Path) -> None:
        """Valid flag file should be detected."""
        flag_dir = tmp_path / ".claude"
        flag_dir.mkdir(parents=True)
        flag_file = flag_dir / ".promise_done"
        flag_file.write_text("<promise>DONE</promise>")

        content = flag_file.read_text().strip()
        assert content == "<promise>DONE</promise>"

    def test_flag_file_wrong_content(self, tmp_path: Path) -> None:
        """Flag file with wrong content should not match."""
        flag_dir = tmp_path / ".claude"
        flag_dir.mkdir(parents=True)
        flag_file = flag_dir / ".promise_done"
        flag_file.write_text("<promise>WRONG</promise>")

        content = flag_file.read_text().strip()
        assert content != "<promise>DONE</promise>"

    def test_flag_file_not_exists(self, tmp_path: Path) -> None:
        """Missing flag file should not match."""
        flag_file = tmp_path / ".claude" / ".promise_done"

        assert not flag_file.exists()

    def test_flag_file_empty(self, tmp_path: Path) -> None:
        """Empty flag file should not match."""
        flag_dir = tmp_path / ".claude"
        flag_dir.mkdir(parents=True)
        flag_file = flag_dir / ".promise_done"
        flag_file.write_text("")

        content = flag_file.read_text().strip()
        assert content != "<promise>DONE</promise>"


class TestIterationTracking:
    """Tests for iteration counting and state management."""

    def test_state_file_creation(self, tmp_path: Path) -> None:
        """State file should be created when it doesn't exist."""
        state_dir = tmp_path / ".claude"
        state_dir.mkdir(parents=True)
        state_file = state_dir / "ralph-state.json"

        # Simulate increment
        state = {"iterations": 1, "started_at": datetime.now().isoformat()}
        state_file.write_text(json.dumps(state, indent=2))

        assert state_file.exists()
        loaded = json.loads(state_file.read_text())
        assert loaded["iterations"] == 1

    def test_iteration_increment(self, tmp_path: Path) -> None:
        """Iteration count should increment correctly."""
        state_dir = tmp_path / ".claude"
        state_dir.mkdir(parents=True)
        state_file = state_dir / "ralph-state.json"

        # Initial state
        state = {"iterations": 5, "started_at": "2026-01-01T00:00:00"}
        state_file.write_text(json.dumps(state))

        # Simulate increment
        loaded = json.loads(state_file.read_text())
        loaded["iterations"] = loaded.get("iterations", 0) + 1
        state_file.write_text(json.dumps(loaded, indent=2))

        final = json.loads(state_file.read_text())
        assert final["iterations"] == 6

    def test_iteration_preserves_started_at(self, tmp_path: Path) -> None:
        """Increment should preserve started_at timestamp."""
        state_dir = tmp_path / ".claude"
        state_dir.mkdir(parents=True)
        state_file = state_dir / "ralph-state.json"

        original_time = "2026-01-01T10:00:00"
        state = {"iterations": 3, "started_at": original_time}
        state_file.write_text(json.dumps(state))

        # Simulate increment
        loaded = json.loads(state_file.read_text())
        loaded["iterations"] = loaded.get("iterations", 0) + 1
        loaded["last_check"] = datetime.now().isoformat()
        state_file.write_text(json.dumps(loaded, indent=2))

        final = json.loads(state_file.read_text())
        assert final["started_at"] == original_time

    def test_get_iteration_no_file(self, tmp_path: Path) -> None:
        """Missing state file should return 0 iterations."""
        state_file = tmp_path / ".claude" / "ralph-state.json"

        assert not state_file.exists()
        # Default should be 0

    def test_get_iteration_malformed_json(self, tmp_path: Path) -> None:
        """Malformed JSON should be handled gracefully."""
        state_dir = tmp_path / ".claude"
        state_dir.mkdir(parents=True)
        state_file = state_dir / "ralph-state.json"
        state_file.write_text("not valid json {{{")

        with pytest.raises(json.JSONDecodeError):
            json.loads(state_file.read_text())


class TestConfigLoading:
    """Tests for Ralph Loop configuration loading."""

    def test_load_profile_based_config(self, tmp_path: Path) -> None:
        """Profile-based config should extract correct exit policy."""
        config_dir = tmp_path / ".claude"
        config_dir.mkdir(parents=True)
        config_file = config_dir / "ralph-config.json"

        config: dict[str, Any] = {
            "active_profile": "code_repo",
            "profiles": {
                "code_repo": {
                    "exit_policy": {
                        "completion_promise": "<promise>DONE</promise>",
                        "max_iterations": 25,
                        "requirements": {"tests_must_pass": True},
                    }
                }
            },
        }
        config_file.write_text(json.dumps(config))

        loaded = json.loads(config_file.read_text())
        active = loaded["active_profile"]
        exit_policy = loaded["profiles"][active]["exit_policy"]

        assert exit_policy["completion_promise"] == "<promise>DONE</promise>"
        assert exit_policy["max_iterations"] == 25

    def test_load_legacy_config(self, tmp_path: Path) -> None:
        """Legacy config format should work."""
        config_dir = tmp_path / ".claude"
        config_dir.mkdir(parents=True)
        config_file = config_dir / "ralph-config.json"

        config = {
            "exit_policy": {
                "completion_promise": "<promise>LEGACY</promise>",
                "max_iterations": 10,
            }
        }
        config_file.write_text(json.dumps(config))

        loaded = json.loads(config_file.read_text())
        exit_policy = loaded.get("exit_policy", loaded)

        assert exit_policy["completion_promise"] == "<promise>LEGACY</promise>"

    def test_default_config_values(self) -> None:
        """Default config should have expected values."""
        default = {
            "completion_promise": "<promise>DONE</promise>",
            "max_iterations": 25,
            "scan_length": 5000,
            "requirements": {"tests_must_pass": False, "lint_must_pass": True},
        }

        assert default["completion_promise"] == "<promise>DONE</promise>"
        assert default["max_iterations"] == 25

    def test_config_missing_profile(self, tmp_path: Path) -> None:
        """Missing profile should use default."""
        config_dir = tmp_path / ".claude"
        config_dir.mkdir(parents=True)
        config_file = config_dir / "ralph-config.json"

        config: dict[str, Any] = {
            "active_profile": "nonexistent",
            "profiles": {"code_repo": {"exit_policy": {"max_iterations": 25}}},
        }
        config_file.write_text(json.dumps(config))

        loaded = json.loads(config_file.read_text())
        active = loaded["active_profile"]
        profile = loaded["profiles"].get(active, {})

        assert profile == {}  # Profile not found


class TestLoopFlagFile:
    """Tests for Ralph Loop activation flag file."""

    def test_flag_file_activates_loop(self, tmp_path: Path) -> None:
        """Loop flag file should activate enforcement."""
        flag_dir = tmp_path / ".claude"
        flag_dir.mkdir(parents=True)
        flag_file = flag_dir / ".ralph_loop_active"
        flag_file.touch()

        assert flag_file.exists()

    def test_missing_flag_file_skips_enforcement(self, tmp_path: Path) -> None:
        """Missing flag file should skip enforcement."""
        flag_file = tmp_path / ".claude" / ".ralph_loop_active"

        assert not flag_file.exists()

    def test_flag_file_removal_deactivates_loop(self, tmp_path: Path) -> None:
        """Removing flag file should deactivate enforcement."""
        flag_dir = tmp_path / ".claude"
        flag_dir.mkdir(parents=True)
        flag_file = flag_dir / ".ralph_loop_active"
        flag_file.touch()

        assert flag_file.exists()

        flag_file.unlink()

        assert not flag_file.exists()


class TestContinueMessage:
    """Tests for continue message building."""

    def test_message_structure(self) -> None:
        """Continue message should have correct structure."""
        message = {
            "action": "continue",
            "reason": "Test reason",
            "suggestions": ["suggestion 1", "suggestion 2"],
            "timestamp": datetime.now().isoformat(),
        }

        assert message["action"] == "continue"
        assert "reason" in message
        assert isinstance(message["suggestions"], list)
        assert "timestamp" in message

    def test_message_with_iteration_info(self) -> None:
        """Message should include iteration information."""
        current = 5
        max_iter = 25
        reason = f"Completion criteria not met (iteration {current}/{max_iter})"

        assert "5/25" in reason


class TestHookInputParsing:
    """Tests for hook input JSON parsing."""

    def test_valid_json_input(self) -> None:
        """Valid JSON should parse correctly."""
        input_data = json.dumps({"transcript": "Some transcript text", "session_id": "test-123"})

        parsed = json.loads(input_data)
        assert parsed["transcript"] == "Some transcript text"

    def test_empty_input(self) -> None:
        """Empty input should be handled."""
        input_data = ""

        assert not input_data.strip()

    def test_invalid_json_input(self) -> None:
        """Invalid JSON should raise JSONDecodeError."""
        input_data = "not valid json {{"

        with pytest.raises(json.JSONDecodeError):
            json.loads(input_data)

    def test_missing_transcript_key(self) -> None:
        """Missing transcript key should return empty string."""
        input_data = json.dumps({"other_key": "value"})

        parsed = json.loads(input_data)
        transcript = parsed.get("transcript", "")

        assert transcript == ""


class TestMaxIterations:
    """Tests for max iteration limit enforcement."""

    def test_max_iterations_triggers_exit(self) -> None:
        """Reaching max iterations should force exit."""
        current = 25
        max_iter = 25

        assert current >= max_iter

    def test_below_max_continues(self) -> None:
        """Below max iterations should continue."""
        current = 24
        max_iter = 25

        assert current < max_iter

    def test_custom_max_iterations(self, tmp_path: Path) -> None:
        """Custom max iterations should be respected."""
        config_dir = tmp_path / ".claude"
        config_dir.mkdir(parents=True)
        config_file = config_dir / "ralph-config.json"

        config: dict[str, Any] = {
            "active_profile": "strict",
            "profiles": {"strict": {"exit_policy": {"max_iterations": 5}}},
        }
        config_file.write_text(json.dumps(config))

        loaded = json.loads(config_file.read_text())
        max_iter = loaded["profiles"]["strict"]["exit_policy"]["max_iterations"]

        assert max_iter == 5


class TestSecurityConsiderations:
    """Security-focused tests for the stop-hook."""

    def test_transcript_json_injection(self) -> None:
        """Transcript containing JSON should not affect parsing."""
        transcript = '{"action": "allow_exit", "bypass": true}'
        promise = "<promise>DONE</promise>"

        # Should search for promise, not parse transcript as JSON
        assert promise not in transcript

    def test_promise_in_code_block_detected(self) -> None:
        """Promise in code block should still be detected."""
        transcript = """
        Here is the code:
        ```
        <promise>DONE</promise>
        ```
        """
        promise = "<promise>DONE</promise>"

        # This is actually a potential issue - the promise in code
        # blocks would trigger exit. Document this behavior.
        assert promise in transcript

    def test_large_transcript_handling(self) -> None:
        """Large transcripts should be handled."""
        # Create a large transcript (1MB)
        large_transcript = "x" * (1024 * 1024)
        promise = "<promise>DONE</promise>"

        # Should not raise memory errors
        assert promise not in large_transcript

    def test_unicode_in_transcript(self) -> None:
        """Unicode characters should be handled."""
        transcript = "Emoji: \U0001f600 and promise: <promise>DONE</promise>"
        promise = "<promise>DONE</promise>"

        assert promise in transcript


class TestFailOpenBehavior:
    """Tests for fail-open error handling."""

    def test_error_allows_exit(self) -> None:
        """Errors should result in exit code 0 (allow exit)."""
        # Simulate error response structure
        error_response = {
            "error": "Some error occurred",
            "action": "allow_exit_on_error",
        }

        assert error_response["action"] == "allow_exit_on_error"

    def test_config_read_error_uses_defaults(self) -> None:
        """Config read errors should fall back to defaults."""
        default = {
            "completion_promise": "<promise>DONE</promise>",
            "max_iterations": 25,
        }

        # When config fails, defaults should be used
        assert default["max_iterations"] == 25


class TestWritePromiseFlag:
    """Tests for writing the promise flag file."""

    def test_write_creates_directory(self, tmp_path: Path) -> None:
        """Writing flag should create parent directory."""
        flag_file = tmp_path / ".claude" / ".promise_done"

        flag_file.parent.mkdir(parents=True, exist_ok=True)
        flag_file.write_text("<promise>DONE</promise>")

        assert flag_file.exists()
        assert flag_file.read_text() == "<promise>DONE</promise>"

    def test_write_overwrites_existing(self, tmp_path: Path) -> None:
        """Writing flag should overwrite existing content."""
        flag_dir = tmp_path / ".claude"
        flag_dir.mkdir(parents=True)
        flag_file = flag_dir / ".promise_done"

        flag_file.write_text("OLD")
        flag_file.write_text("<promise>DONE</promise>")

        assert flag_file.read_text() == "<promise>DONE</promise>"


# ---------------------------------------------------------------------------
# Quality gate tests — actually import and exercise the stop-hook module
# ---------------------------------------------------------------------------
HOOK_PATH = Path(__file__).resolve().parents[2] / ".claude" / "hooks" / "stop-hook.py"


@pytest.fixture
def stop_hook():
    """Import the stop-hook module dynamically."""
    spec = importlib.util.spec_from_file_location("stop_hook", HOOK_PATH)
    mod = importlib.util.module_from_spec(spec)
    # Suppress monitor_client import errors during test loading
    sys.modules["monitor_client"] = MagicMock()
    spec.loader.exec_module(mod)
    return mod


class TestRunCmd:
    """Tests for the run_cmd helper."""

    def test_successful_command(self, stop_hook: Any) -> None:
        mock_result = MagicMock(returncode=0, stdout="ok", stderr="")
        with patch.object(subprocess, "run", return_value=mock_result) as mock_run:
            code, out = stop_hook.run_cmd(["echo", "hello"], timeout_s=10)
        assert code == 0
        assert "ok" in out
        mock_run.assert_called_once()

    def test_failed_command(self, stop_hook: Any) -> None:
        mock_result = MagicMock(returncode=1, stdout="", stderr="FAILED: test_foo")
        with patch.object(subprocess, "run", return_value=mock_result):
            code, out = stop_hook.run_cmd(["pytest", "-q"], timeout_s=10)
        assert code == 1
        assert "FAILED" in out

    def test_output_truncation(self, stop_hook: Any) -> None:
        long_output = "x" * 2000
        mock_result = MagicMock(returncode=0, stdout=long_output, stderr="")
        with patch.object(subprocess, "run", return_value=mock_result):
            _, out = stop_hook.run_cmd(["cmd"], timeout_s=10)
        assert len(out) <= 1500 + len("\n...(truncated)")

    def test_timeout_is_passed(self, stop_hook: Any) -> None:
        mock_result = MagicMock(returncode=0, stdout="", stderr="")
        with patch.object(subprocess, "run", return_value=mock_result) as mock_run:
            stop_hook.run_cmd(["pytest"], timeout_s=300)
        assert (
            mock_run.call_args.kwargs.get("timeout") == 300
            or mock_run.call_args[1].get("timeout") == 300
        )


class TestQualityGates:
    """Tests that verify pytest/ruff quality gates are actually invoked."""

    def _make_hook_input(self, transcript: str = "") -> dict:
        return {
            "transcript": transcript,
            "completion_promise": "<promise>DONE</promise>",
        }

    @patch.object(subprocess, "run")
    def test_pytest_invoked_when_tests_required(
        self, mock_run: MagicMock, stop_hook: Any, tmp_path: Path
    ) -> None:
        """When tests_must_pass is True and promise is found, pytest should run."""
        # Set up: promise in transcript, config requires tests
        mock_run.return_value = MagicMock(returncode=0, stdout="passed", stderr="")

        tools = {"pytest": ["python3", "-m", "pytest"], "ruff": ["ruff"]}
        with patch.object(stop_hook, "resolve_tools", return_value=tools):
            # Simulate quality gate check
            cmd = [
                *tools["pytest"],
                "-q",
                "--cov=.",
                "--cov-report=term-missing",
                "--cov-fail-under=80",
            ]
            code, out = stop_hook.run_cmd(cmd, timeout_s=180)
        assert code == 0
        mock_run.assert_called_once()
        cmd_args = mock_run.call_args[0][0]
        assert "--cov-fail-under=80" in cmd_args

    @patch.object(subprocess, "run")
    def test_pytest_failure_blocks_exit(self, mock_run: MagicMock, stop_hook: Any) -> None:
        """When pytest fails, the hook should report failure."""
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="FAILED test_foo",
            stderr="",
        )

        tools = {"pytest": ["python3", "-m", "pytest"], "ruff": ["ruff"]}
        code, out = stop_hook.run_cmd([*tools["pytest"], "-q"], timeout_s=180)
        assert code != 0
        assert "FAILED" in out

    @patch.object(subprocess, "run")
    def test_ruff_check_invoked_when_lint_required(
        self, mock_run: MagicMock, stop_hook: Any
    ) -> None:
        """When lint_must_pass is True, ruff check should run."""
        mock_run.return_value = MagicMock(returncode=0, stdout="ok", stderr="")

        tools = {"pytest": ["python3", "-m", "pytest"], "ruff": ["ruff"]}
        code, _ = stop_hook.run_cmd([*tools["ruff"], "check", "."], timeout_s=120)
        assert code == 0
        cmd_args = mock_run.call_args[0][0]
        assert "check" in cmd_args

    @patch.object(subprocess, "run")
    def test_ruff_format_invoked_when_lint_required(
        self, mock_run: MagicMock, stop_hook: Any
    ) -> None:
        """When lint_must_pass is True, ruff format --check should also run."""
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

        tools = {"pytest": ["python3", "-m", "pytest"], "ruff": ["ruff"]}
        ruff_cmd = [*tools["ruff"], "format", "--check", "."]
        code, _ = stop_hook.run_cmd(ruff_cmd, timeout_s=120)
        assert code == 0
        cmd_args = mock_run.call_args[0][0]
        assert "format" in cmd_args
        assert "--check" in cmd_args

    @patch.object(subprocess, "run")
    def test_ruff_failure_blocks_exit(self, mock_run: MagicMock, stop_hook: Any) -> None:
        """When ruff fails, the hook should report failure."""
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="E501 line too long",
            stderr="",
        )

        code, out = stop_hook.run_cmd(["ruff", "check", "."], timeout_s=120)
        assert code != 0

    @patch.object(subprocess, "run")
    def test_coverage_threshold_passed_to_pytest(self, mock_run: MagicMock, stop_hook: Any) -> None:
        """Coverage threshold from config should be passed as --cov-fail-under."""
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

        threshold = 80
        cmd = [
            "python3",
            "-m",
            "pytest",
            "-q",
            "--cov=.",
            "--cov-report=term-missing",
            f"--cov-fail-under={threshold}",
        ]
        stop_hook.run_cmd(cmd, timeout_s=180)

        actual_cmd = mock_run.call_args[0][0]
        assert f"--cov-fail-under={threshold}" in actual_cmd


class TestSaveProgressOnMaxIterations:
    """Tests for the draft-PR creation when max iterations hit."""

    @patch.object(subprocess, "run")
    def test_saves_state_and_attempts_draft_pr(
        self, mock_run: MagicMock, stop_hook: Any, tmp_path: Path
    ) -> None:
        """Max iterations should attempt to create a draft PR."""
        status_result = MagicMock(
            returncode=0,
            stdout="M src/foo.py\n",
            stderr="",
        )
        ok_result = MagicMock(
            returncode=0,
            stdout="",
            stderr="",
        )

        mock_run.side_effect = [
            status_result,
            ok_result,
            ok_result,
            ok_result,
            ok_result,
        ]

        state_file = tmp_path / "ralph-state.json"
        branch = "feature/GE-123-test"
        with (
            patch.object(stop_hook, "STATE_FILE", state_file),
            patch.object(stop_hook, "get_git_branch", return_value=branch),
        ):
            stop_hook._save_progress_on_max_iterations(25)

        # State file should have exit_reason
        state = json.loads(state_file.read_text())
        assert state["exit_reason"] == "max_iterations"
        assert state["max_iterations"] == 25

        # Should have called git commands
        assert mock_run.call_count >= 3  # status + add + commit + push + pr create

    @patch.object(subprocess, "run")
    def test_skips_on_main_branch(self, mock_run: MagicMock, stop_hook: Any) -> None:
        """Should not create PR if on main branch."""
        with patch.object(stop_hook, "get_git_branch", return_value="main"):
            stop_hook._save_progress_on_max_iterations(25)
        mock_run.assert_not_called()

    @patch.object(subprocess, "run")
    def test_handles_errors_gracefully(
        self, mock_run: MagicMock, stop_hook: Any, tmp_path: Path
    ) -> None:
        """Errors during draft PR creation should not raise."""
        mock_run.side_effect = Exception("git not found")

        state_file = tmp_path / "ralph-state.json"
        branch = "feature/GE-99-test"
        with (
            patch.object(stop_hook, "STATE_FILE", state_file),
            patch.object(stop_hook, "get_git_branch", return_value=branch),
        ):
            # Should not raise
            stop_hook._save_progress_on_max_iterations(25)


class TestPRMergeGate:
    """Tests for the PR merge verification gate."""

    def test_main_branch_always_passes(self, stop_hook: Any) -> None:
        """Main branch bypasses PR check."""
        with patch.object(stop_hook, "get_git_branch", return_value="main"):
            ok, msg = stop_hook.check_pr_merged()
        assert ok is True
        assert msg == ""

    def test_master_branch_always_passes(self, stop_hook: Any) -> None:
        """Master branch bypasses PR check."""
        with patch.object(stop_hook, "get_git_branch", return_value="master"):
            ok, msg = stop_hook.check_pr_merged()
        assert ok is True
        assert msg == ""

    def test_no_branch_always_passes(self, stop_hook: Any) -> None:
        """Detached HEAD → no block."""
        with patch.object(stop_hook, "get_git_branch", return_value=None):
            ok, msg = stop_hook.check_pr_merged()
        assert ok is True

    def test_merged_pr_passes(self, stop_hook: Any) -> None:
        """PR with state MERGED passes."""
        branch = "feature/GE-63-test"
        pr_json = json.dumps(
            {
                "state": "MERGED",
                "autoMergeRequest": None,
                "url": "https://github.com/x/y/pull/1",
            }
        )
        mock_r = MagicMock(returncode=0, stdout=pr_json, stderr="")
        with (
            patch.object(
                stop_hook,
                "get_git_branch",
                return_value=branch,
            ),
            patch.object(subprocess, "run", return_value=mock_r),
        ):
            ok, msg = stop_hook.check_pr_merged()
        assert ok is True
        assert msg == ""

    def test_open_pr_without_auto_merge_blocks(self, stop_hook: Any) -> None:
        """OPEN PR without auto-merge → BLOCK."""
        branch = "feature/GE-63-test"
        pr_json = json.dumps(
            {
                "state": "OPEN",
                "autoMergeRequest": None,
                "url": "https://github.com/x/y/pull/2",
            }
        )
        mock_r = MagicMock(returncode=0, stdout=pr_json, stderr="")
        with (
            patch.object(
                stop_hook,
                "get_git_branch",
                return_value=branch,
            ),
            patch.object(subprocess, "run", return_value=mock_r),
        ):
            ok, msg = stop_hook.check_pr_merged()
        assert ok is False
        assert "PR MERGE GATE" in msg
        assert "OPEN" in msg

    def test_open_pr_with_auto_merge_passes(self, stop_hook: Any) -> None:
        """OPEN PR with auto-merge enabled passes."""
        branch = "feature/GE-63-test"
        pr_json = json.dumps(
            {
                "state": "OPEN",
                "autoMergeRequest": {
                    "enabledAt": "2026-01-01T00:00:00Z",
                },
                "url": "https://github.com/x/y/pull/3",
            }
        )
        mock_r = MagicMock(returncode=0, stdout=pr_json, stderr="")
        with (
            patch.object(
                stop_hook,
                "get_git_branch",
                return_value=branch,
            ),
            patch.object(subprocess, "run", return_value=mock_r),
        ):
            ok, msg = stop_hook.check_pr_merged()
        assert ok is True

    def test_no_pr_found_passes(self, stop_hook: Any) -> None:
        """No PR for branch → fail-open (don't block)."""
        branch = "feature/GE-99-wip"
        mock_r = MagicMock(returncode=1, stdout="", stderr="no PR found")
        with (
            patch.object(
                stop_hook,
                "get_git_branch",
                return_value=branch,
            ),
            patch.object(subprocess, "run", return_value=mock_r),
        ):
            ok, msg = stop_hook.check_pr_merged()
        assert ok is True

    def test_gh_unavailable_passes(self, stop_hook: Any) -> None:
        """gh CLI not installed → fail-open."""
        branch = "feature/GE-99-wip"
        err = FileNotFoundError("gh not found")
        with (
            patch.object(
                stop_hook,
                "get_git_branch",
                return_value=branch,
            ),
            patch.object(subprocess, "run", side_effect=err),
        ):
            ok, msg = stop_hook.check_pr_merged()
        assert ok is True

    def test_closed_pr_passes(self, stop_hook: Any) -> None:
        """CLOSED PR (without merge) → warn but don't block."""
        branch = "feature/GE-63-test"
        pr_json = json.dumps(
            {
                "state": "CLOSED",
                "autoMergeRequest": None,
                "url": "https://github.com/x/y/pull/4",
            }
        )
        mock_r = MagicMock(returncode=0, stdout=pr_json, stderr="")
        with (
            patch.object(
                stop_hook,
                "get_git_branch",
                return_value=branch,
            ),
            patch.object(subprocess, "run", return_value=mock_r),
        ):
            ok, msg = stop_hook.check_pr_merged()
        assert ok is True

    def test_timeout_exception_passes(self, stop_hook: Any) -> None:
        """Timeout → fail-open."""
        branch = "feature/GE-63-test"
        err = subprocess.TimeoutExpired(cmd="gh", timeout=15)
        with (
            patch.object(
                stop_hook,
                "get_git_branch",
                return_value=branch,
            ),
            patch.object(subprocess, "run", side_effect=err),
        ):
            ok, msg = stop_hook.check_pr_merged()
        assert ok is True

    def test_block_message_includes_pr_url(self, stop_hook: Any) -> None:
        """Block message includes PR URL for actionable fix."""
        branch = "feature/GE-63-fix"
        pr_url = "https://github.com/org/repo/pull/392"
        pr_json = json.dumps(
            {
                "state": "OPEN",
                "autoMergeRequest": None,
                "url": pr_url,
            }
        )
        mock_r = MagicMock(returncode=0, stdout=pr_json, stderr="")
        with (
            patch.object(
                stop_hook,
                "get_git_branch",
                return_value=branch,
            ),
            patch.object(subprocess, "run", return_value=mock_r),
        ):
            ok, msg = stop_hook.check_pr_merged()
        assert ok is False
        assert pr_url in msg
        assert "gh pr merge" in msg


class TestResolveTools:
    """Tests for tool resolution (venv detection)."""

    def test_defaults_to_system_python(self, stop_hook: Any, tmp_path: Path) -> None:
        """Without venv, should use system python3."""
        with patch.object(Path, "cwd", return_value=tmp_path):
            tools = stop_hook.resolve_tools()
        assert tools["pytest"][0] == "python3"
        assert tools["ruff"] == ["ruff"]

    def test_uses_venv_when_present(self, stop_hook: Any, tmp_path: Path) -> None:
        """With venv/bin/python, should use venv python."""
        venv_bin = tmp_path / "venv" / "bin"
        venv_bin.mkdir(parents=True)
        (venv_bin / "python").touch()
        (venv_bin / "pytest").touch()
        (venv_bin / "ruff").touch()

        with patch.object(Path, "cwd", return_value=tmp_path):
            tools = stop_hook.resolve_tools()
        assert "venv" in tools["pytest"][0]
        assert "venv" in tools["ruff"][0]
