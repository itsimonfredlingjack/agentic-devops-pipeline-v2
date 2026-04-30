# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Identity

SEJFA is an agentic software-delivery loop. The loop is the product. Voice, desktop, and monitoring are layers around that loop.

```text
existing Linear task or voice/text draft
  -> structured task review
  -> save to Linear
  -> manual start-task
  -> Ralph Loop execution in Claude Code
  -> verification gates
  -> review feedback
  -> done / failed / blocked / aborted
```

Key terms:

| Term | Meaning |
|------|---------|
| **SEJFA** | The loop-first system |
| **Ralph Loop** | The autonomous execution cycle inside SEJFA |
| **Desktop command desk** | Active operator surface for inbox, dossier, live run, and blockers |
| **Voice start layer** | Voice/text intake plus task draft and Linear bridge |
| **Monitor companion** | Run-status and control-plane tooling around the loop |

Do not redefine the repo as primarily a voice app, monitor product, or companion app.

## Repo Layout

```text
services/
  voice-pipeline/src/voice_pipeline/   # FastAPI intake + Linear bridge + queue backend (:8000)
  monitor-api/src/monitor/             # Monitor API companion (:8100 standalone)
  loop-engine/                         # Execution-layer boundary, loop runner home
src/
  sejfa/                               # Shared Python utilities (integrations, monitor, utils)
  chatgpt_companion/                   # Secondary ChatGPT Developer Mode MCP companion
desktop/                               # Electron + React 18 + Vite desktop command desk
chatgpt-companion/web/                 # React widget UI for the ChatGPT companion
packages/
  data-client/                         # TS API client for voice backend
  shared-types/                        # Shared TS interfaces
  ui-system/                           # Shared UI component library
scripts/                               # Loop, Jules, systemd, deployment helpers
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

- Active desktop command desk
- FastAPI voice backend on `:8000`
- Claude Code / Ralph Loop execution
- Standalone monitor API on `:8100`
- Standalone ChatGPT companion on `:8787`
- Local stack monitor API on `:8110`
- Local stack companion on `:8788`

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

The companion runs via `uvicorn src.chatgpt_companion.mcp_server:app` on port `${SEJFA_CHATGPT_COMPANION_PORT:-8787}`. It is not the v1 critical path.

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

Use the local stack when you want the default integrated dev surface. Use standalone commands when you need one service in isolation.

### Loop runner

```bash
bash scripts/loop-runner.sh
# or directly:
bash services/loop-engine/scripts/loop-runner.sh
```

Polls `/api/loop/queue` for pending tasks, runs `claude --print "/start-task $task_ref"` for each. Env vars: `LOOP_RUNNER_BACKEND_URL`, `LOOP_RUNNER_REPO_DIR`, `LOOP_RUNNER_POLL_INTERVAL`.

## Current V1 Operator Flow

The intended v1 lane is:

1. Select an existing Linear task or create a new draft from voice or text.
2. Review and edit the task in the desktop command desk.
3. Save it to Linear.
4. Start execution manually with `/start-task $task_ref`.
5. Follow the run through monitor-backed desktop surfaces.
6. Use only real interventions: abort, persisted operator instruction, clarify, and retry.

Voice is optional input. Manual start after review/save is the recommended v1 behavior.

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

FastAPI app that converts voice/text input into structured task drafts, bridges to Linear, and queues work for the Ralph Loop.
- `main.py` — HTTP/WS endpoints
- `config.py` — Pydantic Settings from env vars
- `transcriber/` — pluggable backends: `whisper_local.py` (CPU/GPU), `remote.py` (ai-server2), `openai_api.py`
- `intent/` — Ollama-based intent extraction with structured prompts
- `pipeline/` — orchestrator that chains transcription → extraction → task draft review → save-to-Linear, with ambiguity clarification loop
- `loop_queue.py` / `persistent_loop_queue.py` — SQLite-backed queue for dispatching work to the Ralph Loop
- `security/sanitizer.py` — input sanitization (prompt injection defense)

### Monitor API (`services/monitor-api/src/monitor/`)

Companion service that receives Claude Code hook events and provides run status, session observability, and intervention handling.

- `api.py` — receives `/events`, exposes `/sessions`, `/status`
- `models.py` — SQLite-backed session and event persistence
- `cost_tracker.py` — derives cost signals from events
- `stuck_detector.py` — detects stalled execution
- `ws_manager.py` — WebSocket broadcasting

### Desktop App (`desktop/`)

Electron + React 18 + Vite desktop command desk. Uses Zustand for state and consumes `@sejfa/data-client`, `@sejfa/shared-types`, and `@sejfa/ui-system`. This is the active operator surface for inbox, draft review, dossier editing, blockers, run controls, and live monitor views.

### Hook Bridge (`.claude/hooks/`)

`.claude/hooks.json` registers `monitor_hook.py` for PreToolUse, PostToolUse, and Stop events (3s timeout). Hooks are fire-and-forget — they send events to the monitor API but cannot block Claude Code execution.

### ChatGPT Companion (`src/chatgpt_companion/`)

Read-only MCP server for inspecting SEJFA from ChatGPT Developer Mode. Secondary surface, not the main v1 path.

### Shared Utilities (`src/sejfa/`)

- `monitor/monitor_service.py` — monitor service client
- `utils/health_check.py`, `utils/security.py` — health checks and security helpers

### Loop Engine (`services/loop-engine/`)

Execution-layer boundary. Currently owns the loop-runner script that polls for pending tasks and dispatches them to Claude Code.

### Agent Scripts (`scripts/`)

- `loop-runner.sh` — delegates to `services/loop-engine/scripts/loop-runner.sh`
- `classify_failure.py` — classifies CI failures into a taxonomy (AUTH, TEST_FAIL, LINT_FAIL, etc.) for self-healing
- `jules_payload.py`, `jules_review_api.py` — Jules (Google) code review integration
- `create-branch.sh`, `create-pr.sh` — git workflow helpers
- `preflight.sh`, `ci_check.sh` — pre-flight and CI validation
- `systemd/` — service definitions for loop-runner and voice-pipeline

## API Surface

### Voice backend (`:8000`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/api/transcribe` | POST | Audio to text |
| `/api/extract` | POST | Text to task intent |
| `/api/pipeline/run` | POST | Voice/text draft intake pipeline |
| `/api/pipeline/run/audio` | POST | Audio-first intake pipeline |
| `/api/pipeline/clarify` | POST | Ambiguity clarification follow-up |
| `/api/pipeline/approve` | POST | Approve and save a reviewed task |
| `/api/pipeline/discard` | POST | Discard a draft |
| `/api/tasks` | GET | List Linear-backed tasks |
| `/api/tasks/{task_id}` | GET | Fetch task details |
| `/api/loop/queue` | GET | Pending loop work |
| `/api/loop/started` | POST | Mark work as started |
| `/api/loop/completed` | POST | Mark work as completed |
| `/api/loop/failed` | POST | Mark work as failed |
| `/ws/status` | WS | Pipeline status updates |

