"""Pipeline orchestrator: coordinates the full voice -> structured task flow.

Stages:
  recording    → audio file received
  transcribing → Whisper transcribes audio (VRAM loaded -> unloaded)
  extracting   → Ollama extracts structured task intent (VRAM claimed)
  clarifying   → ambiguity detected, waiting for user clarification
  creating     → task saved to Linear
  done         → pipeline complete; task URL returned
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
    from ..demo_tasks import DemoTaskStore
    from ..loop_queue import LoopQueue

from ..intent.extractor import IntentExtractionError, IntentExtractor
from ..intent.models import TaskIntent
from ..linear.client import AsyncLinearClient, LinearAPIError
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
    current_intent: TaskIntent | None = None
    clarification_round: int = 0
    conversation_history: list[str] = field(default_factory=list)


class PipelineResult:
    """Result of a successful pipeline run."""

    def __init__(
        self,
        session_id: str,
        task_ref: str,
        task_url: str,
        summary: str,
        transcribed_text: str,
    ) -> None:
        self.session_id = session_id
        self.task_ref = task_ref
        self.task_url = task_url
        self.summary = summary
        self.transcribed_text = transcribed_text

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "task_ref": self.task_ref,
            "task_url": self.task_url,
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


class PreviewNeeded:
    """Returned when intent is successfully extracted and waiting for human approval."""

    def __init__(
        self,
        session_id: str,
        transcribed_text: str,
        summary: str,
        intent: TaskIntent | None = None,
    ) -> None:
        self.session_id = session_id
        self.transcribed_text = transcribed_text
        self.summary = summary
        self.intent = intent

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "status": "preview_needed",
            "session_id": self.session_id,
            "transcribed_text": self.transcribed_text,
            "summary": self.summary,
        }
        if self.intent:
            result["intent"] = {
                "summary": self.intent.summary,
                "description": self.intent.description,
                "acceptance_criteria": self.intent.acceptance_criteria,
                "issue_type": self.intent.issue_type,
                "priority": self.intent.priority,
                "labels": self.intent.labels,
                "ambiguity_score": self.intent.ambiguity_score,
            }
        return result


class PipelineOrchestrator:
    """Runs the voice -> task intake pipeline and broadcasts status at each stage.

    Designed for a single concurrent pipeline run (RTX 2060 VRAM constraint).
    The _lock prevents two simultaneous runs from fighting over GPU memory.
    """

    def __init__(
        self,
        settings: Settings,
        monitor: MonitorService,
        broadcast: BroadcastCallback | None = None,
        loop_queue: LoopQueue | None = None,
        demo_tasks: DemoTaskStore | None = None,
    ) -> None:
        self._settings = settings
        self._monitor = monitor
        self._broadcast = broadcast
        self._loop_queue = loop_queue
        self._demo_tasks = demo_tasks
        self._lock = asyncio.Lock()
        self._sessions: dict[str, PipelineSession] = {}

        self._transcriber: Transcriber | None = None
        self._extractor: IntentExtractor | None = None
        self._linear: AsyncLinearClient | None = None

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

    def _get_linear(self) -> AsyncLinearClient:
        if self._linear is None:
            self._linear = AsyncLinearClient(self._settings)
        return self._linear

    async def _transition(self, stage: PipelineStatus, message: str) -> None:
        """Move to a new pipeline stage and broadcast the update."""
        self._monitor.update_node(stage, "active", message)
        if self._broadcast:
            await self._broadcast(self._monitor.get_state())

    async def run_from_audio(
        self, audio_bytes: bytes, filename: str = "audio.wav"
    ) -> PipelineResult | ClarificationNeeded | PreviewNeeded:
        """Run the full pipeline from raw audio bytes."""
        async with self._lock:
            return await self._execute_pipeline(audio_bytes, filename)

    async def run_from_text(
        self, text: str
    ) -> PipelineResult | ClarificationNeeded | PreviewNeeded:
        """Run the pipeline skipping the transcription stage."""
        async with self._lock:
            return await self._execute_from_text(text)

    async def continue_with_clarification(
        self, session_id: str, answer_text: str
    ) -> PipelineResult | ClarificationNeeded | PreviewNeeded:
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

    _OVERRIDE_FIELDS = frozenset(
        {
            "summary",
            "description",
            "acceptance_criteria",
            "issue_type",
            "priority",
            "labels",
        }
    )

    async def continue_with_approval(
        self,
        session_id: str,
        overrides: dict[str, Any] | None = None,
    ) -> PipelineResult:
        """Continue a pipeline session after the user approves the preview.

        Args:
            session_id: The session ID from the PreviewNeeded response.
            overrides: Optional dict of intent field edits from the review UI.

        Returns:
            PipelineResult.

        Raises:
            ValueError: If session_id is not found.
        """
        session = self._sessions.get(session_id)
        if session is None:
            raise ValueError(f"Unknown session: {session_id}")

        async with self._lock:
            combined_text = " | ".join(session.conversation_history)
            intent = session.current_intent
            if not intent:
                raise ValueError("Session has no extracted intent to approve")

            if overrides:
                intent_dict = intent.model_dump()
                for key, value in overrides.items():
                    if key in self._OVERRIDE_FIELDS:
                        intent_dict[key] = value
                intent = TaskIntent.model_validate(intent_dict)

            self._sessions.pop(session_id, None)
            return await self._create_ticket(intent, combined_text, session_id)

    async def discard_session(self, session_id: str) -> dict[str, str]:
        """Discard a pipeline session without creating a ticket."""
        async with self._lock:
            if session_id in self._sessions:
                self._sessions.pop(session_id)
            await self._transition(PipelineStatus.DONE, "Pipeline discarded by user.")
            return {"status": "discarded", "session_id": session_id}

    async def _execute_pipeline(
        self, audio_bytes: bytes, filename: str
    ) -> PipelineResult | ClarificationNeeded | PreviewNeeded:
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

    async def _execute_from_text(
        self, text: str
    ) -> PipelineResult | ClarificationNeeded | PreviewNeeded:
        """Internal: pipeline from transcribed text onwards."""
        if not self._settings.demo_mode and not self._settings.linear_configured:
            raise RuntimeError(
                "Linear is not configured. Set LINEAR_API_KEY to save approved tasks."
            )

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

        # Clear enough — wait for intent confirmation
        session = PipelineSession(
            session_id=session_id,
            original_text=text,
            current_intent=intent,
            clarification_round=0,
            conversation_history=[text],
        )
        self._sessions[session.session_id] = session

        await self._transition(
            PipelineStatus.PREVIEWING,
            f"Waiting for human approval: {intent.summary}",
        )

        preview = PreviewNeeded(
            session_id=session.session_id,
            transcribed_text=text,
            summary=intent.summary,
            intent=intent,
        )

        if self._broadcast:
            await self._broadcast(
                {
                    "type": "preview_needed",
                    **preview.to_dict(),
                }
            )

        return preview

    async def _execute_clarification(
        self, session: PipelineSession, answer_text: str
    ) -> PipelineResult | ClarificationNeeded | PreviewNeeded:
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

        # Clear enough (or max rounds hit) — wait for intent confirmation
        if session.clarification_round >= max_rounds:
            logger.info(
                "Max clarification rounds reached, requesting preview with best effort intent"
            )

        combined_text = " | ".join(session.conversation_history)
        self._sessions[session.session_id] = session

        await self._transition(
            PipelineStatus.PREVIEWING,
            f"Waiting for human approval: {intent.summary}",
        )

        preview = PreviewNeeded(
            session_id=session.session_id,
            transcribed_text=combined_text,
            summary=intent.summary,
            intent=intent,
        )

        if self._broadcast:
            await self._broadcast(
                {
                    "type": "preview_needed",
                    **preview.to_dict(),
                }
            )

        return preview

    async def _create_ticket(
        self,
        intent: TaskIntent,
        text: str,
        session_id: str,
    ) -> PipelineResult:
        """Create the active task-backend record from a validated intent."""
        if self._settings.demo_mode:
            if self._demo_tasks is None:
                raise RuntimeError("Demo task store is not available.")

            await self._transition(
                PipelineStatus.CREATING,
                "Saving approved task to demo workspace…",
            )
            task = self._demo_tasks.create_task(
                title=intent.summary,
                description=intent.description,
                priority=intent.priority,
            )
            task_ref = str(task["id"])
            task_url = str(task.get("url") or "")
        else:
            await self._transition(
                PipelineStatus.CREATING,
                "Saving approved task to Linear…",
            )
            linear = self._get_linear()
            try:
                issue = await linear.create_issue(
                    title=intent.summary,
                    description=intent.description,
                    priority=self._priority_to_linear(intent.priority),
                )
            except LinearAPIError as exc:
                await self._transition(PipelineStatus.ERROR, str(exc))
                raise

            task_ref = issue.task_ref
            task_url = issue.url

        completion_message = f"Task saved: {task_ref}"
        if task_url:
            completion_message = f"{completion_message} — {task_url}"

        await self._transition(PipelineStatus.DONE, completion_message)
        self._monitor.set_task_info(title=intent.summary, status="completed")

        if self._settings.auto_dispatch_loop and self._loop_queue is not None:
            queued = self._loop_queue.add_task(task_ref, intent.summary)
            if queued and self._broadcast:
                await self._broadcast(
                    {
                        "type": "task_queued",
                        "task_ref": task_ref,
                        "summary": intent.summary,
                    }
                )

        return PipelineResult(
            session_id=session_id,
            task_ref=task_ref,
            task_url=task_url,
            summary=intent.summary,
            transcribed_text=text,
        )

    @staticmethod
    def _priority_to_linear(priority: str) -> int | None:
        normalized = priority.strip().lower()
        if normalized in {"highest", "urgent"}:
            return 1
        if normalized == "high":
            return 2
        if normalized == "medium":
            return 3
        if normalized in {"low", "lowest"}:
            return 4
        return None

    async def close(self) -> None:
        """Release all held resources on app shutdown."""
        if self._transcriber:
            await self._transcriber.close()
        if self._extractor:
            await self._extractor.close()
        if self._linear:
            await self._linear.close()
        self._sessions.clear()
