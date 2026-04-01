"""Voice Pipeline FastAPI application.

Entry points:
  POST /api/transcribe         — transcribe audio file → text
  POST /api/extract            — extract Jira intent from text
  POST /api/pipeline/run       — full pipeline: text/audio → Jira ticket
  POST /api/webhook/jira       — receive Jira webhook events
  GET  /api/loop/queue         — pending tickets for Ralph Loop
  POST /api/loop/started       — mark ticket as started by loop runner
  POST /api/loop/completed     — mark ticket as completed by loop runner
  WS   /ws/status              — real-time pipeline status broadcast
  GET  /health                 — health check

Run with:
  uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
"""

import asyncio
import logging
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import (
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import Settings, get_settings
from .intent.extractor import IntentExtractionError, IntentExtractor
from .intent.models import JiraTicketIntent
from .loop_queue import LoopQueue
from .persistent_loop_queue import PersistentLoopQueue
from .pipeline.orchestrator import PipelineOrchestrator
from .pipeline.status import MonitorService, PipelineStatus
from .transcriber.base import Transcriber, TranscriptionError
from .transcriber.remote import RemoteTranscriber
from .transcriber.whisper_local import WhisperLocalTranscriber

logger = logging.getLogger(__name__)

# Module-level sentinel for File() default (avoids B008 lint error)
_AUDIO_FILE = File(..., description="Audio file (WAV/MP3/OGG/FLAC)")

# ---------------------------------------------------------------------------
# WebSocket connection manager
# ---------------------------------------------------------------------------


class WebSocketManager:
    """Manages active WebSocket connections and broadcasts messages."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections.add(ws)
        logger.debug("WebSocket connected; total=%d", len(self._connections))

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(ws)
        logger.debug("WebSocket disconnected; total=%d", len(self._connections))

    async def broadcast(self, data: dict[str, Any]) -> None:
        """Send JSON data to all connected clients."""
        async with self._lock:
            connections = set(self._connections)

        dead: set[WebSocket] = set()
        for ws in connections:
            try:
                await ws.send_json(data)
            except Exception:  # noqa: BLE001
                dead.add(ws)

        if dead:
            async with self._lock:
                self._connections -= dead


# ---------------------------------------------------------------------------
# Application-level singletons
# ---------------------------------------------------------------------------

_ws_manager: WebSocketManager | None = None
_monitor: MonitorService | None = None
_orchestrator: PipelineOrchestrator | None = None
_loop_queue: LoopQueue | None = None
_transcriber: Transcriber | None = None
_extractor: IntentExtractor | None = None


def _get_ws_manager() -> WebSocketManager:
    assert _ws_manager is not None, "App not started"
    return _ws_manager


def _get_monitor() -> MonitorService:
    assert _monitor is not None, "App not started"
    return _monitor


def _get_orchestrator() -> PipelineOrchestrator:
    assert _orchestrator is not None, "App not started"
    return _orchestrator


def _get_loop_queue() -> LoopQueue:
    assert _loop_queue is not None, "App not started"
    return _loop_queue


def _get_transcriber(settings: Settings) -> Transcriber:
    global _transcriber
    if _transcriber is None:
        if settings.whisper_backend == "remote":
            _transcriber = RemoteTranscriber(
                remote_url=settings.whisper_remote_url,
                timeout=settings.ollama_timeout,
            )
        else:
            _transcriber = WhisperLocalTranscriber(
                model_size=settings.whisper_model,
                device=settings.whisper_device,
            )
    return _transcriber


def _get_extractor(settings: Settings) -> IntentExtractor:
    global _extractor
    if _extractor is None:
        _extractor = IntentExtractor(
            ollama_url=settings.ollama_url,
            model=settings.ollama_model,
            timeout=settings.ollama_timeout,
        )
    return _extractor


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialise and teardown singletons."""
    global _ws_manager, _monitor, _orchestrator, _loop_queue, _transcriber, _extractor

    settings = get_settings()

    _ws_manager = WebSocketManager()
    _monitor = MonitorService()
    _loop_queue = PersistentLoopQueue(db_path=settings.queue_db_path)

    async def broadcast(state: dict[str, Any]) -> None:
        await _ws_manager.broadcast(state)  # type: ignore[union-attr]

    _orchestrator = PipelineOrchestrator(
        settings=settings,
        monitor=_monitor,
        broadcast=broadcast,
        loop_queue=_loop_queue,
    )

    logger.info(
        "Voice Pipeline started — Whisper=%s, Ollama=%s, auto_dispatch=%s",
        settings.whisper_model,
        settings.ollama_model,
        settings.auto_dispatch_loop,
    )

    yield

    # Teardown
    if _orchestrator:
        await _orchestrator.close()
    if _extractor:
        await _extractor.close()
    logger.info("Voice Pipeline shut down")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="SEJFA Voice Pipeline",
        description="Transcribes voice → extracts Jira intent → creates Jira ticket",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # -----------------------------------------------------------------------
    # Health
    # -----------------------------------------------------------------------

    @app.get("/health", tags=["system"])
    async def health() -> dict[str, Any]:
        """Health check endpoint."""
        return {
            "status": "ok",
            "whisper_model": settings.whisper_model,
            "ollama_model": settings.ollama_model,
            "jira_configured": settings.jira_configured,
            "ws_connections": len(_get_ws_manager()._connections),
        }

    # -----------------------------------------------------------------------
    # WebSocket
    # -----------------------------------------------------------------------

    @app.websocket("/ws/status")
    async def ws_status(websocket: WebSocket) -> None:
        """WebSocket endpoint for real-time pipeline status.

        Broadcasts the full MonitorService state on each pipeline transition.
        """
        manager = _get_ws_manager()
        monitor = _get_monitor()
        await manager.connect(websocket)
        # Send current state immediately on connect
        await websocket.send_json(monitor.get_state())
        try:
            while True:
                # Keep connection alive; actual data is pushed via broadcast
                await websocket.receive_text()
        except WebSocketDisconnect:
            await manager.disconnect(websocket)

    # -----------------------------------------------------------------------
    # Transcription
    # -----------------------------------------------------------------------

    @app.post("/api/transcribe", tags=["transcription"])
    async def transcribe_audio(
        audio: UploadFile = _AUDIO_FILE,
    ) -> dict[str, Any]:
        """Transcribe an uploaded audio file.

        Returns transcribed text, detected language, and duration.
        Whisper model is loaded → used → UNLOADED after this call.
        """
        contents = await audio.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Empty audio file")

        suffix = Path(audio.filename or "audio.wav").suffix or ".wav"

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        monitor = _get_monitor()
        monitor.update_node(PipelineStatus.TRANSCRIBING, "active", "Transcribing…")
        if _ws_manager:
            await _ws_manager.broadcast(monitor.get_state())

        transcriber = _get_transcriber(settings)
        try:
            result = await transcriber.transcribe(tmp_path)
        except TranscriptionError as exc:
            monitor.update_node(PipelineStatus.ERROR, "active", str(exc))
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        finally:
            Path(tmp_path).unlink(missing_ok=True)

        monitor.update_node(PipelineStatus.DONE, "active", "Transcription complete")
        if _ws_manager:
            await _ws_manager.broadcast(monitor.get_state())

        return result.to_dict()

    # -----------------------------------------------------------------------
    # Intent extraction
    # -----------------------------------------------------------------------

    class ExtractRequest(BaseModel):
        text: str

    @app.post("/api/extract", tags=["intent"], response_model=JiraTicketIntent)
    async def extract_intent(request: ExtractRequest) -> JiraTicketIntent:
        """Extract Jira ticket intent from pre-transcribed text.

        Applies prompt injection detection before calling Ollama.
        """
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="text must not be empty")

        extractor = _get_extractor(settings)
        try:
            intent = await extractor.extract(request.text)
        except IntentExtractionError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        return intent

    # -----------------------------------------------------------------------
    # Full pipeline
    # -----------------------------------------------------------------------

    class PipelineTextRequest(BaseModel):
        text: str

    class ClarifyRequest(BaseModel):
        session_id: str
        text: str

    class ApproveRequest(BaseModel):
        session_id: str

    class DiscardRequest(BaseModel):
        session_id: str

    @app.post("/api/pipeline/run", tags=["pipeline"])
    async def run_pipeline(request: PipelineTextRequest) -> dict[str, Any]:
        """Run the full voice pipeline from pre-transcribed text.

        Accepts JSON body: {"text": "..."} with the transcribed voice text.

        Returns either:
          - {"ticket_key", "ticket_url", "summary", "transcribed_text"} on success
          - {"status": "clarification_needed", "session_id", "questions", ...} if ambiguous
        """
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="text must not be empty")

        orchestrator = _get_orchestrator()
        try:
            result = await orchestrator.run_from_text(request.text)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        return result.to_dict()

    @app.post("/api/pipeline/run/audio", tags=["pipeline"])
    async def run_pipeline_audio(
        audio: UploadFile = _AUDIO_FILE,
    ) -> dict[str, Any]:
        """Run the full voice pipeline from an audio file.

        Accepts multipart/form-data with field 'audio'.
        May return clarification_needed if the request is ambiguous.
        """
        contents = await audio.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Empty audio file")

        orchestrator = _get_orchestrator()
        try:
            result = await orchestrator.run_from_audio(contents, audio.filename or "audio.wav")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        return result.to_dict()

    @app.post("/api/pipeline/clarify", tags=["pipeline"])
    async def clarify_pipeline(request: ClarifyRequest) -> dict[str, Any]:
        """Continue a pipeline session with a clarification answer.

        Accepts JSON body: {"session_id": "...", "text": "..."}.
        The session_id comes from a previous clarification_needed response.

        Returns either a ticket result or another clarification_needed.
        """
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="text must not be empty")

        orchestrator = _get_orchestrator()
        try:
            result = await orchestrator.continue_with_clarification(
                session_id=request.session_id,
                answer_text=request.text,
            )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        return result.to_dict()

    @app.post("/api/pipeline/approve", tags=["pipeline"])
    async def approve_pipeline(request: ApproveRequest) -> dict[str, Any]:
        """Approve a previewed pipeline session and create the Jira ticket."""
        orchestrator = _get_orchestrator()
        try:
            result = await orchestrator.continue_with_approval(
                session_id=request.session_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        return result.to_dict()

    @app.post("/api/pipeline/discard", tags=["pipeline"])
    async def discard_pipeline(request: DiscardRequest) -> dict[str, Any]:
        """Discard a previewed pipeline session."""
        orchestrator = _get_orchestrator()
        try:
            result = await orchestrator.discard_session(session_id=request.session_id)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        
        return result

    # -----------------------------------------------------------------------
    # Jira webhook
    # -----------------------------------------------------------------------

    @app.post("/api/webhook/jira", tags=["webhook"])
    async def jira_webhook(payload: dict[str, Any]) -> dict[str, Any]:
        """Receive Jira webhook events.

        Filters for issue_created events on VOICE_INITIATED-labelled tickets.
        """
        event_type = payload.get("webhookEvent", "")
        issue = payload.get("issue", {})
        fields = issue.get("fields", {})
        labels: list[str] = fields.get("labels", [])

        if event_type == "jira:issue_created" and "VOICE_INITIATED" in labels:
            issue_key = issue.get("key", "unknown")
            summary = fields.get("summary", "")
            logger.info("VOICE_INITIATED ticket created: %s — %s", issue_key, summary)
            _get_monitor().add_event(
                PipelineStatus.DONE,
                f"Webhook confirmed ticket: {issue_key}",
            )
            return {"status": "processed", "issue_key": issue_key}

        return {"status": "ignored", "event": event_type}

    # -----------------------------------------------------------------------
    # Ralph Loop queue
    # -----------------------------------------------------------------------

    class LoopStartedRequest(BaseModel):
        key: str

    class LoopCompletedRequest(BaseModel):
        key: str
        success: bool

    @app.get("/api/loop/queue", tags=["loop"])
    async def get_loop_queue() -> list[dict[str, str]]:
        """Return pending tickets waiting for Ralph Loop pickup."""
        return _get_loop_queue().get_pending()

    @app.post("/api/loop/started", tags=["loop"])
    async def loop_started(request: LoopStartedRequest) -> dict[str, str]:
        """Mark a ticket as started by the loop runner."""
        queue = _get_loop_queue()
        queue.mark_started(request.key)

        if _ws_manager:
            await _ws_manager.broadcast({"type": "loop_started", "issue_key": request.key})

        return {"status": "ok", "key": request.key}

    @app.post("/api/loop/completed", tags=["loop"])
    async def loop_completed(request: LoopCompletedRequest) -> dict[str, str]:
        """Mark a ticket as completed by the loop runner."""
        queue = _get_loop_queue()
        queue.mark_completed(request.key, request.success)

        if _ws_manager:
            await _ws_manager.broadcast(
                {
                    "type": "loop_completed",
                    "issue_key": request.key,
                    "success": request.success,
                }
            )

        return {"status": "ok", "key": request.key, "success": str(request.success)}

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    logging.basicConfig(level=settings.log_level.upper())
    uvicorn.run(
        "voice_pipeline.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.app_debug,
    )
