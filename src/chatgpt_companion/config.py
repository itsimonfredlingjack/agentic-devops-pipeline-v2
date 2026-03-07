"""Configuration for the SEJFA ChatGPT companion."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import os


def _csv_list(env_name: str, default: list[str]) -> list[str]:
    raw = os.getenv(env_name, "")
    items = [item.strip() for item in raw.split(",") if item.strip()]
    return items or default


@dataclass(frozen=True)
class CompanionConfig:
    repo_root: Path = field(
        default_factory=lambda: Path(__file__).resolve().parents[2]
    )
    monitor_db_path: Path = field(
        default_factory=lambda: Path(__file__).resolve().parents[2] / "data" / "monitor.db"
    )
    queue_db_path: Path = field(
        default_factory=lambda: Path(__file__).resolve().parents[2] / "loop_queue.db"
    )
    docs_root: Path = field(
        default_factory=lambda: Path(__file__).resolve().parents[2] / "docs"
    )
    widget_dist: Path = field(
        default_factory=lambda: Path(__file__).resolve().parents[2]
        / "chatgpt-companion"
        / "web"
        / "dist"
    )
    voice_api_url: str = field(
        default_factory=lambda: os.getenv("SEJFA_VOICE_API_URL", "http://127.0.0.1:8000")
    )
    monitor_api_url: str = field(
        default_factory=lambda: os.getenv("SEJFA_MONITOR_API_URL", "http://127.0.0.1:8100")
    )
    public_base_url: str = field(
        default_factory=lambda: os.getenv(
            "SEJFA_CHATGPT_PUBLIC_BASE_URL",
            "https://sejfa-chat.fredlingautomation.dev",
        ).rstrip("/")
    )
    allowed_hosts: list[str] = field(
        default_factory=lambda: _csv_list(
            "SEJFA_CHATGPT_ALLOWED_HOSTS",
            [
                "127.0.0.1:*",
                "localhost:*",
                "[::1]:*",
                "sejfa-chat.fredlingautomation.dev",
            ],
        )
    )
    allowed_origins: list[str] = field(
        default_factory=lambda: _csv_list(
            "SEJFA_CHATGPT_ALLOWED_ORIGINS",
            [
                "http://127.0.0.1:*",
                "http://localhost:*",
                "http://[::1]:*",
                "https://chatgpt.com",
                "https://chat.openai.com",
            ],
        )
    )
    companion_port: int = 8787
    max_workspace_hits: int = 30
    max_file_excerpt_lines: int = 220
    max_event_results: int = 50
    request_timeout_seconds: float = 2.0


config = CompanionConfig()
