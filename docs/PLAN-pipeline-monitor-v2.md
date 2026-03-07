# Implementation Plan: SEJFA Pipeline Monitor v2

> Archive status: speculative implementation plan for a companion monitoring direction.
> This file is kept as planning history. It is not the source of truth for the current root repo architecture.
> For the canonical project story, use `README.md` and `docs/ARCHITECTURE.md`.

**Spec:** `docs/SPEC-pipeline-monitor-v2.md`
**Backend:** `agentic-devops-loop/` (Monitor API, hooks, OTEL stack)
**Frontend:** `ELECTRON-sejfa/` (existing Electron desktop app, enhanced)
**Single agent, Mac only, self-hosted**

---

## Phase 1: Foundation (OTEL + Monitor API + Fixed Hooks)

All work in `agentic-devops-loop/` repo.

### Step 1.1: Verify OTEL Telemetry Works

**Goal:** Confirm Claude Code emits OTEL data when enabled.

```bash
# Test locally
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
# Run a short Claude Code session and check if collector receives spans
```

- If it works → proceed with Docker stack
- If it doesn't → skip OTEL layer entirely, go hooks-only (still works, just no Grafana)

**Output:** Boolean — OTEL works or doesn't. Document finding in this file.

### Step 1.2: Docker Compose for OTEL Stack

**Goal:** One command brings up the full metrics backend.

Create `docker-compose.monitor.yml`:
- OTEL Collector (receives from Claude Code, routes to Prometheus + Loki)
- Prometheus (metrics storage)
- Loki (log/event storage)
- Grafana (visualization, port 3000)

Create `config/otel-collector.yml`:
- OTLP receiver on port 4317 (gRPC) and 4318 (HTTP)
- Prometheus exporter
- Loki exporter

Create `config/prometheus.yml`:
- Scrape OTEL collector metrics endpoint

Create `config/grafana/dashboards/claude-code.json`:
- Import from ColeMurray/claude-code-otel repo
- Panels: cost trends, token breakdown, tool frequency, API latency

**Test:** `docker compose -f docker-compose.monitor.yml up -d` → Grafana accessible at localhost:3000

### Step 1.3: Rewrite Monitor Hook

**Goal:** Fix the broken `monitor_hook.py` so it actually sends data.

Current state: imports `NODE_JIRA`, `NODE_CLAUDE` etc from `monitor_client.py` — those constants don't exist. The whole thing is dead code.

Rewrite `.claude/hooks/monitor_hook.py`:
- Register as PreToolUse and PostToolUse hook
- On PreToolUse: capture tool_name, tool_args, timestamp, generate event_id
- On PostToolUse: capture success, duration, error
- POST structured JSON to `http://localhost:8100/events`
- Include session_id from environment or generate per-process
- Extract ticket_id from branch name or CURRENT_TASK.md
- Hash tool_args for stuck detection (sha256 of sorted JSON)
- Truncate tool_args_summary to 200 chars

