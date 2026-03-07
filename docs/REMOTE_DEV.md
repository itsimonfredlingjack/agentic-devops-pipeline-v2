# Remote Dev Workflow

This document describes the current remote-development story for SEJFA.

## Current Topology

The current canonical topology is:

- the **Mac** runs the SEJFA backend, voice client, and Ralph Loop
- **ai-server2** provides remote inference for Whisper and Ollama
- remote development scripts exist to help you reach `ai-server2`, but they do not redefine `ai-server2` as the home of the whole system

## Recommended Current Setup

### 1. Run the SEJFA backend on the Mac

```bash
uvicorn src.voice_pipeline.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Point inference to ai-server2

Typical environment shape:

```text
WHISPER_BACKEND=remote
WHISPER_REMOTE_URL=http://<ai-server2>:8000
OLLAMA_URL=http://<ai-server2>:11434
```

This keeps the loop and orchestration local while offloading heavy inference work.

### 3. Use the voice app locally

```bash
cd voice-app
npm run tauri dev
```

The voice client defaults to talking to `http://localhost:8000`.

## What ai-server2 Is For

`ai-server2` should be treated as:

- a remote Whisper endpoint
- a remote Ollama endpoint
- a machine you can shell into for inference-related setup or debugging

It should not be described as the current home of the entire SEJFA application unless the topology is intentionally changed.

## Helper Shell Access

If you want a persistent shell on `ai-server2`, this helper still exists:

```bash
bash scripts/remote-dev-shell.sh ai-server2 /home/ai-server2/04-voice-mode-4-loop coffeedev
```

Use it as an access convenience, not as proof that the full backend belongs there.

## Verification

### Verify local backend

```bash
curl -i http://localhost:8000/health
```

### Verify remote Ollama path

```bash
curl -i http://<ai-server2>:11434/api/tags
```

### Verify remote Whisper path

Check the configured `WHISPER_REMOTE_URL` endpoint and confirm the remote transcription service is reachable.

## Legacy Topology Note

Older docs in this repo describe a previous setup where the full backend ran on `ai-server2` and the Mac used a reverse tunnel into it.

That older topology is now archive context only:

- useful if you are debugging old scripts
- not the current recommended SEJFA architecture
- should not be used as the default explanation in new docs

## Related Docs

- [`/Users/coffeedev/Projects/03_AGENTIC-DEVOPS/agentic-devops-pipeline-v2/README.md`](../README.md)
- [`/Users/coffeedev/Projects/03_AGENTIC-DEVOPS/agentic-devops-pipeline-v2/docs/ARCHITECTURE.md`](ARCHITECTURE.md)
- [`/Users/coffeedev/Projects/03_AGENTIC-DEVOPS/agentic-devops-pipeline-v2/voice-app/ARCHITECTURE.md`](../voice-app/ARCHITECTURE.md)
