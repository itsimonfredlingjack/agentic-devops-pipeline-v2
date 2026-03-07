"""Application configuration via Pydantic Settings.

All configuration is loaded from environment variables (or .env file).
"""

from functools import lru_cache

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

    # Jira integration
    jira_url: str = Field(default="", description="Jira base URL")
    jira_email: str = Field(default="", description="Jira account email")
    jira_api_token: str = Field(default="", description="Jira API token")
    jira_project_key: str = Field(default="", description="Default Jira project key")

    # OpenAI fallback (optional)
    openai_api_key: str = Field(default="", description="OpenAI API key for Whisper fallback")

    # Ambiguity loop
    ambiguity_threshold: float = Field(
        default=0.3, description="Ambiguity score above which clarification is requested"
    )
    max_clarification_rounds: int = Field(
        default=3, description="Max clarification rounds before forcing ticket creation"
    )

    # Ralph Loop dispatch
    auto_dispatch_loop: bool = Field(
        default=True, description="Auto-queue tickets for Ralph Loop after creation"
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
    def jira_configured(self) -> bool:
        """True if all required Jira credentials are set."""
        return bool(self.jira_url and self.jira_email and self.jira_api_token)

    @property
    def openai_configured(self) -> bool:
        """True if OpenAI API key is set (enables Whisper API fallback)."""
        return bool(self.openai_api_key)


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings.

    Uses lru_cache so the .env file is read only once at startup.
    """
    return Settings()
