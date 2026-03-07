"""Tests for RemoteTranscriber — proxies audio to a remote Whisper GPU server."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from src.voice_pipeline.transcriber.base import TranscriptionError
from src.voice_pipeline.transcriber.remote import RemoteTranscriber


@pytest.mark.asyncio
class TestRemoteTranscriber:
    async def test_transcribe_missing_file(self):
        transcriber = RemoteTranscriber(remote_url="http://fake:8000")
        with pytest.raises(TranscriptionError, match="not found"):
            await transcriber.transcribe("/nonexistent/audio.wav")

    async def test_transcribe_success(self, tmp_path):
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"fake wav content")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "text": "Create a login page",
            "language": "en",
            "duration": 3.2,
            "confidence": 0.92,
        }

        transcriber = RemoteTranscriber(remote_url="http://fake:8000")
        with patch.object(transcriber, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_get_client.return_value = mock_client

            result = await transcriber.transcribe(str(audio_file))

        assert result.text == "Create a login page"
        assert result.language == "en"
        assert result.duration == 3.2
        assert result.confidence == 0.92

        # Verify correct URL was called
        mock_client.post.assert_called_once()
        call_args = mock_client.post.call_args
        assert call_args[0][0] == "http://fake:8000/api/transcribe"

    async def test_transcribe_no_confidence(self, tmp_path):
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"fake wav")

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "text": "Hello",
            "language": "en",
            "duration": 1.0,
        }

        transcriber = RemoteTranscriber(remote_url="http://fake:8000")
        with patch.object(transcriber, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_get_client.return_value = mock_client

            result = await transcriber.transcribe(str(audio_file))

        assert result.confidence is None

    async def test_transcribe_empty_text(self, tmp_path):
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"fake wav")

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "text": "",
            "language": "en",
            "duration": 0.0,
        }

        transcriber = RemoteTranscriber(remote_url="http://fake:8000")
        with patch.object(transcriber, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_get_client.return_value = mock_client

            with pytest.raises(TranscriptionError, match="empty text"):
                await transcriber.transcribe(str(audio_file))

    async def test_transcribe_timeout(self, tmp_path):
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"fake wav")

        transcriber = RemoteTranscriber(remote_url="http://fake:8000", timeout=5)
        with patch.object(transcriber, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.post.side_effect = httpx.TimeoutException("timed out")
            mock_get_client.return_value = mock_client

            with pytest.raises(TranscriptionError, match="timed out"):
                await transcriber.transcribe(str(audio_file))

    async def test_transcribe_http_error(self, tmp_path):
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"fake wav")

        mock_request = httpx.Request("POST", "http://fake:8000/api/transcribe")
        mock_resp = httpx.Response(500, request=mock_request)
        error = httpx.HTTPStatusError("Server Error", request=mock_request, response=mock_resp)

        response = MagicMock()
        response.raise_for_status.side_effect = error
        response.status_code = 500

        transcriber = RemoteTranscriber(remote_url="http://fake:8000")
        with patch.object(transcriber, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.post.return_value = response
            mock_get_client.return_value = mock_client

            with pytest.raises(TranscriptionError, match="HTTP 500"):
                await transcriber.transcribe(str(audio_file))

    async def test_transcribe_connection_error(self, tmp_path):
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"fake wav")

        transcriber = RemoteTranscriber(remote_url="http://fake:8000")
        with patch.object(transcriber, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.post.side_effect = httpx.ConnectError("Connection refused")
            mock_get_client.return_value = mock_client

            with pytest.raises(TranscriptionError, match="request failed"):
                await transcriber.transcribe(str(audio_file))

    async def test_close_client(self):
        transcriber = RemoteTranscriber(remote_url="http://fake:8000")
        mock_client = AsyncMock()
        mock_client.is_closed = False
        transcriber._client = mock_client
        await transcriber.close()
        mock_client.aclose.assert_called_once()
        assert transcriber._client is None

    async def test_close_no_client(self):
        transcriber = RemoteTranscriber(remote_url="http://fake:8000")
        await transcriber.close()  # should not raise

    async def test_url_trailing_slash_stripped(self):
        transcriber = RemoteTranscriber(remote_url="http://fake:8000/")
        assert transcriber._remote_url == "http://fake:8000"
