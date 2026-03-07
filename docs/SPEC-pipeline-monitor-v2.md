# SEJFA Pipeline Monitor v2 — PRD

> Archive status: speculative companion-project plan.
> This document is preserved for planning history. It is not a canonical description of the root repo, and it must not override the loop-first architecture described in `README.md` and `docs/ARCHITECTURE.md`.
> `ELECTRON-sejfa` is a companion project, not the root identity of SEJFA.

**Author:** Simon + Claude Opus 4.6
**Date:** 2026-02-24
**Status:** Draft (v2 — reconciled with ELECTRON-sejfa)
**Location:** `agentic-devops-loop/` (backend) + `ELECTRON-sejfa/` (frontend)

---

## Problem Statement

The Ralph Loop (autonomous TDD agent) runs unobserved. Two monitors exist but neither solves the problem:

1. **grupp-ett-github Flask monitor** — 5 hardcoded neon nodes, no persistence, broken hook integrations, zero actual metrics. Dead code.
2. **ELECTRON-sejfa** — Sophisticated Electron 33 desktop app with orbital reactor, TDD phase tracking, quality gates, kill switch, process management. BUT: no persistence, no real metrics, no cost tracking, no stuck detection, no OTEL. It looks amazing and does almost nothing with real data.

When the agent loops 15 times on the same failing test or burns $8 in tokens on a trivial ticket, nobody knows until it's too late.

**Who is affected:** Simon (sole operator of the pipeline).
**Impact of not solving:** Wasted tokens/cost, undetected stuck loops, false completion claims, no historical data to improve the pipeline.

---

## Existing Asset: ELECTRON-sejfa

**Repo:** `https://github.com/itsimonfredlingjack/ELECTRON-sejfa.git`
**Stack:** Electron 33, React 19, Zustand 5, Framer Motion, Socket.IO, Tailwind CSS 4, Biome, Vitest, Playwright

### What it already has (KEEP)
- Orbital reactor with 5 pipeline nodes (Jira → Agent → Actions → Deploy → Verify)
- TDD phase visualization (red/green/refactor/verify/idle/offline)
- Quality gates panel with evidence drawer
- Kill switch (two-phase arm/confirm, 5s timeout)
- Process management (monitor, agent, logTail via ChildProcessManager)
- FileTailService — polls `ralph-state.json` every 1.5s
- Socket.IO bridge (loop_update, gate_change, agent_event, health)
- HUD aesthetic with chaos level, scanlines, sound effects
- Keyboard shortcuts
- Zustand stores (loop-store, system-store)
- Full dev toolchain (Biome, Vitest, Playwright, TypeScript strict)

### What it's missing (BUILD)
- **OTEL integration** — no telemetry data whatsoever
- **Persistent storage** — Zustand resets on restart, no SQLite, no history
- **Stuck detection** — no timeout logic, no pattern matching
- **Cost tracking** — no token counting, no USD calculation
- **Historical sessions** — no queryable data, no trend analysis
- **Langfuse traces** — nothing
- **Real metrics from hooks** — FileTail reads ralph-state.json (basic) but hooks don't send structured event data
- **Completion verification** — no pytest/ruff/git status parsing on DONE

---

## Strategy: ELECTRON-sejfa = Frontend, Monitor API = Backend

Instead of building a new React web dashboard, we enhance ELECTRON-sejfa with real data from a new Monitor API backend. The Electron app already has the visualization — it just needs the intelligence layer behind it.

```
ELECTRON-sejfa (existing UI)          Monitor API (NEW, FastAPI :8100)
  ├── Orbital Reactor ←──────────────── pipeline stage events
  ├── Quality Gates ←────────────────── gate pass/fail from hooks
  ├── TDD Phase ←────────────────────── test results parsed
  ├── Cost Counter (NEW) ←───────────── token/USD accumulator
  ├── Stuck Alert (NEW) ←────────────── pattern detection
  ├── Session History (NEW) ←─────────── SQLite queries
  ├── Completion Panel (NEW) ←────────── pytest/ruff/git on DONE
  └── Kill Switch (existing)            │
                                        │
  Socket.IO / WebSocket ←──────────────┘
  FileTailService (existing, kept as fallback)
```

---

## Goals

1. **Stuck detection** — Know within seconds if the agent is looping on the same test or tool call pattern
2. **Cost visibility** — See token usage and USD cost per ticket, per session, cumulative
3. **Outcome verification** — Did the agent actually solve the ticket, or did it claim DONE while tests fail?
4. **Historical data** — Persistent storage so metrics survive restarts and enable trend analysis
5. **Single-pane view** — ELECTRON-sejfa becomes that single pane, enhanced with real data

