"""Tests for jules_to_jira.py \u2014 parsing and standalone task creation."""

from unittest.mock import MagicMock

import pytest

from scripts.jules_to_jira import (
    Finding,
    add_low_findings_as_comment,
    create_tasks,
    extract_parent_key,
    extract_project_key,
    parse_findings,
)


class TestParseFindingsUnit:
    """Unit tests for finding parser."""

    def test_parse_high_severity(self) -> None:
        body = "[HIGH] main.py:42 \u2014 SQL injection risk in query builder"
        findings = parse_findings(body)

        assert len(findings) == 1
        assert findings[0].severity == "HIGH"
        assert findings[0].location == "main.py:42"
        assert "SQL injection" in findings[0].description

    def test_parse_multiple_severities(self) -> None:
        body = (
            "## Jules Review\n\n"
            "[HIGH] auth.py:10 \u2014 Missing input validation\n"
            "[MEDIUM] utils.py:5 \u2014 Unused import\n"
            "[LOW] README.md:1 \u2014 Typo in heading\n"
            "[CRITICAL] db.py:99 \u2014 Hardcoded credentials\n"
        )
        findings = parse_findings(body)

        assert len(findings) == 4
        severities = [f.severity for f in findings]
        assert severities == ["HIGH", "MEDIUM", "LOW", "CRITICAL"]

    def test_parse_no_findings(self) -> None:
        body = "Everything looks great! No issues found."
        findings = parse_findings(body)

        assert findings == []

    def test_parse_with_dash_separator(self) -> None:
        """Should handle both em-dash (\u2014) and regular dash (-)."""
        body = "[HIGH] main.py:1 - Missing error handling"
        findings = parse_findings(body)

        assert len(findings) == 1
        assert "Missing error handling" in findings[0].description

    def test_parse_with_en_dash(self) -> None:
        body = "[MEDIUM] route.py:55 \u2013 Potential race condition"
        findings = parse_findings(body)

        assert len(findings) == 1

    def test_finding_summary_truncation(self) -> None:
        f = Finding(severity="HIGH", location="x.py:1", description="A" * 300)
        assert len(f.summary) <= 255


class TestFindingBody:
    """Tests for Finding.body() method with origin references."""

    def test_body_without_origin(self) -> None:
        f = Finding("HIGH", "main.py:1", "Bug found")
        body = f.body()

        assert "Severity: HIGH" in body
        assert "Location: main.py:1" in body
        assert "Origin" not in body

    def test_body_with_origin_key(self) -> None:
        f = Finding("HIGH", "main.py:1", "Bug found")
        body = f.body(origin_key="DEV-35")

        assert "Origin:" in body
        assert "Ticket: DEV-35" in body

    def test_body_with_pr_number(self) -> None:
        f = Finding("HIGH", "main.py:1", "Bug found")
        body = f.body(pr_number="42")

        assert "PR: #42" in body

    def test_body_with_both_origin_and_pr(self) -> None:
        f = Finding("CRITICAL", "db.py:99", "Hardcoded creds")
        body = f.body(origin_key="GE-100", pr_number="55")

        assert "Ticket: GE-100" in body
        assert "PR: #55" in body
        assert "Source: Automated Jules code review" in body


class TestExtractParentKey:
    """Tests for branch name -> Jira key extraction."""

    def test_feature_branch(self) -> None:
        assert extract_parent_key("feature/GE-35-add-auth") == "GE-35"

    def test_fix_branch(self) -> None:
        assert extract_parent_key("fix/GE-102-hotfix") == "GE-102"

    def test_plain_key(self) -> None:
        assert extract_parent_key("GE-50-description") == "GE-50"

    def test_no_key(self) -> None:
        assert extract_parent_key("main") is None

    def test_no_key_feature(self) -> None:
        assert extract_parent_key("feature/no-ticket-here") is None

    def test_multiple_keys_takes_first(self) -> None:
        assert extract_parent_key("feature/GE-10-depends-on-GE-20") == "GE-10"


class TestExtractProjectKey:
    def test_standard(self) -> None:
        assert extract_project_key("GE-35") == "GE"

    def test_long_project(self) -> None:
        assert extract_project_key("PROJ-1") == "PROJ"


