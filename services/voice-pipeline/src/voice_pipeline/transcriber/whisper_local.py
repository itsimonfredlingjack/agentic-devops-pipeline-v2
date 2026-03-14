"""Local faster-whisper transcription backend.

VRAM management is critical on RTX 2060 (6GB):
  - Whisper small ≈ 1-2GB
  - Ollama 7B ≈ 4-5GB
  - They CANNOT run simultaneously

Strategy: load model → transcribe → UNLOAD (del + empty_cache) before Ollama.
"""

import asyncio
import logging
from pathlib import Path

from .base import Transcriber, TranscriptionError, TranscriptionResult

logger = logging.getLogger(__name__)


def _is_cuda_runtime_error(exc: Exception) -> bool:
    """Best-effort detector for missing CUDA runtime/library errors."""
    text = str(exc).lower()
    cuda_markers = (
        "libcublas",
        "libcudnn",
        "libcuda",
        "cuda driver",
        "cuda runtime",
        "cublas",
        "cudnn",
    )
    return any(marker in text for marker in cuda_markers)


class WhisperLocalTranscriber(Transcriber):
    """Transcription via faster-whisper running on local GPU.

    The model is loaded on first use and explicitly unloaded after each
    transcription call to free VRAM for the downstream Ollama inference.
    """

    def __init__(self, model_size: str = "small", device: str = "auto") -> None:
        """Initialise transcriber.

        Args:
            model_size: Whisper model variant (tiny/base/small/medium/large-v2/large-v3).
            device: Compute device — "cuda", "cpu", or "auto" (prefers CUDA when available).
        """
        self.model_size = model_size
        self.device = device
        self._model = None  # Lazy-loaded; None means VRAM is free

    async def transcribe(self, audio_path: str) -> TranscriptionResult:
        """Transcribe audio and immediately unload the model from VRAM.

        The model is loaded, used for a single file, then explicitly freed so
        Ollama can claim VRAM for the next pipeline stage.

        Args:
            audio_path: Path to an audio file (WAV/MP3/OGG/FLAC etc.).

        Returns:
            TranscriptionResult with Swedish-safe UTF-8 text.

        Raises:
            TranscriptionError: On model load failure or audio processing error.
        """
        path = Path(audio_path)
        if not path.exists():
            raise TranscriptionError(f"Audio file not found: {audio_path}")

        loop = asyncio.get_running_loop()
        try:
            result = await loop.run_in_executor(None, self._transcribe_sync, str(path))
        finally:
            # Always unload — even on failure — so VRAM is released
            self._unload_model()

        return result

    def _transcribe_sync(self, audio_path: str) -> TranscriptionResult:
        """Blocking transcription — runs in a thread-pool executor."""
        model = self._load_model()

        try:
            segments, info = model.transcribe(
                audio_path,
                beam_size=5,
                vad_filter=True,  # Skip silent regions
                vad_parameters={"min_silence_duration_ms": 500},
                language=None,  # Auto-detect (handles Swedish)
            )
        except Exception as exc:
            if self.device in ("auto", "cuda") and _is_cuda_runtime_error(exc):
                logger.warning(
                    "CUDA runtime failed during transcription on '%s' (%s). Retrying on CPU fallback.",
                    self.device,
                    exc,
                )
                self._unload_model()
                try:
                    from faster_whisper import WhisperModel  # noqa: PLC0415

                    self._model = WhisperModel(
                        self.model_size,
                        device="cpu",
                        compute_type="int8",
                    )
                    model = self._model
                    segments, info = model.transcribe(
                        audio_path,
                        beam_size=5,
                        vad_filter=True,
                        vad_parameters={"min_silence_duration_ms": 500},
                        language=None,
                    )
                except Exception as cpu_exc:
                    raise TranscriptionError(
                        f"Transcription failed on '{self.device}' (CUDA runtime unavailable) "
                        f"and CPU fallback failed: {cpu_exc}"
                    ) from cpu_exc
            else:
                raise TranscriptionError(f"Transcription failed: {exc}") from exc

        # Materialise the lazy iterator before releasing the model
        text_parts = [segment.text for segment in segments]
        text = " ".join(text_parts).strip()

        return TranscriptionResult(
            text=text,
            language=info.language or "unknown",
            duration=info.duration,
        )

    def _load_model(self):
        """Load faster-whisper model into GPU memory if not already loaded."""
        if self._model is None:
            requested_device = self.device
            requested_compute_type = "float16" if requested_device in ("cuda", "auto") else "int8"
            try:
                from faster_whisper import WhisperModel  # noqa: PLC0415

                logger.info(
                    "Loading Whisper model '%s' on device '%s'",
                    self.model_size,
                    requested_device,
                )
                self._model = WhisperModel(
                    self.model_size,
                    device=requested_device,
                    compute_type=requested_compute_type,
                )
                logger.info("Whisper model loaded")
            except Exception as exc:
                if requested_device in ("auto", "cuda") and _is_cuda_runtime_error(exc):
                    logger.warning(
                        "CUDA runtime unavailable for Whisper '%s' device (%s). Falling back to CPU.",
                        requested_device,
                        exc,
                    )
                    try:
                        from faster_whisper import WhisperModel  # noqa: PLC0415

                        self._model = WhisperModel(
                            self.model_size,
                            device="cpu",
                            compute_type="int8",
                        )
                        logger.info("Whisper model loaded on CPU fallback")
                        return self._model
                    except Exception as cpu_exc:
                        raise TranscriptionError(
                            f"Failed to load Whisper model on '{requested_device}' (CUDA unavailable) "
                            f"and CPU fallback failed: {cpu_exc}"
                        ) from cpu_exc

                raise TranscriptionError(f"Failed to load Whisper model: {exc}") from exc

        return self._model

    def _unload_model(self) -> None:
        """Release the Whisper model from VRAM.

        Calls torch.cuda.empty_cache() to actually free the allocated pages
        so Ollama can claim them immediately.
        """
        if self._model is not None:
            logger.info("Unloading Whisper model to free VRAM")
            del self._model
            self._model = None
            try:
                import torch  # noqa: PLC0415

                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    logger.info("CUDA cache cleared")
            except ImportError:
                pass  # torch not installed — CPU mode, nothing to clear

    async def close(self) -> None:
        """Explicit cleanup — call on app shutdown."""
        self._unload_model()
