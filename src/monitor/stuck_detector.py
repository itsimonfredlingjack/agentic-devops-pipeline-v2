"""Detect when the agent is stuck repeating the same tool call."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from .config import config


@dataclass
class StuckAlert:
    pattern: str
    repeat_count: int
    tokens_burned: int
    since: str


class StuckDetector:
    """Maintains a sliding window of (tool_name, tool_args_hash) per session.

    When the same tuple appears >= threshold times within the window, emits a StuckAlert.
    Resets the alert flag when a new unique tuple arrives after an alert.
    """

    def __init__(
        self,
        window_size: int = config.stuck.window_size,
        threshold: int = config.stuck.threshold,
    ) -> None:
        self._window_size = window_size
        self._threshold = threshold
        # session_id -> list of (tool_name, tool_args_hash)
        self._windows: dict[str, list[tuple[str, str]]] = defaultdict(list)
        # session_id -> whether we already alerted for current pattern
        self._alerted: dict[str, bool] = defaultdict(lambda: False)

    def check(self, event: dict[str, Any]) -> StuckAlert | None:
        """Check an event for stuck patterns. Returns StuckAlert or None."""
        session_id = event.get("session_id", "unknown")
        tool_name = event.get("tool_name", "")
        tool_args_hash = event.get("tool_args_hash", "")
        timestamp = event.get("timestamp", "")

        key = (tool_name, tool_args_hash)
        window = self._windows[session_id]

        # Slide window
        window.append(key)
        if len(window) > self._window_size:
            window.pop(0)

        # Count occurrences of the latest key in window
        count = window.count(key)

        if count >= self._threshold:
            if not self._alerted[session_id]:
                self._alerted[session_id] = True
                # Estimate tokens burned: rough heuristic from event data
                tokens = event.get("tokens") or {}
                per_call = tokens.get("input", 0) + tokens.get("output", 0)
                return StuckAlert(
                    pattern=f"{tool_name}({event.get('tool_args_summary', '')[:80]})",
                    repeat_count=count,
                    tokens_burned=per_call * count,
                    since=timestamp,
                )
        else:
            # New unique call — reset alert flag
            self._alerted[session_id] = False

        return None

    def reset(self, session_id: str | None = None) -> None:
        """Reset detector state for a session, or all sessions."""
        if session_id:
            self._windows.pop(session_id, None)
            self._alerted.pop(session_id, None)
        else:
            self._windows.clear()
            self._alerted.clear()
