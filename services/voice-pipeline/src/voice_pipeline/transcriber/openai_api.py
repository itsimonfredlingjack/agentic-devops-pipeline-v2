"""OpenAI Whisper API transcription backend (fallback).

Used when local GPU is unavailable or when higher accuracy is needed.
Requires OPENAI_API_KEY environment variable.
"""

import logging
from pathlib import Path

import httpx

from .base import Transcriber, TranscriptionError, TranscriptionResult

logger = logging.getLogger(__name__)

OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions"


class OpenAIWhisperTranscriber(Transcriber):
    """Transcription via the OpenAI Whisper API.

    No local GPU memory is used; audio is sent to OpenAI's servers.
    Falls back gracefully to this when local Whisper is not available.
    """

    def __init__(self, api_key: str, model: str = "whisper-1") -> None:
        """Initialise OpenAI Whisper transcriber.

        Args:
            api_key: OpenAI API key (sk-...).
            model: Whisper model name on OpenAI (default "whisper-1").
        """
        self.api_key = api_key
        self.model = model
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Return (or create) a shared async HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=httpx.Timeout(120.0),
            )
        return self._client

    async def transcribe(self, audio_path: str) -> TranscriptionResult:
        """Send audio to OpenAI Whisper API and return transcription.

        Args:
            audio_path: Path to audio file (WAV/MP3/OGG/FLAC etc.).

        Returns:
            TranscriptionResult with text and language.

        Raises:
            TranscriptionError: On HTTP or API errors.
        """
        path = Path(audio_path)
        if not path.exists():
            raise TranscriptionError(f"Audio file not found: {audio_path}")

        client = await self._get_client()

        try:
            with open(path, "rb") as f:
                response = await client.post(
                    OPENAI_TRANSCRIPTIONS_URL,
                    data={"model": self.model, "response_format": "verbose_json"},
                    files={"file": (path.name, f, "audio/wav")},
                )
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPStatusError as exc:
            raise TranscriptionError(
                f"OpenAI API error {exc.response.status_code}: {exc.response.text}"
            ) from exc
        except httpx.RequestError as exc:
            raise TranscriptionError(f"OpenAI request failed: {exc}") from exc

        return TranscriptionResult(
            text=data.get("text", "").strip(),
            language=data.get("language", "unknown"),
            duration=float(data.get("duration", 0.0)),
        )

    async def close(self) -> None:
        """Close the shared HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
