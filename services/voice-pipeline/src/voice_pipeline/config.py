"""Application configuration via Pydantic Settings.

All configuration is loaded from environment variables (or .env file).
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Voice pipeline application settings.

    Loaded from environment variables with optional .env file support.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Whisper / transcription
    whisper_model: str = Field(default="small", description="Whisper model size")
    whisper_device: str = Field(default="auto", description="Device: cuda, cpu, or auto")
    whisper_backend: str = Field(
        default="local", description="Transcription backend: 'local' or 'remote'"
    )
    whisper_remote_url: str = Field(
        default="", description="Remote Whisper server URL (e.g. http://100.101.182.67:8000)"
    )

    # Ollama / intent extraction
    ollama_model: str = Field(
        default="mistral:7b-instruct-q4_0", description="Ollama model for intent extraction"
    )
    ollama_url: str = Field(default="http://localhost:11434", description="Ollama API base URL")
    ollama_timeout: int = Field(default=120, description="Ollama request timeout in seconds")

    # Linear integration
    sejfa_mode: Literal["auto", "demo", "full"] = Field(
        default="auto",
        description="Runtime mode: auto prefers full when Linear is configured, otherwise demo.",
    )
    linear_api_url: str = Field(
        default="https://api.linear.app/graphql",
        description="Linear GraphQL API endpoint",
    )
    linear_api_key: str = Field(default="", description="Linear personal API key")
    linear_team_id: str = Field(
        default="",
        description="Default Linear team UUID for task creation",
    )
    linear_team_key: str = Field(
        default="",
        description="Default Linear team key for task creation when UUID is not set",
    )

    # Local desktop trust boundary
    sejfa_local_api_token: str = Field(
        default="",
        description="Bearer token required for desktop-facing local task APIs",
    )
    sejfa_cors_origins: str = Field(
        default="",
        description="Comma-separated browser origins allowed to call local APIs",
    )
    sejfa_cors_origin_regex: str = Field(
        default=r"^https?://(localhost|127\.0\.0\.1):\d+$",
        description="Regex for local browser origins allowed by CORS",
    )

    # OpenAI fallback (optional)
    openai_api_key: str = Field(default="", description="OpenAI API key for Whisper fallback")

    # Ambiguity loop
    ambiguity_threshold: float = Field(
        default=0.3, description="Ambiguity score above which clarification is requested"
    )
    max_clarification_rounds: int = Field(
        default=3, description="Max clarification rounds before forcing task creation"
    )

    # Ralph Loop dispatch
    auto_dispatch_loop: bool = Field(
        default=True, description="Auto-queue tasks for Ralph Loop after creation"
    )
    queue_db_path: str = Field(
        default="loop_queue.db",
        description="Path to SQLite database for persistent queue storage",
    )

    # App
    app_host: str = Field(default="0.0.0.0", description="Server bind host")
    app_port: int = Field(default=8000, description="Server port")
    app_debug: bool = Field(default=False, description="Debug mode")
    log_level: str = Field(default="INFO", description="Logging level")

    @property
    def linear_configured(self) -> bool:
        """True if the Linear API key is set."""
        return bool(self.linear_api_key)

    @property
    def effective_mode(self) -> Literal["demo", "full"]:
        """Return the resolved runtime mode."""
        if self.sejfa_mode == "demo":
            return "demo"
        if self.sejfa_mode == "full":
            return "full"
        return "full" if self.linear_configured else "demo"

    @property
    def demo_mode(self) -> bool:
        """True when the app should serve the local demo flow."""
        return self.effective_mode == "demo"

    @property
    def openai_configured(self) -> bool:
        """True if OpenAI API key is set (enables Whisper API fallback)."""
        return bool(self.openai_api_key)

    @property
    def cors_origins(self) -> list[str]:
        """Explicit local browser origins allowed by CORS."""
        if self.sejfa_cors_origins.strip():
            return [
                origin.strip()
                for origin in self.sejfa_cors_origins.split(",")
                if origin.strip()
            ]
        return [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
            "null",
        ]


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings.

    Uses lru_cache so the .env file is read only once at startup.
    """
    return Settings()
