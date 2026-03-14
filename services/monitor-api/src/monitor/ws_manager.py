"""Socket.IO broadcast manager for the /monitor namespace."""

from __future__ import annotations

import logging
from dataclasses import asdict
from typing import Any

import socketio

logger = logging.getLogger(__name__)


def _serialize(obj: Any) -> Any:
    """Convert dataclasses and other objects to JSON-safe dicts."""
    if hasattr(obj, "__dataclass_fields__"):
        return asdict(obj)
    return obj


class BroadcastManager:
    """Wraps python-socketio AsyncServer for the /monitor namespace."""

    def __init__(self, sio: socketio.AsyncServer) -> None:
        self._sio = sio
        self._connected: set[str] = set()

        @sio.on("connect", namespace="/monitor")
        async def on_connect(sid: str, environ: dict[str, Any]) -> None:
            self._connected.add(sid)
            logger.info("Monitor client connected: %s", sid)

        @sio.on("disconnect", namespace="/monitor")
        async def on_disconnect(sid: str) -> None:
            self._connected.discard(sid)
            logger.info("Monitor client disconnected: %s", sid)

    async def emit(self, event: str, data: Any) -> None:
        """Broadcast an event to all connected /monitor clients."""
        payload = _serialize(data)
        await self._sio.emit(event, payload, namespace="/monitor")

    @property
    def client_count(self) -> int:
        return len(self._connected)