### Monitor (`:8100`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/events` | POST | Receive hook events |
| `/events` | GET | Query stored events |
| `/sessions` | GET | List monitor sessions |
| `/sessions/{id}` | GET | Inspect one session |
| `/sessions/{id}/abort` | POST | Abort an active run |
| `/sessions/{id}/instruction` | POST | Persist operator instruction |
| `/sessions/{id}/actions` | POST | Clarify or retry |
| `/status` | GET | Current monitor status |
| `/reset` | POST | Reset in-memory analyzers |

## Conventions

### Python

- Type hints required
- `ruff` for linting and formatting (line-length 100, target py311)
- Lint rules: E, F, W, I, N, UP, B, C4 (E501 ignored)
- Tests in `tests/` mirroring source structure

### Git

- Branch: `{type}/{TASK-REF}-{slug}` (e.g. `feature/SEJ-42-oauth-login`)
- Commit: `DEV-42: Add OAuth login endpoint`
- Stage with `git add -u`
- Use `./scripts/create-branch.sh PROJ-123 feature "short description"` and `./scripts/create-pr.sh PROJ-123` for consistent naming
- Run `bash scripts/preflight.sh` before starting task work (validates git state, GitHub connectivity, required files)

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
| `LINEAR_API_KEY` | Linear personal API key |
| `LINEAR_TEAM_ID` | Default Linear team UUID |
| `LINEAR_TEAM_KEY` | Default Linear team key |
| `AUTO_DISPATCH_LOOP` | Whether approved tasks auto-queue after save |
| `APP_PORT` | Backend port (default `8000`) |
| `SEJFA_CHATGPT_COMPANION_PORT` | Companion port (default `8787`) |
| `LOOP_RUNNER_BACKEND_URL` | Loop runner backend URL (default `http://localhost:8000`) |
| `LOOP_RUNNER_POLL_INTERVAL` | Loop runner poll interval in seconds (default `10`) |
