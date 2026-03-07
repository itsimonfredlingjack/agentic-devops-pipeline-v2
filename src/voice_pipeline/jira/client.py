"""Async Jira REST API client.

Adapted from grupp-ett-github/src/sejfa/integrations/jira_client.py.
Key changes:
  - Replaced urllib with httpx.AsyncClient for async FastAPI compatibility
  - Added VOICE_INITIATED label support on create_issue()
  - Added ADF description support via formatter.build_adf_description()
"""

import base64
import logging
from dataclasses import dataclass
from typing import Any

import httpx

from ..config import Settings
from .formatter import build_adf_description

logger = logging.getLogger(__name__)

VOICE_INITIATED_LABEL = "VOICE_INITIATED"


class JiraAPIError(Exception):
    """Raised on Jira REST API errors."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        response: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.response = response


@dataclass
class JiraIssue:
    """Represents a Jira issue returned by the API."""

    key: str
    summary: str
    description: str | None
    issue_type: str
    status: str
    priority: str | None
    labels: list[str]
    url: str
    raw: dict[str, Any]

    @classmethod
    def from_api_response(cls, data: dict[str, Any], jira_url: str = "") -> "JiraIssue":
        """Create JiraIssue from API response dict."""
        fields = data.get("fields", {})
        key = data.get("key", "")
        return cls(
            key=key,
            summary=fields.get("summary", ""),
            description=fields.get("description"),
            issue_type=fields.get("issuetype", {}).get("name", "Unknown"),
            status=fields.get("status", {}).get("name", "Unknown"),
            priority=(fields.get("priority", {}).get("name") if fields.get("priority") else None),
            labels=fields.get("labels", []),
            url=f"{jira_url.rstrip('/')}/browse/{key}" if jira_url and key else "",
            raw=data,
        )


class AsyncJiraClient:
    """Async Jira REST API client built on httpx.AsyncClient.

    Manages a single shared client; call close() on app shutdown.
    """

    def __init__(self, settings: Settings) -> None:
        """Initialise client from application settings.

        Args:
            settings: Application settings containing Jira credentials.
        """
        self._settings = settings
        self._base_url = settings.jira_url.rstrip("/")
        if not self._base_url.startswith("https://"):
            self._base_url = f"https://{self._base_url}"
        self._client: httpx.AsyncClient | None = None

    def _auth_header(self) -> str:
        """Generate HTTP Basic auth header for Jira Cloud."""
        credentials = f"{self._settings.jira_email}:{self._settings.jira_api_token}"
        encoded = base64.b64encode(credentials.encode()).decode()
        return f"Basic {encoded}"

    async def _get_client(self) -> httpx.AsyncClient:
        """Lazily create and return the shared async HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self._base_url,
                headers={
                    "Authorization": self._auth_header(),
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                timeout=httpx.Timeout(30.0),
            )
        return self._client

    async def _request(
        self,
        method: str,
        endpoint: str,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Make an authenticated request to the Jira REST API.

        Args:
            method: HTTP method (GET, POST, PUT, etc.).
            endpoint: API path (e.g., /rest/api/3/issue/PROJ-1).
            data: Optional JSON request body.

        Returns:
            Parsed JSON response dict (empty dict for 204 responses).

        Raises:
            JiraAPIError: On 4xx/5xx responses or connection failures.
        """
        client = await self._get_client()
        try:
            response = await client.request(method, endpoint, json=data)
            response.raise_for_status()
            return response.json() if response.content else {}
        except httpx.HTTPStatusError as exc:
            raise JiraAPIError(
                f"Jira API error {exc.response.status_code}: {exc.response.text[:500]}",
                status_code=exc.response.status_code,
                response=exc.response.text,
            ) from exc
        except httpx.RequestError as exc:
            raise JiraAPIError(f"Jira connection error: {exc}") from exc

    async def get_issue(self, issue_key: str) -> JiraIssue:
        """Fetch a Jira issue by its key.

        Args:
            issue_key: Issue key (e.g., PROJ-123).

        Returns:
            JiraIssue with full details.
        """
        data = await self._request("GET", f"/rest/api/3/issue/{issue_key}")
        return JiraIssue.from_api_response(data, self._base_url)

    async def create_issue(
        self,
        project_key: str,
        summary: str,
        description: str = "",
        acceptance_criteria: str = "",
        issue_type: str = "Story",
        priority: str = "Medium",
        labels: list[str] | None = None,
        parent_key: str | None = None,
    ) -> JiraIssue:
        """Create a new Jira issue with ADF-formatted description.

        Automatically appends VOICE_INITIATED to labels.

        Args:
            project_key: Jira project key (e.g., "PROJ").
            summary: Issue summary (truncated to 255 chars).
            description: Plain-text description.
            acceptance_criteria: Gherkin acceptance criteria.
            issue_type: Jira issue type name.
            priority: Jira priority name.
            labels: Additional labels (VOICE_INITIATED added automatically).
            parent_key: Parent issue key for sub-tasks.

        Returns:
            Created JiraIssue with key and browse URL.
        """
        all_labels = list(labels or [])
        if VOICE_INITIATED_LABEL not in all_labels:
            all_labels.append(VOICE_INITIATED_LABEL)

        adf_description = build_adf_description(
            description=description,
            acceptance_criteria=acceptance_criteria,
            voice_initiated=True,
        )

        fields: dict[str, Any] = {
            "project": {"key": project_key},
            "summary": summary[:255],
            "issuetype": {"name": issue_type},
            "priority": {"name": priority},
            "description": adf_description,
            "labels": all_labels,
        }

        if parent_key:
            fields["parent"] = {"key": parent_key}

        response_data = await self._request("POST", "/rest/api/3/issue", data={"fields": fields})

        created_key = response_data.get("key", "")
        if created_key:
            return await self.get_issue(created_key)

        return JiraIssue.from_api_response(response_data, self._base_url)

    async def test_connection(self) -> bool:
        """Verify Jira connectivity by fetching the current user.

        Returns:
            True if connection succeeds, False otherwise.
        """
        try:
            await self._request("GET", "/rest/api/3/myself")
            return True
        except JiraAPIError:
            return False

    async def close(self) -> None:
        """Close the shared HTTP client (call on app shutdown)."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
