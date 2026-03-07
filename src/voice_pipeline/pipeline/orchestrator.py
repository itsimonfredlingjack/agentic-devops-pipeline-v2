"""Pipeline orchestrator: coordinates the full voice → Jira ticket flow.

Stages:
  recording    → audio file received
  transcribing → Whisper transcribes audio (VRAM loaded → unloaded)
  extracting   → Ollama extracts Jira intent (VRAM claimed)
  clarifying   → ambiguity detected, waiting for user clarification
  creating     → Jira issue created via REST API
  done         → pipeline complete; ticket URL returned
  error        → any stage failed

At each transition the orchestrator broadcasts a status update to all
connected WebSocket clients via the MonitorService + WebSocketManager.
"""

from __future__ import annotations

import asyncio
import logging
import tempfile
import uuid
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from ..config import Settings

if TYPE_CHECKING:
    from ..loop_queue import LoopQueue

from ..intent.extractor import IntentExtractionError, IntentExtractor
from ..intent.models import JiraTicketIntent
from ..jira.client import AsyncJiraClient, JiraAPIError
from ..transcriber.base import Transcriber, TranscriptionError
from ..transcriber.whisper_local import WhisperLocalTranscriber
from .status import MonitorService, PipelineStatus

logger = logging.getLogger(__name__)

BroadcastCallback = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]


@dataclass
class PipelineSession:
    """Tracks state for a single pipeline run (including clarification rounds)."""

    session_id: str
    original_text: str
    current_intent: JiraTicketIntent | None = None
    clarification_round: int = 0
    conversation_history: list[str] = field(default_factory=list)


class PipelineResult:
    """Result of a successful pipeline run."""

    def __init__(
        self,
        session_id: str,
        ticket_key: str,
        ticket_url: str,
        summary: str,
        transcribed_text: str,
    ) -> None:
        self.session_id = session_id
        self.ticket_key = ticket_key
        self.ticket_url = ticket_url
        self.summary = summary
        self.transcribed_text = transcribed_text

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "ticket_key": self.ticket_key,
            "ticket_url": self.ticket_url,
            "summary": self.summary,
            "transcribed_text": self.transcribed_text,
        }


class ClarificationNeeded:
    """Returned when the intent is too ambiguous and clarification is needed."""

    def __init__(
        self,
        session_id: str,
        questions: list[str],
        ambiguity_score: float,
        partial_summary: str,
        round_number: int,
    ) -> None:
        self.session_id = session_id
        self.questions = questions
        self.ambiguity_score = ambiguity_score
        self.partial_summary = partial_summary
        self.round_number = round_number

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": "clarification_needed",
            "session_id": self.session_id,
            "questions": self.questions,
            "ambiguity_score": self.ambiguity_score,
            "partial_summary": self.partial_summary,
            "round": self.round_number,
        }


