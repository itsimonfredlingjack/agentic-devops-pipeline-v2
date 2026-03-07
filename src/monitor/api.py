"""Monitor API — FastAPI + Socket.IO entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any

import socketio
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import desc, select

from .config import config
from .cost_tracker import CostTracker
from .models import Event, Session, async_session, init_db
from .stuck_detector import StuckDetector
from .ws_manager import BroadcastManager

logger = logging.getLogger(__name__)

# Socket.IO server
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

# Broadcast manager
broadcast = BroadcastManager(sio)

# In-memory analyzers
stuck_detector = StuckDetector()
cost_tracker = CostTracker()

# Pipeline stage mapping
STAGE_MAP: dict[str, str] = {
    "Bash": "actions",
    "Edit": "actions",
    "Write": "actions",
    "Read": "actions",
    "Glob": "actions",
    "Grep": "actions",
    "Task": "actions",
    "WebFetch": "actions",
    "WebSearch": "actions",
}


def infer_stage(tool_name: str, tool_args_summary: str) -> str:
    """Infer pipeline stage from tool name and args."""
    summary_lower = tool_args_summary.lower()

    # Check for test/lint commands
    if tool_name == "Bash":
        if any(
            kw in summary_lower
            for kw in ("pytest", "vitest", "ruff", "biome", "lint", "test")
        ):
            return "verify"
        if any(kw in summary_lower for kw in ("git push", "gh pr", "git merge")):
            return "deploy"
        if any(kw in summary_lower for kw in ("jira", "ticket")):
            return "jira"

    # Default from map
    return STAGE_MAP.get(tool_name, "agent")


class HookEventBody(BaseModel):
    event_id: str
    session_id: str
    ticket_id: str | None = None
    timestamp: str
    event_type: str
    tool_name: str
    tool_args_hash: str
    tool_args_summary: str = ""
    success: bool | None = None
    duration_ms: int | None = None
    tokens: dict[str, int] | None = None
    cost_usd: float | None = None
    error: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Monitor API started on port %d", config.port)
    yield
    logger.info("Monitor API shutting down")


fastapi_app = FastAPI(title="SEJFA Monitor API", version="1.0.0", lifespan=lifespan)

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Socket.IO as ASGI sub-app
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)


@fastapi_app.post("/events", status_code=201)
async def receive_event(body: HookEventBody) -> dict[str, Any]:
    """Receive a hook event, store, analyze, and broadcast."""
    event_dict = body.model_dump()

    # 1. Store in SQLite
    async with async_session() as session:
        db_event = Event(
            event_id=body.event_id,
            session_id=body.session_id,
            ticket_id=body.ticket_id,
            timestamp=datetime.fromisoformat(body.timestamp.replace("Z", "+00:00")),
            event_type=body.event_type,
            tool_name=body.tool_name,
            tool_args_hash=body.tool_args_hash,
            tool_args_summary=body.tool_args_summary,
            success=body.success,
            duration_ms=body.duration_ms,
            tokens=body.tokens,
            cost_usd=body.cost_usd,
            error=body.error,
        )
        session.add(db_event)

        # Upsert session record
        existing = await session.execute(
            select(Session).where(Session.session_id == body.session_id)
        )
        db_session = existing.scalar_one_or_none()
        if not db_session:
            db_session = Session(
                session_id=body.session_id,
                ticket_id=body.ticket_id,
                started_at=datetime.fromisoformat(body.timestamp.replace("Z", "+00:00")),
            )
            session.add(db_session)

        db_session.total_events = (db_session.total_events or 0) + 1
        if body.cost_usd:
            db_session.total_cost_usd = (db_session.total_cost_usd or 0) + body.cost_usd

        if body.event_type == "stop":
            db_session.ended_at = datetime.now(UTC)
            db_session.outcome = "done"

        await session.commit()

    # 2. Broadcast tool_event
    await broadcast.emit("tool_event", event_dict)

    # 3. Run cost tracker
    cost_update = cost_tracker.add_event(event_dict)
    await broadcast.emit("cost_update", asdict(cost_update))

    # 4. Run stuck detector
    stuck_alert = stuck_detector.check(event_dict)
    if stuck_alert:
        await broadcast.emit("stuck_alert", asdict(stuck_alert))

    # 5. Broadcast pipeline stage
    stage = infer_stage(body.tool_name, body.tool_args_summary)
    await broadcast.emit("pipeline_stage", {"stage": stage, "active": True})

    return {"ok": True, "event_id": body.event_id}


@fastapi_app.get("/events")
async def get_events(
    session_id: str | None = None,
    limit: int = Query(default=50, le=500),
) -> list[dict[str, Any]]:
    """Query historical events."""
    async with async_session() as session:
        query = select(Event).order_by(desc(Event.id)).limit(limit)
        if session_id:
            query = query.where(Event.session_id == session_id)
        result = await session.execute(query)
        events = result.scalars().all()
        return [
            {
                "event_id": e.event_id,
                "session_id": e.session_id,
                "ticket_id": e.ticket_id,
                "timestamp": e.timestamp.isoformat() if e.timestamp else None,
                "event_type": e.event_type,
                "tool_name": e.tool_name,
                "tool_args_summary": e.tool_args_summary,
                "success": e.success,
                "duration_ms": e.duration_ms,
                "cost_usd": e.cost_usd,
            }
            for e in events
        ]


@fastapi_app.get("/sessions")
async def get_sessions() -> list[dict[str, Any]]:
    """List all sessions with summary stats."""
    async with async_session() as session:
        result = await session.execute(
            select(Session).order_by(desc(Session.started_at)).limit(50)
        )
        sessions = result.scalars().all()
        return [
            {
                "session_id": s.session_id,
                "ticket_id": s.ticket_id,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "ended_at": s.ended_at.isoformat() if s.ended_at else None,
                "total_cost_usd": s.total_cost_usd,
                "total_events": s.total_events,
                "outcome": s.outcome,
            }
            for s in sessions
        ]


@fastapi_app.get("/sessions/{session_id}")
async def get_session_detail(session_id: str) -> dict[str, Any]:
    """Get single session detail."""
    async with async_session() as session:
        result = await session.execute(
            select(Session).where(Session.session_id == session_id)
        )
        s = result.scalar_one_or_none()
        if not s:
            return {"error": "Session not found"}
        return {
            "session_id": s.session_id,
            "ticket_id": s.ticket_id,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "total_cost_usd": s.total_cost_usd,
            "total_events": s.total_events,
            "outcome": s.outcome,
        }


@fastapi_app.get("/status")
async def get_status() -> dict[str, Any]:
    """Get current (most recent active) session status."""
    async with async_session() as session:
        result = await session.execute(
            select(Session)
            .where(Session.ended_at.is_(None))
            .order_by(desc(Session.started_at))
            .limit(1)
        )
        s = result.scalar_one_or_none()
        if not s:
            return {"active": False}
        return {
            "active": True,
            "session_id": s.session_id,
            "ticket_id": s.ticket_id,
            "total_events": s.total_events,
            "total_cost_usd": s.total_cost_usd,
        }


@fastapi_app.post("/reset")
async def reset_session() -> dict[str, bool]:
    """Clear current session state (in-memory analyzers)."""
    stuck_detector.reset()
    cost_tracker.reset()
    return {"ok": True}