---

## Non-Goals

1. **Multi-agent swim lanes** — Only one Claude Code instance runs at a time. No agent_id routing needed.
2. **Cloud deployment** — This runs on Mac only. No Azure, no Hetzner, no cloud hosting.
3. **Replacing voice pipeline monitoring** — The Tauri app WebSocket monitor for voice→Jira works fine. Don't touch it.
4. **Rebuilding ELECTRON-sejfa UI** — The orbital reactor and HUD aesthetic is kept. We ADD panels, not replace them.
5. **Langfuse as hard dependency** — It's a nice-to-have layer, not a blocker for MVP.
6. **New web dashboard** — No separate React app. ELECTRON-sejfa IS the dashboard.

---

## Architecture Overview

Three layers, all self-hosted on Mac:

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 1: Data Collection                                │
│                                                          │
│  Claude Code ──OTEL──→ OTEL Collector (Docker)           │
│       │                    ├→ Prometheus (metrics)        │
│       │                    └→ Loki (logs/events)          │
│       │                                                  │
│       └──Hooks──→ monitor_hook.py ──POST──→ Monitor API  │
│         (PreToolUse, PostToolUse, Stop)      (FastAPI)   │
│                                              ↓           │
│       ralph-state.json ──FileTail──→ ELECTRON-sejfa      │
│         (existing fallback,              (direct)        │
│          kept for basic loop state)                      │
│                                           SQLite         │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  LAYER 2: Analysis & Storage (NEW — agentic-devops-loop)│
│                                                          │
│  Monitor API (FastAPI, port 8100):                       │
│  - Receives hook events via POST /events                 │
│  - Stores in SQLite (persistent)                         │
│  - Computes derived metrics:                             │
│    · iteration count per ticket                          │
│    · test pass/fail ratio                                │
│    · stuck detection (same tool+args repeated 3x)        │
│    · cost accumulator (from OTEL token data)             │
│  - Broadcasts via WebSocket /ws (JSON events)            │
│  - Broadcasts via Socket.IO /monitor (for ELECTRON-sejfa)│
│  - Exposes REST API for historical queries               │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  LAYER 3: Visualization                                  │
│                                                          │
│  ELECTRON-sejfa (existing desktop app):                  │
│  - ENHANCED: Socket.IO client connects to Monitor API    │
│    (in addition to existing Flask backend)               │
│  - NEW COMPONENTS:                                       │
│    · CostCounter — live USD, color-coded thresholds      │
│    · StuckAlert — red banner when pattern detected        │
│    · SessionHistory — historical sessions list           │
│    · CompletionPanel — pytest/ruff/git on DONE           │
│  - EXISTING KEPT:                                        │
│    · OrbitalReactor — now driven by real pipeline events  │
│    · QualityGates — now driven by real hook data          │
│    · KillSwitch — unchanged                              │
│    · FileTailService — kept as fallback/complement        │
│                                                          │
│  Grafana (OTEL dashboards, Docker, port 3000):           │
│  - Cost trends over time                                 │
│  - Token breakdown by model/tool                         │
│  - Tool frequency analysis                               │
│  - Historical deep-dive (complements ELECTRON-sejfa)     │
└─────────────────────────────────────────────────────────┘
```

---

## User Stories

### As the pipeline operator, I want to...

**US-1:** See a live timeline of every tool call the agent makes in ELECTRON-sejfa, so I can tell what it's doing right now.
- Acceptance: Socket.IO events from Monitor API flow to ELECTRON-sejfa within 1 second
- Each event shows: timestamp, tool name, success/fail, duration, truncated args
- Orbital reactor nodes light up based on which pipeline stage is active

**US-2:** Get an automatic alert when the agent is stuck in a loop, so I can intervene before it burns tokens.
- Acceptance: If the same tool+arguments pattern repeats 3+ times within 5 minutes, a "STUCK" alert appears in ELECTRON-sejfa
- Alert includes: which pattern is repeating, how many times, estimated tokens burned
- Chaos level in HUD increases when stuck

**US-3:** See the cost of the current session in real-time, so I can kill expensive runs early.
- Acceptance: Running USD counter visible in ELECTRON-sejfa at all times, updated per tool call
- Breakdown available: input tokens, output tokens, cache hits
- Color-coded: green (<$1), yellow ($1-5), red (>$5)

**US-4:** Verify that the agent actually solved the ticket after it claims DONE, so I catch false completions.
- Acceptance: When agent outputs `<promise>DONE</promise>`, ELECTRON-sejfa shows:
  - Last pytest output (pass/fail count)
  - Last ruff output (clean/errors)
  - Git diff summary (files changed, lines added/removed)
  - PR URL if created
  - Verdict badge: LEGIT ✓ or SUSPICIOUS ⚠

**US-5:** View historical session data, so I can analyze trends across tickets.
- Acceptance: All events persisted in SQLite, queryable by ticket ID, date range
- Summary stats: avg cost per ticket, avg iterations, avg time-to-PR, success rate
- Accessible via both ELECTRON-sejfa session list and Grafana dashboards

**US-6:** See Grafana dashboards for aggregate OTEL metrics without custom code.
- Acceptance: Docker Compose brings up collector + Prometheus + Loki + Grafana
- Pre-imported dashboards show: cost trends, token usage, tool frequency, API latency

---

## Requirements

### P0 — Must Have (MVP)

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| R1 | **OTEL telemetry enabled** | `CLAUDE_CODE_ENABLE_TELEMETRY=1` set, collector receives data |
| R2 | **Docker Compose for OTEL stack** | `docker compose -f docker-compose.monitor.yml up` starts collector + Prometheus + Loki + Grafana |
| R3 | **Grafana dashboards imported** | Cost, tokens, tool usage panels visible on first boot |
| R4 | **Hook event collection** | `monitor_hook.py` rewritten (fix broken imports), POSTs structured JSON to Monitor API |
| R5 | **Monitor API (FastAPI :8100)** | Receives events, stores in SQLite, broadcasts via Socket.IO + WebSocket |
| R6 | **ELECTRON-sejfa Socket.IO integration** | New Socket.IO channel connecting to Monitor API alongside existing Flask connection |
| R7 | **Stuck detection** | Backend detects repeating patterns, emits alert event to ELECTRON-sejfa |
| R8 | **Live cost counter in ELECTRON-sejfa** | New CostCounter component, visible USD updated per event |
| R9 | **Session summary on DONE** | CompletionPanel in ELECTRON-sejfa shows pytest/ruff/git status |
| R10 | **SQLite persistence** | Events survive process restarts, stored in `data/monitor.db` |

### P1 — Nice to Have

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| R11 | **Langfuse integration** | Stop hook sends traces to self-hosted Langfuse for detailed reasoning inspection |
| R12 | **Historical query API + Session History view** | `GET /api/sessions?ticket=DEV-42` + SessionHistory component in ELECTRON-sejfa |
| R13 | **Real-data orbital reactor** | OrbitalReactor nodes driven by actual pipeline events from Monitor API (not just FileTail) |
| R14 | **Coverage delta tracking** | Parse coverage reports to show % change per iteration |

### P2 — Future

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| R15 | **SigNoz migration** | Replace Prometheus+Loki+Grafana with SigNoz single binary |
| R16 | **Multi-agent support** | If/when multiple Claude Code instances run |
| R17 | **Automated kill switch** | Auto-terminate agent if cost exceeds threshold (enhance existing kill switch) |

---

## Technical Design

### File Structure — Monitor API (in agentic-devops-loop/)

```
src/monitor/
├── __init__.py
├── api.py                  # FastAPI app (port 8100)
├── models.py               # SQLAlchemy models (Event, Session)
├── stuck_detector.py       # Pattern matching for loop detection
├── cost_tracker.py         # Token → USD calculation
├── ws_manager.py           # WebSocket + Socket.IO broadcast manager
└── config.py               # Monitor configuration

