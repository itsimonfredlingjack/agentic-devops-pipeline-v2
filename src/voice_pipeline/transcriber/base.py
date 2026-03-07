"""Abstract base class for audio transcription backends."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class TranscriptionResult:
    """Result from a transcription operation.

    Attributes:
        text: Transcribed text content (UTF-8).
        language: Detected language code (e.g. "sv", "en").
        duration: Audio duration in seconds.
        confidence: Optional confidence score 0.0-1.0.
    """

    text: str
    language: str
    duration: float
    confidence: float | None = None

    def to_dict(self) -> dict:
        """Serialize to dict for JSON response."""
        return {
            "text": self.text,
            "language": self.language,
            "duration": self.duration,
            "confidence": self.confidence,
        }


class Transcriber(ABC):
    """Abstract transcription backend.

    Subclasses implement specific transcription backends
    (local Whisper model, OpenAI Whisper API, etc.).
    """

    @abstractmethod
    async def transcribe(self, audio_path: str) -> TranscriptionResult:
        """Transcribe audio file to text.

        Args:
            audio_path: Absolute path to the audio file.

        Returns:
            TranscriptionResult with text, language, and duration.

        Raises:
            TranscriptionError: If transcription fails.
        """
        ...

    async def close(self) -> None:  # noqa: B027
        """Release any held resources (GPU memory, connections).

        Override in subclasses that hold persistent resources.
        """


class TranscriptionError(Exception):
    """Raised when transcription fails."""
