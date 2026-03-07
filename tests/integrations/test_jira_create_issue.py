"""Tests for JiraClient.create_issue() method."""

from unittest.mock import patch

import pytest

from src.sejfa.integrations.jira_client import (
    JiraAPIError,
    JiraClient,
    JiraConfig,
)


class TestCreateIssue:
    """Tests for create_issue sub-task creation."""

    @pytest.fixture
    def mock_config(self) -> JiraConfig:
        return JiraConfig(
            url="https://test.atlassian.net",
            email="test@example.com",
            api_token="test-token",
        )

    @pytest.fixture
    def client(self, mock_config: JiraConfig) -> JiraClient:
        return JiraClient(config=mock_config)

    def test_create_subtask_success(self, client: JiraClient) -> None:
        """Should create a sub-task and return full JiraIssue."""
        create_response = {"id": "10001", "key": "DEV-101", "self": "..."}
        issue_response = {
            "key": "DEV-101",
            "fields": {
                "summary": "[Jules/HIGH] app.py:42: SQL injection risk",
                "issuetype": {"name": "Sub-task"},
                "status": {"name": "To Do"},
                "parent": {"key": "DEV-35"},
                "labels": ["jules-review", "automated"],
            },
        }

        call_count = 0

        def mock_request(method: str, endpoint: str, data: dict = None):
            nonlocal call_count
            call_count += 1
            if method == "POST":
                assert "/rest/api/3/issue" in endpoint
                fields = data["fields"]
                assert fields["project"]["key"] == "DEV"
                assert fields["parent"]["key"] == "DEV-35"
                assert fields["issuetype"]["name"] == "Sub-task"
                assert "jules-review" in fields["labels"]
                return create_response
            return issue_response

        with patch.object(client, "_request", side_effect=mock_request):
            issue = client.create_issue(
                project_key="DEV",
                summary="[Jules/HIGH] app.py:42: SQL injection risk",
                description="Severity: HIGH\nSome description",
                issue_type="Sub-task",
                parent_key="DEV-35",
                labels=["jules-review", "automated"],
            )

            assert issue.key == "DEV-101"
            assert call_count == 2  # POST create + GET fetch

    def test_create_issue_without_parent(self, client: JiraClient) -> None:
        """Should create a standalone issue (no parent field)."""
        create_response = {"id": "10002", "key": "DEV-102"}
        issue_response = {
            "key": "DEV-102",
            "fields": {
                "summary": "Standalone task",
                "issuetype": {"name": "Task"},
                "status": {"name": "To Do"},
            },
        }

        def mock_request(method: str, endpoint: str, data: dict = None):
            if method == "POST":
                fields = data["fields"]
                assert "parent" not in fields
                return create_response
            return issue_response

        with patch.object(client, "_request", side_effect=mock_request):
            issue = client.create_issue(
                project_key="DEV",
                summary="Standalone task",
                issue_type="Task",
            )

            assert issue.key == "DEV-102"

    def test_create_issue_truncates_summary(self, client: JiraClient) -> None:
        """Summary should be truncated to 255 chars."""
        long_summary = "A" * 300
        create_response = {"key": "DEV-103"}
        issue_response = {
            "key": "DEV-103",
            "fields": {
                "summary": "A" * 255,
                "issuetype": {"name": "Task"},
                "status": {"name": "To Do"},
            },
        }

        def mock_request(method: str, endpoint: str, data: dict = None):
            if method == "POST":
                assert len(data["fields"]["summary"]) == 255
                return create_response
            return issue_response

        with patch.object(client, "_request", side_effect=mock_request):
            client.create_issue(project_key="DEV", summary=long_summary)

    def test_create_issue_api_error(self, client: JiraClient) -> None:
        """Should propagate JiraAPIError on failure."""
        with patch.object(
            client,
            "_request",
            side_effect=JiraAPIError("Validation failed", status_code=400),
        ):
            with pytest.raises(JiraAPIError) as exc_info:
                client.create_issue(
                    project_key="DEV",
                    summary="Will fail",
                    parent_key="DEV-999",
                )

            assert exc_info.value.status_code == 400

    def test_create_issue_uses_adf_description(self, client: JiraClient) -> None:
        """Description should be in Atlassian Document Format."""
        create_response = {"key": "DEV-104"}
        issue_response = {
            "key": "DEV-104",
            "fields": {
                "summary": "Test",
                "issuetype": {"name": "Sub-task"},
                "status": {"name": "To Do"},
            },
        }

        def mock_request(method: str, endpoint: str, data: dict = None):
            if method == "POST":
                desc = data["fields"]["description"]
                assert desc["type"] == "doc"
                assert desc["version"] == 1
                content = desc["content"][0]["content"][0]
                assert content["text"] == "Custom description"
                return create_response
            return issue_response

        with patch.object(client, "_request", side_effect=mock_request):
            client.create_issue(
                project_key="DEV",
                summary="Test",
                description="Custom description",
            )
