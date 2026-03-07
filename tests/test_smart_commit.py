"""Tests for smart commit post-commit hook logic.

The post-commit hook extracts Jira IDs and smart commit directives from
commit messages and dispatches API calls. We test the Python helper module
that encapsulates this logic.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / ".claude" / "utils"))

import smart_commit

# ---------------------------------------------------------------------------
# Jira ID extraction
# ---------------------------------------------------------------------------


class TestExtractJiraId:
    """Extract Jira ID from commit message."""

    def test_standard_format(self):
        assert smart_commit.extract_jira_id("PROJ-123: Add feature") == "PROJ-123"

    def test_lowercase_rejected(self):
        assert smart_commit.extract_jira_id("proj-123: lowercase") is None

    def test_no_jira_id(self):
        assert smart_commit.extract_jira_id("Random commit message") is None

    def test_multiple_ids_returns_first(self):
        assert smart_commit.extract_jira_id("PROJ-1: refs PROJ-2") == "PROJ-1"

    def test_id_at_start_of_line(self):
        assert smart_commit.extract_jira_id("DEV-42 fix login bug") == "DEV-42"


# ---------------------------------------------------------------------------
# Directive parsing
# ---------------------------------------------------------------------------


class TestParseDirectives:
    """Parse smart commit directives from message."""

    def test_comment_directive(self):
        directives = smart_commit.parse_directives("PROJ-1: stuff #comment This is a comment")
        assert ("comment", "This is a comment") in directives

    def test_status_directive_in_progress(self):
        directives = smart_commit.parse_directives("PROJ-1: work #in-progress")
        assert ("transition", "In Progress") in directives

    def test_status_directive_in_review(self):
        directives = smart_commit.parse_directives("PROJ-1: done #in-review")
        assert ("transition", "In Review") in directives

    def test_status_directive_done(self):
        directives = smart_commit.parse_directives("PROJ-1: done #done")
        assert ("transition", "Done") in directives

    def test_status_directive_resolved(self):
        directives = smart_commit.parse_directives("PROJ-1: fix #resolved")
        assert ("transition", "Done") in directives

    def test_status_directive_closed(self):
        directives = smart_commit.parse_directives("PROJ-1: fix #closed")
        assert ("transition", "Done") in directives

    def test_multiple_directives(self):
        directives = smart_commit.parse_directives(
            "PROJ-1: work #comment Updated login flow #in-review"
        )
        assert ("comment", "Updated login flow") in directives
        assert ("transition", "In Review") in directives

    def test_no_directives(self):
        directives = smart_commit.parse_directives("PROJ-1: plain commit")
        assert directives == []


# ---------------------------------------------------------------------------
# API backend detection
# ---------------------------------------------------------------------------


class TestDetectBackend:
    """Detect whether to use jira-api.sh or jira_api.py."""

    @patch("smart_commit.shutil.which", return_value="/usr/bin/jq")
    def test_prefers_shell_when_jq_available(self, _mock_which, tmp_path):
        sh_path = tmp_path / "jira-api.sh"
        sh_path.write_text("#!/bin/bash\n")
        backend = smart_commit.detect_backend(
            shell_script=str(sh_path),
            python_module=str(tmp_path / "jira_api.py"),
        )
        assert backend == "shell"

    @patch("smart_commit.shutil.which", return_value=None)
    def test_falls_back_to_python_when_no_jq(self, _mock_which, tmp_path):
        py_path = tmp_path / "jira_api.py"
        py_path.write_text("# python module\n")
        backend = smart_commit.detect_backend(
            shell_script=str(tmp_path / "jira-api.sh"),
            python_module=str(py_path),
        )
        assert backend == "python"

    @patch("smart_commit.shutil.which", return_value=None)
    def test_returns_none_when_nothing_available(self, _mock_which, tmp_path):
        backend = smart_commit.detect_backend(
            shell_script=str(tmp_path / "missing.sh"),
            python_module=str(tmp_path / "missing.py"),
        )
        assert backend is None


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


class TestDispatch:
    """Test dispatching directives to Jira API."""

    @patch("smart_commit.subprocess.run")
    def test_dispatch_comment_via_shell(self, mock_run):
        smart_commit.dispatch(
            backend="shell",
            shell_script="/path/to/jira-api.sh",
            python_module="",
            issue_key="PROJ-1",
            directives=[("comment", "Hello world")],
        )
        mock_run.assert_called()
        args = mock_run.call_args[0][0]
        assert "add-comment" in args
        assert "PROJ-1" in args

    @patch("smart_commit.subprocess.run")
    def test_dispatch_transition_via_shell(self, mock_run):
        smart_commit.dispatch(
            backend="shell",
            shell_script="/path/to/jira-api.sh",
            python_module="",
            issue_key="PROJ-1",
            directives=[("transition", "In Progress")],
        )
        mock_run.assert_called()
        args = mock_run.call_args[0][0]
        assert "transition-issue" in args

    @patch("smart_commit.subprocess.run")
    def test_dispatch_via_python(self, mock_run):
        smart_commit.dispatch(
            backend="python",
            shell_script="",
            python_module="/path/to/jira_api.py",
            issue_key="PROJ-1",
            directives=[("comment", "Hello")],
        )
        mock_run.assert_called()
        args = mock_run.call_args[0][0]
        assert "python3" in args[0] or "jira_api.py" in " ".join(args)

    @patch("smart_commit.subprocess.run")
    def test_dispatch_silently_ignores_errors(self, mock_run):
        mock_run.side_effect = Exception("Connection refused")
        # Should not raise
        smart_commit.dispatch(
            backend="shell",
            shell_script="/path/to/jira-api.sh",
            python_module="",
            issue_key="PROJ-1",
            directives=[("comment", "Boom")],
        )


# ---------------------------------------------------------------------------
# Credential check
# ---------------------------------------------------------------------------


class TestHasCredentials:
    """Skip silently if no .env credentials."""

    def test_no_env_file_returns_false(self, tmp_path):
        assert smart_commit.has_credentials(str(tmp_path / ".env")) is False

    def test_env_with_creds_returns_true(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("JIRA_URL=https://x.atlassian.net\nJIRA_USERNAME=u\nJIRA_API_TOKEN=t\n")
        assert smart_commit.has_credentials(str(env_file)) is True

    def test_env_missing_token_returns_false(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("JIRA_URL=https://x.atlassian.net\n")
        assert smart_commit.has_credentials(str(env_file)) is False
