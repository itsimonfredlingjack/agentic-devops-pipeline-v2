# SEJFA Architecture

> Canonical architecture document for the root repo.
> Verified against repo contents on 2026-03-07.

## One-Sentence Definition

SEJFA is an agentic software-delivery loop that turns incoming work into an autonomous cycle of execution, verification, review, and follow-up.

## Terminology

Use these terms consistently across the repo:

| Term | Meaning |
|------|---------|
| **SEJFA** | The loop-first system |
| **Ralph Loop** | The autonomous execution cycle inside SEJFA |
| **Voice start layer** | The audio, transcription, and intent path that starts or feeds the loop |
| **ai-server2** | The remote inference machine used for Whisper and Ollama workloads |
| **Monitor / command center** | Companion observability and control tooling around the loop |

## Architecture At A Glance

```text
voice start or Jira context
  -> task intake and queueing
  -> Ralph Loop execution in Claude Code
  -> verification gates
  -> review feedback
  -> deployment or follow-up work
```

The loop is the system. The voice layer and monitoring layer exist around it.

## System Roles

### 1. Core Loop

The core loop is the product identity of SEJFA.

Its responsibilities are:

- receive work from Jira or a voice-driven intake path
- establish execution context for the task
- run the Ralph Loop through implementation and verification
- surface completion, blockage, or failure
- feed review outcomes back into the next task cycle

### 2. Voice Start Layer

The voice start layer is a subsystem that helps start or feed the loop.

In this repo it consists of:

- `voice-app/` for desktop audio capture and user interaction
- `src/voice_pipeline/` for transcription, intent extraction, Jira issue creation, and queueing

This layer is important, but it does not redefine SEJFA as "the voice app."

### 3. Monitor Companion

The monitor layer is a companion surface that observes the loop.

In this repo it consists of:

- `.claude/hooks/monitor_hook.py`
- `.claude/hooks/monitor_client.py`
- `src/monitor/`

`ELECTRON-sejfa/` is a separate companion project embedded as a nested git repository. It is not the root identity of this repo.

## Current Repo Boundaries

### Source Packages

| Path | Role |
|------|------|
| `src/voice_pipeline/` | Voice start layer backend |
| `src/monitor/` | Monitor API companion |
| `src/sejfa/` | Shared utilities |

### Apps

| Path | Role |
|------|------|
| `voice-app/` | Tauri voice start client |
| `ELECTRON-sejfa/` | Separate companion command center with its own `.git` |

### Root Hooks

| Path | Role |
|------|------|
| `.claude/hooks/monitor_hook.py` | Sends tool-use lifecycle events to the monitor API |
| `.claude/hooks/monitor_client.py` | Fire-and-forget event transport |

### Scripts

Representative scripts that support the loop and its integrations:

- `scripts/loop-runner.sh`
- `scripts/preflight.sh`
- `scripts/create-branch.sh`
- `scripts/create-pr.sh`
- `scripts/jules_payload.py`
- `scripts/jules_review_api.py`
- `scripts/jules_to_jira.py`
- `scripts/classify_failure.py`

## Machine Topology

### Mac

Primary SEJFA runtime and orchestration environment.

- runs the voice backend on `:8000`
- runs Claude Code and the Ralph Loop
- can run the monitor API on `:8100`
- hosts the Tauri client in local development

### ai-server2

Remote inference node.

- runs Whisper workloads when `WHISPER_BACKEND=remote`
- runs Ollama for intent extraction
- should be treated as a service dependency, not as the whole application host

### Hetzner

Deployment or demo environment for supporting workloads. Not part of the loop identity.

## Current Data Flow

### Canonical loop flow

```text
incoming work
  -> queue or task context
  -> Ralph Loop execution
  -> verification
  -> review outcome
  -> completion or follow-up work
```

### Current voice-path flow

```text
voice-app on Mac
  -> FastAPI backend on Mac
  -> remote Whisper / Ollama on ai-server2 when configured
  -> Jira issue creation
  -> loop queue and pipeline status updates
```

### Current monitor flow

```text
Claude hooks
  -> monitor API
  -> SQLite-backed session/event state
  -> WebSocket / Socket.IO consumers
```

## Repo Truth Versus Archived Narratives

These facts are important when reading older documents:

- the root repo does not currently contain `.github/workflows/`
- the root repo does not currently contain `.claude/skills/` or `.claude/commands/`
- some older docs describe future or historical CI, review, and monitoring setups as if they already exist in the root repo
- `ELECTRON-sejfa/` is a companion project, not the primary product narrative for this repo

## Docs Status

### Canonical

- `README.md`
- `CLAUDE.md`
- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `docs/GUIDELINES.md`
- `docs/REMOTE_DEV.md`

### Subsystem

- `voice-app/ARCHITECTURE.md`

### Archive / speculative / companion

- `docs/SPEC-pipeline-monitor-v2.md`
- `docs/PLAN-pipeline-monitor-v2.md`
- `docs/JULES_INTEGRATION.md`
- `docs/jules-playbook.md`

## Practical Takeaway

When someone asks "what is SEJFA?", the correct answer is:

SEJFA is an agentic delivery loop, with voice as an intake path and monitoring as a companion capability.
