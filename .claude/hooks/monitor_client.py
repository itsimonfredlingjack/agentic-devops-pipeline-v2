"""Fire-and-forget HTTP client for Monitor API."""

from __future__ import annotations

import json
import urllib.request
from typing import Any

MONITOR_URL = "http://localhost:8100/events"
TIMEOUT_S = 1


def post_event(event: dict[str, Any]) -> None:
    """POST event to Monitor API. Silently fails if API is down."""
    try:
        data = json.dumps(event).encode("utf-8")
        req = urllib.request.Request(
            MONITOR_URL,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=TIMEOUT_S)
    except Exception:
        # Fire-and-forget: never block the agent
        pass
