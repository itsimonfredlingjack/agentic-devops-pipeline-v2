# CLAUDE.md

This file gives working guidance for agents operating in this repository.

## Project Identity

SEJFA is an agentic software-delivery loop.

Treat this as the canonical model:

```text
voice start or Jira context
  -> task creation / queueing
  -> Ralph Loop execution in Claude Code
  -> verification gates
  -> review feedback
  -> deploy / close the loop
```

Important boundaries:

- **SEJFA** = the loop-first system
- **Ralph Loop** = the autonomous execution cycle inside SEJFA
- **Voice start layer** = the audio and intent subsystem that starts or feeds the loop
- **ai-server2** = the remote inference machine
- **Monitor / command center** = companion observability and control tooling

Do not redefine the repo as primarily a voice app or primarily a monitor product.

## Repo Truth

Current repo contents that matter:

- `src/voice_pipeline/` implements the voice start layer backend
- `src/monitor/` implements the monitor API companion
- `src/sejfa/` contains shared utilities
- `voice-app/` contains the Tauri voice client
- `ELECTRON-sejfa/` is a separate nested git repo for a companion command center
- `.claude/hooks/` in the root repo contains the monitor hook bridge
- `scripts/` contains loop, Jira, Jules, and deployment helper scripts

Current repo limitations:

- there is no root `.github/workflows/` directory in this repo
- there is no root `.claude/skills/` or `.claude/commands/`
- archive docs may describe planned or historical workflows that are not present here

Use the canonical docs first:

- `README.md`
- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `docs/GUIDELINES.md`
- `docs/REMOTE_DEV.md`

## Machine Roles

### Mac

The Mac is the primary SEJFA machine.

- FastAPI voice backend on `:8000`
- Tauri voice client in `voice-app/`
- Claude Code / Ralph Loop execution
- optional monitor API on `:8100`

### ai-server2

`ai-server2` is the remote inference node.

- remote Whisper execution
- remote Ollama execution
- accessed over Tailscale

Do not treat `ai-server2` as the place where the whole SEJFA system lives unless a task explicitly says the topology changed.

### Hetzner

Hetzner is deployment or demo infrastructure, not the loop core.

## Build And Run

### Python environment

```bash
pip install -r requirements.txt
```

### Voice start layer backend

```bash
uvicorn src.voice_pipeline.main:app --host 0.0.0.0 --port 8000 --reload
```

### Monitor API companion

```bash
uvicorn src.monitor.api:app --host 0.0.0.0 --port 8100
```

### Voice app

```bash
cd voice-app
npm install
npm run tauri dev
npm run build
npm test
npm run lint
```

### Companion command center

Only work here when the task explicitly targets the companion app.

```bash
cd ELECTRON-sejfa
npm install
npm start
npm run verify
```

### Verification

```bash
pytest tests/ -xvs
pytest tests/monitor/ -xvs
pytest tests/voice_pipeline/ -xvs
ruff check .
ruff format --check .
```

## Architecture Overview

### `src/voice_pipeline/`

The voice start layer backend.

- `main.py` exposes HTTP and WebSocket endpoints
- `config.py` reads environment-based settings
- `transcriber/` contains local and remote transcription backends
- `intent/` handles Ollama-based intent extraction
- `jira/` handles Jira issue creation
- `pipeline/` orchestrates intake, ambiguity handling, and queueing
- `loop_queue.py` and `persistent_loop_queue.py` support task dispatch into the loop

### `src/monitor/`

The monitoring companion backend.

- `api.py` receives hook events and exposes monitor endpoints
- `models.py` persists monitor sessions and events
- `cost_tracker.py` and `stuck_detector.py` derive monitoring signals
- `ws_manager.py` broadcasts status updates

### `src/sejfa/`

Shared utilities used across loop-related components.

### `voice-app/`

The Tauri voice start client. It captures audio locally and sends requests to the backend configured by the user, which defaults to `http://localhost:8000`.

### `ELECTRON-sejfa/`

A companion command center with its own `.git` directory. Do not assume changes in this repo automatically belong there.

## Data Flow

Canonical flow:

```text
voice or Jira context
  -> SEJFA intake
  -> task queued for Ralph Loop
  -> implementation and verification
  -> review and follow-up work
```

Current voice-path implementation:

```text
voice-app on Mac
  -> FastAPI backend on Mac
  -> remote Whisper / Ollama on ai-server2 when configured
  -> Jira issue creation
  -> loop queue / status updates
```

## Important Commands And APIs

### Voice backend endpoints

- `GET /health`
- `POST /api/transcribe`
- `POST /api/extract`
- `POST /api/pipeline/run`
- `POST /api/pipeline/clarify`
- `POST /api/webhook/jira`
- `GET /api/loop/queue`
- `POST /api/loop/started`
- `POST /api/loop/completed`
- `WS /ws/status`

### Monitor endpoints

- `POST /events`
- `GET /events`
- `GET /sessions`
- `GET /sessions/{session_id}`
- `GET /status`
- `POST /reset`

## Conventions

### Python

- use type hints
- use `ruff` for linting and formatting
- target Python 3.11+
- keep tests in `tests/`

### Git

- branch format: `{type}/{JIRA-ID}-{slug}`
- commit format: `DEV-42: Add OAuth login endpoint`
- stage with `git add -u`

### Documentation

- root docs must stay loop-first
- subsystem docs must clearly identify themselves as subsystem docs
- archive docs must be clearly labeled as archive or speculative reference

## Protected Or Sensitive Areas

- `.claude/hooks/`
- `.env` files
- `Dockerfile`
- `docker-compose.yml`
- `scripts/systemd/`

There is no root `.github/` directory today. Do not document or edit it as if it already exists unless you are explicitly creating it.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `OLLAMA_URL` | Remote or local Ollama endpoint |
| `OLLAMA_MODEL` | Intent model name |
| `WHISPER_BACKEND` | `local` or `remote` |
| `WHISPER_REMOTE_URL` | Remote transcription base URL |
| `WHISPER_MODEL` | Whisper model size |
| `WHISPER_DEVICE` | Whisper device selection |
| `JIRA_URL` | Jira base URL |
| `JIRA_EMAIL` | Jira account email |
| `JIRA_API_TOKEN` | Jira API token |
| `JIRA_PROJECT_KEY` | Default Jira project |
| `APP_PORT` | Backend port, default `8000` |
