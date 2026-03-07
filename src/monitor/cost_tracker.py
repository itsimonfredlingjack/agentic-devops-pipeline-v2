"""Track running cost per session from token counts."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from .config import config


@dataclass
class CostBreakdown:
    input_usd: float = 0.0
    output_usd: float = 0.0
    cache_usd: float = 0.0


@dataclass
class CostUpdate:
    session_id: str
    total_usd: float
    breakdown: CostBreakdown


class CostTracker:
    """Accumulates token counts per session and calculates USD cost."""

    def __init__(self) -> None:
        self._sessions: dict[str, CostBreakdown] = defaultdict(CostBreakdown)
        self._rates = config.cost_rates

    def add_event(self, event: dict[str, Any]) -> CostUpdate:
        """Process an event and return updated cost for its session."""
        session_id = event.get("session_id", "unknown")
        tokens = event.get("tokens") or {}

        input_tokens = tokens.get("input", 0)
        output_tokens = tokens.get("output", 0)
        cache_read_tokens = tokens.get("cache_read", 0)

        breakdown = self._sessions[session_id]
        breakdown.input_usd += input_tokens * self._rates.input_per_m / 1_000_000
        breakdown.output_usd += output_tokens * self._rates.output_per_m / 1_000_000
        breakdown.cache_usd += cache_read_tokens * self._rates.cache_read_per_m / 1_000_000

        total = breakdown.input_usd + breakdown.output_usd + breakdown.cache_usd
        return CostUpdate(
            session_id=session_id,
            total_usd=round(total, 6),
            breakdown=CostBreakdown(
                input_usd=round(breakdown.input_usd, 6),
                output_usd=round(breakdown.output_usd, 6),
                cache_usd=round(breakdown.cache_usd, 6),
            ),
        )

    def get_session_cost(self, session_id: str) -> CostUpdate:
        """Get current cost for a session."""
        breakdown = self._sessions.get(session_id, CostBreakdown())
        total = breakdown.input_usd + breakdown.output_usd + breakdown.cache_usd
        return CostUpdate(
            session_id=session_id,
            total_usd=round(total, 6),
            breakdown=CostBreakdown(
                input_usd=round(breakdown.input_usd, 6),
                output_usd=round(breakdown.output_usd, 6),
                cache_usd=round(breakdown.cache_usd, 6),
            ),
        )

    def reset(self, session_id: str | None = None) -> None:
        """Reset cost tracking for a session, or all sessions."""
        if session_id:
            self._sessions.pop(session_id, None)
        else:
            self._sessions.clear()
