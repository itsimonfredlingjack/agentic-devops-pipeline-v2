"""Monitor API configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _split_csv_env(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [value.strip() for value in raw.split(",") if value.strip()]


@dataclass(frozen=True)
class CostRates:
    """Claude Opus 4.6 pricing per 1M tokens."""

    input_per_m: float = 15.0
    output_per_m: float = 75.0
    cache_read_per_m: float = 1.5
    cache_create_per_m: float = 18.75


@dataclass(frozen=True)
class StuckConfig:
    """Stuck detection parameters."""

    window_size: int = 10
    threshold: int = 3


@dataclass(frozen=True)
class MonitorConfig:
    port: int = field(default_factory=lambda: int(os.getenv("SEJFA_MONITOR_PORT", "8100")))
    db_path: Path = field(
        default_factory=lambda: Path(os.getenv("SEJFA_MONITOR_DB_PATH", "data/monitor.db"))
    )
    cors_origins: list[str] = field(
        default_factory=lambda: _split_csv_env(
            "SEJFA_CORS_ORIGINS",
            [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:5174",
                "http://127.0.0.1:5174",
                "null",
            ],
        )
    )
    cors_origin_regex: str = field(
        default_factory=lambda: os.getenv(
            "SEJFA_CORS_ORIGIN_REGEX",
            r"^https?://(localhost|127\.0\.0\.1):\d+$",
        )
    )
    cost_rates: CostRates = field(default_factory=CostRates)
    stuck: StuckConfig = field(default_factory=StuckConfig)


config = MonitorConfig()
