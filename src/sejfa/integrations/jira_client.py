"""Jira REST API client for Agentic Dev Loop.

This module provides direct API access to Jira without requiring MCP.
Credentials are loaded from environment variables.
"""

import base64
import json
import os
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass
class JiraConfig:
    """Jira configuration from environment."""

    url: str
    email: str
    api_token: str

    @classmethod
    def from_env(cls) -> "JiraConfig":
        """Load configuration from environment variables.

        Raises:
            ValueError: If required environment variables are missing.
        """
        url = os.getenv("JIRA_URL")
        email = os.getenv("JIRA_EMAIL")
        token = os.getenv("JIRA_API_TOKEN")

        missing = []
        if not url:
            missing.append("JIRA_URL")
        if not email:
            missing.append("JIRA_EMAIL")
        if not token:
            missing.append("JIRA_API_TOKEN")

        if missing:
            raise ValueError(f"Missing environment variables: {', '.join(missing)}")

        # Normalize URL
        url = url.rstrip("/")
        if not url.startswith("https://"):
            url = f"https://{url}"

        return cls(url=url, email=email, api_token=token)

    @property
    def auth_header(self) -> str:
        """Generate Basic auth header value."""
        credentials = f"{self.email}:{self.api_token}"
        encoded = base64.b64encode(credentials.encode()).decode()
        return f"Basic {encoded}"


@dataclass
class JiraIssue:
    """Represents a Jira issue."""

    key: str
    summary: str
    description: str | None
    issue_type: str
    status: str
    priority: str | None
    assignee: str | None
    reporter: str | None
    labels: list[str]
    raw: dict[str, Any]

    @classmethod
    def from_api_response(cls, data: dict[str, Any]) -> "JiraIssue":
        """Create JiraIssue from API response."""
        fields = data.get("fields", {})

        return cls(
            key=data.get("key", ""),
            summary=fields.get("summary", ""),
            description=fields.get("description"),
            issue_type=fields.get("issuetype", {}).get("name", "Unknown"),
            status=fields.get("status", {}).get("name", "Unknown"),
            priority=(fields.get("priority", {}).get("name") if fields.get("priority") else None),
            assignee=(
                fields.get("assignee", {}).get("displayName") if fields.get("assignee") else None
            ),
            reporter=(
                fields.get("reporter", {}).get("displayName") if fields.get("reporter") else None
            ),
            labels=fields.get("labels", []),
            raw=data,
        )


