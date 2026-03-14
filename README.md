# SEJFA

SEJFA is an agentic software-delivery loop.

Its core idea is simple: an incoming task becomes an autonomous execution cycle where the system plans, implements, verifies, reviews, and feeds the result back into the next task. Voice is an input layer into that loop. Monitoring is a companion layer around that loop. The loop itself is the product.

```text
voice start or Jira context
  -> task creation / queueing
  -> Claude Code execution (Ralph Loop)
  -> verification gates
  -> review feedback
  -> deploy / close the task
  -> new feedback becomes new work
```

## What SEJFA Is

SEJFA is the loop-first system built around these ideas:

- Jira-centered task intake
- autonomous execution through the Ralph Loop
- verification before completion
- review feedback that can create follow-up work
- hard boundaries between instructions, data, and monitoring

The repository currently contains:

- the loop-facing backend split across `services/` and `src/`
- a voice pipeline backend in `services/voice-pipeline/src/voice_pipeline/`
- a monitor API in `services/monitor-api/src/monitor/`
- shared frontend packages in `packages/`
- helper scripts for Jira, Jules, queueing, and loop operations in `scripts/`

The repository does not currently contain root GitHub Actions workflows. Old documents that describe those workflows as already present are kept as archive material only.

## System Roles

### Core

The core is the autonomous software-delivery loop:

`task -> branch/context -> implement -> test/lint -> review -> close or continue`

This is what SEJFA fundamentally is.

### Voice Start Layer

The voice layer is a subsystem that helps start or feed the loop.

In the current repo it includes:

- a FastAPI backend in `services/voice-pipeline/src/voice_pipeline/`
- Whisper transcription and Ollama intent extraction
- Jira ticket creation and loop queueing

Voice is important, but it is not the primary identity of the project.

### Monitoring Companion

Monitoring is a companion observability and control surface around the loop.

In the current repo it includes:

- the monitor API in `services/monitor-api/src/monitor/`
- Claude hook event forwarding in `.claude/hooks/`

`ELECTRON-sejfa/` is a separate companion app with its own nested `.git` repository. It is not the root identity of this repo.

## Machine Topology

### Mac

The Mac is the orchestration machine.

- runs the FastAPI backend on `:8000`
- runs the Tauri voice app
- runs Claude Code and the Ralph Loop
- can run the monitor API on `:8100`

### ai-server2

`ai-server2` is the remote inference machine.

- runs Whisper and Ollama workloads
- is used as the GPU path for transcription and intent extraction
- should not be treated as the home of the whole SEJFA system

### Hetzner

Hetzner is a demo/deployment host, not the loop core.

## Docs Map

### Canonical / current

- [README.md](README.md)
- [CLAUDE.md](CLAUDE.md)
- [docs/README.md](docs/README.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/GUIDELINES.md](docs/GUIDELINES.md)
- [docs/REMOTE_DEV.md](docs/REMOTE_DEV.md)

### Service surfaces

- `services/voice-pipeline/` is the voice start backend
- `services/monitor-api/` is the observability and session API
- `services/loop-engine/` is the execution-layer boundary, not a UI

### Archive / speculative / companion references

- [docs/SPEC-pipeline-monitor-v2.md](docs/SPEC-pipeline-monitor-v2.md)
- [docs/PLAN-pipeline-monitor-v2.md](docs/PLAN-pipeline-monitor-v2.md)
- [docs/JULES_INTEGRATION.md](docs/JULES_INTEGRATION.md)
- [docs/jules-playbook.md](docs/jules-playbook.md)

## What Exists In The Repo

```text
.
├── .claude/hooks/          # Hook-to-monitor bridge in the root repo
├── docs/                   # Canonical docs plus archive references
├── packages/               # Shared UI, contracts, and frontend data clients
├── services/
│   ├── loop-engine/        # Execution-layer boundary and loop runner home
│   ├── monitor-api/        # Monitor API source
│   └── voice-pipeline/     # Voice pipeline source
├── scripts/                # Queue, Jira, Jules, systemd, loop helpers
├── src/sejfa/              # Shared utilities
├── tests/                  # Python test suites
└── ELECTRON-sejfa/         # Separate nested companion repo
```

## Run The Current Repo

### Python backend

```bash
pip install -r requirements.txt
PYTHONPATH=services/voice-pipeline/src uvicorn voice_pipeline.main:app --host 0.0.0.0 --port 8000 --reload
```

### Monitor API

```bash
PYTHONPATH=services/monitor-api/src uvicorn monitor.api:app --host 0.0.0.0 --port 8100
```

### Tests

```bash
pytest tests/ -xvs
```

## Current API Surface

### Voice start layer

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | `GET` | Health check |
| `/api/transcribe` | `POST` | Audio to text |
| `/api/extract` | `POST` | Text to Jira intent |
| `/api/pipeline/run` | `POST` | Run the voice intake pipeline |
| `/api/pipeline/clarify` | `POST` | Continue ambiguity clarification |
| `/api/loop/queue` | `GET` | Inspect pending loop work |
| `/api/loop/started` | `POST` | Mark queued work as started |
| `/api/loop/completed` | `POST` | Mark queued work as completed |
| `/ws/status` | `WS` | Pipeline status updates |

### Monitor companion

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/events` | `POST` | Receive hook events |
| `/events` | `GET` | Query stored events |
| `/sessions` | `GET` | List monitor sessions |
| `/sessions/{session_id}` | `GET` | Inspect one session |
| `/status` | `GET` | Current monitor status |
| `/reset` | `POST` | Reset in-memory analyzers |

## Repository Truths

- SEJFA is the loop-first system.
- Voice starts or feeds the loop.
- `ai-server2` is the inference node, not the whole platform.
- Monitoring is a companion surface, not the root product identity.
- Archive docs are retained for history and planning, not as the source of truth.
