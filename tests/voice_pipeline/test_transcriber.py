"""Tests for transcription module.

Uses mocks to avoid requiring actual GPU/Whisper installation in CI.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.voice_pipeline.transcriber.base import Transcriber, TranscriptionError, TranscriptionResult
from src.voice_pipeline.transcriber.openai_api import OpenAIWhisperTranscriber
from src.voice_pipeline.transcriber.whisper_local import WhisperLocalTranscriber


class TestTranscriptionResult:
    def test_to_dict(self):
        result = TranscriptionResult(
            text="Hej världen",
            language="sv",
            duration=2.5,
            confidence=0.95,
        )
        d = result.to_dict()
        assert d["text"] == "Hej världen"
        assert d["language"] == "sv"
        assert d["duration"] == 2.5
        assert d["confidence"] == 0.95

    def test_to_dict_no_confidence(self):
        result = TranscriptionResult(text="hello", language="en", duration=1.0)
        assert result.to_dict()["confidence"] is None

    def test_swedish_characters(self):
        text = "Bygg login-sida med Google OAuth och hantera å, ä, ö"
        result = TranscriptionResult(text=text, language="sv", duration=3.0)
        assert "å" in result.text
        assert "ä" in result.text
        assert "ö" in result.text


class TestTranscriberABC:
    def test_transcriber_is_abstract(self):
        """Transcriber cannot be instantiated directly."""
        with pytest.raises(TypeError):
            Transcriber()  # type: ignore[abstract]


@pytest.mark.asyncio
class TestWhisperLocalTranscriber:
    async def test_transcribe_missing_file(self):
        transcriber = WhisperLocalTranscriber()
        with pytest.raises(TranscriptionError, match="not found"):
            await transcriber.transcribe("/nonexistent/path/audio.wav")

    async def test_transcribe_unloads_model_on_success(self, tmp_path):
        """Model must be unloaded after successful transcription."""
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"fake wav content")

        mock_model = MagicMock()
        mock_model.transcribe.return_value = (
            [MagicMock(text="Hej världen")],
            MagicMock(language="sv", duration=2.0),
        )

        transcriber = WhisperLocalTranscriber(model_size="tiny", device="cpu")
        transcriber._model = mock_model

        with patch.object(
            transcriber,
            "_transcribe_sync",
            return_value=TranscriptionResult(text="Hej världen", language="sv", duration=2.0),
        ):
            result = await transcriber.transcribe(str(audio_file))

        # Model must be unloaded after transcription
        assert transcriber._model is None
        assert result.text == "Hej världen"

    async def test_transcribe_unloads_model_on_error(self, tmp_path):
        """Model must be unloaded even when transcription fails."""
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"bad content")

        transcriber = WhisperLocalTranscriber(model_size="tiny", device="cpu")
        transcriber._model = MagicMock()

        with patch.object(transcriber, "_transcribe_sync", side_effect=TranscriptionError("boom")):
            with pytest.raises(TranscriptionError):
                await transcriber.transcribe(str(audio_file))

        assert transcriber._model is None

    async def test_close_unloads_model(self):
        transcriber = WhisperLocalTranscriber()
        transcriber._model = MagicMock()
        # _unload_model handles ImportError for torch gracefully
        await transcriber.close()
        assert transcriber._model is None


@pytest.mark.asyncio
class TestOpenAIWhisperTranscriber:
    async def test_transcribe_missing_file(self):
        transcriber = OpenAIWhisperTranscriber(api_key="sk-test")
        with pytest.raises(TranscriptionError, match="not found"):
            await transcriber.transcribe("/nonexistent/audio.wav")

    async def test_transcribe_success(self, tmp_path):
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"wav content")

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "text": "Hello world",
            "language": "en",
            "duration": 1.5,
        }
        mock_response.raise_for_status = MagicMock()

        transcriber = OpenAIWhisperTranscriber(api_key="sk-test")

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_response):
            result = await transcriber.transcribe(str(audio_file))

        assert result.text == "Hello world"
        assert result.language == "en"
        assert result.duration == 1.5

    async def test_close_client(self):
        transcriber = OpenAIWhisperTranscriber(api_key="sk-test")
        mock_client = AsyncMock()
        mock_client.is_closed = False
        transcriber._client = mock_client
        await transcriber.close()
        mock_client.aclose.assert_called_once()
