"""Tests for Jira API client."""

from unittest.mock import patch

import pytest

from src.sejfa.integrations.jira_client import (
    JiraAPIError,
    JiraClient,
    JiraConfig,
    JiraIssue,
)


class TestJiraConfig:
    """Tests for JiraConfig."""

    def test_from_env_success(self) -> None:
        """Config should load from environment variables."""
        with patch.dict(
            "os.environ",
            {
                "JIRA_URL": "https://test.atlassian.net",
                "JIRA_EMAIL": "test@example.com",
                "JIRA_API_TOKEN": "test-token",
            },
        ):
            config = JiraConfig.from_env()

            assert config.url == "https://test.atlassian.net"
            assert config.email == "test@example.com"
            assert config.api_token == "test-token"

    def test_from_env_normalizes_url(self) -> None:
        """Config should normalize URL (add https, remove trailing slash)."""
        with patch.dict(
            "os.environ",
            {
                "JIRA_URL": "test.atlassian.net/",
                "JIRA_EMAIL": "test@example.com",
                "JIRA_API_TOKEN": "test-token",
            },
        ):
            config = JiraConfig.from_env()

            assert config.url == "https://test.atlassian.net"

    def test_from_env_missing_variables(self) -> None:
        """Config should raise error for missing variables."""
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ValueError) as exc_info:
                JiraConfig.from_env()

            assert "JIRA_URL" in str(exc_info.value)
            assert "JIRA_EMAIL" in str(exc_info.value)
            assert "JIRA_API_TOKEN" in str(exc_info.value)

    def test_auth_header(self) -> None:
        """Auth header should be valid Basic auth."""
        config = JiraConfig(
            url="https://test.atlassian.net",
            email="test@example.com",
            api_token="test-token",
        )

        assert config.auth_header.startswith("Basic ")
        # Should be base64 of "test@example.com:test-token"


class TestJiraIssue:
    """Tests for JiraIssue."""

    def test_from_api_response(self) -> None:
        """Issue should parse from API response."""
        api_response = {
            "key": "PROJ-123",
            "fields": {
                "summary": "Test issue",
                "description": "Test description",
                "issuetype": {"name": "Bug"},
                "status": {"name": "In Progress"},
                "priority": {"name": "High"},
                "assignee": {"displayName": "John Doe"},
                "reporter": {"displayName": "Jane Doe"},
                "labels": ["urgent", "backend"],
            },
        }

        issue = JiraIssue.from_api_response(api_response)

        assert issue.key == "PROJ-123"
        assert issue.summary == "Test issue"
        assert issue.description == "Test description"
        assert issue.issue_type == "Bug"
        assert issue.status == "In Progress"
        assert issue.priority == "High"
        assert issue.assignee == "John Doe"
        assert issue.reporter == "Jane Doe"
        assert issue.labels == ["urgent", "backend"]

    def test_from_api_response_minimal(self) -> None:
        """Issue should handle minimal response."""
        api_response = {
            "key": "PROJ-456",
            "fields": {
                "summary": "Minimal issue",
                "issuetype": {"name": "Task"},
                "status": {"name": "To Do"},
            },
        }

        issue = JiraIssue.from_api_response(api_response)

        assert issue.key == "PROJ-456"
        assert issue.summary == "Minimal issue"
        assert issue.description is None
        assert issue.priority is None
        assert issue.assignee is None


class TestJiraClient:
    """Tests for JiraClient."""

    @pytest.fixture
    def mock_config(self) -> JiraConfig:
        """Create mock config."""
        return JiraConfig(
            url="https://test.atlassian.net",
            email="test@example.com",
            api_token="test-token",
        )

    @pytest.fixture
    def client(self, mock_config: JiraConfig) -> JiraClient:
        """Create client with mock config."""
        return JiraClient(config=mock_config)

    def test_get_issue_success(self, client: JiraClient) -> None:
        """Should fetch issue successfully."""
        mock_response = {
            "key": "PROJ-123",
            "fields": {
                "summary": "Test issue",
                "issuetype": {"name": "Bug"},
                "status": {"name": "Open"},
            },
        }

        with patch.object(client, "_request", return_value=mock_response):
            issue = client.get_issue("PROJ-123")

            assert issue.key == "PROJ-123"
            assert issue.summary == "Test issue"

    def test_search_issues(self, client: JiraClient) -> None:
        """Should search issues with JQL."""
        mock_response = {
            "issues": [
                {
                    "key": "PROJ-1",
                    "fields": {
                        "summary": "First issue",
                        "issuetype": {"name": "Task"},
                        "status": {"name": "Done"},
                    },
                },
                {
                    "key": "PROJ-2",
                    "fields": {
                        "summary": "Second issue",
                        "issuetype": {"name": "Bug"},
                        "status": {"name": "Open"},
                    },
                },
            ]
        }

        with patch.object(client, "_request", return_value=mock_response):
            issues = client.search_issues("project = PROJ")

            assert len(issues) == 2
            assert issues[0].key == "PROJ-1"
            assert issues[1].key == "PROJ-2"

    def test_add_comment(self, client: JiraClient) -> None:
        """Should add comment to issue."""
        with patch.object(client, "_request", return_value={"id": "123"}) as mock:
            client.add_comment("PROJ-123", "Test comment")

            mock.assert_called_once()
            call_args = mock.call_args
            assert call_args[0][0] == "POST"
            assert "PROJ-123" in call_args[0][1]

    def test_transition_issue_success(self, client: JiraClient) -> None:
        """Should transition issue to new status."""
        transitions_response = {
            "transitions": [
                {"id": "1", "name": "To Do"},
                {"id": "2", "name": "In Progress"},
                {"id": "3", "name": "Done"},
            ]
        }

        call_count = 0

        def mock_request(method: str, endpoint: str, data: dict = None):
            nonlocal call_count
            call_count += 1
            if method == "GET":
                return transitions_response
            return {}

        with patch.object(client, "_request", side_effect=mock_request):
            result = client.transition_issue("PROJ-123", "In Progress")

            assert result is True
            assert call_count == 2  # GET transitions + POST transition

    def test_transition_issue_not_found(self, client: JiraClient) -> None:
        """Should raise error for unknown transition."""
        transitions_response = {
            "transitions": [
                {"id": "1", "name": "To Do"},
                {"id": "2", "name": "Done"},
            ]
        }

        with patch.object(client, "_request", return_value=transitions_response):
            with pytest.raises(JiraAPIError) as exc_info:
                client.transition_issue("PROJ-123", "Unknown Status")

            assert "not found" in str(exc_info.value).lower()

    def test_test_connection_success(self, client: JiraClient) -> None:
        """Should return True for successful connection."""
        with patch.object(client, "_request", return_value={"displayName": "Test"}):
            assert client.test_connection() is True

    def test_test_connection_failure(self, client: JiraClient) -> None:
        """Should return False for failed connection."""
        with patch.object(client, "_request", side_effect=JiraAPIError("Auth failed", 401)):
            assert client.test_connection() is False


class TestJiraAPIError:
    """Tests for JiraAPIError."""

    def test_error_with_status_code(self) -> None:
        """Error should include status code."""
        error = JiraAPIError("Test error", status_code=404)

        assert error.status_code == 404
        assert "Test error" in str(error)

    def test_error_with_response(self) -> None:
        """Error should include response body."""
        error = JiraAPIError("Test error", status_code=400, response='{"error": "Bad request"}')

        assert error.response == '{"error": "Bad request"}'
