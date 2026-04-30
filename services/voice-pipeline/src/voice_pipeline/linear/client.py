"""Async Linear GraphQL client for task read/write."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from ..config import Settings


class LinearAPIError(Exception):
    """Raised when Linear returns an API or transport error."""


@dataclass(slots=True)
class LinearIssue:
    id: str
    identifier: str
    team_key: str
    team_name: str | None
    title: str
    description: str | None
    url: str
    priority: int | None
    state_name: str
    state_type: str
    assignee: str | None
    labels: list[str]

    @property
    def task_ref(self) -> str:
        return f"{self.team_key}-{self.identifier}" if self.team_key else self.id

    @classmethod
    def from_graphql(cls, payload: dict[str, Any]) -> LinearIssue:
        team = payload.get("team") or {}
        state = payload.get("state") or {}
        assignee = payload.get("assignee") or {}
        labels_payload = payload.get("labels") or {}
        labels = labels_payload.get("nodes") or []
        return cls(
            id=str(payload.get("id") or ""),
            identifier=str(payload.get("identifier") or ""),
            team_key=str(team.get("key") or ""),
            team_name=team.get("name"),
            title=str(payload.get("title") or ""),
            description=payload.get("description"),
            url=str(payload.get("url") or ""),
            priority=payload.get("priority"),
            state_name=str(state.get("name") or ""),
            state_type=str(state.get("type") or ""),
            assignee=assignee.get("name"),
            labels=[
                str(label.get("name"))
                for label in labels
                if isinstance(label, dict) and label.get("name")
            ],
        )


class AsyncLinearClient:
    """Minimal Linear GraphQL client for issue list/create/update."""

    _ISSUE_FIELDS = """
        id
        identifier
        title
        description
        url
        priority
        assignee { name }
        state { name type }
        team { id key name }
        labels { nodes { name } }
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._base_url = settings.linear_api_url.rstrip("/")
        self._client = httpx.AsyncClient(
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {settings.linear_api_key}",
            },
            timeout=httpx.Timeout(settings.ollama_timeout),
        )
        self._resolved_team_id: str | None = settings.linear_team_id or None

    async def _post(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            response = await self._client.post(
                self._base_url,
                json={"query": query, "variables": variables or {}},
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise LinearAPIError(
                f"Linear API error {exc.response.status_code}: {exc.response.text[:500]}"
            ) from exc
        except httpx.RequestError as exc:
            raise LinearAPIError(f"Linear connection error: {exc}") from exc

        payload = response.json()
        errors = payload.get("errors") or []
        if errors:
            detail = "; ".join(
                str(error.get("message") or "unknown Linear error")
                for error in errors
                if isinstance(error, dict)
            )
            raise LinearAPIError(detail or "Linear GraphQL request failed")

        data = payload.get("data")
        if not isinstance(data, dict):
            raise LinearAPIError("Linear API returned an invalid response payload")
        return data

    async def _resolve_team_id(self) -> str:
        if self._resolved_team_id:
            return self._resolved_team_id

        team_key = self._settings.linear_team_key.strip()
        if not team_key:
            raise LinearAPIError(
                "Linear write path requires LINEAR_TEAM_ID or LINEAR_TEAM_KEY."
            )

        data = await self._post(
            """
            query ResolveTeam($teamKey: String!) {
              teams(first: 1, filter: { key: { eq: $teamKey } }) {
                nodes { id }
              }
            }
            """,
            {"teamKey": team_key},
        )
        nodes = ((data.get("teams") or {}).get("nodes") or [])
        if not nodes:
            raise LinearAPIError(f"Linear team '{team_key}' was not found.")

        team_id = str((nodes[0] or {}).get("id") or "")
        if not team_id:
            raise LinearAPIError(f"Linear team '{team_key}' did not return an id.")
        self._resolved_team_id = team_id
        return team_id

    async def list_issues(self, max_results: int = 20) -> list[LinearIssue]:
        max_results = max(1, min(max_results, 100))

        if self._settings.linear_team_id or self._settings.linear_team_key:
            team_id = await self._resolve_team_id()
            data = await self._post(
                f"""
                query TeamIssues($teamId: String!, $first: Int!) {{
                  team(id: $teamId) {{
                    issues(first: $first, orderBy: updatedAt) {{
                      nodes {{ {self._ISSUE_FIELDS} }}
                    }}
                  }}
                }}
                """,
                {"teamId": team_id, "first": max_results},
            )
            nodes = (((data.get("team") or {}).get("issues") or {}).get("nodes") or [])
        else:
            data = await self._post(
                f"""
                query Issues($first: Int!) {{
                  issues(first: $first, orderBy: updatedAt) {{
                    nodes {{ {self._ISSUE_FIELDS} }}
                  }}
                }}
                """,
                {"first": max_results},
            )
            nodes = ((data.get("issues") or {}).get("nodes") or [])

        return [LinearIssue.from_graphql(node) for node in nodes if isinstance(node, dict)]

    async def get_issue(self, issue_id: str) -> LinearIssue:
        data = await self._post(
            f"""
            query Issue($id: String!) {{
              issue(id: $id) {{ {self._ISSUE_FIELDS} }}
            }}
            """,
            {"id": issue_id},
        )
        issue = data.get("issue")
        if not isinstance(issue, dict):
            raise LinearAPIError(f"Linear issue '{issue_id}' was not found.")
        return LinearIssue.from_graphql(issue)

    async def create_issue(
        self,
        *,
        title: str,
        description: str | None = None,
        priority: int | None = None,
    ) -> LinearIssue:
        team_id = await self._resolve_team_id()
        input_payload: dict[str, Any] = {"teamId": team_id, "title": title}
        if description:
            input_payload["description"] = description
        if priority is not None:
            input_payload["priority"] = priority

        data = await self._post(
            f"""
            mutation IssueCreate($input: IssueCreateInput!) {{
              issueCreate(input: $input) {{
                success
                issue {{ {self._ISSUE_FIELDS} }}
              }}
            }}
            """,
            {"input": input_payload},
        )
        result = data.get("issueCreate") or {}
        if not result.get("success") or not isinstance(result.get("issue"), dict):
            raise LinearAPIError("Linear issueCreate did not return a created issue.")
        return LinearIssue.from_graphql(result["issue"])

    async def update_issue(
        self,
        issue_id: str,
        *,
        title: str | None = None,
        description: str | None = None,
        priority: int | None = None,
    ) -> LinearIssue:
        input_payload: dict[str, Any] = {}
        if title is not None:
            input_payload["title"] = title
        if description is not None:
            input_payload["description"] = description
        if priority is not None:
            input_payload["priority"] = priority
        if not input_payload:
            return await self.get_issue(issue_id)

        data = await self._post(
            f"""
            mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {{
              issueUpdate(id: $id, input: $input) {{
                success
                issue {{ {self._ISSUE_FIELDS} }}
              }}
            }}
            """,
            {"id": issue_id, "input": input_payload},
        )
        result = data.get("issueUpdate") or {}
        if not result.get("success") or not isinstance(result.get("issue"), dict):
            raise LinearAPIError(f"Linear issueUpdate failed for '{issue_id}'.")
        return LinearIssue.from_graphql(result["issue"])

    async def close(self) -> None:
        await self._client.aclose()
