"""Read-only analysis services for the SEJFA ChatGPT companion."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote

import httpx

from src.chatgpt_companion.config import config
from src.sejfa.integrations.jira_client import JiraClient

MissionPhase = Literal[
    "idle",
    "queued",
    "agent_active",
    "verifying",
    "blocked",
    "completed",
    "failed",
]

ContextTopic = Literal[
    "overview",
    "architecture",
    "workflow",
    "voice",
    "monitor",
]

WorkspaceSource = Literal["all", "code", "docs", "config"]


class WorkspaceSecurityError(ValueError):
    """Raised when a workspace read escapes the allowed surface."""


class WorkspaceService:
    """Safe, read-only access to the local SEJFA workspace."""

    TEXT_EXTENSIONS = {
        ".css",
        ".env.example",
        ".html",
        ".js",
        ".json",
        ".md",
        ".mjs",
        ".py",
        ".rst",
        ".sh",
        ".sql",
        ".toml",
        ".ts",
        ".tsx",
        ".txt",
        ".yaml",
        ".yml",
    }
    BLOCKED_NAMES = {
        ".env",
        ".git",
        ".pytest_cache",
        ".ruff_cache",
        ".venv",
        "__pycache__",
        "node_modules",
        "target",
        "venv",
    }
    BLOCKED_PREFIXES = {
        "ELECTRON-sejfa/",
        "data/",
    }
    BLOCKED_SUFFIXES = {
        ".db",
        ".egg-info",
        ".log",
        ".pyc",
        ".shm",
        ".sqlite",
        ".wal",
    }

    def __init__(self, repo_root: Path) -> None:
        self.repo_root = repo_root.resolve()

    def resolve_path(self, path: str) -> Path:
        candidate = (self.repo_root / path).resolve()
        if self.repo_root not in candidate.parents and candidate != self.repo_root:
            raise WorkspaceSecurityError("Requested path is outside the SEJFA repo root")

        rel = candidate.relative_to(self.repo_root).as_posix()
        if self.is_blocked(rel):
            raise WorkspaceSecurityError(f"Access to {rel} is blocked")

        if not candidate.exists():
            raise FileNotFoundError(rel)

        return candidate

    def is_blocked(self, relative_path: str) -> bool:
        parts = relative_path.split("/")
        if any(part in self.BLOCKED_NAMES for part in parts):
            return True
        if relative_path.startswith(".git/"):
            return True
        if any(relative_path.startswith(prefix) for prefix in self.BLOCKED_PREFIXES):
            return True
        if any(relative_path.endswith(suffix) for suffix in self.BLOCKED_SUFFIXES):
            return True
        return False

    def iter_searchable_files(self, source: WorkspaceSource, path_prefix: str = ""):
        prefix = path_prefix.strip().strip("/")
        base = self.resolve_path(prefix) if prefix else self.repo_root
        if not base.exists():
            return
        if base.is_file():
            relative = base.relative_to(self.repo_root).as_posix()
            if not self.is_blocked(relative) and self._matches_source(relative, source):
                yield base
            return

        for path in base.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(self.repo_root).as_posix()
            if self.is_blocked(relative):
                continue
            if not self._is_text_file(path):
                continue
            if not self._matches_source(relative, source):
                continue
            yield path

    def search(
        self,
        query: str,
        source: WorkspaceSource = "all",
        path_prefix: str = "",
        max_hits: int = config.max_workspace_hits,
    ) -> dict[str, Any]:
        lowered = query.casefold()
        hits: list[dict[str, Any]] = []

        for file_path in self.iter_searchable_files(source, path_prefix):
            try:
                text = file_path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue

            for line_number, line in enumerate(text.splitlines(), start=1):
                if lowered not in line.casefold():
                    continue
                hits.append(
                    {
                        "path": file_path.relative_to(self.repo_root).as_posix(),
                        "line": line_number,
                        "snippet": line.strip()[:240],
                    }
                )
                if len(hits) >= max_hits:
                    return {
                        "query": query,
                        "source": source,
                        "path_prefix": path_prefix,
                        "truncated": True,
                        "hits": hits,
                    }

        return {
            "query": query,
            "source": source,
            "path_prefix": path_prefix,
            "truncated": False,
            "hits": hits,
        }

    def fetch_file(
        self,
        path: str,
        start_line: int = 1,
        end_line: int | None = None,
    ) -> dict[str, Any]:
        target = self.resolve_path(path)
        lines = target.read_text(encoding="utf-8").splitlines()
        last_line = len(lines)

        if start_line < 1:
            start_line = 1

        if end_line is None:
            end_line = min(start_line + config.max_file_excerpt_lines - 1, last_line)
        else:
            end_line = min(end_line, start_line + config.max_file_excerpt_lines - 1, last_line)

        excerpt = [
            {"line": index, "text": lines[index - 1]}
            for index in range(start_line, end_line + 1)
        ]
        return {
            "path": target.relative_to(self.repo_root).as_posix(),
            "start_line": start_line,
            "end_line": end_line,
            "total_lines": last_line,
            "truncated": end_line < last_line,
            "excerpt": excerpt,
        }

    def search_documents(
        self,
        query: str,
        source: WorkspaceSource = "all",
        path_prefix: str = "",
        max_hits: int = config.max_workspace_hits,
    ) -> dict[str, Any]:
        raw = self.search(query=query, source=source, path_prefix=path_prefix, max_hits=max_hits)
        seen: set[str] = set()
        results: list[dict[str, str]] = []
        for hit in raw["hits"]:
            path = hit["path"]
            if path in seen:
                continue
            seen.add(path)
            results.append(
                {
                    "id": path,
                    "title": Path(path).name,
                    "url": self.workspace_url(path),
                }
            )
        return {"results": results}

    def fetch_document(self, document_id: str) -> dict[str, Any]:
        target = self.resolve_path(document_id)
        text = target.read_text(encoding="utf-8")
        rel = target.relative_to(self.repo_root).as_posix()
        return {
            "id": rel,
            "title": target.name,
            "text": text,
            "url": self.workspace_url(rel),
            "metadata": {
                "path": rel,
                "source": self._detect_source(rel),
            },
        }

    def project_context(self, topic: ContextTopic) -> dict[str, Any]:
        topic_map: dict[ContextTopic, tuple[Path, int, int | None]] = {
            "overview": (self.repo_root / "README.md", 1, 180),
            "architecture": (self.repo_root / "docs" / "ARCHITECTURE.md", 1, 220),
            "workflow": (self.repo_root / "CLAUDE.md", 1, 220),
            "voice": (
                self.repo_root / "services" / "voice-pipeline" / "src" / "voice_pipeline" / "main.py",
                1,
                220,
            ),
            "monitor": (
                self.repo_root / "services" / "monitor-api" / "src" / "monitor" / "api.py",
                1,
                220,
            ),
        }
        path, start, end = topic_map[topic]
        relative = path.relative_to(self.repo_root).as_posix()
        payload = self.fetch_file(relative, start, end)
        payload["topic"] = topic
        return payload

    def _is_text_file(self, path: Path) -> bool:
        if path.name in {"Dockerfile", "CODEOWNERS", ".env.example"}:
            return True
        if path.suffix.lower() in self.TEXT_EXTENSIONS:
            return True
        return False

    def workspace_url(self, relative_path: str) -> str:
        return f"{config.public_base_url}/workspace/{quote(relative_path, safe='/')}"

    def _detect_source(self, relative_path: str) -> WorkspaceSource:
        if self._matches_source(relative_path, "docs"):
            return "docs"
        if self._matches_source(relative_path, "config"):
            return "config"
        return "code"

    def _matches_source(self, relative_path: str, source: WorkspaceSource) -> bool:
        if source == "all":
            return True
        if source == "docs":
            return relative_path.startswith("docs/") or relative_path.endswith(".md")
        if source == "config":
            return any(
                relative_path.endswith(suffix)
                for suffix in (".json", ".toml", ".yaml", ".yml", ".env.example")
            ) or relative_path in {"Dockerfile", "docker-compose.yml", "pyproject.toml"}
        return not self._matches_source(relative_path, "docs") and not self._matches_source(
            relative_path, "config"
        )


class MissionService:
    """Aggregates read-only SEJFA mission, Jira, and workspace context."""

    def __init__(self) -> None:
        self.workspace = WorkspaceService(config.repo_root)
        self._jira_client: JiraClient | None = None

    def get_active_mission(self) -> dict[str, Any]:
        active_session = self._query_single_session(active_only=True)
        latest_session = active_session or self._query_single_session(active_only=False)
        queued_ticket = self._query_latest_queue_entry()
        session_id = (
            active_session["session_id"]
            if active_session
            else latest_session["session_id"] if latest_session else None
        )
        events = self._query_events(session_id=session_id, limit=12) if session_id else []
        ticket_key = (
            active_session.get("ticket_id")
            if active_session
            else queued_ticket.get("key") if queued_ticket else latest_session.get("ticket_id")
            if latest_session
            else None
        )
        mission_phase = self._derive_phase(active_session, latest_session, queued_ticket, events)
        return {
            "mission_phase": mission_phase,
            "phase_label": mission_phase.replace("_", " ").title(),
            "ticket": self._build_ticket_summary(ticket_key, queued_ticket),
            "active_session": active_session,
            "latest_session": latest_session,
            "connections": self._probe_connections(),
            "latest_events": events,
            "gates": self._derive_gates(events),
            "alerts": self._derive_alerts(events, latest_session),
            "queue": {
                "has_pending_ticket": queued_ticket is not None,
                "latest_pending": queued_ticket,
            },
        }

    def list_recent_sessions(self, limit: int = 10) -> dict[str, Any]:
        limit = max(1, min(limit, 25))
        sessions = self._query_sessions(limit)
        return {"sessions": sessions, "count": len(sessions)}

    def get_session_events(
        self,
        session_id: str | None = None,
        ticket_id: str | None = None,
        limit: int = 25,
    ) -> dict[str, Any]:
        limit = max(1, min(limit, config.max_event_results))
        resolved_session_id = session_id
        if resolved_session_id is None and ticket_id:
            matching = self._query_single_session(ticket_id=ticket_id, active_only=False)
            resolved_session_id = matching["session_id"] if matching else None
        events = self._query_events(session_id=resolved_session_id, ticket_id=ticket_id, limit=limit)
        return {
            "session_id": resolved_session_id,
            "ticket_id": ticket_id,
            "events": events,
            "count": len(events),
        }

    def get_jira_issue(self, issue_key: str) -> dict[str, Any]:
        client = self._get_jira_client()
        issue = client.get_issue(issue_key)
        comments = client._request("GET", f"/rest/api/3/issue/{issue_key}/comment")
        fields = issue.raw.get("fields", {})
        parent = fields.get("parent")
        subtasks = fields.get("subtasks", [])
        return {
            "key": issue.key,
            "summary": issue.summary,
            "description": issue.description,
            "status": issue.status,
            "issue_type": issue.issue_type,
            "priority": issue.priority,
            "assignee": issue.assignee,
            "reporter": issue.reporter,
            "labels": issue.labels,
            "parent": {
                "key": parent.get("key"),
                "summary": parent.get("fields", {}).get("summary"),
            }
            if parent
            else None,
            "subtasks": [
                {
                    "key": subtask.get("key"),
                    "summary": subtask.get("fields", {}).get("summary"),
                    "status": subtask.get("fields", {}).get("status", {}).get("name"),
                }
                for subtask in subtasks
            ],
            "comment_summary": [
                {
                    "author": item.get("author", {}).get("displayName"),
                    "created": item.get("created"),
                    "body_preview": self._extract_comment_preview(item.get("body")),
                }
                for item in comments.get("comments", [])[:6]
            ],
        }

    def search_workspace(
        self,
        query: str,
        source: WorkspaceSource = "all",
        path_prefix: str = "",
    ) -> dict[str, Any]:
        source = self._validate_source(source)
        return self.workspace.search(query=query, source=source, path_prefix=path_prefix)

    def search_documents(
        self,
        query: str,
        source: WorkspaceSource = "all",
        path_prefix: str = "",
    ) -> dict[str, Any]:
        source = self._validate_source(source)
        return self.workspace.search_documents(query=query, source=source, path_prefix=path_prefix)

    def fetch_workspace_file(
        self,
        path: str,
        start_line: int = 1,
        end_line: int | None = None,
    ) -> dict[str, Any]:
        return self.workspace.fetch_file(path=path, start_line=start_line, end_line=end_line)

    def fetch_document(self, document_id: str) -> dict[str, Any]:
        return self.workspace.fetch_document(document_id)

    def get_project_context(self, topic: ContextTopic = "overview") -> dict[str, Any]:
        topic = self._validate_topic(topic)
        return self.workspace.project_context(topic)

    def build_dashboard_payload(
        self,
        session_id: str | None = None,
        ticket_id: str | None = None,
    ) -> dict[str, Any]:
        mission = self.get_active_mission()
        resolved_session_id = session_id
        if resolved_session_id is None and mission["active_session"]:
            resolved_session_id = mission["active_session"]["session_id"]
        if session_id or ticket_id:
            mission["latest_events"] = self.get_session_events(
                session_id=resolved_session_id,
                ticket_id=ticket_id,
                limit=16,
            )["events"]
        mission["project_context"] = {
            "overview_path": "README.md",
            "architecture_path": "docs/ARCHITECTURE.md",
            "voice_path": "services/voice-pipeline/src/voice_pipeline/main.py",
            "monitor_path": "services/monitor-api/src/monitor/api.py",
        }
        return mission

    def _query_sessions(self, limit: int) -> list[dict[str, Any]]:
        db_path = config.monitor_db_path
        if not db_path.exists():
            return []
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT session_id, ticket_id, started_at, ended_at, total_cost_usd,
                       total_events, outcome
                FROM sessions
                ORDER BY started_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def _query_single_session(
        self,
        *,
        active_only: bool,
        ticket_id: str | None = None,
    ) -> dict[str, Any] | None:
        db_path = config.monitor_db_path
        if not db_path.exists():
            return None
        query = """
            SELECT session_id, ticket_id, started_at, ended_at, total_cost_usd,
                   total_events, outcome
            FROM sessions
        """
        clauses: list[str] = []
        params: list[Any] = []
        if active_only:
            clauses.append("ended_at IS NULL")
        if ticket_id:
            clauses.append("ticket_id = ?")
            params.append(ticket_id)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY started_at DESC LIMIT 1"
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(query, params).fetchone()
        return dict(row) if row else None

    def _query_events(
        self,
        *,
        session_id: str | None = None,
        ticket_id: str | None = None,
        limit: int,
    ) -> list[dict[str, Any]]:
        db_path = config.monitor_db_path
        if not db_path.exists():
            return []
        query = """
            SELECT event_id, session_id, ticket_id, timestamp, event_type, tool_name,
                   tool_args_summary, success, duration_ms, cost_usd, error
            FROM events
        """
        clauses: list[str] = []
        params: list[Any] = []
        if session_id:
            clauses.append("session_id = ?")
            params.append(session_id)
        if ticket_id:
            clauses.append("ticket_id = ?")
            params.append(ticket_id)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def _query_latest_queue_entry(self) -> dict[str, Any] | None:
        db_path = config.queue_db_path
        if not db_path.exists():
            return None
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                """
                SELECT key, summary, status, queued_at, started_at, completed_at, success
                FROM queue_entries
                ORDER BY queued_at DESC
                LIMIT 1
                """
            ).fetchone()
        return dict(row) if row else None

    def _build_ticket_summary(
        self,
        ticket_key: str | None,
        queued_ticket: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if ticket_key is None and queued_ticket is None:
            return None
        summary = queued_ticket.get("summary") if queued_ticket else None
        return {
            "key": ticket_key or queued_ticket["key"],
            "summary": summary,
            "status": queued_ticket.get("status") if queued_ticket else None,
        }

    def _probe_connections(self) -> dict[str, Any]:
        monitor = self._probe_http(f"{config.monitor_api_url.rstrip('/')}/status")
        voice = self._probe_http(f"{config.voice_api_url.rstrip('/')}/health")
        return {"monitor": monitor, "voice_pipeline": voice}

    def _probe_http(self, url: str) -> dict[str, Any]:
        try:
            with httpx.Client(timeout=config.request_timeout_seconds) as client:
                response = client.get(url)
            return {"reachable": response.is_success, "status_code": response.status_code}
        except httpx.HTTPError as exc:
            return {"reachable": False, "error": str(exc)}

    def _derive_phase(
        self,
        active_session: dict[str, Any] | None,
        latest_session: dict[str, Any] | None,
        queued_ticket: dict[str, Any] | None,
        events: list[dict[str, Any]],
    ) -> MissionPhase:
        outcome = (latest_session or {}).get("outcome")
        if active_session:
            if any(self._infer_stage(event) == "verify" for event in events):
                return "verifying"
            return "agent_active"
        if outcome == "blocked":
            return "blocked"
        if outcome == "failed":
            return "failed"
        if outcome == "done":
            return "completed"
        if queued_ticket and queued_ticket.get("status") == "pending":
            return "queued"
        return "idle"

    def _derive_gates(self, events: list[dict[str, Any]]) -> list[dict[str, str]]:
        gates = {
            "tests": "pending",
            "lint": "pending",
            "review": "pending",
            "ci_cd": "pending",
        }
        for event in reversed(events):
            summary = (event.get("tool_args_summary") or "").casefold()
            success = event.get("success")
            if any(token in summary for token in ("pytest", "vitest", "test")):
                gates["tests"] = "passed" if success is not False else "failed"
            if any(token in summary for token in ("ruff", "biome", "lint")):
                gates["lint"] = "passed" if success is not False else "failed"
            if "gh pr" in summary or "review" in summary:
                gates["review"] = "passed" if success is not False else "failed"
            if any(token in summary for token in ("git push", "deploy", "merge")):
                gates["ci_cd"] = "passed" if success is not False else "failed"
        return [
            {"name": key, "status": value}
            for key, value in gates.items()
        ]

    def _derive_alerts(
        self,
        events: list[dict[str, Any]],
        latest_session: dict[str, Any] | None,
    ) -> list[str]:
        alerts: list[str] = []
        if latest_session and latest_session.get("outcome") == "failed":
            alerts.append("Latest session failed and needs review.")
        for event in events:
            if event.get("error"):
                alerts.append(str(event["error"]))
                break
        return alerts

    def _infer_stage(self, event: dict[str, Any]) -> str:
        summary = str(event.get("tool_args_summary") or "").casefold()
        if any(token in summary for token in ("pytest", "vitest", "ruff", "lint", "test")):
            return "verify"
        if any(token in summary for token in ("jira", "ticket")):
            return "jira"
        if any(token in summary for token in ("git push", "deploy", "merge")):
            return "deploy"
        return "agent"

    def _get_jira_client(self) -> JiraClient:
        if self._jira_client is None:
            self._jira_client = JiraClient()
        return self._jira_client

    def _validate_source(self, source: str) -> WorkspaceSource:
        allowed: set[WorkspaceSource] = {"all", "code", "docs", "config"}
        if source not in allowed:
            raise ValueError(f"Unsupported workspace source: {source}")
        return source  # type: ignore[return-value]

    def _validate_topic(self, topic: str) -> ContextTopic:
        if topic == "mission_control":
            topic = "monitor"
        allowed: set[ContextTopic] = {
            "overview",
            "architecture",
            "workflow",
            "voice",
            "monitor",
        }
        if topic not in allowed:
            raise ValueError(f"Unsupported project context topic: {topic}")
        return topic  # type: ignore[return-value]

    def _extract_comment_preview(self, body: Any) -> str:
        if not isinstance(body, dict):
            return ""
        fragments: list[str] = []
        for content in body.get("content", []):
            for part in content.get("content", []):
                text = part.get("text")
                if text:
                    fragments.append(text)
        return " ".join(fragments)[:240]


def pretty_json(data: Any) -> str:
    """Serialize JSON with stable formatting for text tool results."""
    return json.dumps(data, indent=2, sort_keys=True, ensure_ascii=True)