class PipelineOrchestrator:
    """Runs the voice → Jira pipeline and broadcasts status at each stage.

    Designed for a single concurrent pipeline run (RTX 2060 VRAM constraint).
    The _lock prevents two simultaneous runs from fighting over GPU memory.
    """

    def __init__(
        self,
        settings: Settings,
        monitor: MonitorService,
        broadcast: BroadcastCallback | None = None,
        loop_queue: LoopQueue | None = None,
    ) -> None:
        self._settings = settings
        self._monitor = monitor
        self._broadcast = broadcast
        self._loop_queue = loop_queue
        self._lock = asyncio.Lock()
        self._sessions: dict[str, PipelineSession] = {}

        self._transcriber: Transcriber | None = None
        self._extractor: IntentExtractor | None = None
        self._jira: AsyncJiraClient | None = None

    def _get_transcriber(self) -> Transcriber:
        if self._transcriber is None:
            if self._settings.whisper_backend == "remote":
                from ..transcriber.remote import RemoteTranscriber

                self._transcriber = RemoteTranscriber(
                    remote_url=self._settings.whisper_remote_url,
                    timeout=self._settings.ollama_timeout,
                )
            else:
                self._transcriber = WhisperLocalTranscriber(
                    model_size=self._settings.whisper_model,
                    device=self._settings.whisper_device,
                )
        return self._transcriber

    def _get_extractor(self) -> IntentExtractor:
        if self._extractor is None:
            self._extractor = IntentExtractor(
                ollama_url=self._settings.ollama_url,
                model=self._settings.ollama_model,
                timeout=self._settings.ollama_timeout,
            )
        return self._extractor

    def _get_jira(self) -> AsyncJiraClient:
        if self._jira is None:
            self._jira = AsyncJiraClient(self._settings)
        return self._jira

    async def _transition(self, stage: PipelineStatus, message: str) -> None:
        """Move to a new pipeline stage and broadcast the update."""
        self._monitor.update_node(stage, "active", message)
        if self._broadcast:
            await self._broadcast(self._monitor.get_state())

    async def run_from_audio(
        self, audio_bytes: bytes, filename: str = "audio.wav"
    ) -> PipelineResult | ClarificationNeeded:
        """Run the full pipeline from raw audio bytes."""
        async with self._lock:
            return await self._execute_pipeline(audio_bytes, filename)

    async def run_from_text(self, text: str) -> PipelineResult | ClarificationNeeded:
        """Run the pipeline skipping the transcription stage."""
        async with self._lock:
            return await self._execute_from_text(text)

    async def continue_with_clarification(
        self, session_id: str, answer_text: str
    ) -> PipelineResult | ClarificationNeeded:
        """Continue a pipeline session after the user answers clarification questions.

        Args:
            session_id: The session ID from the ClarificationNeeded response.
            answer_text: The user's answer to the clarification questions.

        Returns:
            PipelineResult if now clear enough, or another ClarificationNeeded.

        Raises:
            ValueError: If session_id is not found.
        """
        session = self._sessions.get(session_id)
        if session is None:
            raise ValueError(f"Unknown session: {session_id}")

        async with self._lock:
            return await self._execute_clarification(session, answer_text)

    async def _execute_pipeline(
        self, audio_bytes: bytes, filename: str
    ) -> PipelineResult | ClarificationNeeded:
        """Internal: full pipeline from audio bytes."""
        suffix = Path(filename).suffix or ".wav"

        await self._transition(PipelineStatus.RECORDING, f"Audio received: {filename}")

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            await self._transition(PipelineStatus.TRANSCRIBING, "Transcribing with Whisper…")
            transcriber = self._get_transcriber()
            try:
                result = await transcriber.transcribe(tmp_path)
            except TranscriptionError as exc:
                await self._transition(PipelineStatus.ERROR, str(exc))
                raise

            transcribed_text = result.text
            logger.info(
                "Transcription complete: language=%s, duration=%.1fs, chars=%d",
                result.language,
                result.duration,
                len(transcribed_text),
            )
        finally:
            Path(tmp_path).unlink(missing_ok=True)

        return await self._execute_from_text(transcribed_text)

    async def _execute_from_text(self, text: str) -> PipelineResult | ClarificationNeeded:
        """Internal: pipeline from transcribed text onwards."""
        if not self._settings.jira_configured:
            raise RuntimeError("Jira is not configured. Set JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN.")

        session_id = uuid.uuid4().hex[:12]

        # Extract intent
        await self._transition(PipelineStatus.EXTRACTING, "Extracting intent with Ollama…")
        extractor = self._get_extractor()
        try:
            intent = await extractor.extract(text)
        except IntentExtractionError as exc:
            await self._transition(PipelineStatus.ERROR, str(exc))
            raise

        logger.info("Intent extracted: %s (ambiguity=%.2f)", intent.summary, intent.ambiguity_score)

        # Check ambiguity
        threshold = self._settings.ambiguity_threshold
        if intent.ambiguity_score > threshold and intent.clarification_questions:
            session = PipelineSession(
                session_id=session_id,
                original_text=text,
                current_intent=intent,
                clarification_round=1,
                conversation_history=[text],
            )
            self._sessions[session.session_id] = session

            questions_str = "; ".join(intent.clarification_questions)
            await self._transition(
                PipelineStatus.CLARIFYING,
                f"Ambiguity {intent.ambiguity_score:.2f} > {threshold}: {questions_str}",
            )

            # Broadcast clarification event with questions
            if self._broadcast:
                await self._broadcast(
                    {
                        "type": "clarification_needed",
                        "session_id": session.session_id,
                        "questions": intent.clarification_questions,
                        "ambiguity_score": intent.ambiguity_score,
                        "partial_summary": intent.summary,
                        "round": 1,
                    }
                )

            return ClarificationNeeded(
                session_id=session.session_id,
                questions=intent.clarification_questions,
                ambiguity_score=intent.ambiguity_score,
                partial_summary=intent.summary,
                round_number=1,
            )

        # Clear enough — create ticket
        return await self._create_ticket(intent, text, session_id)

    async def _execute_clarification(
        self, session: PipelineSession, answer_text: str
    ) -> PipelineResult | ClarificationNeeded:
        """Internal: re-extract with clarification context."""
        session.conversation_history.append(answer_text)
        session.clarification_round += 1

        await self._transition(
            PipelineStatus.EXTRACTING,
            f"Re-extracting intent (round {session.clarification_round})…",
        )

        extractor = self._get_extractor()
        previous_questions = (
            session.current_intent.clarification_questions if session.current_intent else []
        )

        try:
            intent = await extractor.extract_with_clarification(
                original_text=session.original_text,
                questions=previous_questions,
                answer_text=answer_text,
            )
        except IntentExtractionError as exc:
            await self._transition(PipelineStatus.ERROR, str(exc))
            raise

        session.current_intent = intent
        logger.info(
            "Re-extracted intent (round %d): %s (ambiguity=%.2f)",
            session.clarification_round,
            intent.summary,
            intent.ambiguity_score,
        )

        threshold = self._settings.ambiguity_threshold
        max_rounds = self._settings.max_clarification_rounds

        # Still ambiguous and we haven't hit max rounds?
        if (
            intent.ambiguity_score > threshold
            and intent.clarification_questions
            and session.clarification_round < max_rounds
        ):
            questions_str = "; ".join(intent.clarification_questions)
            await self._transition(
                PipelineStatus.CLARIFYING,
                f"Still ambiguous ({intent.ambiguity_score:.2f}), round {session.clarification_round}: {questions_str}",
            )

            if self._broadcast:
                await self._broadcast(
                    {
                        "type": "clarification_needed",
                        "session_id": session.session_id,
                        "questions": intent.clarification_questions,
                        "ambiguity_score": intent.ambiguity_score,
                        "partial_summary": intent.summary,
                        "round": session.clarification_round,
                    }
                )

            return ClarificationNeeded(
                session_id=session.session_id,
                questions=intent.clarification_questions,
                ambiguity_score=intent.ambiguity_score,
                partial_summary=intent.summary,
                round_number=session.clarification_round,
            )

        # Clear enough (or max rounds hit) — create ticket
        if session.clarification_round >= max_rounds:
            logger.info("Max clarification rounds reached, creating ticket with best effort")

        combined_text = " | ".join(session.conversation_history)
        self._sessions.pop(session.session_id, None)
        return await self._create_ticket(intent, combined_text, session.session_id)

    async def _create_ticket(
        self,
        intent: JiraTicketIntent,
        text: str,
        session_id: str,
    ) -> PipelineResult:
        """Create the Jira ticket from a validated intent."""
        await self._transition(
            PipelineStatus.CREATING,
            f"Creating Jira ticket in {self._settings.jira_project_key}…",
        )
        jira = self._get_jira()
        try:
            issue = await jira.create_issue(
                project_key=self._settings.jira_project_key,
                summary=intent.summary,
                description=intent.description,
                acceptance_criteria=intent.acceptance_criteria,
                issue_type=intent.issue_type,
                priority=intent.priority,
                labels=intent.labels,
            )
        except JiraAPIError as exc:
            await self._transition(PipelineStatus.ERROR, str(exc))
            raise

        await self._transition(
            PipelineStatus.DONE,
            f"Ticket created: {issue.key} — {issue.url}",
        )
        self._monitor.set_task_info(title=intent.summary, status="completed")

        # Auto-dispatch to Ralph Loop queue
        if self._settings.auto_dispatch_loop and self._loop_queue is not None:
            queued = self._loop_queue.add_ticket(issue.key, intent.summary)
            if queued and self._broadcast:
                await self._broadcast(
                    {
                        "type": "ticket_queued",
                        "issue_key": issue.key,
                        "summary": intent.summary,
                    }
                )

        return PipelineResult(
            session_id=session_id,
            ticket_key=issue.key,
            ticket_url=issue.url,
            summary=intent.summary,
            transcribed_text=text,
        )

    async def close(self) -> None:
        """Release all held resources on app shutdown."""
        if self._transcriber:
            await self._transcriber.close()
        if self._extractor:
            await self._extractor.close()
        if self._jira:
            await self._jira.close()
        self._sessions.clear()
