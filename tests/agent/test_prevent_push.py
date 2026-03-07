"""Tests for the prevent-push PreToolUse hook."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# The hook is at .claude/hooks/prevent-push.py
HOOK_PATH = Path(__file__).resolve().parents[2] / ".claude" / "hooks" / "prevent-push.py"


@pytest.fixture
def import_hook():
    """Import the prevent-push hook module dynamically."""
    import importlib.util

    spec = importlib.util.spec_from_file_location("prevent_push", HOOK_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestFindCommand:
    """Tests for command extraction from hook input."""

    def test_extracts_command_from_dict(self, import_hook):
        assert import_hook.find_command({"command": "git push"}) == "git push"

    def test_extracts_from_nested_tool_input(self, import_hook):
        obj = {"tool_input": {"command": "git push origin main"}}
        assert import_hook.find_command(obj) == "git push origin main"

    def test_returns_none_for_empty(self, import_hook):
        assert import_hook.find_command({}) is None
        assert import_hook.find_command({"command": ""}) is None

    def test_extracts_from_list(self, import_hook):
        obj = [{"command": "git push"}]
        assert import_hook.find_command(obj) == "git push"


class TestWhitespaceNormalization:
    """Tests that whitespace bypass is prevented."""

    def test_double_space_blocked(self, import_hook):
        """git  push (double space) should be caught after normalization."""
        hook_input = {"command": "git  push"}
        cmd = import_hook.find_command(hook_input)
        cmd = " ".join(cmd.split())
        assert import_hook.GIT_PUSH_RE.search(cmd)

    def test_tab_between_git_push(self, import_hook):
        """git\\tpush should be caught after normalization."""
        hook_input = {"command": "git\tpush"}
        cmd = import_hook.find_command(hook_input)
        cmd = " ".join(cmd.split())
        assert import_hook.GIT_PUSH_RE.search(cmd)

    def test_leading_whitespace(self, import_hook):
        """Leading spaces should not prevent detection."""
        hook_input = {"command": "  git push origin main"}
        cmd = import_hook.find_command(hook_input)
        cmd = " ".join(cmd.split())
        assert import_hook.GIT_PUSH_RE.search(cmd)

    def test_multiple_spaces_in_gh_pr(self, import_hook):
        """gh  pr  create should be caught after normalization."""
        hook_input = {"command": "gh  pr  create"}
        cmd = import_hook.find_command(hook_input)
        cmd = " ".join(cmd.split())
        assert import_hook.GH_PR_CREATE_RE.search(cmd)


class TestMainFunction:
    """Integration tests for the main() hook function."""

    def _run_hook(self, import_hook, hook_input: dict, task_text: str = ""):
        """Helper to run the hook with mocked stdin and task file."""
        input_json = json.dumps(hook_input)
        mock_stdin = MagicMock(
            read=MagicMock(return_value=input_json),
        )
        with (
            patch.object(sys, "stdin", mock_stdin),
            patch.object(
                import_hook,
                "load_current_task_text",
                return_value=task_text,
            ),
        ):
            with pytest.raises(SystemExit) as exc_info:
                import_hook.main()
            return exc_info.value.code

    def test_git_push_blocked_with_no_push_marker(self, import_hook):
        code = self._run_hook(
            import_hook,
            {"command": "git push origin main"},
            "MUST NOT: git push",
        )
        assert code == 2

    def test_git_push_double_space_blocked(self, import_hook):
        code = self._run_hook(
            import_hook,
            {"command": "git  push origin main"},
            "MUST NOT: git push",
        )
        assert code == 2

    def test_gh_pr_create_blocked(self, import_hook):
        code = self._run_hook(
            import_hook,
            {"command": "gh pr create --title test"},
            "no-push",
        )
        assert code == 2

    def test_push_allowed_without_marker(self, import_hook):
        code = self._run_hook(
            import_hook,
            {"command": "git push origin main"},
            "Some other task text",
        )
        assert code == 0

    def test_push_allowed_with_push_ok_marker(self, import_hook):
        code = self._run_hook(
            import_hook,
            {"command": "git push origin main"},
            "push-ok\nMUST NOT: git push",
        )
        assert code == 0

    def test_non_push_command_allowed(self, import_hook):
        code = self._run_hook(
            import_hook,
            {"command": "git status"},
            "MUST NOT: git push",
        )
        assert code == 0

    def test_empty_input_exits_zero(self, import_hook):
        mock_stdin = MagicMock(
            read=MagicMock(return_value=""),
        )
        with patch.object(sys, "stdin", mock_stdin):
            with pytest.raises(SystemExit) as exc_info:
                import_hook.main()
            assert exc_info.value.code == 0

    def test_invalid_json_exits_zero(self, import_hook):
        mock_stdin = MagicMock(
            read=MagicMock(return_value="not json"),
        )
        with patch.object(sys, "stdin", mock_stdin):
            with pytest.raises(SystemExit) as exc_info:
                import_hook.main()
            assert exc_info.value.code == 0