Rewrite `.claude/hooks/monitor_client.py`:
- Simple `requests.post()` wrapper
- Fire-and-forget (don't block the agent if monitor is down)
- Timeout: 1 second
- No retries (monitor down = silently skip)

**Test:** Manually POST a test event, verify it arrives at Monitor API.

### Step 1.4: Monitor API (FastAPI)

**Goal:** Receive events, store, broadcast, analyze.

Create `src/monitor/api.py`:
- FastAPI app on port 8100
- `POST /events` — receive hook events, store in SQLite, broadcast via Socket.IO + WebSocket
- `GET /events?session_id=X&limit=50` — query historical events
- `GET /sessions` — list all sessions with summary stats
- `GET /sessions/{id}` — single session detail (events, cost, outcome)
- `GET /status` — current session status (active/idle, ticket, iteration count)
- `WS /ws` — WebSocket for generic clients
- Socket.IO namespace `/monitor` — for ELECTRON-sejfa (emits: tool_event, stuck_alert, cost_update, session_start, session_complete, pipeline_stage)
- `POST /reset` — clear current session

Create `src/monitor/models.py`:
- SQLAlchemy models: `Event`, `Session`
- Event: all fields from hook event schema in spec
- Session: ticket_id, branch, start_time, end_time, total_cost, total_events, outcome

Create `src/monitor/ws_manager.py`:
- Dual broadcast: WebSocket connections + Socket.IO namespace
- JSON serialization of events
- Pipeline stage inference (tool_name → pipeline node mapping for orbital reactor)

Create `src/monitor/config.py`:
- Port (8100), DB path (data/monitor.db), cost rates per model
- Socket.IO CORS config (allow ELECTRON-sejfa origin)

**Test:**
```bash
source venv/bin/activate && pytest tests/monitor/ -xvs
```
- Test event storage and retrieval
- Test Socket.IO broadcast
- Test session aggregation

### Step 1.5: Stuck Detection

**Goal:** Automatically detect when the agent is looping.

Create `src/monitor/stuck_detector.py`:
- Maintains sliding window of last 10 events per session
- Pattern: if same `(tool_name, tool_args_hash)` appears 3+ times in window → stuck
- Emits a `stuck_alert` event via Socket.IO with:
  - pattern description
  - repeat count
  - estimated tokens burned on repeated calls
- Resets when a new unique tool call arrives

**Test:**
- Feed 3 identical events → expect stuck_alert
- Feed 2 identical + 1 different → expect no alert
- Feed 3 identical, then 1 different, then 3 new identical → expect 2 alerts total

### Step 1.6: Cost Tracker

**Goal:** Running USD counter per session.

Create `src/monitor/cost_tracker.py`:
- Accumulates token counts from events
- Calculates USD using configurable rates (default: Opus 4.6 pricing)
- Provides `get_session_cost(session_id)` and `get_current_cost()`
- Emits `cost_update` events via Socket.IO after each event

**Test:** Feed events with known token counts, verify USD calculation matches expected.

---

## Phase 2: ELECTRON-sejfa Integration

All work in `ELECTRON-sejfa/` repo. Requires Phase 1 Monitor API running.

### Step 2.1: Monitor API Socket.IO Connection

**Goal:** ELECTRON-sejfa connects to Monitor API as a second data source.

Modify `src/main/socket-bridge.ts`:
- Add second Socket.IO connection to `http://localhost:8100` namespace `/monitor`
- Keep existing Flask backend connection unchanged (backward compatible)
- Forward Monitor API events to renderer via IPC

Create `src/renderer/hooks/use-monitor-api.ts`:
- Custom hook that listens to Monitor API events via IPC
- Updates loop-store and system-store with real metrics data

Modify `src/renderer/stores/loop-store.ts`:
- Add state: `cost`, `stuckAlert`, `completionInfo`, `sessionHistory`
- Add actions: `setCost`, `setStuckAlert`, `setCompletion`, `addSessionToHistory`

Modify `src/renderer/stores/system-store.ts`:
- Add `monitorApiConnected` state
- Track Monitor API connection status alongside Flask backend

**Test:** Start Monitor API, start ELECTRON-sejfa, verify connection established and events flow.

### Step 2.2: Cost Counter Component

**Goal:** Live USD display in ELECTRON-sejfa.

Create `src/renderer/components/cost-counter.tsx`:
- Large number showing current session cost in USD
- Color-coded: green (<$1), yellow ($1-5), red (>$5) — thresholds configurable
- Breakdown tooltip: input/output/cache tokens
- HUD-consistent styling (matches existing aesthetic)
- Positioned in top bar or status area of main-view

Modify `src/renderer/views/main-view.tsx`:
- Add CostCounter to the layout

### Step 2.3: Stuck Alert Component

**Goal:** Impossible to miss when agent is looping.

Create `src/renderer/components/stuck-alert.tsx`:
- Full-width red banner overlaying top of viewport
- Shows: "STUCK: Bash(pytest tests/ -xvs) repeated 5 times"
- Includes estimated token burn since stuck started
- Dismissible but re-appears if pattern continues
- Integrates with existing chaos level (max chaos when stuck)
- Sound effect trigger (uses existing sound infrastructure)

Modify `src/renderer/views/main-view.tsx`:
- Add StuckAlert overlay, driven by loop-store stuckAlert state

### Step 2.4: Completion Panel Component

**Goal:** Verify DONE claims.

Create `src/renderer/components/completion-panel.tsx`:
- Appears as modal/drawer when `session_complete` event received
- Shows:
  - Last pytest output (parsed: X passed, Y failed)
  - Last ruff output (clean or error count)
  - Git diff summary (files changed, insertions, deletions)
  - PR URL (if created, clickable)
  - Verdict badge: LEGIT ✓ or SUSPICIOUS ⚠ (if tests failed but agent said DONE)
- Integrates with existing evidence drawer pattern

### Step 2.5: Enhanced Orbital Reactor

**Goal:** Drive orbital reactor nodes with real pipeline event data.

Modify `src/renderer/components/orbital-reactor.tsx`:
- Accept `pipeline_stage` events from Monitor API
- Map tool calls to pipeline stages:
  - Jira API calls → Jira node active
  - Claude thinking → Agent node active
  - Bash/Edit/Write → Actions node active
  - Git push/PR → Deploy node active
  - Pytest/ruff → Verify node active
- Keep existing animation and aesthetic
- Add event count badges on each node

### Step 2.6: Integration Testing

**Goal:** Full end-to-end verification.

Test flow:
1. Start Monitor API (`uvicorn src.monitor.api:app --port 8100`)
2. Start ELECTRON-sejfa (`npm run tauri dev` or `npm start`)
3. Start a Ralph Loop on a test ticket
4. Verify in ELECTRON-sejfa:
   - [ ] Orbital reactor nodes light up in sequence
   - [ ] Cost counter increments
   - [ ] Events appear in activity log
   - [ ] Stuck detection fires if agent loops
   - [ ] Completion panel appears on DONE
   - [ ] All data persisted in SQLite after restart

---

## Phase 3: Langfuse Integration (Optional Depth)

### Step 3.1: Self-Host Langfuse

```bash
# Add to docker-compose.monitor.yml
# Langfuse server + ClickHouse/Postgres
# Port 3050
```

### Step 3.2: Stop Hook → Langfuse

- Add Langfuse SDK to Stop hook
- Parse transcript, send as trace with nested spans
- Tag with ticket_id, session_id

### Step 3.3: Link from ELECTRON-sejfa

- Add "View Trace" button in CompletionPanel
- Opens Langfuse UI in browser for that session's detailed trace

---

## Testing Strategy

| Layer | Test Type | Command / Method |
|-------|-----------|-----------------|
| Monitor API | Unit + integration | `source venv/bin/activate && pytest tests/monitor/ -xvs` |
| Stuck detector | Unit | `pytest tests/monitor/test_stuck_detector.py -xvs` |
| Cost tracker | Unit | `pytest tests/monitor/test_cost_tracker.py -xvs` |
| Hooks | Integration (mock API) | `pytest tests/monitor/test_hooks.py -xvs` |
| ELECTRON-sejfa components | Unit | `cd ELECTRON-sejfa && npx vitest` |
| ELECTRON-sejfa E2E | Integration | `cd ELECTRON-sejfa && npx playwright test` |
| OTEL stack | Smoke test | `docker compose up` + verify Grafana panels |
| Full pipeline | Manual E2E | Run Ralph Loop with all systems up |

---

## Definition of Done

### Phase 1 (Backend)
- [ ] `docker compose -f docker-compose.monitor.yml up` starts full OTEL stack
- [ ] Grafana shows cost/token/tool dashboards
- [ ] Hook events flow to Monitor API when Ralph Loop runs
- [ ] Stuck detection fires alert within 30 seconds of pattern
- [ ] Cost tracker calculates correct USD per session
- [ ] All events persisted in SQLite across restarts
- [ ] Monitor API broadcasts via Socket.IO namespace `/monitor`
- [ ] All tests pass: `source venv/bin/activate && pytest tests/monitor/ -xvs`
- [ ] Ruff clean: `source venv/bin/activate && ruff check src/monitor/`

### Phase 2 (Frontend — ELECTRON-sejfa)
- [ ] ELECTRON-sejfa connects to Monitor API via Socket.IO
- [ ] CostCounter shows live USD per session
- [ ] StuckAlert appears when pattern detected
- [ ] CompletionPanel shows pytest/ruff/git on DONE
- [ ] OrbitalReactor driven by real pipeline events
- [ ] Vitest tests pass: `npx vitest run`
- [ ] Biome clean: `npx biome check`

---

## Execution Order (for Claude Code agent)

```
Phase 1 (agentic-devops-loop):
1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6

Phase 2 (ELECTRON-sejfa):
2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6

Phase 3 (optional):
3.1 → 3.2 → 3.3
```

Start with 1.1 (verify OTEL) — it's a 5-minute test that determines if the whole OTEL layer is viable or if we go hooks-only.

Phase 2 can start as soon as Step 1.4 (Monitor API) is running — the Electron integration doesn't need stuck detection or cost tracking to be complete first, those can be wired up incrementally.