.claude/hooks/
├── monitor_hook.py         # REWRITTEN: PreToolUse + PostToolUse → POST /events
└── monitor_client.py       # REWRITTEN: Simple HTTP client to Monitor API

docker-compose.monitor.yml  # OTEL Collector + Prometheus + Loki + Grafana
config/
├── otel-collector.yml      # Collector pipeline config
├── prometheus.yml           # Prometheus scrape config
└── grafana/
    └── dashboards/         # Pre-built dashboard JSON
        └── claude-code.json

data/
└── monitor.db              # SQLite (gitignored)

tests/monitor/              # All monitor tests
├── test_api.py
├── test_stuck_detector.py
├── test_cost_tracker.py
└── test_hooks.py
```

### File Structure — ELECTRON-sejfa changes (in ELECTRON-sejfa/)

```
src/renderer/
├── components/
│   ├── cost-counter.tsx        # NEW: Live USD display
│   ├── stuck-alert.tsx         # NEW: Red banner for stuck detection
│   ├── completion-panel.tsx    # NEW: Pytest/ruff/git on DONE
│   ├── session-history.tsx     # NEW: Historical sessions list (P1)
│   ├── orbital-reactor.tsx     # ENHANCED: driven by real Monitor API events
│   └── ... (existing components unchanged)
├── stores/
│   ├── loop-store.ts           # ENHANCED: add cost, stuck, completion state
│   └── system-store.ts         # ENHANCED: add monitor-api connection status
└── hooks/
    └── use-monitor-api.ts      # NEW: Socket.IO connection to Monitor API

