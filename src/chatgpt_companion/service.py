"""Read-only analysis services for the SEJFA ChatGPT companion."""

from __future__ import annotations

import html
import json
import os
import sqlite3
from datetime import UTC, datetime
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


class ShareMetricsStore:
    """Small SQLite-backed counters for share events."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def record(self, event_name: str, share_id: str) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).isoformat()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS share_metrics (
                    event_name TEXT NOT NULL,
                    share_id TEXT NOT NULL,
                    count INTEGER NOT NULL DEFAULT 0,
                    last_seen_at TEXT NOT NULL,
                    PRIMARY KEY (event_name, share_id)
                )
                """
            )
            conn.execute(
                """
                INSERT INTO share_metrics (event_name, share_id, count, last_seen_at)
                VALUES (?, ?, 1, ?)
                ON CONFLICT(event_name, share_id)
                DO UPDATE SET
                    count = share_metrics.count + 1,
                    last_seen_at = excluded.last_seen_at
                """,
                (event_name, share_id, timestamp),
            )
            conn.commit()

    def snapshot(self, share_id: str) -> dict[str, int]:
        if not self.db_path.exists():
            return {}
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT event_name, count
                FROM share_metrics
                WHERE share_id = ?
                ORDER BY event_name ASC
                """,
                (share_id,),
            ).fetchall()
        return {str(event_name): int(count) for event_name, count in rows}


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
            {"line": index, "text": lines[index - 1]} for index in range(start_line, end_line + 1)
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
                self.repo_root
                / "services"
                / "voice-pipeline"
                / "src"
                / "voice_pipeline"
                / "main.py",
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
        self.share_metrics = ShareMetricsStore(config.share_metrics_db_path)

    def _monitor_data_status(self, *required_tables: str) -> dict[str, Any]:
        db_path = config.monitor_db_path
        db_label = (
            db_path.relative_to(config.repo_root).as_posix()
            if config.repo_root in db_path.resolve().parents
            else str(db_path)
        )
        status: dict[str, Any] = {
            "available": False,
            "db_path": db_label,
            "required_tables": list(required_tables),
        }

        if not db_path.exists():
            status["reason"] = "missing_db"
            return status

        try:
            with sqlite3.connect(db_path) as conn:
                rows = conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
                ).fetchall()
        except sqlite3.Error as exc:
            status["reason"] = "db_error"
            status["error"] = str(exc)
            return status

        available_tables = {row[0] for row in rows}
        missing_tables = sorted(set(required_tables) - available_tables)
        if missing_tables:
            status["reason"] = "missing_tables"
            status["missing_tables"] = missing_tables
            return status

        status["available"] = True
        status["reason"] = "ready"
        return status

    def get_active_mission(self) -> dict[str, Any]:
        monitor_data = self._monitor_data_status("sessions", "events")
        active_session = self._query_single_session(active_only=True)
        latest_session = active_session or self._query_single_session(active_only=False)
        queued_ticket = self._query_latest_queue_entry()
        session_id = (
            active_session["session_id"]
            if active_session
            else latest_session["session_id"]
            if latest_session
            else None
        )
        events = self._query_events(session_id=session_id, limit=12) if session_id else []
        ticket_key = (
            active_session.get("ticket_id")
            if active_session
            else queued_ticket.get("key")
            if queued_ticket
            else latest_session.get("ticket_id")
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
            "monitor_data": monitor_data,
            "latest_events": events,
            "gates": self._derive_gates(events),
            "alerts": self._derive_alerts(events, latest_session, monitor_data),
            "queue": {
                "has_pending_ticket": queued_ticket is not None,
                "latest_pending": queued_ticket,
            },
        }

    def list_recent_sessions(self, limit: int = 10) -> dict[str, Any]:
        limit = max(1, min(limit, 25))
        sessions = self._query_sessions(limit)
        return {
            "sessions": sessions,
            "count": len(sessions),
            "monitor_data": self._monitor_data_status("sessions"),
        }

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
        events = self._query_events(
            session_id=resolved_session_id, ticket_id=ticket_id, limit=limit
        )
        return {
            "session_id": resolved_session_id,
            "ticket_id": ticket_id,
            "events": events,
            "count": len(events),
            "monitor_data": self._monitor_data_status("events"),
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
        mission["share"] = self._build_share_data(
            mission,
            session_id=resolved_session_id,
            ticket_id=ticket_id,
        )
        return mission

    def build_share_payload(
        self,
        session_id: str | None = None,
        ticket_id: str | None = None,
        event_name: str | None = None,
    ) -> dict[str, Any]:
        payload = self.build_dashboard_payload(session_id=session_id, ticket_id=ticket_id)
        payload["share"] = self._build_share_data(
            payload,
            session_id=session_id,
            ticket_id=ticket_id,
            event_name=event_name,
        )
        return payload

    def render_share_page(self, session_id: str | None = None) -> str:
        payload = self.build_share_payload(
            session_id=session_id,
            event_name="mission_share_opened",
        )
        share = payload.get("share") or {}
        title = html.escape(str(payload.get("phase_label") or "Mission Snapshot"))
        headline = html.escape(str(self._headline_from_payload(payload)))
        share_url = html.escape(str(share.get("url") or ""))
        share_text = html.escape(str(share.get("text") or ""))
        metrics = share.get("metrics") or {}

        stat_cards = [
            (
                "Session",
                str(
                    (payload.get("active_session") or payload.get("latest_session") or {}).get(
                        "session_id"
                    )
                    or "waiting"
                ),
            ),
            (
                "Outcome",
                str(
                    (payload.get("active_session") or payload.get("latest_session") or {}).get(
                        "outcome"
                    )
                    or "in progress"
                ),
            ),
            (
                "Cost",
                self._format_money(
                    (payload.get("active_session") or payload.get("latest_session") or {}).get(
                        "total_cost_usd"
                    )
                ),
            ),
            (
                "Events",
                str(
                    (payload.get("active_session") or payload.get("latest_session") or {}).get(
                        "total_events"
                    )
                    or 0
                ),
            ),
        ]
        stats_html = "".join(
            f"""
            <div class="stat">
              <span>{html.escape(label)}</span>
              <strong>{html.escape(value)}</strong>
            </div>
            """
            for label, value in stat_cards
        )
        gates_html = (
            "".join(
                f'<div class="chip {self._tone_class(gate.get("status"))}">{html.escape(str(gate.get("name") or "gate"))}: {html.escape(str(gate.get("status") or "pending"))}</div>'
                for gate in (payload.get("gates") or [])
            )
            or '<div class="muted">No evidence cards yet.</div>'
        )
        events_html = (
            "".join(
                f"""
            <li>
              <strong>{html.escape(str(event.get("tool_name") or "Event"))}</strong>
              <span>{html.escape(str(event.get("timestamp") or ""))}</span>
              <p>{html.escape(str(event.get("error") or event.get("tool_args_summary") or "No detail provided."))}</p>
            </li>
            """
                for event in (payload.get("latest_events") or [])[:6]
            )
            or '<div class="muted">No recent events yet.</div>'
        )
        alerts_html = (
            "".join(
                f"<li>{html.escape(str(alert))}</li>" for alert in (payload.get("alerts") or [])
            )
            or "<li>No active alerts.</li>"
        )

        opened_count = int(metrics.get("mission_share_opened", 0))
        requested_count = int(metrics.get("mission_share_requested", 0))

        return f"""
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SEJFA Mission Snapshot</title>
    <style>
      :root {{
        color: rgba(244, 247, 255, 0.96);
        background:
          radial-gradient(circle at top center, rgba(82, 210, 255, 0.12), transparent 35%),
          linear-gradient(180deg, #070b16 0%, #0b1327 46%, #121934 100%);
        font-family: "Space Grotesk", "Avenir Next", "Segoe UI", sans-serif;
      }}
      * {{ box-sizing: border-box; }}
      body {{ margin: 0; min-height: 100vh; padding: 24px; }}
      .shell {{ max-width: 980px; margin: 0 auto; display: grid; gap: 16px; }}
      .card {{
        border-radius: 18px;
        border: 1px solid rgba(134, 163, 241, 0.14);
        background: rgba(9, 15, 30, 0.86);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
        padding: 20px;
      }}
      .eyebrow, .label {{
        font-family: "IBM Plex Mono", "SF Mono", monospace;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: rgba(210, 219, 244, 0.72);
        font-size: 11px;
      }}
      h1 {{ margin: 8px 0 4px; font-size: clamp(28px, 5vw, 44px); letter-spacing: -0.05em; }}
      p, .muted, li span {{ color: rgba(218, 226, 248, 0.72); }}
      .grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }}
      .statGrid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }}
      .stat, .shareBox {{
        border-radius: 14px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }}
      .stat span {{ display: block; color: rgba(210, 219, 244, 0.62); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }}
      .stat strong {{ display: block; margin-top: 8px; font-size: 16px; }}
      .chipRow {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }}
      .chip {{
        border-radius: 999px;
        padding: 8px 12px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        font-family: "IBM Plex Mono", "SF Mono", monospace;
        font-size: 12px;
      }}
      .tone-good {{ color: #78f0aa; border-color: rgba(120, 240, 170, 0.26); }}
      .tone-bad {{ color: #ff8b88; border-color: rgba(255, 107, 107, 0.28); }}
      .tone-active {{ color: #7fe4ff; border-color: rgba(82, 210, 255, 0.26); }}
      .tone-pending {{ color: rgba(244, 247, 255, 0.96); }}
      ol, ul {{ margin: 12px 0 0; padding-left: 20px; }}
      li {{ margin-bottom: 12px; }}
      li p {{ margin: 6px 0 0; }}
      code {{
        display: block;
        margin-top: 12px;
        padding: 12px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.04);
        color: #d9f7ff;
        white-space: pre-wrap;
        word-break: break-word;
      }}
      a {{ color: #8fe7ff; }}
      .meta {{ display: flex; gap: 18px; flex-wrap: wrap; margin-top: 12px; }}
      .meta strong {{ display: block; font-size: 20px; margin-top: 4px; }}
      @media (max-width: 900px) {{
        .grid {{ grid-template-columns: 1fr; }}
      }}
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="card">
        <div class="eyebrow">SEJFA Share Snapshot</div>
        <h1>{title}</h1>
        <p>{headline}</p>
        <div class="meta">
          <div>
            <span class="label">Share Opens</span>
            <strong>{opened_count}</strong>
          </div>
          <div>
            <span class="label">Share Requests</span>
            <strong>{requested_count}</strong>
          </div>
        </div>
      </section>

      <section class="grid">
        <article class="card">
          <div class="eyebrow">Mission Snapshot</div>
          <div class="statGrid">{stats_html}</div>
          <div class="chipRow">{gates_html}</div>
        </article>

        <article class="card">
          <div class="eyebrow">Share Brief</div>
          <p>Copy this update into Slack, Jira, email, or ChatGPT.</p>
          <div class="shareBox">
            <div class="label">Public Link</div>
            <a href="{share_url}">{share_url}</a>
            <code>{share_text}</code>
          </div>
        </article>
      </section>

      <section class="grid">
        <article class="card">
          <div class="eyebrow">Recent Activity</div>
          <ol>{events_html}</ol>
        </article>

        <article class="card">
          <div class="eyebrow">Alerts</div>
          <ul>{alerts_html}</ul>
        </article>
      </section>
    </main>
  </body>
</html>
""".strip()

    def _query_sessions(self, limit: int) -> list[dict[str, Any]]:
        if not self._monitor_data_status("sessions")["available"]:
            return []
        db_path = config.monitor_db_path
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
        if not self._monitor_data_status("sessions")["available"]:
            return None
        db_path = config.monitor_db_path
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
        if not self._monitor_data_status("events")["available"]:
            return []
        db_path = config.monitor_db_path
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
        monitor_candidates = [config.monitor_api_url.rstrip("/")]
        if not any(
            env_name in os.environ
            for env_name in ("SEJFA_MONITOR_API_URL", "SEJFA_MONITOR_URL", "MONITOR_URL")
        ):
            for fallback in ("http://127.0.0.1:8110", "http://127.0.0.1:8100"):
                if fallback not in monitor_candidates:
                    monitor_candidates.append(fallback)
        monitor = self._probe_first_http([f"{base}/status" for base in monitor_candidates])
        voice = self._probe_http(f"{config.voice_api_url.rstrip('/')}/health")
        return {"monitor": monitor, "voice_pipeline": voice}

    def _probe_first_http(self, urls: list[str]) -> dict[str, Any]:
        first_result: dict[str, Any] | None = None
        for url in urls:
            result = self._probe_http(url)
            result["url"] = url
            if first_result is None:
                first_result = result
            if result.get("reachable"):
                return result
        return first_result or {"reachable": False, "error": "No probe URLs configured"}

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
        return [{"name": key, "status": value} for key, value in gates.items()]

    def _derive_alerts(
        self,
        events: list[dict[str, Any]],
        latest_session: dict[str, Any] | None,
        monitor_data: dict[str, Any],
    ) -> list[str]:
        alerts: list[str] = []
        if not monitor_data.get("available"):
            reason = monitor_data.get("reason")
            if reason == "missing_db":
                alerts.append("Monitor history database is not available yet.")
            elif reason == "missing_tables":
                missing = ", ".join(monitor_data.get("missing_tables", []))
                alerts.append(
                    f"Monitor history schema is not initialized yet (missing tables: {missing})."
                )
            elif reason == "db_error":
                alerts.append("Monitor history database could not be read.")
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

    def _build_share_data(
        self,
        payload: dict[str, Any],
        *,
        session_id: str | None = None,
        ticket_id: str | None = None,
        event_name: str | None = None,
    ) -> dict[str, Any]:
        resolved_session_id = (
            session_id
            or (payload.get("active_session") or {}).get("session_id")
            or (payload.get("latest_session") or {}).get("session_id")
        )
        ticket_key = ticket_id or (payload.get("ticket") or {}).get("key")
        share_id = f"session:{resolved_session_id}" if resolved_session_id else "current"
        if event_name:
            self.share_metrics.record(event_name, share_id)
        metrics = self.share_metrics.snapshot(share_id)

        if resolved_session_id:
            share_path = f"/share/session/{quote(resolved_session_id, safe='')}"
        else:
            share_path = "/share/current"
        share_url = f"{config.public_base_url}{share_path}"

        headline = self._headline_from_payload(payload)
        phase = str(payload.get("phase_label") or "Idle")
        session_label = resolved_session_id or "waiting"
        stats = payload.get("active_session") or payload.get("latest_session") or {}
        gate_summary = ", ".join(
            f"{gate.get('name')}: {gate.get('status')}" for gate in (payload.get("gates") or [])[:2]
        )
        if not gate_summary:
            gate_summary = "evidence pending"
        share_text = (
            f"SEJFA mission update: {headline}. "
            f"Phase: {phase.lower()}. "
            f"Session: {session_label}. "
            f"Events: {stats.get('total_events') or 0}. "
            f"Cost: {self._format_money(stats.get('total_cost_usd'))}. "
            f"Gates: {gate_summary}. "
            f"Live snapshot: {share_url}"
        )
        return {
            "id": share_id,
            "label": "Share Mission Link",
            "url": share_url,
            "text": share_text,
            "session_id": resolved_session_id,
            "ticket_id": ticket_key,
            "metrics": metrics,
        }

    def _format_money(self, value: Any) -> str:
        if not isinstance(value, (int, float)):
            return "pending"
        return f"${value:.4f}"

    def _headline_from_payload(self, payload: dict[str, Any]) -> str:
        ticket = payload.get("ticket") or {}
        key = ticket.get("key")
        summary = ticket.get("summary")
        if key and summary:
            return f"{key} · {summary}"
        if key:
            return str(key)
        return "No active objective"

    def _tone_class(self, status: Any) -> str:
        value = str(status or "").casefold()
        if value in {"passed", "completed", "done"}:
            return "tone-good"
        if value in {"failed", "blocked"}:
            return "tone-bad"
        if value in {"running", "queued", "agent active", "verifying"}:
            return "tone-active"
        return "tone-pending"


def pretty_json(data: Any) -> str:
    """Serialize JSON with stable formatting for text tool results."""
    return json.dumps(data, indent=2, sort_keys=True, ensure_ascii=True)
