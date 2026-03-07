# Contributing to SEJFA

## Code Structure

This repository follows a modular structure separating the voice pipeline application from shared utilities and agent infrastructure.

### `src/voice_pipeline/`
The FastAPI voice-to-Jira pipeline application.
- `main.py` - FastAPI app entry point
- `config.py` - Pipeline configuration (Whisper, Ollama, Jira settings)
- `transcriber/` - Whisper speech-to-text transcription
- `intent/` - Ollama-based intent extraction
- `jira/` - Jira ticket creation from extracted intent
- `pipeline/` - Pipeline orchestration and ambiguity loop
- `security/` - Input validation and sanitization

### `src/sejfa/integrations/`
External API clients and integration logic.
Examples: Jira client.

### `src/sejfa/utils/`
General utility functions and helpers.
Examples: Security sanitization, string formatting.

### `src/sejfa/monitor/`
Monitor service for real-time loop observation.

## Testing

Mirror the source structure in `tests/`.
- `tests/voice_pipeline/` - Tests for `src/voice_pipeline/` (64 tests)
- `tests/integrations/` - Tests for `src/sejfa/integrations/`
- `tests/utils/` - Tests for `src/sejfa/utils/`
- `tests/agent/` - Tests for agent scripts and hooks.

Run tests:
```bash
source venv/bin/activate && pytest tests/ -xvs
```

## Guidelines

- Keep the root directory clean. Only config files (`pyproject.toml`, `Dockerfile`, etc.) should be here.
- Do not modify `.claude/hooks/` or `.github/` without review.
- Follow TDD: write a failing test before implementing.
- Use `DEV-XXX: Description` format for commit messages.
- Create feature branches: `feature/DEV-XXX-description`.
