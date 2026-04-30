"""Monitor API — FastAPI + Socket.IO entrypoint."""

from __future__ import annotations

import logging
import os
import secrets
import uuid
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any, Literal

import socketio
from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, model_validator
from sqlalchemy import desc, func, select

from .config import config
from .cost_tracker import CostTracker
from .models import ConversationMessage, Event, Session, async_session, init_db
from .stuck_detector import StuckDetector
from .ws_manager import BroadcastManager

logger = logging.getLogger(__name__)

def _configured_api_token() -> str | None:
    token = os.getenv("SEJFA_LOCAL_API_TOKEN") or os.getenv("MONITOR_API_SECRET")
    return token if token else None


def _is_valid_token(candidate: str | None) -> bool:
    expected = _configured_api_token()
    return bool(expected and candidate and secrets.compare_digest(candidate, expected))


def require_local_api_token(authorization: str | None = Header(default=None)) -> None:
    expected = _configured_api_token()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SEJFA_LOCAL_API_TOKEN is required for monitor control APIs.",
        )

    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not _is_valid_token(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid monitor API token.",
        )


def _authorize_monitor_socket(auth: dict[str, Any] | None) -> bool:
    token = auth.get("token") if isinstance(auth, dict) else None
    return _is_valid_token(token if isinstance(token, str) else None)


# Socket.IO server
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=config.cors_origins)

# Broadcast manager
broadcast = BroadcastManager(sio, authorize=_authorize_monitor_socket)

# In-memory analyzers
stuck_detector = StuckDetector()
cost_tracker = CostTracker()

# Session signals (transient — not persisted)
_session_signals: dict[str, dict[str, Any]] = {}

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
        if any(kw in summary_lower for kw in ("pytest", "vitest", "ruff", "biome", "lint", "test")):
            return "verify"
        if any(kw in summary_lower for kw in ("git push", "gh pr", "git merge")):
            return "deploy"
        if any(kw in summary_lower for kw in ("ticket", "linear", "task")):
            return "agent"

    # Default from map
    return STAGE_MAP.get(tool_name, "agent")


class HookEventBody(BaseModel):
    event_id: str
    session_id: str
    task_ref: str | None = None
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

    @model_validator(mode="after")
    def normalize_task_ref(self) -> HookEventBody:
        if self.task_ref is None and self.ticket_id is not None:
            self.task_ref = self.ticket_id
        return self


def _event_payload(event: Event) -> dict[str, Any]:
    task_ref = event.task_ref or event.ticket_id
    return {
        "event_id": event.event_id,
        "session_id": event.session_id,
        "task_ref": task_ref,
        "timestamp": event.timestamp.isoformat() if event.timestamp else None,
        "event_type": event.event_type,
        "tool_name": event.tool_name,
        "tool_args_summary": event.tool_args_summary,
        "success": event.success,
        "duration_ms": event.duration_ms,
        "cost_usd": event.cost_usd,
    }


def _hook_event_payload(body: HookEventBody) -> dict[str, Any]:
    task_ref = body.task_ref or body.ticket_id
    return {
        "event_id": body.event_id,
        "session_id": body.session_id,
        "task_ref": task_ref,
        "timestamp": body.timestamp,
        "event_type": body.event_type,
        "tool_name": body.tool_name,
        "tool_args_hash": body.tool_args_hash,
        "tool_args_summary": body.tool_args_summary,
        "success": body.success,
        "duration_ms": body.duration_ms,
        "tokens": body.tokens,
        "cost_usd": body.cost_usd,
        "error": body.error,
    }


def _session_payload(session: Session) -> dict[str, Any]:
    task_ref = session.task_ref or session.ticket_id
    return {
        "session_id": session.session_id,
        "task_ref": task_ref,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "total_cost_usd": session.total_cost_usd,
        "total_events": session.total_events,
        "outcome": session.outcome,
    }


class InstructionBody(BaseModel):
    message: str


class ConversationMessageBody(BaseModel):
    message_id: str | None = None
    message: str
    sender: Literal["user", "loop", "system", "blocker"] = "user"
    status: Literal["info", "success", "warning", "danger"] | None = None
    details: str | None = None
    actions: list[Literal["retry", "clarify"]] | None = None


class SessionActionBody(BaseModel):
    action: Literal["retry", "clarify"]
    details: str | None = None
    message_id: str | None = None


