"""Heartbeat reporter — sends periodic signals to monitor API during execution."""

from __future__ import annotations

import logging
import threading
import urllib.request

logger = logging.getLogger(__name__)


class HeartbeatReporter:
    """Sends periodic heartbeat events to the monitor API."""

    def __init__(self, monitor_url: str, session_id: str, interval: int = 30) -> None:
        self._url = f"{monitor_url}/events"
        self._session_id = session_id
        self._interval = interval
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        """Start the heartbeat thread."""
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """Stop the heartbeat thread."""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        while not self._stop_event.wait(self._interval):
            self._send()

    def _send(self) -> None:
        import json

        payload = json.dumps(
            {
                "session_id": self._session_id,
                "event_type": "heartbeat",
                "tool_name": "loop-runner",
                "success": True,
            }
        ).encode()
        req = urllib.request.Request(
            self._url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5):
                pass
        except Exception:
            logger.debug("heartbeat send failed (non-fatal)")