class TestCreateTasks:
    """Tests for standalone task creation logic."""

    @pytest.fixture
    def mock_client(self) -> MagicMock:
        client = MagicMock()
        client.create_issue.return_value = MagicMock(key="GE-200")
        return client

    def test_creates_actionable_findings(self, mock_client: MagicMock) -> None:
        """HIGH, CRITICAL, and MEDIUM create tasks; LOW does not."""
        findings = [
            Finding("HIGH", "a.py:1", "Critical bug"),
            Finding("LOW", "b.py:2", "Minor issue"),
            Finding("MEDIUM", "c.py:3", "Moderate problem"),
        ]

        keys = create_tasks(mock_client, "GE-35", findings)

        assert len(keys) == 2
        assert mock_client.create_issue.call_count == 2
        call_kwargs = mock_client.create_issue.call_args.kwargs
        assert call_kwargs["issue_type"] == "Task"
        assert "parent_key" not in call_kwargs

    def test_description_includes_origin(self, mock_client: MagicMock) -> None:
        findings = [Finding("HIGH", "a.py:1", "Bug")]

        create_tasks(mock_client, "GE-35", findings, pr_number="42")

        call_kwargs = mock_client.create_issue.call_args.kwargs
        assert "GE-35" in call_kwargs["description"]
        assert "#42" in call_kwargs["description"]

    def test_caps_at_max_tasks(self, mock_client: MagicMock) -> None:
        findings = [Finding("HIGH", f"f{i}.py:1", f"Bug {i}") for i in range(10)]

        keys = create_tasks(mock_client, "GE-35", findings)

        assert len(keys) == 3  # MAX_TASKS
        assert mock_client.create_issue.call_count == 3

    def test_includes_critical_severity(self, mock_client: MagicMock) -> None:
        findings = [Finding("CRITICAL", "db.py:99", "Hardcoded creds")]

        keys = create_tasks(mock_client, "GE-35", findings)

        assert len(keys) == 1

    def test_no_actionable_findings_skips(self, mock_client: MagicMock) -> None:
        """Only LOW findings \u2192 no tasks created."""
        findings = [
            Finding("LOW", "a.py:1", "Minor"),
            Finding("LOW", "b.py:2", "Also minor"),
        ]

        keys = create_tasks(mock_client, "GE-35", findings)

        assert keys == []
        mock_client.create_issue.assert_not_called()

    def test_handles_api_error_gracefully(self) -> None:
        from src.sejfa.integrations.jira_client import JiraAPIError

        client = MagicMock()
        client.create_issue.side_effect = JiraAPIError("Boom", status_code=500)

        findings = [Finding("HIGH", "a.py:1", "Bug")]
        keys = create_tasks(client, "GE-35", findings)

        assert keys == []

    def test_labels_include_jules_review(self, mock_client: MagicMock) -> None:
        findings = [Finding("HIGH", "x.py:1", "Issue")]
        create_tasks(mock_client, "GE-35", findings)

        call_kwargs = mock_client.create_issue.call_args.kwargs
        assert "jules-review" in call_kwargs["labels"]
        assert "automated" in call_kwargs["labels"]


class TestAddLowFindingsAsComment:
    """Tests for low-severity comment posting."""

    def test_adds_comment_for_low_only(self) -> None:
        """Only LOW findings go to comments; MEDIUM+ are escalated to tasks."""
        client = MagicMock()
        findings = [
            Finding("LOW", "a.py:1", "Minor"),
            Finding("LOW", "b.py:2", "Also minor"),
            Finding("MEDIUM", "c.py:3", "Escalated to task"),
            Finding("HIGH", "d.py:4", "Also escalated"),
        ]

        result = add_low_findings_as_comment(client, "GE-35", findings)

        assert result is True
        client.add_comment.assert_called_once()
        comment_body = client.add_comment.call_args[0][1]
        assert "Minor" in comment_body
        assert "Also minor" in comment_body
        assert "Escalated to task" not in comment_body
        assert "Also escalated" not in comment_body

    def test_skips_if_no_low_findings(self) -> None:
        """No LOW findings \u2192 no comment posted."""
        client = MagicMock()
        findings = [
            Finding("HIGH", "a.py:1", "Only high"),
            Finding("MEDIUM", "b.py:2", "Only medium"),
        ]

        result = add_low_findings_as_comment(client, "GE-35", findings)

        assert result is False
        client.add_comment.assert_not_called()
