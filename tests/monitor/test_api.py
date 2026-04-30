"""Integration tests for Monitor API endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from src.monitor.api import fastapi_app, infer_stage
from src.monitor.models import Base, _engine, init_db

AUTH_HEADERS = {"Authorization": "Bearer test-local-token"}


@pytest.fixture(autouse=True)
async def setup_db(monkeypatch: pytest.MonkeyPatch):
    """Create tables before each test, drop after."""
    monkeypatch.setenv("SEJFA_LOCAL_API_TOKEN", "test-local-token")
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers=AUTH_HEADERS,
    ) as c:
        yield c


def make_event_body(**overrides):
    base = {
        "event_id": "test-001",
        "session_id": "s1",
        "task_ref": "DEV-42",
        "ticket_id": None,
        "timestamp": "2026-02-24T14:00:00Z",
        "event_type": "post_tool_use",
        "tool_name": "Bash",
        "tool_args_hash": "abc123",
        "tool_args_summary": "pytest tests/ -xvs",
        "success": True,
        "duration_ms": 5000,
        "tokens": {"input": 500, "output": 200, "cache_read": 1000},
        "cost_usd": 0.025,
        "error": None,
    }
    base.update(overrides)
    return base


class TestPostEvents:
    async def test_stores_and_returns_201(self, client: AsyncClient):
        resp = await client.post("/events", json=make_event_body())
        assert resp.status_code == 201
        data = resp.json()
        assert data["ok"] is True
        assert data["event_id"] == "test-001"

    async def test_creates_session(self, client: AsyncClient):
        await client.post("/events", json=make_event_body())
        resp = await client.get("/sessions")
        sessions = resp.json()
        assert len(sessions) >= 1
        assert sessions[0]["session_id"] == "s1"
        assert sessions[0]["task_ref"] == "DEV-42"
        assert "ticket_id" not in sessions[0]

        async with _engine.begin() as conn:
            session_row = (
                await conn.exec_driver_sql(
                    "SELECT task_ref, ticket_id FROM sessions WHERE session_id = 's1'"
                )
            ).fetchone()
            event_row = (
                await conn.exec_driver_sql(
                    "SELECT task_ref, ticket_id FROM events WHERE event_id = 'test-001'"
                )
            ).fetchone()

        assert session_row == ("DEV-42", None)
        assert event_row == ("DEV-42", None)

    async def test_accepts_ticket_id_as_compatibility_alias(self, client: AsyncClient):
        payload = make_event_body(task_ref=None, ticket_id="SEJ-7")

        resp = await client.post("/events", json=payload)

        assert resp.status_code == 201

        sessions_resp = await client.get("/sessions")
        sessions = sessions_resp.json()
        assert sessions[0]["task_ref"] == "SEJ-7"
        assert "ticket_id" not in sessions[0]

        async with _engine.begin() as conn:
            session_row = (
                await conn.exec_driver_sql(
                    "SELECT task_ref, ticket_id FROM sessions WHERE session_id = 's1'"
                )
            ).fetchone()
            event_row = (
                await conn.exec_driver_sql(
                    "SELECT task_ref, ticket_id FROM events WHERE event_id = 'test-001'"
                )
            ).fetchone()

        assert session_row == ("SEJ-7", None)
        assert event_row == ("SEJ-7", None)


class TestStageInference:
    def test_task_tracker_commands_no_longer_map_to_jira_stage(self):
        assert infer_stage("Bash", "sync task metadata from Linear") == "agent"


class TestCors:
    def test_cors_does_not_allow_wildcard_origin(self):
        cors_middleware = [
            entry
            for entry in fastapi_app.user_middleware
            if entry.cls.__name__ == "CORSMiddleware"
        ]

        assert cors_middleware
        assert cors_middleware[0].kwargs["allow_origins"] != ["*"]


class TestGetEvents:
    async def test_returns_stored_events(self, client: AsyncClient):
        await client.post("/events", json=make_event_body(event_id="e1"))
        await client.post("/events", json=make_event_body(event_id="e2"))
        resp = await client.get("/events?session_id=s1")
        events = resp.json()
        assert len(events) == 2
        assert events[0]["task_ref"] == "DEV-42"
        assert "ticket_id" not in events[0]

    async def test_limit(self, client: AsyncClient):
        for i in range(5):
            await client.post("/events", json=make_event_body(event_id=f"e{i}"))
        resp = await client.get("/events?limit=2")
        assert len(resp.json()) == 2

    async def test_mixed_legacy_and_new_rows_are_queryable(self, client: AsyncClient):
        async with _engine.begin() as conn:
            await conn.exec_driver_sql(
                """
                INSERT INTO sessions (session_id, task_ref, ticket_id, started_at, total_events, total_cost_usd)
                VALUES ('legacy-session', NULL, 'LEG-1', '2026-02-24T13:59:00Z', 1, 0.0)
                """
            )
            await conn.exec_driver_sql(
                """
                INSERT INTO events (
                    event_id, session_id, task_ref, ticket_id, timestamp, event_type, tool_name, tool_args_hash, tool_args_summary
                ) VALUES ('legacy-event', 'legacy-session', NULL, 'LEG-1', '2026-02-24T13:59:00Z', 'post_tool_use', 'Bash', 'legacy-hash', '')
                """
            )

        await client.post(
            "/events",
            json=make_event_body(event_id="new-event", session_id="new-session", task_ref="SEJ-8"),
        )

        legacy_events = (await client.get("/events?task_ref=LEG-1")).json()
        new_events = (await client.get("/events?task_ref=SEJ-8")).json()
        sessions = (await client.get("/sessions")).json()

        assert legacy_events[0]["task_ref"] == "LEG-1"
        assert "ticket_id" not in legacy_events[0]
        assert new_events[0]["task_ref"] == "SEJ-8"
        assert "ticket_id" not in new_events[0]
        assert any(
            session["session_id"] == "legacy-session" and session["task_ref"] == "LEG-1"
            for session in sessions
        )
        assert any(
            session["session_id"] == "new-session" and session["task_ref"] == "SEJ-8"
            for session in sessions
        )


class TestGetStatus:
    async def test_idle_when_no_sessions(self, client: AsyncClient):
        resp = await client.get("/status")
        assert resp.json()["active"] is False

    async def test_active_after_event(self, client: AsyncClient):
        await client.post("/events", json=make_event_body())
        resp = await client.get("/status")
        data = resp.json()
        assert data["active"] is True
        assert data["session_id"] == "s1"


class TestSessionControls:
    async def test_protected_session_endpoint_rejects_missing_token(self):
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/sessions")

        assert response.status_code == 401

    async def test_protected_session_endpoint_rejects_wrong_token(self):
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            headers={"Authorization": "Bearer wrong-token"},
        ) as client:
            response = await client.get("/sessions")

        assert response.status_code == 401

    async def test_protected_session_endpoint_accepts_configured_token(self, client: AsyncClient):
        response = await client.get("/sessions")
        assert response.status_code == 200

    async def test_abort_records_conversation_message(self, client: AsyncClient):
        await client.post("/events", json=make_event_body())

        response = await client.post("/sessions/s1/abort")

        assert response.status_code == 200
        messages = (await client.get("/sessions/s1/messages")).json()
        assert messages[-1]["text"] == "Abort requested by user"

    async def test_clarify_action_sets_signal_details(self, client: AsyncClient):
        response = await client.post(
            "/sessions/s1/actions",
            json={"action": "clarify", "details": "Need repo root confirmation"},
        )

        assert response.status_code == 200
        signals = (await client.get("/sessions/s1/signals")).json()
        assert signals["clarify"] == "Need repo root confirmation"

    async def test_pause_action_is_rejected(self, client: AsyncClient):
        response = await client.post(
            "/sessions/s1/actions",
            json={"action": "pause", "details": "not supported"},
        )

        assert response.status_code == 422

    async def test_checkpoint_endpoint_is_removed(self, client: AsyncClient):
        response = await client.post("/sessions/s1/checkpoint")
        assert response.status_code == 404


class TestSessionOutcome:
    async def test_explicit_outcome_updates_session_and_broadcast_shape(self, client: AsyncClient):
        await client.post("/events", json=make_event_body())

        response = await client.post(
            "/sessions/s1/outcome",
            json={"outcome": "blocked", "task_ref": "DEV-42", "details": "Waiting on user input"},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["task_ref"] == "DEV-42"
        assert payload["outcome"] == "blocked"

        session = (await client.get("/sessions/s1")).json()
        assert session["task_ref"] == "DEV-42"
        assert "ticket_id" not in session
        assert session["ended_at"] is not None
        assert session["outcome"] == "blocked"

        messages = (await client.get("/sessions/s1/messages")).json()
        assert messages[-1]["actions"] == ["retry"]
        assert "blocked" in messages[-1]["text"].lower()


class TestReset:
    async def test_reset_clears_analyzers(self, client: AsyncClient):
        resp = await client.post("/reset")
        assert resp.json()["ok"] is True


class TestStorageMigration:
    async def test_init_db_adds_task_ref_columns_and_backfills_existing_rows(self):
        async with _engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.exec_driver_sql(
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
                )
                """
            )
            await conn.exec_driver_sql(
                """
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
                    tokens JSON,
                    cost_usd REAL,
                    error TEXT
                )
                """
            )
            await conn.exec_driver_sql(
                "INSERT INTO sessions (session_id, ticket_id, total_events, total_cost_usd) VALUES ('sess-legacy', 'SEJ-200', 1, 0.1)"
            )
            await conn.exec_driver_sql(
                """
                INSERT INTO events (
                    event_id, session_id, ticket_id, timestamp, event_type, tool_name, tool_args_hash
                ) VALUES ('evt-legacy', 'sess-legacy', 'SEJ-200', '2026-02-24T14:00:00Z', 'post_tool_use', 'Bash', 'abc123')
                """
            )

        await init_db()

        async with _engine.begin() as conn:
            session_columns = await conn.exec_driver_sql("PRAGMA table_info(sessions)")
            event_columns = await conn.exec_driver_sql("PRAGMA table_info(events)")
            session_column_names = {row[1] for row in session_columns.fetchall()}
            event_column_names = {row[1] for row in event_columns.fetchall()}
            session_row = (
                await conn.exec_driver_sql(
                    "SELECT task_ref, ticket_id FROM sessions WHERE session_id = 'sess-legacy'"
                )
            ).fetchone()
            event_row = (
                await conn.exec_driver_sql(
                    "SELECT task_ref, ticket_id FROM events WHERE event_id = 'evt-legacy'"
                )
            ).fetchone()

        assert "task_ref" in session_column_names
        assert "task_ref" in event_column_names
        assert session_row == ("SEJ-200", "SEJ-200")
        assert event_row == ("SEJ-200", "SEJ-200")
