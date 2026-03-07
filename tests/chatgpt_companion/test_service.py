from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from src.chatgpt_companion.config import CompanionConfig
from src.chatgpt_companion.service import MissionService, WorkspaceSecurityError, WorkspaceService


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def create_monitor_db(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.executescript(
            """
            CREATE TABLE sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                ticket_id TEXT,
                branch TEXT,
                started_at TEXT,
                ended_at TEXT,
                total_cost_usd REAL DEFAULT 0.0,
                total_events INTEGER DEFAULT 0,
                outcome TEXT
            );

            CREATE TABLE events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                ticket_id TEXT,
                timestamp TEXT NOT NULL,
                event_type TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                tool_args_hash TEXT NOT NULL,
                tool_args_summary TEXT DEFAULT '',
                success INTEGER,
                duration_ms INTEGER,
                tokens TEXT,
                cost_usd REAL,
                error TEXT
            );
            """
        )


def create_queue_db(path: Path) -> None:
    with sqlite3.connect(path) as conn:
        conn.executescript(
            """
            CREATE TABLE queue_entries (
                key TEXT PRIMARY KEY,
                summary TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                queued_at REAL NOT NULL,
                started_at REAL,
                completed_at REAL,
                success INTEGER
            );
            """
        )


def test_workspace_service_blocks_sensitive_paths(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    write_text(repo_root / "README.md", "# Test")
    write_text(repo_root / ".env", "SECRET=1")

    workspace = WorkspaceService(repo_root)

    assert workspace.fetch_file("README.md")["path"] == "README.md"

    with pytest.raises(WorkspaceSecurityError):
        workspace.fetch_file(".env")

    with pytest.raises(WorkspaceSecurityError):
        workspace.resolve_path("../outside.txt")


def test_workspace_search_and_context(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    write_text(repo_root / "README.md", "# SEJFA\nVoice mission")
    write_text(repo_root / "docs" / "ARCHITECTURE.md", "Agentic loop architecture")
    write_text(repo_root / "CLAUDE.md", "workflow guidance")
    write_text(repo_root / "voice-app" / "ARCHITECTURE.md", "voice subsystem")
    write_text(repo_root / "voice-app" / "src" / "App.tsx", "const mission = deriveMissionState();")

    workspace = WorkspaceService(repo_root)
    result = workspace.search("mission", source="all")

    assert result["hits"]
    assert any(hit["path"] == "README.md" for hit in result["hits"])

    context = workspace.project_context("mission_control")
    assert context["path"] == "voice-app/src/App.tsx"
    assert context["topic"] == "mission_control"


def test_workspace_search_blocks_parent_escape(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    write_text(repo_root / "README.md", "# SEJFA\nVoice mission")

    workspace = WorkspaceService(repo_root)

    with pytest.raises(WorkspaceSecurityError):
        workspace.search("mission", path_prefix="../")


def test_workspace_supports_standard_search_and_fetch_shapes(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    write_text(repo_root / "README.md", "# SEJFA\nVoice mission control")
    write_text(repo_root / "docs" / "ARCHITECTURE.md", "Agentic loop architecture")

    workspace = WorkspaceService(repo_root)

    search_payload = workspace.search_documents("mission")
    assert search_payload["results"]
    assert search_payload["results"][0]["id"] == "README.md"
    assert search_payload["results"][0]["url"].endswith("/workspace/README.md")

    fetch_payload = workspace.fetch_document("README.md")
    assert fetch_payload["id"] == "README.md"
    assert fetch_payload["title"] == "README.md"
    assert "Voice mission control" in fetch_payload["text"]
    assert fetch_payload["metadata"]["path"] == "README.md"


def test_mission_service_derives_queued_phase(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    repo_root = tmp_path / "repo"
    write_text(repo_root / "README.md", "# SEJFA")
    write_text(repo_root / "docs" / "ARCHITECTURE.md", "Agentic loop")
    write_text(repo_root / "CLAUDE.md", "workflow")
    write_text(repo_root / "voice-app" / "ARCHITECTURE.md", "voice")
    write_text(repo_root / "voice-app" / "src" / "App.tsx", "mission control")
    monitor_db = repo_root / "data" / "monitor.db"
    queue_db = repo_root / "loop_queue.db"
    create_monitor_db(monitor_db)
    create_queue_db(queue_db)

    with sqlite3.connect(queue_db) as conn:
        conn.execute(
            """
            INSERT INTO queue_entries (key, summary, status, queued_at, started_at, completed_at, success)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            ("DEV-7", "Fix mission state", "pending", 10.0, None, None, None),
        )
        conn.commit()

    monkeypatch.setattr(
        "src.chatgpt_companion.service.config",
        CompanionConfig(
            repo_root=repo_root,
            monitor_db_path=monitor_db,
            queue_db_path=queue_db,
            docs_root=repo_root / "docs",
            widget_dist=repo_root / "chatgpt-companion" / "web" / "dist",
        ),
    )

    service = MissionService()
    monkeypatch.setattr(service, "_probe_connections", lambda: {"monitor": {"reachable": False}})

    mission = service.get_active_mission()

    assert mission["mission_phase"] == "queued"
    assert mission["ticket"]["key"] == "DEV-7"
    assert mission["queue"]["has_pending_ticket"] is True


def test_mission_service_derives_agent_phase_from_active_session(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo_root = tmp_path / "repo"
    write_text(repo_root / "README.md", "# SEJFA")
    write_text(repo_root / "docs" / "ARCHITECTURE.md", "Agentic loop")
    write_text(repo_root / "CLAUDE.md", "workflow")
    write_text(repo_root / "voice-app" / "ARCHITECTURE.md", "voice")
    write_text(repo_root / "voice-app" / "src" / "App.tsx", "mission control")
    monitor_db = repo_root / "data" / "monitor.db"
    queue_db = repo_root / "loop_queue.db"
    create_monitor_db(monitor_db)
    create_queue_db(queue_db)

    with sqlite3.connect(monitor_db) as conn:
        conn.execute(
            """
            INSERT INTO sessions (session_id, ticket_id, started_at, ended_at, total_cost_usd, total_events, outcome)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            ("sess-1", "DEV-9", "2026-03-07T09:00:00+00:00", None, 1.25, 2, None),
        )
        conn.execute(
            """
            INSERT INTO events (event_id, session_id, ticket_id, timestamp, event_type, tool_name, tool_args_hash, tool_args_summary, success, duration_ms, cost_usd, error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "evt-1",
                "sess-1",
                "DEV-9",
                "2026-03-07T09:01:00+00:00",
                "tool",
                "Bash",
                "abc",
                "python run agent loop",
                1,
                1200,
                0.4,
                None,
            ),
        )
        conn.commit()

    monkeypatch.setattr(
        "src.chatgpt_companion.service.config",
        CompanionConfig(
            repo_root=repo_root,
            monitor_db_path=monitor_db,
            queue_db_path=queue_db,
            docs_root=repo_root / "docs",
            widget_dist=repo_root / "chatgpt-companion" / "web" / "dist",
        ),
    )

    service = MissionService()
    monkeypatch.setattr(service, "_probe_connections", lambda: {"monitor": {"reachable": True}})

    mission = service.get_active_mission()

    assert mission["mission_phase"] == "agent_active"
    assert mission["active_session"]["session_id"] == "sess-1"
    assert mission["latest_events"][0]["event_id"] == "evt-1"