class SessionOutcomeBody(BaseModel):
    outcome: Literal["done", "failed", "blocked", "aborted"]
    task_ref: str | None = None
    ticket_id: str | None = None
    details: str | None = None

    @model_validator(mode="after")
    def normalize_task_ref(self) -> SessionOutcomeBody:
        if self.task_ref is None and self.ticket_id is not None:
            self.task_ref = self.ticket_id
        return self


def _derive_completion_outcome(success: bool | None, error: str | None) -> str:
    if success is True:
        return "done"

    normalized_error = (error or "").lower()
    if "abort" in normalized_error:
        return "aborted"
    if "block" in normalized_error or "clarif" in normalized_error:
        return "blocked"
    if success is False:
        return "failed"
    return "unknown"


async def _append_conversation_message(
    *,
    session_id: str,
    sender: str,
    text: str,
    status: str | None = None,
    details: str | None = None,
    actions: list[str] | None = None,
    message_id: str | None = None,
    should_broadcast: bool = True,
) -> dict[str, Any]:
    normalized_sender = sender if sender in {"user", "loop", "system", "blocker"} else "system"
    normalized_status = status if status in {"info", "success", "warning", "danger"} else None
    normalized_actions = (
        [action for action in actions if action in {"retry", "clarify"}] if actions else None
    )
    db_message_id = message_id or f"{session_id}-{uuid.uuid4().hex}"
    if len(db_message_id) > 63:
        db_message_id = db_message_id[:63]
    payload = {
        "message_id": db_message_id,
        "session_id": session_id,
        "sender": normalized_sender,
        "status": normalized_status,
        "text": text,
        "details": details,
        "actions": normalized_actions,
        "timestamp": datetime.utcnow().isoformat(),
    }

    async with async_session() as session:
        db_row = ConversationMessage(
            message_id=payload["message_id"],
            session_id=session_id,
            timestamp=datetime.fromisoformat(payload["timestamp"].replace("Z", "+00:00")),
            sender=normalized_sender,
            text=text,
            status=normalized_status,
            details=details,
            actions=normalized_actions,
        )
        session.add(db_row)
        await session.commit()

    if should_broadcast:
        await broadcast.emit("session_message", payload)

    return payload


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Monitor API started on port %d", config.port)
    yield
    logger.info("Monitor API shutting down")


fastapi_app = FastAPI(title="SEJFA Monitor API", version="1.0.0", lifespan=lifespan)

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_origin_regex=config.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Socket.IO as ASGI sub-app
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)


@fastapi_app.post("/events", status_code=201)
async def receive_event(body: HookEventBody) -> dict[str, Any]:
    """Receive a hook event, store, analyze, and broadcast."""
    resolved_task_ref = body.task_ref or body.ticket_id
    event_dict = _hook_event_payload(body)

    # 1. Store in SQLite
    async with async_session() as session:
        db_event = Event(
            event_id=body.event_id,
            session_id=body.session_id,
            task_ref=resolved_task_ref,
            ticket_id=None,
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
                task_ref=resolved_task_ref,
                ticket_id=None,
                started_at=datetime.fromisoformat(body.timestamp.replace("Z", "+00:00")),
            )
            session.add(db_session)
        else:
            if resolved_task_ref and not db_session.task_ref:
                db_session.task_ref = resolved_task_ref

        db_session.total_events = (db_session.total_events or 0) + 1
        if body.cost_usd:
            db_session.total_cost_usd = (db_session.total_cost_usd or 0) + body.cost_usd

        stop_outcome = None
        if body.event_type == "stop":
            stop_outcome = _derive_completion_outcome(body.success, body.error)
            db_session.ended_at = datetime.now(UTC)
            db_session.outcome = stop_outcome

        await session.commit()

    # 2. Broadcast tool_event
    await broadcast.emit("tool_event", event_dict)

    # 2b. Persist notable session system messages
    if body.event_type == "stop":
        await _append_conversation_message(
            session_id=body.session_id,
            sender="system",
            text=(
                f"Loop session completed for task {resolved_task_ref or 'unknown'}"
                if stop_outcome == "done"
                else f"Loop session ended with outcome {stop_outcome} for task {resolved_task_ref or 'unknown'}"
            ),
            status="success" if stop_outcome == "done" else "warning",
            details=body.error,
            actions=[],
        )
        await broadcast.emit(
            "session_complete",
            {
                "session_id": body.session_id,
                "task_ref": resolved_task_ref,
                "outcome": stop_outcome or "unknown",
                "pytest_summary": None,
                "ruff_summary": None,
                "git_diff_summary": None,
                "pr_url": None,
            },
        )

    # 3. Run cost tracker
    cost_update = cost_tracker.add_event(event_dict)
    await broadcast.emit("cost_update", asdict(cost_update))

    # 4. Run stuck detector
    stuck_alert = stuck_detector.check(event_dict)
    if stuck_alert:
        await broadcast.emit("stuck_alert", asdict(stuck_alert))
        await _append_conversation_message(
            session_id=body.session_id,
            sender="blocker",
            text=f"Potential stall detected: {stuck_alert.pattern}",
            status="danger",
            details=(
                f"repeat_count={stuck_alert.repeat_count}, "
                f"tokens_burned={stuck_alert.tokens_burned}, since={stuck_alert.since}"
            ),
        )

    # 5. Broadcast pipeline stage
    stage = infer_stage(body.tool_name, body.tool_args_summary)
    await broadcast.emit("pipeline_stage", {"stage": stage, "active": True})

    return {"ok": True, "event_id": body.event_id}