src/main/
├── socket-bridge.ts            # ENHANCED: add Monitor API as second Socket.IO target
└── ... (existing files unchanged)
```

### Hook Event Schema

```json
{
  "event_id": "uuid",
  "session_id": "claude-code-session-id",
  "ticket_id": "DEV-42",
  "timestamp": "2026-02-24T14:30:00Z",
  "event_type": "pre_tool_use | post_tool_use | stop | prompt_submit",
  "tool_name": "Bash | Edit | Read | Write | ...",
  "tool_args_hash": "sha256-of-args-for-dedup-detection",
  "tool_args_summary": "pytest tests/ -xvs (truncated)",
  "success": true,
  "duration_ms": 1234,
  "tokens": {
    "input": 500,
    "output": 200,
    "cache_read": 1000
  },
  "cost_usd": 0.0042,
  "error": null
}
```

### Monitor API → ELECTRON-sejfa Socket.IO Events

```typescript
// New events emitted by Monitor API (Socket.IO namespace: /monitor)
interface MonitorEvents {
  'tool_event': HookEvent;           // Every tool call
  'stuck_alert': StuckAlert;         // Pattern detected
  'cost_update': CostUpdate;         // Running USD total
  'session_start': SessionInfo;      // New session began
  'session_complete': CompletionInfo; // DONE/FAILED/BLOCKED
  'pipeline_stage': PipelineStage;   // Which node is active (for orbital reactor)
}
```

### Stuck Detection Algorithm

```python
# In stuck_detector.py
# Window: last 10 events
# Pattern: same (tool_name, tool_args_hash) appears 3+ times
# Result: emit "stuck_alert" event with pattern details
# Reset: on new unique tool call or manual reset
```

### Cost Calculation

```python
# Claude Opus 4.6 pricing (as of 2026-02):
# Input:  $15 / 1M tokens
# Output: $75 / 1M tokens
# Cache read: $1.50 / 1M tokens
# Cache creation: $18.75 / 1M tokens
# Configurable in config.py for model changes
```

### OTEL Environment Variables

```bash
# Added to Claude Code launch environment
CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

---

## Success Metrics

### Leading (change within days)

| Metric | Target | How measured |
|--------|--------|-------------|
| Time to detect stuck loop | < 30 seconds | Alert timestamp vs first repeated event |
| ELECTRON-sejfa event latency | < 1 second | Hook timestamp vs Socket.IO receive |
| ELECTRON-sejfa boot to data | < 3 seconds | App start to first event displayed |

### Lagging (change over weeks)

| Metric | Target | How measured |
|--------|--------|-------------|
| Avg cost per ticket | Track baseline, reduce 20% | SQLite aggregation |
| False DONE rate | < 5% | Completion events where tests actually failed |
| Avg iterations per ticket | Track baseline | Session event counts |
| Time-to-PR | Track baseline, reduce 15% | First event → PR creation event |

---

## Open Questions

| # | Question | Owner | Impact |
|---|----------|-------|--------|
| 1 | Does `CLAUDE_CODE_ENABLE_TELEMETRY=1` work in Claude Code hooks context or only in direct sessions? | Engineering (test it) | Determines if OTEL layer works at all |
| 2 | Should Monitor API run as a systemd service or just `uvicorn` in background? | Simon | Affects reliability |
| 3 | ELECTRON-sejfa currently connects to Flask backend — do we keep Flask AND add Monitor API, or replace Flask with Monitor API? | Simon | Affects socket-bridge.ts changes |
| 4 | ELECTRON-sejfa repo — should it stay separate or merge into agentic-devops-loop monorepo? | Simon | Affects CI/CD and dev workflow |

---

## Timeline Considerations

- **No hard deadline** — quality over speed
- **Dependency:** OTEL telemetry must be verified working before building dashboards on top of it
- **Phase 1:** OTEL stack + fixed hooks + Monitor API + SQLite (foundation) — all in agentic-devops-loop
- **Phase 2:** ELECTRON-sejfa integration + new components (cost, stuck, completion) — in ELECTRON-sejfa repo
- **Phase 3:** Langfuse integration + historical analytics (depth)
- **Risk:** If Claude Code OTEL doesn't emit the data we expect, we fall back to hooks-only approach (still works, just no Grafana)
