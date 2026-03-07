"""Integration tests for Monitor API endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from src.monitor.api import fastapi_app
from src.monitor.models import Base, _engine


@pytest.fixture(autouse=True)
async def setup_db():
    """Create tables before each test, drop after."""
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def make_event_body(**overrides):
    base = {
        "event_id": "test-001",
        "session_id": "s1",
        "ticket_id": "DEV-42",
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
        assert sessions[0]["ticket_id"] == "DEV-42"


class TestGetEvents:
    async def test_returns_stored_events(self, client: AsyncClient):
        await client.post("/events", json=make_event_body(event_id="e1"))
        await client.post("/events", json=make_event_body(event_id="e2"))
        resp = await client.get("/events?session_id=s1")
        events = resp.json()
        assert len(events) == 2

    async def test_limit(self, client: AsyncClient):
        for i in range(5):
            await client.post("/events", json=make_event_body(event_id=f"e{i}"))
        resp = await client.get("/events?limit=2")
        assert len(resp.json()) == 2


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


class TestReset:
    async def test_reset_clears_analyzers(self, client: AsyncClient):
        resp = await client.post("/reset")
        assert resp.json()["ok"] is True
