"""Monitor API configuration."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


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
    port: int = 8100
    db_path: Path = field(default_factory=lambda: Path("data/monitor.db"))
    cors_origins: list[str] = field(
        default_factory=lambda: ["http://localhost:*", "file://"]
    )
    cost_rates: CostRates = field(default_factory=CostRates)
    stuck: StuckConfig = field(default_factory=StuckConfig)


config = MonitorConfig()
