# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Identity

SEJFA is an agentic software-delivery loop. The loop is the product — voice and monitoring are layers around it.

```text
voice start or Jira context
  -> task creation / queueing
  -> Ralph Loop execution in Claude Code
  -> verification gates
  -> review feedback
  -> deploy / close the loop
```

Key terms:

| Term | Meaning |
|------|---------|
| **SEJFA** | The loop-first system |
| **Ralph Loop** | The autonomous execution cycle inside SEJFA |
| **Voice start layer** | Audio/transcription/intent subsystem that feeds the loop |
| **Monitor companion** | Observability and control tooling around the loop |

Do not redefine the repo as primarily a voice app or a monitor product.

## Repo Layout

```text
services/
  voice-pipeline/src/voice_pipeline/   # FastAPI voice-to-Jira backend (:8000)
  monitor-api/src/monitor/             # Monitor API companion (:8100)
  loop-engine/                         # Execution-layer boundary, loop runner home
src/
  sejfa/                               # Shared Python utilities (integrations, monitor, utils)
  chatgpt_companion/                   # ChatGPT Developer Mode MCP companion
desktop/                               # Electron + React 18 + Vite desktop app (Command Desk)
chatgpt-companion/web/                 # React widget UI for the ChatGPT companion
packages/
  data-client/                         # TS API client for voice backend
  shared-types/                        # Shared TS interfaces
  ui-system/                           # Shared UI component library
scripts/                               # Loop, Jira, Jules, systemd, deployment helpers
tests/                                 # pytest suites mirroring source structure
data/                                  # SQLite databases (monitor.db, companion metrics)
.claude/hooks.json                     # Hook config registering monitor_hook.py
.claude/hooks/                         # Monitor hook bridge (fire-and-forget)
docs/                                  # Canonical + archive documentation
```

The root `package.json` defines an npm workspace covering `packages/*` and `desktop/`.

What does NOT exist in this repo:

- No `.github/workflows/` directory
- No `.claude/skills/` or `.claude/commands/`
- No `voice-app/` (deleted Tauri desktop app)
- No `ELECTRON-sejfa/` in the working tree

Archive docs may describe planned or historical workflows not present here.

## Machine Topology

### Mac (primary)

- FastAPI voice backend on `:8000`
- Claude Code / Ralph Loop execution
- Optional monitor API on `:8100`
- ChatGPT companion on `:8787`

### ai-server2 (inference node)

- Remote Whisper transcription (`WHISPER_BACKEND=remote`)
- Remote Ollama intent extraction
- Accessed over Tailscale
- RTX 2060 with 6GB VRAM — Whisper small and Ollama 7B cannot coexist in VRAM simultaneously

Do not treat ai-server2 as the home of the whole system.

### Hetzner

Demo/deployment infrastructure, not the loop core.

## Build and Run

### Python environment

```bash
pip install -r requirements.txt
# or with dev deps:
pip install -e ".[dev]"
```

### Voice start layer backend

```bash
PYTHONPATH=services/voice-pipeline/src uvicorn voice_pipeline.main:app --host 0.0.0.0 --port 8000 --reload
```

### Monitor API companion

```bash
PYTHONPATH=services/monitor-api/src uvicorn monitor.api:app --host 0.0.0.0 --port 8100
```

### ChatGPT companion

```bash
# Build widget first:
cd chatgpt-companion/web && npm install && npm run build && cd ../..

# Start server + Cloudflare tunnel:
./scripts/start-chatgpt-companion.sh start
./scripts/start-chatgpt-companion.sh status|stop|restart|logs
```

The companion runs via `uvicorn src.chatgpt_companion.mcp_server:app` on port `${SEJFA_CHATGPT_COMPANION_PORT:-8787}`.

### Desktop app (Electron)

```bash
npm --workspace desktop run electron:dev   # Dev mode (Vite + Electron)
npm --workspace desktop run test           # Vitest
npm --workspace desktop run build          # Production build
```

### Local stack orchestrator

Runs voice pipeline, monitor API, and ChatGPT companion together with non-colliding ports:

