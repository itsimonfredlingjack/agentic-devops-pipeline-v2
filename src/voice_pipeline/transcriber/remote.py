"""Remote transcription backend — proxies audio to a Whisper GPU server."""

from __future__ import annotations

import logging
from pathlib import Path

import httpx

from .base import Transcriber, TranscriptionError, TranscriptionResult

logger = logging.getLogger(__name__)


class RemoteTranscriber(Transcriber):
    """Sends audio to a remote SEJFA voice-pipeline /api/transcribe endpoint.

    Designed for the Mac → ai-server2 (GPU) topology over Tailscale.
    """

    def __init__(self, remote_url: str, timeout: int = 120) -> None:
        self._remote_url = remote_url.rstrip("/")
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self._timeout)
        return self._client

    async def transcribe(self, audio_path: str) -> TranscriptionResult:
        """POST audio file to the remote Whisper endpoint.

        Args:
            audio_path: Absolute path to the audio file.

        Returns:
            TranscriptionResult parsed from the JSON response.

        Raises:
            TranscriptionError: On file-not-found, network, or parse errors.
        """
        path = Path(audio_path)
        if not path.exists():
            raise TranscriptionError(f"Audio file not found: {audio_path}")

        url = f"{self._remote_url}/api/transcribe"
        client = self._get_client()

        try:
            with path.open("rb") as f:
                files = {"audio": (path.name, f, "audio/wav")}
                response = await client.post(url, files=files)

            response.raise_for_status()
            data = response.json()
        except httpx.TimeoutException as exc:
            raise TranscriptionError(
                f"Remote transcription timed out after {self._timeout}s: {exc}"
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise TranscriptionError(
                f"Remote transcription failed (HTTP {exc.response.status_code}): {exc}"
            ) from exc
        except httpx.HTTPError as exc:
            raise TranscriptionError(f"Remote transcription request failed: {exc}") from exc

        text = data.get("text", "")
        if not text:
            raise TranscriptionError("Remote transcription returned empty text")

        result = TranscriptionResult(
            text=text,
            language=data.get("language", "unknown"),
            duration=float(data.get("duration", 0.0)),
            confidence=data.get("confidence"),
        )

        logger.info(
            "Remote transcription complete: lang=%s, duration=%.1fs, chars=%d",
            result.language,
            result.duration,
            len(result.text),
        )
        return result

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
