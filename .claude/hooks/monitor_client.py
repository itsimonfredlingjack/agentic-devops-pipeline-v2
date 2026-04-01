"""Fire-and-forget HTTP client for Monitor API."""

from __future__ import annotations

import json
import os
import urllib.request
from typing import Any

TIMEOUT_S = 1


def _monitor_events_url() -> str:
    raw = (
        os.getenv("SEJFA_MONITOR_API_URL")
        or os.getenv("SEJFA_MONITOR_URL")
        or os.getenv("MONITOR_URL")
        or "http://127.0.0.1:8100"
    ).rstrip("/")
    if raw.endswith("/events"):
        return raw
    return f"{raw}/events"


def post_event(event: dict[str, Any]) -> None:
    """POST event to Monitor API. Silently fails if API is down."""
    try:
        data = json.dumps(event).encode("utf-8")
        req = urllib.request.Request(
            _monitor_events_url(),
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=TIMEOUT_S)
    except Exception:
        # Fire-and-forget: never block the agent
        pass