```bash
./scripts/start-sejfa-local.sh start       # Start all services
./scripts/start-sejfa-local.sh status      # Check running services
./scripts/start-sejfa-local.sh stop        # Stop all services
```

Default ports: voice `8000`, monitor `8110`, companion `8788`. Override with `SEJFA_VOICE_PORT`, `SEJFA_MONITOR_PORT`, `SEJFA_CHATGPT_COMPANION_PORT`.

### Loop runner

```bash
bash scripts/loop-runner.sh
# or directly:
bash services/loop-engine/scripts/loop-runner.sh
```

Polls `/api/loop/queue` for pending tickets, runs `claude --print "/start-task $ticket_key"` for each. Env vars: `LOOP_RUNNER_BACKEND_URL`, `LOOP_RUNNER_REPO_DIR`, `LOOP_RUNNER_POLL_INTERVAL`.

## Verification

```bash
# Full CI validation (ruff + pytest with coverage, fail-under 65%)
bash scripts/ci_check.sh

# All Python tests
pytest tests/ -xvs

# Subsystem tests
pytest tests/voice_pipeline/ -xvs
pytest tests/monitor/ -xvs
pytest tests/chatgpt_companion/ -xvs
pytest tests/agent/ -xvs
pytest tests/integrations/ -xvs

# Single test file
pytest tests/voice_pipeline/test_pipeline.py -xvs

# Lint and format
ruff check .
ruff format --check .

# JS/TS workspace tests and builds
npm run test                           # All workspace tests
npm run build                          # All workspace builds
npm run lint                           # All workspace lints
```

pytest is configured with `asyncio_mode = "auto"` in pyproject.toml. Markers: `unit`, `integration`, `e2e`, `slow`.

## Architecture

### Voice Pipeline (`services/voice-pipeline/src/voice_pipeline/`)

FastAPI app that converts voice/text input into Jira tickets and queues work for the Ralph Loop.

- `main.py` — HTTP/WS endpoints
- `config.py` — Pydantic Settings from env vars
- `transcriber/` — pluggable backends: `whisper_local.py` (CPU/GPU), `remote.py` (ai-server2), `openai_api.py`
- `intent/` — Ollama-based intent extraction with structured prompts
- `jira/` — Jira issue creation from extracted intent
- `pipeline/` — orchestrator that chains transcription → extraction → ticket creation, with ambiguity clarification loop
- `loop_queue.py` / `persistent_loop_queue.py` — SQLite-backed queue for dispatching work to the Ralph Loop
- `security/sanitizer.py` — input sanitization (prompt injection defense)

### Monitor API (`services/monitor-api/src/monitor/`)

Companion service that receives Claude Code hook events and provides session observability.

- `api.py` — receives `/events`, exposes `/sessions`, `/status`
- `models.py` — SQLite-backed session and event persistence
- `cost_tracker.py` — derives cost signals from events
- `stuck_detector.py` — detects stalled execution
- `ws_manager.py` — WebSocket broadcasting

### Desktop App (`desktop/`)

Electron + React 18 + Vite desktop companion (Command Desk). Uses Zustand for state, consumes `@sejfa/data-client`, `@sejfa/shared-types`, and `@sejfa/ui-system` from the monorepo. Key views: MonitorDashboard, CommandPalette, MissionDossier, TerminalFeed, BlockersView.

### Hook Bridge (`.claude/hooks/`)

`.claude/hooks.json` registers `monitor_hook.py` for PreToolUse, PostToolUse, and Stop events (3s timeout). Hooks are fire-and-forget — they send events to the monitor API but cannot block Claude Code execution.

### ChatGPT Companion (`src/chatgpt_companion/`)

Read-only MCP server for inspecting SEJFA from ChatGPT Developer Mode. Provides tools: `search`, `fetch`, `get_active_mission`, `list_recent_sessions`, `get_session_events`, `get_jira_issue`, `search_workspace`, `fetch_workspace_file`, `get_project_context`, `render_mission_dashboard`. No file mutation, no shell execution, no Jira writes.

### Shared Utilities (`src/sejfa/`)

