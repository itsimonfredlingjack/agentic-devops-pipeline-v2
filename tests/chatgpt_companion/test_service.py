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
    write_text(
        repo_root / "services" / "monitor-api" / "src" / "monitor" / "api.py",
        "def mission_overview():\n    return {'status': 'ok'}\n",
    )

    workspace = WorkspaceService(repo_root)
    result = workspace.search("mission", source="all")

    assert result["hits"]
    assert any(hit["path"] == "README.md" for hit in result["hits"])

    context = workspace.project_context("monitor")
    assert context["path"] == "services/monitor-api/src/monitor/api.py"
    assert context["topic"] == "monitor"


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


def test_mission_service_derives_queued_phase(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo_root = tmp_path / "repo"
    write_text(repo_root / "README.md", "# SEJFA")
    write_text(repo_root / "docs" / "ARCHITECTURE.md", "Agentic loop")
    write_text(repo_root / "CLAUDE.md", "workflow")
    write_text(
        repo_root / "services" / "voice-pipeline" / "src" / "voice_pipeline" / "main.py",
        "def health():\n    return {'status': 'ok'}\n",
    )
    write_text(
        repo_root / "services" / "monitor-api" / "src" / "monitor" / "api.py",
        "def mission_overview():\n    return {'status': 'ok'}\n",
    )
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
    write_text(
        repo_root / "services" / "voice-pipeline" / "src" / "voice_pipeline" / "main.py",
        "def health():\n    return {'status': 'ok'}\n",
    )
    write_text(
        repo_root / "services" / "monitor-api" / "src" / "monitor" / "api.py",
        "def mission_overview():\n    return {'status': 'ok'}\n",
    )
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


def test_mission_service_handles_uninitialized_monitor_db(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo_root = tmp_path / "repo"
    write_text(repo_root / "README.md", "# SEJFA")
    write_text(repo_root / "docs" / "ARCHITECTURE.md", "Agentic loop")
    write_text(repo_root / "CLAUDE.md", "workflow")
    write_text(
        repo_root / "services" / "voice-pipeline" / "src" / "voice_pipeline" / "main.py",
        "def health():\n    return {'status': 'ok'}\n",
    )
    write_text(
        repo_root / "services" / "monitor-api" / "src" / "monitor" / "api.py",
        "def mission_overview():\n    return {'status': 'ok'}\n",
    )
    monitor_db = repo_root / "data" / "monitor.db"
    queue_db = repo_root / "loop_queue.db"
    monitor_db.parent.mkdir(parents=True, exist_ok=True)
    monitor_db.touch()
    create_queue_db(queue_db)

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

    sessions = service.list_recent_sessions()
    mission = service.get_active_mission()

    assert sessions["sessions"] == []
    assert sessions["monitor_data"]["available"] is False
    assert sessions["monitor_data"]["reason"] == "missing_tables"
    assert mission["monitor_data"]["available"] is False
    assert mission["alerts"][0].startswith("Monitor history schema is not initialized yet")


def test_companion_config_supports_monitor_and_voice_env_aliases(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SEJFA_VOICE_API_URL", raising=False)
    monkeypatch.setenv("SEJFA_VOICE_URL", "http://127.0.0.1:9000")
    monkeypatch.delenv("SEJFA_MONITOR_API_URL", raising=False)
    monkeypatch.setenv("SEJFA_MONITOR_URL", "http://127.0.0.1:9110")

    config = CompanionConfig()

    assert config.voice_api_url == "http://127.0.0.1:9000"
    assert config.monitor_api_url == "http://127.0.0.1:9110"


def test_probe_connections_falls_back_to_new_monitor_port(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = MissionService()

    monkeypatch.delenv("SEJFA_MONITOR_API_URL", raising=False)

    def fake_probe(url: str) -> dict[str, object]:
        if url == "http://127.0.0.1:8100/status":
            return {"reachable": False, "status_code": 404}
        if url == "http://127.0.0.1:8110/status":
            return {"reachable": True, "status_code": 200}
        if url == "http://127.0.0.1:8000/health":
            return {"reachable": True, "status_code": 200}
        raise AssertionError(f"Unexpected probe URL: {url}")

    monkeypatch.setattr(service, "_probe_http", fake_probe)

    connections = service._probe_connections()

    assert connections["monitor"]["reachable"] is True
    assert connections["monitor"]["status_code"] == 200
    assert connections["monitor"]["url"] == "http://127.0.0.1:8110/status"


def test_mission_share_payload_generates_public_link_and_tracks_requests(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo_root = tmp_path / "repo"
    write_text(repo_root / "README.md", "# SEJFA")
    write_text(repo_root / "docs" / "ARCHITECTURE.md", "Agentic loop")
    write_text(repo_root / "CLAUDE.md", "workflow")
    write_text(
        repo_root / "services" / "voice-pipeline" / "src" / "voice_pipeline" / "main.py",
        "def health():\n    return {'status': 'ok'}\n",
    )
    write_text(
        repo_root / "services" / "monitor-api" / "src" / "monitor" / "api.py",
        "def mission_overview():\n    return {'status': 'ok'}\n",
    )
    monitor_db = repo_root / "data" / "monitor.db"
    queue_db = repo_root / "loop_queue.db"
    share_metrics_db = repo_root / "data" / "share_metrics.db"
    create_monitor_db(monitor_db)
    create_queue_db(queue_db)

    with sqlite3.connect(monitor_db) as conn:
        conn.execute(
            """
            INSERT INTO sessions (session_id, ticket_id, started_at, ended_at, total_cost_usd, total_events, outcome)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            ("sess-viral", "DEV-42", "2026-03-17T12:00:00+00:00", None, 0.42, 14, None),
        )
        conn.execute(
            """
            INSERT INTO events (event_id, session_id, ticket_id, timestamp, event_type, tool_name, tool_args_hash, tool_args_summary, success, duration_ms, cost_usd, error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "evt-share",
                "sess-viral",
                "DEV-42",
                "2026-03-17T12:01:00+00:00",
                "tool",
                "Bash",
                "hash-1",
                "pytest tests/chatgpt_companion -q",
                1,
                900,
                0.08,
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
            public_base_url="https://share.example.com",
            share_metrics_db_path=share_metrics_db,
        ),
    )

    service = MissionService()
    monkeypatch.setattr(
        service,
        "_probe_connections",
        lambda: {"monitor": {"reachable": True}, "voice_pipeline": {"reachable": True}},
    )

    payload = service.build_share_payload(
        session_id="sess-viral",
        event_name="mission_share_requested",
    )

    assert payload["share"]["url"] == "https://share.example.com/share/session/sess-viral"
    assert "DEV-42" in payload["share"]["text"]
    assert "phase:" in payload["share"]["text"].lower()
    assert payload["share"]["metrics"]["mission_share_requested"] == 1
