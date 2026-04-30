# AGENTS.md

This file is the local agent guide for the SEJFA repo.

## Project Identity

SEJFA is an agentic software-delivery loop.

The core loop is the product:

```text
incoming task or voice input
  -> Jira issue / queue item
  -> Ralph Loop execution
  -> verification gates
  -> review feedback
  -> completion or follow-up work
```

Do not redefine the repo as primarily a voice app, monitor product, or desktop app. Voice is an intake path. Monitoring and desktop surfaces are companions around the loop.

## Read This First

When you need project context, read in this order:

1. `AGENTS.md`
2. `README.md`
3. `CLAUDE.md`
4. `docs/ARCHITECTURE.md`
5. `docs/REMOTE_DEV.md`
6. Service-specific docs such as `services/loop-engine/README.md` and `docs/CHATGPT_COMPANION.md`

Prefer the current repo and script behavior over older planning docs.

## Repo Truths

- The repo contains Python services, TypeScript packages, a desktop app, and a ChatGPT companion.
- The voice backend lives in `services/voice-pipeline/src/voice_pipeline/`.
- The monitor API lives in `services/monitor-api/src/monitor/`.
- The loop runner lives in `services/loop-engine/scripts/loop-runner.sh`.
- The ChatGPT companion server lives in `src/chatgpt_companion/`.
- The desktop app lives in `desktop/`.
- The root repo does not define its core workflow through `.github/workflows/`; use the checked-in scripts as the authoritative workflow surface.

## Preferred Workflows

### 1. Start-task workflow

Use this when beginning ticket work or any Ralph Loop session:

```bash
bash scripts/preflight.sh
```

`preflight.sh` is the canonical readiness check for `/start-task`. It validates:

- git cleanliness
- branch position on `main` or `master`
- Jira connectivity
- GitHub auth
- required local files such as `.claude/settings.local.json` and `CURRENT_TASK.md`

If the script fails, fix the reported blocker before claiming the repo is ready.

### 2. Branch and PR workflow

Use the repo helpers instead of inventing ad hoc naming:

```bash
./scripts/create-branch.sh PROJ-123 feature "short description"
./scripts/create-pr.sh PROJ-123
./scripts/create-pr.sh PROJ-123 --draft
```

Branch names follow:

```text
{type}/{JIRA-ID}-{slug}
```

Supported branch types:

- `feature`
- `bugfix`
- `hotfix`
- `refactor`
- `docs`

### 3. Local stack workflow

For the default local SEJFA stack, prefer the orchestrator script:

```bash
./scripts/start-sejfa-local.sh start
./scripts/start-sejfa-local.sh status
./scripts/start-sejfa-local.sh stop
```

Default ports:

- voice pipeline: `8000`
- monitor API: `8110`
- ChatGPT companion: `8788`
- desktop dev server: `5173` when desktop start is enabled

Useful environment overrides:

```bash
SEJFA_VOICE_PORT=8001
SEJFA_MONITOR_PORT=8120
SEJFA_CHATGPT_COMPANION_PORT=8790
SEJFA_DESKTOP_PORT=5174
SEJFA_LOCAL_START_DESKTOP=true
```

### 4. Individual service workflow

Use direct commands when you only need one surface:

Voice backend:

```bash
PYTHONPATH=services/voice-pipeline/src uvicorn voice_pipeline.main:app --host 0.0.0.0 --port 8000 --reload
```

Monitor API:

```bash
PYTHONPATH=services/monitor-api/src uvicorn monitor.api:app --host 0.0.0.0 --port 8100
```

ChatGPT companion:

```bash
./scripts/start-chatgpt-companion.sh start
./scripts/start-chatgpt-companion.sh status
./scripts/start-chatgpt-companion.sh logs
./scripts/start-chatgpt-companion.sh stop
./scripts/start-chatgpt-companion.sh restart
```

Desktop app:

```bash
npm --workspace desktop run electron:dev
npm --workspace desktop run test
npm --workspace desktop run build
```

Widget frontend:

```bash
npm --prefix chatgpt-companion/web run dev
npm --prefix chatgpt-companion/web run build
```

### 5. Loop runner workflow

Run the Ralph Loop poller with:

```bash
bash scripts/loop-runner.sh
```

Equivalent direct entrypoint:

```bash
bash services/loop-engine/scripts/loop-runner.sh
```

Key environment variables:

```bash
LOOP_RUNNER_BACKEND_URL=http://localhost:8000
LOOP_RUNNER_REPO_DIR=/absolute/path/to/repo
LOOP_RUNNER_POLL_INTERVAL=10
```

The loop runner polls `/api/loop/queue`, marks work started, runs `claude --print "/start-task $ticket_key"`, then reports completion back to the backend.

### 6. Remote inference workflow

The Mac is the main orchestration environment. Treat `ai-server2` as a remote inference dependency, not the home of the full system.

Typical remote inference shape:

```bash
WHISPER_BACKEND=remote
WHISPER_REMOTE_URL=http://<ai-server2>:8000
OLLAMA_URL=http://<ai-server2>:11434
```

### 7. Container workflow

When a containerized dev shell is useful, use the checked-in Compose setup:

```bash
docker compose up -d
docker compose exec agent bash
docker compose down
```

## Verification Commands

Use repo-native verification before claiming success.

Full Python validation:

```bash
bash scripts/ci_check.sh
```

This runs:

- `ruff check .`
- `ruff format --check .`
- `pytest -q --cov=src --cov-report=term-missing --cov-fail-under=80`

Focused validation:

```bash
pytest tests/ -xvs
pytest tests/voice_pipeline/ -xvs
pytest tests/monitor/ -xvs
pytest tests/chatgpt_companion/ -xvs
pytest tests/agent/ -xvs
pytest tests/integrations/ -xvs
ruff check .
ruff format --check .
```

Workspace validation:

```bash
npm run test
npm run build
npm run lint
npm --prefix chatgpt-companion/web run build
```

## Environment Notes

- Python version target is `>=3.11`.
- Install Python dependencies with `pip install -r requirements.txt` or `pip install -e ".[dev]"`.
- Root JS workspace commands are driven by `package.json`.
- Example environment values live in `.env.example`.
- `pytest` is configured in `pyproject.toml` with markers: `unit`, `integration`, `e2e`, and `slow`.

## Agent Guardrails

- Prefer the checked-in scripts over one-off shell pipelines when a script already exists.
- Keep changes small and consistent with existing service boundaries.
- Respect unrelated user changes in the worktree.
- Do not assume old or speculative docs are still authoritative.
- Do not claim the repo is ready, fixed, or passing without running the relevant command fresh and reporting the actual result.
