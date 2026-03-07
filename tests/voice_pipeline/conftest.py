"""Pytest configuration and shared fixtures.

Sets up FastAPI app-level singletons that are normally created by the
lifespan handler. This allows tests to use ASGITransport without needing
to trigger the full ASGI lifespan protocol.
"""

import pytest

from src.voice_pipeline import main as app_module
from src.voice_pipeline.config import get_settings
from src.voice_pipeline.loop_queue import LoopQueue
from src.voice_pipeline.main import WebSocketManager
from src.voice_pipeline.pipeline.orchestrator import PipelineOrchestrator
from src.voice_pipeline.pipeline.status import MonitorService


@pytest.fixture(autouse=True)
def setup_app_singletons():
    """Inject app-level singletons before each test.

    Replaces the lifespan-managed globals with fresh instances so that
    tests using ASGITransport (which does not run ASGI lifespan events)
    can call any endpoint without hitting "App not started" assertions.
    """
    settings = get_settings()
    ws = WebSocketManager()
    monitor = MonitorService()
    loop_queue = LoopQueue()

    async def _noop_broadcast(state):  # noqa: ANN001
        pass

    orchestrator = PipelineOrchestrator(
        settings=settings,
        monitor=monitor,
        broadcast=_noop_broadcast,
        loop_queue=loop_queue,
    )

    app_module._ws_manager = ws
    app_module._monitor = monitor
    app_module._orchestrator = orchestrator
    app_module._loop_queue = loop_queue

    yield

    # Reset after each test so state doesn't leak
    app_module._ws_manager = None
    app_module._monitor = None
    app_module._orchestrator = None
    app_module._loop_queue = None
    app_module._transcriber = None
    app_module._extractor = None
