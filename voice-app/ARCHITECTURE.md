# Voice Start Layer Architecture

> Subsystem document.
> This file explains the voice start layer inside SEJFA. It does not define the whole project.

## Role In SEJFA

The voice app is the intake path that helps start or feed the SEJFA loop.

Its job is to:

- capture spoken input on the Mac
- send audio to the backend
- receive transcription and clarification status
- help create Jira-ready task context
- feed that work into the queue and broader Ralph Loop

The voice app is not the primary identity of SEJFA. SEJFA remains the loop-first system.

## Topology

```text
Electron app on Mac
  -> FastAPI backend on Mac
  -> remote Whisper / Ollama on ai-server2 when configured
  -> Jira issue creation and loop queueing
```

## Responsibilities

### `voice-app/`

Desktop interaction layer.

- microphone capture
- waveform and recording UX
- audio preview and send flow
- clarification UI
- WebSocket status display
- Electron shell and packaging

### `src/voice_pipeline/`

Backend for the voice start layer.

- transcription routing
- intent extraction
- ambiguity clarification
- Jira issue creation
- loop queue integration

### `ai-server2`

Remote inference node.

- Whisper service when `WHISPER_BACKEND=remote`
- Ollama service for intent extraction

## Current Runtime Shape

### Mac

- runs the Electron voice app
- runs the FastAPI backend on `:8000`
- owns the local orchestration flow and queueing

### ai-server2

- provides remote GPU-backed inference when configured
- is not the canonical home of the full SEJFA backend story

## Current Data Flow

```text
1. User records audio in the Electron renderer
2. App sends audio to the configured backend URL
3. Backend transcribes locally or remotely
4. Backend extracts Jira intent with Ollama
5. Backend either asks for clarification or creates/queues work
6. Status flows back to the client over WebSocket
```

## Key Files

### Frontend

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main voice flow orchestration |
| `src/stores/pipelineStore.ts` | App state for recording, preview, status, clarification, result |
| `src/lib/ws.ts` | WebSocket client for backend status |
| `src/components/RecordButton.tsx` | Record UX |
| `src/components/AudioPreview.tsx` | Send or discard captured audio |
| `src/components/ClarificationDialog.tsx` | Clarification rounds |
| `src/components/SuccessCard.tsx` | Result display |

### Electron

| File | Purpose |
|------|---------|
| `electron/main.ts` | BrowserWindow lifecycle and safe desktop integrations |
| `electron/preload.ts` | Narrow contextBridge API |
| `src/lib/audioCapture.ts` | Renderer-side mic capture, WAV encoding, and HTTP upload |

### Backend

| File | Purpose |
|------|---------|
| `src/voice_pipeline/main.py` | HTTP and WebSocket entrypoints |
| `src/voice_pipeline/pipeline/orchestrator.py` | Voice intake orchestration |
| `src/voice_pipeline/transcriber/remote.py` | Remote Whisper path |
| `src/voice_pipeline/intent/extractor.py` | Ollama-based intent extraction |
| `src/voice_pipeline/persistent_loop_queue.py` | Queue persistence |

## Practical Notes

- the client defaults to `http://localhost:8000`
- the backend can use `WHISPER_BACKEND=remote`
- `OLLAMA_URL` can point at `ai-server2`
- this subsystem should be documented as the start layer into the loop, not as the whole SEJFA story

## Related Canonical Docs

- [`/Users/coffeedev/Projects/03_AGENTIC-DEVOPS/agentic-devops-pipeline-v2/README.md`](../README.md)
- [`/Users/coffeedev/Projects/03_AGENTIC-DEVOPS/agentic-devops-pipeline-v2/docs/README.md`](../docs/README.md)
- [`/Users/coffeedev/Projects/03_AGENTIC-DEVOPS/agentic-devops-pipeline-v2/docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)