- `integrations/jira_client.py` — Jira API client
- `monitor/monitor_service.py` — monitor service client
- `utils/health_check.py`, `utils/security.py` — health checks and security helpers

### Loop Engine (`services/loop-engine/`)

Execution-layer boundary. Currently owns the loop-runner script that polls for pending tickets and dispatches them to Claude Code.

### Agent Scripts (`scripts/`)

- `loop-runner.sh` — delegates to `services/loop-engine/scripts/loop-runner.sh`
- `classify_failure.py` — classifies CI failures into a taxonomy (AUTH, TEST_FAIL, LINT_FAIL, etc.) for self-healing
- `jules_payload.py`, `jules_review_api.py`, `jules_to_jira.py` — Jules (Google) code review integration
- `create-branch.sh`, `create-pr.sh` — git workflow helpers
- `preflight.sh`, `ci_check.sh` — pre-flight and CI validation
- `systemd/` — service definitions for loop-runner and voice-pipeline

## API Surface

### Voice backend (`:8000`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/api/transcribe` | POST | Audio to text |
| `/api/extract` | POST | Text to Jira intent |
| `/api/pipeline/run` | POST | Full voice intake pipeline |
| `/api/pipeline/clarify` | POST | Ambiguity clarification follow-up |
| `/api/loop/queue` | GET | Pending loop work |
| `/api/loop/started` | POST | Mark work as started |
| `/api/loop/completed` | POST | Mark work as completed |
| `/ws/status` | WS | Pipeline status updates |

### Monitor (`:8100`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/events` | POST | Receive hook events |
| `/events` | GET | Query stored events |
| `/sessions` | GET | List monitor sessions |
| `/sessions/{id}` | GET | Inspect one session |
| `/status` | GET | Current monitor status |
| `/reset` | POST | Reset in-memory analyzers |

## Conventions

### Python

- Type hints required
- `ruff` for linting and formatting (line-length 100, target py311)
- Lint rules: E, F, W, I, N, UP, B, C4 (E501 ignored)
- Tests in `tests/` mirroring source structure

### Git

- Branch: `{type}/{JIRA-ID}-{slug}` (e.g. `feature/DEV-42-oauth-login`)
- Commit: `DEV-42: Add OAuth login endpoint`
- Stage with `git add -u`
- Use `./scripts/create-branch.sh PROJ-123 feature "short description"` and `./scripts/create-pr.sh PROJ-123` for consistent naming
- Run `bash scripts/preflight.sh` before starting ticket work (validates git state, Jira/GitHub connectivity, required files)

### TDD (Ralph Loop)

```text
RED    -> write a failing test
GREEN  -> smallest change that passes
REFACTOR -> clean up without breaking behavior
```

### Documentation priority when docs disagree

1. `CLAUDE.md` / `AGENTS.md` / `README.md`
2. `docs/README.md` / `docs/ARCHITECTURE.md`
3. Subsystem docs
4. Archive docs (historical context only)

## Protected Areas

Do not modify without explicit instruction:

- `.claude/hooks/`
- `.env` files
- `Dockerfile` / `docker-compose.yml`
- `scripts/systemd/`

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `OLLAMA_URL` | Remote or local Ollama endpoint |
| `OLLAMA_MODEL` | Intent extraction model name |
| `WHISPER_BACKEND` | `local` or `remote` |
| `WHISPER_REMOTE_URL` | Remote transcription base URL |
| `WHISPER_MODEL` | Whisper model size |
| `WHISPER_DEVICE` | Whisper device (`cpu` or `cuda`) |
| `JIRA_URL` | Jira base URL |
| `JIRA_EMAIL` | Jira account email |
| `JIRA_API_TOKEN` | Jira API token |
| `JIRA_PROJECT_KEY` | Default Jira project |
| `APP_PORT` | Backend port (default `8000`) |
| `SEJFA_CHATGPT_COMPANION_PORT` | Companion port (default `8787`) |
| `LOOP_RUNNER_BACKEND_URL` | Loop runner backend URL (default `http://localhost:8000`) |
| `LOOP_RUNNER_POLL_INTERVAL` | Loop runner poll interval in seconds (default `10`) |