@fastapi_app.get("/events")
async def get_events(
    session_id: str | None = None,
    task_ref: str | None = None,
    ticket_id: str | None = None,
    limit: int = Query(default=50, le=500),
) -> list[dict[str, Any]]:
    """Query historical events."""
    resolved_task_ref = task_ref or ticket_id
    async with async_session() as session:
        query = select(Event).order_by(desc(Event.id)).limit(limit)
        if session_id:
            query = query.where(Event.session_id == session_id)
        if resolved_task_ref:
            query = query.where(func.coalesce(Event.task_ref, Event.ticket_id) == resolved_task_ref)
        result = await session.execute(query)
        events = result.scalars().all()
        return [_event_payload(event) for event in events]


@fastapi_app.get("/sessions", dependencies=[Depends(require_local_api_token)])
async def get_sessions() -> list[dict[str, Any]]:
    """List all sessions with summary stats."""
    async with async_session() as session:
        result = await session.execute(select(Session).order_by(desc(Session.started_at)).limit(50))
        sessions = result.scalars().all()
        return [_session_payload(session) for session in sessions]


@fastapi_app.get("/sessions/{session_id}", dependencies=[Depends(require_local_api_token)])
async def get_session_detail(session_id: str) -> dict[str, Any]:
    """Get single session detail."""
    async with async_session() as session:
        result = await session.execute(select(Session).where(Session.session_id == session_id))
        s = result.scalar_one_or_none()
        if not s:
            return {"error": "Session not found"}
        return _session_payload(s)


@fastapi_app.get(
    "/sessions/{session_id}/messages",
    dependencies=[Depends(require_local_api_token)],
)
async def get_session_messages(
    session_id: str, limit: int = Query(default=100, le=250)
) -> list[dict[str, Any]]:
    """Return persisted message history for a session."""
    async with async_session() as session:
        result = await session.execute(
            select(ConversationMessage)
            .where(ConversationMessage.session_id == session_id)
            .order_by(desc(ConversationMessage.timestamp))
            .limit(limit),
        )
        messages = result.scalars().all()
        return [
            {
                "message_id": message.message_id,
                "session_id": message.session_id,
                "timestamp": message.timestamp.isoformat() if message.timestamp else None,
                "sender": message.sender,
                "text": message.text,
                "status": message.status,
                "details": message.details,
                "actions": message.actions,
            }
            for message in messages[::-1]
        ]


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
            "task_ref": s.task_ref or s.ticket_id,
            "total_events": s.total_events,
            "total_cost_usd": s.total_cost_usd,
        }


@fastapi_app.post("/reset", dependencies=[Depends(require_local_api_token)])
async def reset_session() -> dict[str, bool]:
    """Clear current session state (in-memory analyzers)."""
    stuck_detector.reset()
    cost_tracker.reset()
    _session_signals.clear()
    return {"ok": True}


@fastapi_app.post("/sessions/{session_id}/abort", dependencies=[Depends(require_local_api_token)])
async def abort_session(session_id: str) -> dict[str, Any]:
    """Signal a running session to abort."""
    _session_signals.setdefault(session_id, {})["abort"] = True
    await broadcast.emit("session_abort", {"session_id": session_id})
    await _append_conversation_message(
        session_id=session_id,
        sender="user",
        text="Abort requested by user",
        status="warning",
        details="Live abort signal queued for the runner.",
    )
    return {"ok": True, "session_id": session_id}


