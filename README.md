# SEJFA

SEJFA is an agentic software-delivery loop.

The active v1 shape is a Mac-first command desk where the desktop app is the main operator surface, Linear is the task source of truth, `ai-server2` provides remote inference, and Ralph Loop executes reviewed work.

```text
existing Linear task or voice/text draft
  -> review and edit
  -> save to Linear
  -> manual /start-task
  -> Ralph Loop execution
  -> monitor timeline and interventions
  -> done / failed / blocked / aborted
```

## Current V1 Operator Flow

SEJFA v1 currently works like this:

1. Pick an existing Linear task or create a new draft from voice or text.
2. Review and edit the task in the desktop command desk.
3. Save the task to Linear.
4. Start the run manually with `/start-task $task_ref`.
5. Let Ralph Loop execute the task.
6. Follow the live run in the monitor-backed desktop surfaces.
7. Intervene only through real controls: `stop`, `clarify`, `retry`, and persisted operator instruction.

The important rule is that voice is optional input, not the product. The loop is the product.

## Machine Topology

### Mac

The Mac is the control plane.

- runs the local SEJFA APIs and desktop app
- owns task intake, review, save-to-Linear, and manual loop start
- runs Claude Code and the Ralph Loop

### ai-server2

`ai-server2` is the remote inference machine.

- remote Whisper transcription
- remote Ollama intent extraction
- not the home of the whole SEJFA system

### Linear

Linear is the intended v1 task source of truth.

- existing tasks come from Linear
- new voice/text drafts should be saved to Linear before execution

## Active Repo Surfaces

### Desktop Command Desk

`desktop/` is the active operator surface.

It currently carries the inbox, draft intake, dossier/review flow, monitor views, blocker handling, and run controls around the loop.

### Voice Pipeline

`services/voice-pipeline/src/voice_pipeline/` is not just transcription.

It currently handles:

- voice and text intake
- task draft shaping
- Linear-backed task list and task detail fetches
- save/update-to-Linear flows
- queue and loop start boundary endpoints

### Monitor API

`services/monitor-api/src/monitor/` is the run-status and control-plane companion.

It currently handles:

- hook event ingestion
- session and event persistence
- live run status
- conversation/intervention state
- abort, clarify, retry, and instruction surfaces

### Loop Engine

`services/loop-engine/` is the execution boundary.

Its runner polls for queued work, launches `claude --print "/start-task $task_ref"`, and reports outcomes back into the monitor flow.

### Companion

`src/chatgpt_companion/` and `chatgpt-companion/web/` are secondary surfaces. They exist in the repo, but they are not the v1 critical path.

## Local Stack Vs Individual Services

### Local Stack

Use the orchestrator when you want the default local SEJFA stack:

```bash
./scripts/start-sejfa-local.sh start
./scripts/start-sejfa-local.sh status
./scripts/start-sejfa-local.sh stop
```

Default local-stack ports:

- voice pipeline: `8000`
- monitor API: `8110`
- ChatGPT companion: `8788`
- desktop dev server: `5173` when `SEJFA_LOCAL_START_DESKTOP=true`

### Individual Services

Use direct commands when you only need one surface.

Voice pipeline:

```bash
PYTHONPATH=services/voice-pipeline/src uvicorn voice_pipeline.main:app --host 0.0.0.0 --port 8000 --reload
```

Standalone monitor API:

```bash
PYTHONPATH=services/monitor-api/src uvicorn monitor.api:app --host 0.0.0.0 --port 8100
```

ChatGPT companion:

```bash
./scripts/start-chatgpt-companion.sh start
./scripts/start-chatgpt-companion.sh status
./scripts/start-chatgpt-companion.sh stop
```

Standalone companion defaults to port `8787`. The local stack uses `8788` to avoid collisions.

Desktop app:

```bash
npm --workspace desktop run electron:dev
npm --workspace desktop run test
npm --workspace desktop run build
```

Loop runner:

```bash
bash scripts/loop-runner.sh
```

## Recommended Environment Defaults

Recommended v1 defaults are:

- Mac as control plane
- `SEJFA_MODE=auto` so local work falls back to demo mode when Linear is not configured
- `WHISPER_BACKEND=remote`
- `WHISPER_REMOTE_URL=http://<ai-server2>:8000`
- `OLLAMA_URL=http://<ai-server2>:11434`
- Linear configured through `LINEAR_API_KEY` plus `LINEAR_TEAM_ID` or `LINEAR_TEAM_KEY`
- `AUTO_DISPATCH_LOOP=false` so runs start manually after review/save

See [`.env.example`](.env.example) for the current setup template.

## Demo Vs Full

SEJFA now supports two practical local modes:

- `demo`: uses a local in-memory task workspace so the desktop inbox, dossier edits, and preview approval flow still work without Linear
- `full`: uses Linear as the task backend and preserves the current v1 operator shape
- `auto`: default mode; resolves to `full` when `LINEAR_API_KEY` is set, otherwise `demo`

This keeps the command desk usable when you want to show the product or regain momentum before wiring every external dependency back in.

## Canonical Commands

Preflight before starting task work:

```bash
bash scripts/preflight.sh
```

Create a branch:

```bash
./scripts/create-branch.sh PROJ-123 feature "short description"
```

Create a PR:

```bash
./scripts/create-pr.sh PROJ-123
./scripts/create-pr.sh PROJ-123 --draft
```

Run repo-native verification:

```bash
bash scripts/ci_check.sh
npm --workspace desktop run build
```

## Current API Surface

### Voice Pipeline

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | `GET` | Health check |
| `/api/transcribe` | `POST` | Audio to text |
| `/api/extract` | `POST` | Text to task intent |
| `/api/pipeline/run` | `POST` | Create a draft from voice or text |
| `/api/pipeline/run/audio` | `POST` | Audio-first draft intake |
| `/api/pipeline/clarify` | `POST` | Continue clarification |
| `/api/pipeline/approve` | `POST` | Approve/save a reviewed task |
| `/api/pipeline/discard` | `POST` | Discard a draft |
| `/api/tasks` | `GET` | List Linear-backed tasks |
| `/api/tasks/{task_id}` | `GET` | Fetch task details |
| `/api/loop/queue` | `GET` | Inspect queued loop work |
| `/api/loop/started` | `POST` | Mark queued work as started |
| `/api/loop/completed` | `POST` | Mark queued work as completed |
| `/api/loop/failed` | `POST` | Mark queued work as failed |

### Monitor API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/events` | `POST` | Receive hook events |
| `/events` | `GET` | Query stored events |
| `/sessions` | `GET` | List monitor sessions |
| `/sessions/{session_id}` | `GET` | Inspect one session |
| `/sessions/{session_id}/abort` | `POST` | Abort a live run |
| `/sessions/{session_id}/instruction` | `POST` | Persist operator instruction |
| `/sessions/{session_id}/actions` | `POST` | Clarify or retry |
| `/status` | `GET` | Current monitor status |

## Known Non-V1 Or Secondary Surfaces

- ChatGPT companion is secondary and not required for the main v1 loop.
- Archived plans and specs are historical context, not the source of truth.
- The local stack and individual service commands intentionally use different default ports for monitor and companion.

## Docs Map

Read current docs in this order:

1. [`AGENTS.md`](AGENTS.md)
2. [`README.md`](README.md)
3. [`CLAUDE.md`](CLAUDE.md)
4. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
5. [`docs/REMOTE_DEV.md`](docs/REMOTE_DEV.md)

Prefer checked-in scripts and current code behavior over older planning material.
