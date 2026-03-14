"""Intent extraction via Ollama (local LLM).

Sends sanitized transcription text to Ollama and parses the structured
JSON response into a JiraTicketIntent Pydantic model.

VRAM note: Whisper must be unloaded before this module runs.
The Ollama server manages its own VRAM; we simply call it via HTTP.
"""

import json
import logging
import re

import httpx
from pydantic import ValidationError

from ..security.sanitizer import detect_prompt_injection_patterns, sanitize_for_llm
from .models import JiraTicketIntent
from .prompts import SYSTEM_PROMPT, build_clarification_prompt, build_extraction_prompt

logger = logging.getLogger(__name__)


class IntentExtractionError(Exception):
    """Raised when intent extraction fails."""


class IntentExtractor:
    """Extracts structured Jira ticket intent from voice transcriptions.

    Calls the local Ollama API and parses the JSON response into a
    JiraTicketIntent model. Detects and rejects prompt injection attempts.
    """

    def __init__(
        self,
        ollama_url: str = "http://localhost:11434",
        model: str = "mistral:7b-instruct-q4_0",
        timeout: int = 120,
    ) -> None:
        self.ollama_url = ollama_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Return (or lazily create) the shared async HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(self.timeout))
        return self._client

    async def extract(self, transcribed_text: str) -> JiraTicketIntent:
        """Extract Jira ticket intent from transcribed voice text.

        Applies prompt injection detection before sending to Ollama.

        Args:
            transcribed_text: Raw text from Whisper transcription.

        Returns:
            Validated JiraTicketIntent Pydantic model.

        Raises:
            IntentExtractionError: On injection detection, LLM failure, or parse error.
        """
        self._check_injection(transcribed_text)

        safe_text = sanitize_for_llm(transcribed_text)
        user_message = build_extraction_prompt(safe_text)

        raw_json = await self._call_ollama(user_message)
        return self._parse_response(raw_json)

    async def extract_with_clarification(
        self,
        original_text: str,
        questions: list[str],
        answer_text: str,
    ) -> JiraTicketIntent:
        """Re-extract intent after a clarification round.

        Combines the original request with the user's answer to the
        clarification questions and sends to Ollama for a refined extraction.

        Args:
            original_text: The original transcribed text.
            questions: The clarification questions that were asked.
            answer_text: The user's clarification answer.

        Returns:
            Updated JiraTicketIntent (hopefully with lower ambiguity).

        Raises:
            IntentExtractionError: On injection, LLM failure, or parse error.
        """
        self._check_injection(answer_text)

        safe_original = sanitize_for_llm(original_text)
        safe_answer = sanitize_for_llm(answer_text)
        user_message = build_clarification_prompt(safe_original, questions, safe_answer)

        raw_json = await self._call_ollama(user_message)
        return self._parse_response(raw_json)

    def _check_injection(self, text: str) -> None:
        """Check text for prompt injection patterns.

        Raises:
            IntentExtractionError: If suspicious patterns are found.
        """
        injection_hits = detect_prompt_injection_patterns(text)
        if injection_hits:
            logger.warning("Prompt injection patterns detected: %s", injection_hits)
            raise IntentExtractionError(
                f"Input rejected: potential prompt injection detected ({injection_hits})"
            )

    async def _call_ollama(self, user_message: str) -> str:
        """POST to Ollama /api/generate and return the response text."""
        client = await self._get_client()
        payload = {
            "model": self.model,
            "system": SYSTEM_PROMPT,
            "prompt": user_message,
            "stream": False,
            "format": "json",
        }

        logger.info("Calling Ollama model '%s' for intent extraction", self.model)
        try:
            response = await client.post(
                f"{self.ollama_url}/api/generate",
                json=payload,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise IntentExtractionError(
                f"Ollama API error {exc.response.status_code}: {exc.response.text}"
            ) from exc
        except httpx.RequestError as exc:
            raise IntentExtractionError(f"Ollama connection failed: {exc}") from exc

        data = response.json()
        return data.get("response", "")

    def _parse_response(self, raw: str) -> JiraTicketIntent:
        """Parse the LLM JSON response into a JiraTicketIntent."""
        cleaned = re.sub(r"```(?:json)?\s*|\s*```", "", raw).strip()

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse LLM response as JSON: %s", raw[:500])
            raise IntentExtractionError(f"LLM returned invalid JSON: {exc}") from exc

        try:
            intent = JiraTicketIntent.model_validate(data)
        except ValidationError as exc:
            logger.error("Intent validation failed: %s", exc)
            raise IntentExtractionError(f"Intent validation failed: {exc}") from exc

        logger.info(
            "Extracted intent: summary='%s', ambiguity=%.2f, questions=%d",
            intent.summary[:80],
            intent.ambiguity_score,
            len(intent.clarification_questions),
        )
        return intent

    async def close(self) -> None:
        """Close the shared HTTP client on shutdown."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