class JiraClient:
    """Simple Jira REST API client."""

    def __init__(self, config: JiraConfig | None = None):
        """Initialize client with config or load from environment."""
        self.config = config or JiraConfig.from_env()

    def _request(
        self,
        method: str,
        endpoint: str,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Make authenticated request to Jira API.

        Args:
            method: HTTP method (GET, POST, PUT, etc.)
            endpoint: API endpoint (e.g., /rest/api/3/issue/PROJ-123)
            data: Optional JSON data for POST/PUT requests

        Returns:
            Parsed JSON response

        Raises:
            JiraAPIError: On API errors
        """
        url = f"{self.config.url}{endpoint}"

        headers = {
            "Authorization": self.config.auth_header,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        body = json.dumps(data).encode() if data else None

        request = Request(url, data=body, headers=headers, method=method)

        try:
            with urlopen(request, timeout=30) as response:
                response_data = response.read().decode()
                if response_data:
                    return json.loads(response_data)
                return {}
        except HTTPError as e:
            error_body = e.read().decode() if e.fp else ""
            raise JiraAPIError(
                f"Jira API error {e.code}: {e.reason}",
                status_code=e.code,
                response=error_body,
            ) from e
        except URLError as e:
            raise JiraAPIError(f"Connection error: {e.reason}") from e

    def get_issue(self, issue_key: str) -> JiraIssue:
        """Fetch a Jira issue by key.

        Args:
            issue_key: The issue key (e.g., PROJ-123)

        Returns:
            JiraIssue object with issue details
        """
        endpoint = f"/rest/api/3/issue/{issue_key}"
        data = self._request("GET", endpoint)
        return JiraIssue.from_api_response(data)

    def search_issues(self, jql: str, max_results: int = 50) -> list[JiraIssue]:
        """Search for issues using JQL.

        Args:
            jql: JQL query string
            max_results: Maximum number of results

        Returns:
            List of JiraIssue objects
        """
        endpoint = "/rest/api/3/search"
        data = self._request(
            "POST",
            endpoint,
            data={"jql": jql, "maxResults": max_results},
        )

        issues = []
        for issue_data in data.get("issues", []):
            issues.append(JiraIssue.from_api_response(issue_data))

        return issues

    def add_comment(self, issue_key: str, body: str) -> dict[str, Any]:
        """Add a comment to an issue.

        Args:
            issue_key: The issue key
            body: Comment text (supports Atlassian Document Format or plain text)

        Returns:
            API response
        """
        endpoint = f"/rest/api/3/issue/{issue_key}/comment"

        # Use Atlassian Document Format for the comment
        comment_data = {
            "body": {
                "type": "doc",
                "version": 1,
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": body}],
                    }
                ],
            }
        }

        return self._request("POST", endpoint, data=comment_data)

    def transition_issue(self, issue_key: str, transition_name: str) -> bool:
        """Transition an issue to a new status.

        Args:
            issue_key: The issue key
            transition_name: Name of the transition (e.g., "In Progress")

        Returns:
            True if transition was successful
        """
        # First, get available transitions
        endpoint = f"/rest/api/3/issue/{issue_key}/transitions"
        transitions_data = self._request("GET", endpoint)

        # Find the transition by name
        transition_id = None
        for transition in transitions_data.get("transitions", []):
            if transition.get("name", "").lower() == transition_name.lower():
                transition_id = transition.get("id")
                break

        if not transition_id:
            available = [t.get("name") for t in transitions_data.get("transitions", [])]
            raise JiraAPIError(f"Transition '{transition_name}' not found. Available: {available}")

        # Perform the transition
        self._request(
            "POST",
            endpoint,
            data={"transition": {"id": transition_id}},
        )

        return True

    def create_issue(
        self,
        project_key: str,
        summary: str,
        description: str = "",
        issue_type: str = "Sub-task",
        parent_key: str | None = None,
        labels: list[str] | None = None,
    ) -> JiraIssue:
        """Create a new Jira issue (or sub-task).

        Args:
            project_key: Project key (e.g., "GE")
            summary: Issue summary (max 255 chars)
            description: Plain-text description
            issue_type: Issue type name (default "Sub-task")
            parent_key: Parent issue key for sub-tasks (e.g., "GE-35")
            labels: Optional list of labels

        Returns:
            Created JiraIssue

        Raises:
            JiraAPIError: On API errors or validation failure
        """
        summary = summary[:255]

        # Build ADF description
        desc_content = {
            "type": "doc",
            "version": 1,
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": description or summary}],
                }
            ],
        }

        fields: dict[str, Any] = {
            "project": {"key": project_key},
            "summary": summary,
            "issuetype": {"name": issue_type},
            "description": desc_content,
        }

        if parent_key:
            fields["parent"] = {"key": parent_key}

        if labels:
            fields["labels"] = labels

        data = self._request("POST", "/rest/api/3/issue", data={"fields": fields})

        # Fetch the created issue to return full JiraIssue
        created_key = data.get("key", "")
        if created_key:
            return self.get_issue(created_key)

        return JiraIssue.from_api_response(data)

    def get_projects(self) -> list[dict[str, Any]]:
        """Get all accessible projects.

        Returns:
            List of project data
        """
        endpoint = "/rest/api/3/project"
        return self._request("GET", endpoint)

    def test_connection(self) -> bool:
        """Test the Jira connection.

        Returns:
            True if connection is successful
        """
        try:
            self._request("GET", "/rest/api/3/myself")
            return True
        except JiraAPIError:
            return False


class JiraAPIError(Exception):
    """Exception for Jira API errors."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        response: str | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.response = response


def get_jira_client() -> JiraClient:
    """Get a configured Jira client.

    This is the main entry point for getting a Jira client.
    It loads credentials from environment variables.

    Returns:
        Configured JiraClient instance

    Raises:
        ValueError: If environment variables are not set
    """
    return JiraClient()


# CLI helper for testing
if __name__ == "__main__":
    import sys

    # Load .env file if python-dotenv is available
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass

    try:
        client = get_jira_client()

        if client.test_connection():
            print("✅ Jira connection successful!")

            if len(sys.argv) > 1:
                issue_key = sys.argv[1]
                print(f"\nFetching {issue_key}...")
                issue = client.get_issue(issue_key)
                print(f"  Summary: {issue.summary}")
                print(f"  Type: {issue.issue_type}")
                print(f"  Status: {issue.status}")
                desc = issue.description[:200] if issue.description else "None"
                print(f"  Description: {desc}...")
        else:
            print("❌ Jira connection failed!")
            sys.exit(1)

    except ValueError as e:
        print(f"❌ Configuration error: {e}")
        sys.exit(1)
    except JiraAPIError as e:
        print(f"❌ API error: {e}")
        sys.exit(1)