@fastapi_app.post(
    "/sessions/{session_id}/instructions",
    dependencies=[Depends(require_local_api_token)],
)
async def send_instruction(session_id: str, body: InstructionBody) -> dict[str, Any]:
    """Send a tactical instruction to a running session."""
    text = body.message.strip()
    _session_signals.setdefault(session_id, {})["instruction"] = text
    await broadcast.emit(
        "session_instruction",
        {"session_id": session_id, "message": body.message},
    )
    await _append_conversation_message(
        session_id=session_id,
        sender="user",
        text=text,
        status="info",
        details="User instruction",
    )
    return {"ok": True, "session_id": session_id}


@fastapi_app.post(
    "/sessions/{session_id}/actions",
    dependencies=[Depends(require_local_api_token)],
)
async def send_session_action(session_id: str, body: SessionActionBody) -> dict[str, Any]:
    """Send a control action (retry / clarify) to a running session."""
    action = body.action

    signal_value = body.details.strip() if body.details else True
    if action in {"retry", "clarify"}:
        _session_signals.setdefault(session_id, {})[action] = signal_value

    await broadcast.emit(
        "session_action",
        {
            "session_id": session_id,
            "action": action,
            "details": body.details,
            "source": "desktop",
        },
    )

    await _append_conversation_message(
        session_id=session_id,
        sender="user",
        text=body.details
        or ("Retry requested by user" if action == "retry" else "Clarification requested by user"),
        status="info",
        details=body.details,
        actions=[action],
        message_id=body.message_id,
    )

    return {"ok": True, "session_id": session_id, "action": action}


@fastapi_app.post(
    "/sessions/{session_id}/outcome",
    dependencies=[Depends(require_local_api_token)],
)
async def set_session_outcome(session_id: str, body: SessionOutcomeBody) -> dict[str, Any]:
    """Persist an explicit runner-reported session outcome and broadcast completion."""
    resolved_task_ref = body.task_ref or body.ticket_id

    async with async_session() as session:
        result = await session.execute(select(Session).where(Session.session_id == session_id))
        db_session = result.scalar_one_or_none()
        already_completed = False
        if not db_session:
            db_session = Session(
                session_id=session_id,
                task_ref=resolved_task_ref,
                ticket_id=None,
                started_at=datetime.now(UTC),
            )
            session.add(db_session)
        else:
            already_completed = bool(
                db_session.outcome == body.outcome and db_session.ended_at is not None
            )
            if resolved_task_ref and not db_session.task_ref:
                db_session.task_ref = resolved_task_ref

        db_session.ended_at = datetime.now(UTC)
        db_session.outcome = body.outcome
        await session.commit()

        task_ref = db_session.task_ref or db_session.ticket_id or resolved_task_ref
    if not already_completed:
        await _append_conversation_message(
            session_id=session_id,
            sender="system",
            text=(
                f"Runner reported outcome {body.outcome} for task {task_ref or 'unknown'}"
                if body.outcome != "done"
                else f"Runner reported successful completion for task {task_ref or 'unknown'}"
            ),
            status="success" if body.outcome == "done" else "warning",
            details=body.details,
            actions=["retry"] if body.outcome in {"failed", "blocked", "aborted"} else [],
        )
        await broadcast.emit(
            "session_complete",
            {
                "session_id": session_id,
                "task_ref": task_ref,
                "outcome": body.outcome,
                "pytest_summary": None,
                "ruff_summary": None,
                "git_diff_summary": None,
                "pr_url": None,
            },
        )

    return {"ok": True, "session_id": session_id, "task_ref": task_ref, "outcome": body.outcome}


@fastapi_app.post(
    "/sessions/{session_id}/messages",
    dependencies=[Depends(require_local_api_token)],
)
async def append_session_message(session_id: str, body: ConversationMessageBody) -> dict[str, Any]:
    """Persist and broadcast a conversation message."""
    text = body.message.strip()
    payload = await _append_conversation_message(
        session_id=session_id,
        sender=body.sender,
        text=text,
        status=body.status,
        details=body.details,
        actions=body.actions,
        message_id=body.message_id,
        should_broadcast=True,
    )
    return payload


@fastapi_app.get(
    "/sessions/{session_id}/signals",
    dependencies=[Depends(require_local_api_token)],
)
async def get_signals(session_id: str) -> dict[str, Any]:
    """Check for pending signals (called by monitor hook on PreToolUse)."""
    signals = _session_signals.pop(session_id, {})
    return signals
