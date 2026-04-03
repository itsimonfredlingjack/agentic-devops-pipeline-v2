"""Loop engine configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class LoopConfig:
    """Configuration for the loop runner."""

    backend_url: str = field(
        default_factory=lambda: os.getenv("LOOP_RUNNER_BACKEND_URL", "http://localhost:8000")
    )
    repo_dir: str = field(default_factory=lambda: os.getenv("LOOP_RUNNER_REPO_DIR", os.getcwd()))
    poll_interval: int = field(
        default_factory=lambda: int(os.getenv("LOOP_RUNNER_POLL_INTERVAL", "10"))
    )
    monitor_url: str = field(
        default_factory=lambda: os.getenv("SEJFA_MONITOR_API_URL", "http://127.0.0.1:8110")
    )
    log_dir: Path = field(
        default_factory=lambda: Path(os.getenv("LOOP_RUNNER_LOG_DIR", "data/loop-logs"))
    )
    max_retries: int = field(default_factory=lambda: int(os.getenv("LOOP_RUNNER_MAX_RETRIES", "3")))
    heartbeat_interval: int = field(
        default_factory=lambda: int(os.getenv("LOOP_RUNNER_HEARTBEAT_INTERVAL", "30"))
    )
    max_backoff: int = 300  # 5 minutes max backoff

    @classmethod
    def from_env(cls) -> LoopConfig:
        return cls()
