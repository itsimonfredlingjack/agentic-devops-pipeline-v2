# GEMINI.md

## Project Overview

**SEJFA** is an **agentic software-delivery loop**. The core product is an autonomous execution cycle where tasks (from Jira or voice) are planned, implemented, verified, and reviewed. Voice input and monitoring are supportive layers around this loop.

### Core Architecture
- **Voice Start Layer**: A FastAPI backend (`services/voice-pipeline`) that handles audio transcription (Whisper), intent extraction (Ollama), and Jira ticket creation.
- **Ralph Loop**: The autonomous execution cycle within the system, typically driven by Claude Code.
- **Monitoring Companion**: A FastAPI service (`services/monitor-api`) that receives observability events via Claude hooks (`.claude/hooks`) and provides session analysis.
- **Desktop Interface**: An Electron/React/TypeScript application (`desktop/`) that serves as a control surface.
- **ChatGPT Companion**: An MCP server and web widget (`src/chatgpt_companion`, `chatgpt-companion/web`) for inspecting the system from ChatGPT.
- **Loop Engine**: The execution boundary that polls for pending work and dispatches tasks to the Ralph Loop.

## Tech Stack
- **Backend**: Python 3.11+, FastAPI, Uvicorn, Pydantic, SQLAlchemy, aiosqlite.
- **Frontend/Desktop**: TypeScript, React, Electron, Vite, Tailwind CSS (in some parts).
- **AI/ML**: faster-whisper (transcription), Ollama (intent extraction), Claude Code (execution).
- **Inference**: Remote node (`ai-server2`) for GPU-heavy workloads.
- **Tooling**: Ruff (Python linting/formatting), Pytest, NPM Workspaces.

## Building and Running

### Prerequisites
- Python >= 3.11
- Node.js (for desktop/packages)
- Ollama (running locally or remotely)
- Tailscale (if accessing `ai-server2`)

### Installation
```bash
# Python dependencies
pip install -r requirements.txt
# or for development
pip install -e ".[dev]"

# Node dependencies
npm install
```

### Key Services

| Service | Command | Port |
|---------|---------|------|
| **Voice Pipeline** | `PYTHONPATH=services/voice-pipeline/src uvicorn voice_pipeline.main:app --host 0.0.0.0 --port 8000 --reload` | 8000 |
| **Monitor API** | `PYTHONPATH=services/monitor-api/src uvicorn monitor.api:app --host 0.0.0.0 --port 8100` | 8100 |
| **Desktop App** | `npm --workspace desktop run electron:dev` | 5173 (Vite) |
| **ChatGPT Companion** | `./scripts/start-chatgpt-companion.sh start` | 8787 |

### Local Dev Orchestrator
Use the provided script to manage the local stack:
```bash
./scripts/start-sejfa-local.sh start|status|stop
```

## Development Conventions

### Python
- **Type Hints**: Mandatory for all new code.
- **Linting/Formatting**: Use `ruff`. Run `ruff check .` and `ruff format .`.
- **Tests**: Use `pytest`. Run `pytest tests/ -xvs`. Coverage target is >80%.
- **Structure**: Source in `src/` and `services/*/src/`, tests in `tests/` mirroring source.

### Git & Branching
- **Branch Naming**: `{type}/{JIRA-ID}-{slug}` (e.g., `feature/DEV-42-oauth-login`).
- **Commit Messages**: `DEV-42: Clear description of the change`.
- **Workflows**:
  - `bash scripts/preflight.sh`: Readiness check before starting tasks.
  - `./scripts/create-branch.sh`: Helper for branch creation.
  - `./scripts/create-pr.sh`: Helper for creating PRs.

### Verification Workflow
Before claiming success, run:
```bash
bash scripts/ci_check.sh
# or manually
ruff check . && ruff format --check . && pytest tests/
```

## Repository Truths
1. **SEJFA is the loop.** Don't redefine it as just a voice or monitor app.
2. **The Mac is the orchestrator.** `ai-server2` is for inference only.
3. **Scripts are authoritative.** Use `scripts/` instead of ad-hoc commands where possible.
4. **Archive docs are historical.** Prioritize `README.md`, `CLAUDE.md`, and `AGENTS.md`.
