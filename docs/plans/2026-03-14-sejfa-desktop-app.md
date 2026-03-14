# SEJFA Desktop App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a combined voice + monitor Electron desktop app where you speak a task, watch the Ralph Loop execute it live, and know when it's done or stuck.

**Architecture:** Electron + React 18 + TypeScript. Reuse existing `@sejfa/data-client` (HTTP/Socket.IO clients for voice pipeline and monitor API), `@sejfa/shared-types` (all type definitions), and `@sejfa/ui-system` (React components + CSS). The app connects to voice pipeline (`:8000`) and monitor API (`:8100`). Design follows AI-Docs tactical canvas: dark glass `#0a0a0f`, floating panels with `backdrop-filter: blur`, Inter + JetBrains Mono typography, ambient color bleed per loop phase, data pill treatment for machine-produced values.

**Tech Stack:** Electron 35, React 18, TypeScript, Vite, Zustand, CSS Modules, Vitest

**Decomposition Strategy:** Complexity-based (simple shell → voice → monitor → polish)

**Target Model:** Sonnet 30min chunks

---

## Design Reference

### Color System — Loop Phase Colors

| Phase | Variable | Hex | RGB | Use |
|-------|----------|-----|-----|-----|
| Idle | `--phase-idle` | `#8e8e93` | `142,142,147` | Waiting for input |
| Listening | `--phase-listening` | `#30b0c7` | `48,176,199` | Mic recording |
| Processing | `--phase-processing` | `#ff9f0a` | `255,159,10` | Transcribing / extracting |
| Loop Active | `--phase-loop` | `#5856d6` | `88,86,214` | Ralph Loop executing |
| Verifying | `--phase-verify` | `#007aff` | `0,122,255` | Tests/lint running |
| Stuck/Error | `--phase-error` | `#ff375f` | `255,55,95` | Alert |
| Done | `--phase-done` | `#34c759` | `52,199,89` | Completed |

These map to the existing `@sejfa/ui-system` tone system: idle → `idle`, listening → `active`, processing → `warning`, loop → `active`, verifying → `active`, error → `failed`, done → `healthy`.

### Glass Material

```css
/* Standard panel */
background: rgba(0, 0, 0, 0.4);
backdrop-filter: blur(20px);
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
border: 1px solid rgba(255, 255, 255, 0.06);
border-radius: 16px;

/* Canvas background */
background: #0a0a0f;
```

### Typography

- **Inter** — all UI text (headings, buttons, labels)
- **JetBrains Mono** — all machine data (ticket keys, costs, durations, tool names)
- Data pills: `font-mono`, `text-sm`, `px-2 py-0.5`, `rounded-md`, `bg-white/5`

### Layout

```
┌────────────────────────────────────────────────────────┐
│ Window (frameless, drag region at top)                  │
│  ┌──────────┐  ┌────────────────────────────────────┐  │
│  │          │  │                                    │  │
│  │  Voice   │  │         Loop Canvas                │  │
│  │  Rail    │  │                                    │  │
│  │  200px   │  │  Phase indicator + ambient color   │  │
│  │          │  │  Ticket key, elapsed, cost         │  │
│  │  - mic   │  │  Progress visualization            │  │
│  │  - queue │  │                                    │  │
│  │  - conn  │  ├────────────────────────────────────┤  │
│  │          │  │  Event Stream (collapsible)        │  │
│  │          │  │  Live tool events, alerts           │  │
│  └──────────┘  └────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

---

## Task 1: Electron + React Shell with Vite

**Chunk estimate:** ~30 min (Sonnet)

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/electron/main.ts`
- Create: `desktop/electron/preload.ts`
- Create: `desktop/electron/tsconfig.json`
- Create: `desktop/src/main.tsx`
- Create: `desktop/src/App.tsx`
- Create: `desktop/src/index.css`
- Create: `desktop/index.html`
- Create: `desktop/vite.config.ts`
- Create: `desktop/tsconfig.json`
- Modify: `package.json` (root — add `desktop` to workspaces)

**Step 1: Create `desktop/package.json`**

```json
{
  "name": "@sejfa/desktop",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build && tsc -p electron/tsconfig.json",
    "preview": "vite preview",
    "electron:dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "electron:build": "npm run build && electron-builder",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@sejfa/data-client": "file:../packages/data-client",
    "@sejfa/shared-types": "file:../packages/shared-types",
    "@sejfa/ui-system": "file:../packages/ui-system",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "socket.io-client": "^4.8.3",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "concurrently": "^9.1.0",
    "electron": "^35.0.0",
    "electron-builder": "^25.1.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0",
    "wait-on": "^8.0.0"
  }
}
```

**Step 2: Create `desktop/electron/main.ts`**

```typescript
import { app, BrowserWindow, globalShortcut } from "electron";
import path from "node:path";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#0a0a0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  globalShortcut.register("CommandOrControl+Shift+V", () => {
    mainWindow?.webContents.send("global-shortcut", "toggle-voice");
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
```

**Step 3: Create `desktop/electron/preload.ts`**

```typescript
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("sejfa", {
  onGlobalShortcut: (callback: (action: string) => void) => {
    ipcRenderer.on("global-shortcut", (_event, action) => callback(action));
  },
});
```

**Step 4: Create `desktop/electron/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "../dist-electron",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["*.ts"]
}
```

**Step 5: Create `desktop/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SEJFA</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

**Step 6: Create `desktop/src/index.css`**

This is the glass design system — canvas, panels, typography, phase colors, data pills.

```css
:root {
  /* Canvas */
  --canvas-bg: #0a0a0f;

  /* Glass */
  --glass-bg: rgba(0, 0, 0, 0.4);
  --glass-bg-strong: rgba(0, 0, 0, 0.6);
  --glass-border: rgba(255, 255, 255, 0.06);
  --glass-border-hover: rgba(255, 255, 255, 0.1);
  --glass-highlight: rgba(255, 255, 255, 0.05);
  --glass-blur: 20px;
  --glass-blur-strong: 30px;
  --glass-radius: 16px;
  --glass-radius-lg: 20px;

  /* Typography */
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Text */
  --text-primary: rgba(244, 247, 255, 0.96);
  --text-secondary: rgba(201, 213, 236, 0.78);
  --text-tertiary: rgba(153, 169, 201, 0.72);
  --text-muted: rgba(129, 144, 175, 0.56);

  /* Phase colors */
  --phase-idle: #8e8e93;
  --phase-idle-rgb: 142, 142, 147;
  --phase-listening: #30b0c7;
  --phase-listening-rgb: 48, 176, 199;
  --phase-processing: #ff9f0a;
  --phase-processing-rgb: 255, 159, 10;
  --phase-loop: #5856d6;
  --phase-loop-rgb: 88, 86, 214;
  --phase-verify: #007aff;
  --phase-verify-rgb: 0, 122, 255;
  --phase-error: #ff375f;
  --phase-error-rgb: 255, 55, 95;
  --phase-done: #34c759;
  --phase-done-rgb: 52, 199, 89;

  /* Shadows */
  --shadow-panel: 0 20px 60px rgba(0, 0, 0, 0.45);
  --shadow-hud: 0 16px 64px rgba(0, 0, 0, 0.6);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
  background: var(--canvas-bg);
  color: var(--text-primary);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}

/* Drag region for frameless window */
.drag-region {
  -webkit-app-region: drag;
}

.no-drag {
  -webkit-app-region: no-drag;
}

/* Glass panel */
.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  box-shadow: inset 0 1px 0 var(--glass-highlight);
  border: 1px solid var(--glass-border);
  border-radius: var(--glass-radius);
}

.glass-panel-strong {
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur-strong));
  -webkit-backdrop-filter: blur(var(--glass-blur-strong));
  box-shadow: var(--shadow-hud), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--glass-radius-lg);
}

/* Ambient phase bleed */
.phase-bleed {
  background: linear-gradient(160deg, rgba(var(--active-phase-rgb), 0.07) 0%, transparent 60%);
  box-shadow: inset 0 1px 0 rgba(var(--active-phase-rgb), 0.1);
}

/* Data pill */
.data-pill {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
}

/* Event row hover */
.event-row {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 10px 14px;
  transition: all 200ms ease;
}

.event-row:hover {
  border-color: rgba(var(--active-phase-rgb), 0.12);
  background: linear-gradient(160deg, rgba(var(--active-phase-rgb), 0.06), transparent 60%);
  box-shadow: inset 0 1px 0 rgba(var(--active-phase-rgb), 0.08);
}

/* Phase accent line */
.phase-accent::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 20%;
  right: 20%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(var(--active-phase-rgb), 0.6), transparent);
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Step 7: Create `desktop/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Step 8: Create `desktop/src/App.tsx`**

```tsx
export default function App() {
  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        gap: 12,
        padding: 12,
        background: "var(--canvas-bg)",
      }}
    >
      {/* Drag region */}
      <div
        className="drag-region"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 40,
          zIndex: 100,
        }}
      />

      {/* Voice Rail */}
      <aside className="glass-panel" style={{ padding: 18, paddingTop: 48 }}>
        <div style={{ color: "var(--text-muted)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
          SEJFA
        </div>
        <div style={{ fontWeight: 600, fontSize: "1.1rem", marginTop: 6 }}>
          Voice + Monitor
        </div>
      </aside>

      {/* Main area */}
      <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 12, paddingTop: 36 }}>
        {/* Loop Canvas */}
        <main className="glass-panel" style={{ padding: 24, display: "grid", placeContent: "center", textAlign: "center" }}>
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Idle — speak the next objective
          </div>
        </main>

        {/* Event Stream */}
        <section className="glass-panel" style={{ padding: 18, minHeight: 160 }}>
          <div style={{ color: "var(--text-muted)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            Event Stream
          </div>
        </section>
      </div>
    </div>
  );
}
```

**Step 9: Create `desktop/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

**Step 10: Create `desktop/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src"],
  "references": [{ "path": "./electron/tsconfig.json" }]
}
```

**Step 11: Add desktop to root workspaces**

In root `package.json`, add `"desktop"` to the `workspaces` array:

```json
{
  "workspaces": [
    "packages/*",
    "desktop"
  ]
}
```

**Step 12: Install and verify the shell runs**

Run:
```bash
cd desktop && npm install && npm run dev
```

Open `http://localhost:5173` in a browser. Expected: dark canvas with two floating glass panels (Voice Rail left, Loop Canvas + Event Stream right).

Then test Electron:
```bash
cd desktop && npm run electron:dev
```

Expected: frameless Electron window with same content, traffic light buttons in top-left corner.

**Step 13: Commit**

```bash
git add desktop/ package.json
git commit -m "feat: scaffold SEJFA desktop Electron app with glass design system"
```

**Verification Gate:**
1. Automated: `cd desktop && npx tsc --noEmit` — no type errors
2. Manual: `npm run dev` shows glass panels in browser; `npm run electron:dev` shows frameless window
3. Regression: root `npm install` still works with new workspace
4. Review: diff is scoped to `desktop/` + root `package.json` workspace change

> **GATE RULE:** Do not proceed to Task 2 until all four checks pass.

---

## Task 2: Zustand Store + Connection Layer

**Chunk estimate:** ~30 min (Sonnet)

**Files:**
- Create: `desktop/src/stores/appStore.ts`
- Create: `desktop/src/hooks/useConnections.ts`
- Create: `desktop/src/types/electron.d.ts`
- Create: `desktop/src/__tests__/appStore.test.ts`

**Step 1: Write the failing test**

Create `desktop/src/__tests__/appStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../stores/appStore";

describe("appStore", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  it("starts in idle phase", () => {
    const state = useAppStore.getState();
    expect(state.phase).toBe("idle");
  });

  it("tracks voice pipeline connection", () => {
    useAppStore.getState().setVoiceConnected(true);
    expect(useAppStore.getState().voiceConnected).toBe(true);
  });

  it("tracks monitor connection", () => {
    useAppStore.getState().setMonitorConnected(true);
    expect(useAppStore.getState().monitorConnected).toBe(true);
  });

  it("derives phase from pipeline status", () => {
    useAppStore.getState().setPipelineStatus("recording");
    expect(useAppStore.getState().phase).toBe("listening");
  });

  it("derives phase from pipeline status processing", () => {
    useAppStore.getState().setPipelineStatus("processing");
    expect(useAppStore.getState().phase).toBe("processing");
  });

  it("derives phase from loop active", () => {
    useAppStore.getState().setLoopActive(true);
    expect(useAppStore.getState().phase).toBe("loop");
  });

  it("stores cost updates", () => {
    useAppStore.getState().setCost({ session_id: "s1", total_usd: 0.05, breakdown: { input_usd: 0.03, output_usd: 0.02, cache_usd: 0 } });
    expect(useAppStore.getState().cost?.total_usd).toBe(0.05);
  });

  it("appends events", () => {
    const event = {
      event_id: "e1",
      session_id: "s1",
      ticket_id: null,
      timestamp: new Date().toISOString(),
      event_type: "tool_use",
      tool_name: "Read",
    };
    useAppStore.getState().appendEvent(event);
    expect(useAppStore.getState().events).toHaveLength(1);
  });

  it("caps events at 200", () => {
    const store = useAppStore.getState();
    for (let i = 0; i < 210; i++) {
      store.appendEvent({
        event_id: `e${i}`,
        session_id: "s1",
        ticket_id: null,
        timestamp: new Date().toISOString(),
        event_type: "tool_use",
        tool_name: "Read",
      });
    }
    expect(useAppStore.getState().events.length).toBeLessThanOrEqual(200);
  });

  it("stores stuck alerts", () => {
    useAppStore.getState().setStuckAlert({ pattern: "Read", repeat_count: 5, tokens_burned: 10000, since: new Date().toISOString() });
    expect(useAppStore.getState().phase).toBe("error");
  });

  it("stores queue items", () => {
    useAppStore.getState().setQueue([{ key: "DEV-1", summary: "Test task" }]);
    expect(useAppStore.getState().queue).toHaveLength(1);
  });

  it("clears stuck alert", () => {
    useAppStore.getState().setStuckAlert({ pattern: "Read", repeat_count: 5, tokens_burned: 10000, since: new Date().toISOString() });
    useAppStore.getState().clearStuckAlert();
    expect(useAppStore.getState().stuckAlert).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd desktop && npx vitest run src/__tests__/appStore.test.ts`
Expected: FAIL — module not found

**Step 3: Write the store**

Create `desktop/src/stores/appStore.ts`:

```typescript
import { create } from "zustand";
import type {
  PipelineStatus,
  QueueItem,
  EventRecord,
  CostEntry,
  StuckAlert,
  ClarificationState,
  CompletionSummary,
} from "@sejfa/shared-types";

export type LoopPhase =
  | "idle"
  | "listening"
  | "processing"
  | "loop"
  | "verify"
  | "error"
  | "done";

function derivePhase(state: {
  pipelineStatus: PipelineStatus;
  loopActive: boolean;
  stuckAlert: StuckAlert | null;
  completion: CompletionSummary | null;
}): LoopPhase {
  if (state.stuckAlert) return "error";
  if (state.completion) return "done";

  if (state.loopActive) return "loop";

  switch (state.pipelineStatus) {
    case "recording":
      return "listening";
    case "processing":
      return "processing";
    case "clarifying":
      return "processing";
    case "previewing":
      return "processing";
    case "done":
      return "idle";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

const MAX_EVENTS = 200;

interface AppState {
  // Derived
  phase: LoopPhase;

  // Connection
  voiceConnected: boolean;
  monitorConnected: boolean;
  voiceUrl: string;
  monitorUrl: string;

  // Pipeline
  pipelineStatus: PipelineStatus;
  processingStep: string;
  clarification: ClarificationState | null;

  // Loop
  loopActive: boolean;
  ticketKey: string | null;
  sessionId: string | null;
  elapsedMs: number;

  // Monitor
  events: EventRecord[];
  cost: CostEntry | null;
  stuckAlert: StuckAlert | null;
  completion: CompletionSummary | null;
  queue: QueueItem[];

  // Actions
  setVoiceConnected: (connected: boolean) => void;
  setMonitorConnected: (connected: boolean) => void;
  setPipelineStatus: (status: PipelineStatus) => void;
  setProcessingStep: (step: string) => void;
  setClarification: (clarification: ClarificationState | null) => void;
  setLoopActive: (active: boolean) => void;
  setTicketKey: (key: string | null) => void;
  setSessionId: (id: string | null) => void;
  setElapsedMs: (ms: number) => void;
  appendEvent: (event: EventRecord) => void;
  setCost: (cost: CostEntry) => void;
  setStuckAlert: (alert: StuckAlert) => void;
  clearStuckAlert: () => void;
  setCompletion: (completion: CompletionSummary | null) => void;
  setQueue: (items: QueueItem[]) => void;
  reset: () => void;
}

const initialState = {
  phase: "idle" as LoopPhase,
  voiceConnected: false,
  monitorConnected: false,
  voiceUrl: "http://localhost:8000",
  monitorUrl: "http://localhost:8100",
  pipelineStatus: "idle" as PipelineStatus,
  processingStep: "",
  clarification: null,
  loopActive: false,
  ticketKey: null,
  sessionId: null,
  elapsedMs: 0,
  events: [] as EventRecord[],
  cost: null,
  stuckAlert: null,
  completion: null,
  queue: [] as QueueItem[],
};

export const useAppStore = create<AppState>()((set, get) => ({
  ...initialState,

  setVoiceConnected: (connected) => set({ voiceConnected: connected }),
  setMonitorConnected: (connected) => set({ monitorConnected: connected }),

  setPipelineStatus: (status) => {
    const state = get();
    const phase = derivePhase({ ...state, pipelineStatus: status });
    set({ pipelineStatus: status, phase });
  },

  setProcessingStep: (step) => set({ processingStep: step }),
  setClarification: (clarification) => set({ clarification }),

  setLoopActive: (active) => {
    const state = get();
    const phase = derivePhase({ ...state, loopActive: active });
    set({ loopActive: active, phase });
  },

  setTicketKey: (key) => set({ ticketKey: key }),
  setSessionId: (id) => set({ sessionId: id }),
  setElapsedMs: (ms) => set({ elapsedMs: ms }),

  appendEvent: (event) => {
    const events = [event, ...get().events].slice(0, MAX_EVENTS);
    set({ events });
  },

  setCost: (cost) => set({ cost }),

  setStuckAlert: (alert) => {
    set({ stuckAlert: alert, phase: "error" });
  },

  clearStuckAlert: () => {
    const state = get();
    const phase = derivePhase({ ...state, stuckAlert: null });
    set({ stuckAlert: null, phase });
  },

  setCompletion: (completion) => {
    if (completion) {
      set({ completion, phase: "done", loopActive: false });
    } else {
      const state = get();
      const phase = derivePhase({ ...state, completion: null });
      set({ completion: null, phase });
    }
  },

  setQueue: (items) => set({ queue: items }),

  reset: () => set(initialState),
}));
```

**Step 4: Create type declaration for Electron preload**

Create `desktop/src/types/electron.d.ts`:

```typescript
interface SejfaBridge {
  onGlobalShortcut: (callback: (action: string) => void) => void;
}

interface Window {
  sejfa?: SejfaBridge;
}
```

**Step 5: Create connection hook**

Create `desktop/src/hooks/useConnections.ts`:

```typescript
import { useEffect } from "react";
import {
  connectVoicePipelineSocket,
  connectMonitorSocket,
  fetchLoopQueue,
  fetchMonitorStatus,
} from "@sejfa/data-client";
import { useAppStore } from "../stores/appStore";

export function useConnections() {
  const voiceUrl = useAppStore((s) => s.voiceUrl);
  const monitorUrl = useAppStore((s) => s.monitorUrl);

  useEffect(() => {
    const cleanup = connectVoicePipelineSocket(
      () => voiceUrl,
      {
        appendLog: () => {},
        setStatus: (status) => {
          const store = useAppStore.getState();
          const statusMap: Record<string, string> = {
            processing: "processing",
            clarifying: "clarifying",
            done: "done",
            error: "error",
          };
          const mapped = statusMap[status];
          if (mapped) {
            store.setPipelineStatus(mapped as any);
          }
        },
        setProcessingStep: (step) => {
          useAppStore.getState().setProcessingStep(step);
        },
        setWsConnected: (connected) => {
          useAppStore.getState().setVoiceConnected(connected);
        },
        onClarification: (payload) => {
          useAppStore.getState().setClarification({
            sessionId: payload.session_id,
            questions: payload.questions,
            partialSummary: payload.partial_summary,
            round: payload.round,
          });
        },
        onLoopEvent: (event) => {
          const store = useAppStore.getState();
          if (event.type === "loop_started") {
            store.setLoopActive(true);
            store.setTicketKey(event.issue_key);
          } else if (event.type === "loop_completed") {
            store.setLoopActive(false);
          }
        },
      },
    );

    return cleanup;
  }, [voiceUrl]);

  useEffect(() => {
    const cleanup = connectMonitorSocket(
      () => monitorUrl,
      {
        onConnect: () => useAppStore.getState().setMonitorConnected(true),
        onDisconnect: () => useAppStore.getState().setMonitorConnected(false),
        onToolEvent: (event) => useAppStore.getState().appendEvent(event),
        onCostUpdate: (cost) => useAppStore.getState().setCost(cost),
        onStuckAlert: (alert) => useAppStore.getState().setStuckAlert(alert),
        onSessionComplete: (completion) => useAppStore.getState().setCompletion(completion),
      },
    );

    return cleanup;
  }, [monitorUrl]);

  // Poll queue and status periodically
  useEffect(() => {
    async function poll() {
      try {
        const queue = await fetchLoopQueue(voiceUrl);
        useAppStore.getState().setQueue(queue);
      } catch {}

      try {
        const status = await fetchMonitorStatus(monitorUrl);
        if (status.active && status.session_id) {
          useAppStore.getState().setSessionId(status.session_id);
          if (status.ticket_id) {
            useAppStore.getState().setTicketKey(status.ticket_id);
          }
        }
      } catch {}
    }

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [voiceUrl, monitorUrl]);
}
```

**Step 6: Run tests**

Run: `cd desktop && npx vitest run src/__tests__/appStore.test.ts`
Expected: all pass

**Step 7: Commit**

```bash
git add desktop/src/stores/ desktop/src/hooks/ desktop/src/types/ desktop/src/__tests__/
git commit -m "feat: add Zustand store and connection hooks for voice + monitor"
```

**Verification Gate:**
1. Automated: `cd desktop && npx vitest run` — all tests pass
2. Manual: N/A (store is data layer, tested via unit tests)
3. Regression: `cd desktop && npx tsc --noEmit` — no type errors
4. Review: store derives `phase` from pipeline/loop/alert state correctly

> **GATE RULE:** Do not proceed to Task 3 until all checks pass.

---

## Task 3: Voice Rail — Mic Recording + Queue Display

**Chunk estimate:** ~30 min (Sonnet)

**Files:**
- Create: `desktop/src/components/VoiceRail.tsx`
- Create: `desktop/src/components/VoiceRail.module.css`
- Create: `desktop/src/components/MicButton.tsx`
- Create: `desktop/src/components/MicButton.module.css`
- Create: `desktop/src/hooks/useMicrophone.ts`
- Modify: `desktop/src/App.tsx`

**Step 1: Create mic hook**

Create `desktop/src/hooks/useMicrophone.ts`:

```typescript
import { useState, useRef, useCallback } from "react";
import { useAppStore } from "../stores/appStore";

export function useMicrophone() {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const voiceUrl = useAppStore((s) => s.voiceUrl);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());

        // Send to voice pipeline
        const store = useAppStore.getState();
        store.setPipelineStatus("processing");

        try {
          const form = new FormData();
          form.append("file", blob, "recording.webm");
          const resp = await fetch(`${voiceUrl}/api/pipeline/run/audio`, {
            method: "POST",
            body: form,
          });

          if (!resp.ok) {
            store.setPipelineStatus("error");
            return;
          }

          const data = await resp.json();
          if (data.ticket_key) {
            store.setTicketKey(data.ticket_key);
            store.setPipelineStatus("done");
          } else if (data.clarification) {
            store.setClarification({
              sessionId: data.session_id,
              questions: data.clarification.questions,
              partialSummary: data.clarification.partial_summary,
              round: data.clarification.round,
            });
            store.setPipelineStatus("clarifying");
          }
        } catch {
          store.setPipelineStatus("error");
        }
      };

      mediaRecorder.current = recorder;
      recorder.start();
      setRecording(true);
      useAppStore.getState().setPipelineStatus("recording");
    } catch {
      useAppStore.getState().setPipelineStatus("error");
    }
  }, [voiceUrl]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
      setRecording(false);
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [recording, startRecording, stopRecording]);

  return { recording, audioBlob, toggleRecording, startRecording, stopRecording };
}
```

**Step 2: Create MicButton component**

Create `desktop/src/components/MicButton.module.css`:

```css
.mic {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 2px solid var(--glass-border);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  color: var(--text-secondary);
  cursor: pointer;
  display: grid;
  place-content: center;
  transition: all 200ms ease;
  position: relative;
}

.mic:hover {
  border-color: var(--glass-border-hover);
  color: var(--text-primary);
}

.mic.recording {
  border-color: var(--phase-listening);
  color: var(--phase-listening);
  box-shadow:
    0 0 24px rgba(48, 176, 199, 0.3),
    inset 0 0 12px rgba(48, 176, 199, 0.1);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 24px rgba(48, 176, 199, 0.3), inset 0 0 12px rgba(48, 176, 199, 0.1); }
  50% { box-shadow: 0 0 40px rgba(48, 176, 199, 0.5), inset 0 0 20px rgba(48, 176, 199, 0.15); }
}

.icon {
  width: 24px;
  height: 24px;
}

@media (prefers-reduced-motion: reduce) {
  .mic.recording {
    animation: none;
  }
}
```

Create `desktop/src/components/MicButton.tsx`:

```tsx
import styles from "./MicButton.module.css";

interface MicButtonProps {
  recording: boolean;
  onClick: () => void;
}

export function MicButton({ recording, onClick }: MicButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.mic} ${recording ? styles.recording : ""} no-drag`}
      onClick={onClick}
      aria-label={recording ? "Stop recording" : "Start recording"}
    >
      <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {recording ? (
          <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
        ) : (
          <>
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </>
        )}
      </svg>
    </button>
  );
}
```

**Step 3: Create VoiceRail component**

Create `desktop/src/components/VoiceRail.module.css`:

```css
.rail {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 20px;
  padding: 18px 16px;
  padding-top: 48px;
  height: 100%;
}

.brand {
  display: grid;
  gap: 4px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--glass-border);
}

.brand-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--text-muted);
}

.brand-name {
  font-weight: 600;
  font-size: 1.1rem;
}

.mic-area {
  display: grid;
  justify-items: center;
  gap: 10px;
}

.mic-hint {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.queue-section {
  overflow-y: auto;
}

.queue-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.queue-item {
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.04);
  margin-bottom: 6px;
  font-size: 12px;
  line-height: 1.4;
}

.queue-item-key {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--phase-loop);
  margin-bottom: 2px;
}

.queue-item-summary {
  color: var(--text-secondary);
}

.connections {
  display: grid;
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--glass-border);
}

.connection {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--phase-error);
}

.dot.connected {
  background: var(--phase-done);
  box-shadow: 0 0 8px rgba(52, 199, 89, 0.5);
}
```

Create `desktop/src/components/VoiceRail.tsx`:

```tsx
import { useAppStore } from "../stores/appStore";
import { useMicrophone } from "../hooks/useMicrophone";
import { MicButton } from "./MicButton";
import styles from "./VoiceRail.module.css";

export function VoiceRail() {
  const { recording, toggleRecording } = useMicrophone();
  const queue = useAppStore((s) => s.queue);
  const voiceConnected = useAppStore((s) => s.voiceConnected);
  const monitorConnected = useAppStore((s) => s.monitorConnected);

  return (
    <div className={styles.rail}>
      <div className={styles.brand}>
        <span className={styles["brand-label"]}>SEJFA</span>
        <span className={styles["brand-name"]}>Mission Control</span>
      </div>

      <div className={styles["mic-area"]}>
        <MicButton recording={recording} onClick={toggleRecording} />
        <span className={styles["mic-hint"]}>⌘⇧V</span>
      </div>

      <div className={styles["queue-section"]}>
        <div className={styles["queue-title"]}>Queue ({queue.length})</div>
        {queue.map((item) => (
          <div key={item.key} className={styles["queue-item"]}>
            <div className={styles["queue-item-key"]}>{item.key}</div>
            <div className={styles["queue-item-summary"]}>{item.summary}</div>
          </div>
        ))}
      </div>

      <div className={styles.connections}>
        <div className={styles.connection}>
          <span className={`${styles.dot} ${voiceConnected ? styles.connected : ""}`} />
          Voice Pipeline
        </div>
        <div className={styles.connection}>
          <span className={`${styles.dot} ${monitorConnected ? styles.connected : ""}`} />
          Monitor API
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Update App.tsx to use VoiceRail + connections**

Replace `desktop/src/App.tsx`:

```tsx
import { VoiceRail } from "./components/VoiceRail";
import { useConnections } from "./hooks/useConnections";

export default function App() {
  useConnections();

  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        gap: 12,
        padding: 12,
        background: "var(--canvas-bg)",
      }}
    >
      <div
        className="drag-region"
        style={{ position: "fixed", top: 0, left: 0, right: 0, height: 40, zIndex: 100 }}
      />

      <aside className="glass-panel">
        <VoiceRail />
      </aside>

      <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 12, paddingTop: 36 }}>
        <main className="glass-panel" style={{ padding: 24, display: "grid", placeContent: "center" }}>
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Idle — speak the next objective
          </div>
        </main>

        <section className="glass-panel" style={{ padding: 18, minHeight: 160 }}>
          <div style={{ color: "var(--text-muted)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            Event Stream
          </div>
        </section>
      </div>
    </div>
  );
}
```

**Step 5: Wire global hotkey to mic toggle**

Add to `App.tsx` inside the `App` component, before the return:

```tsx
import { useEffect } from "react";
// ... existing imports

export default function App() {
  useConnections();
  const { recording, toggleRecording } = useMicrophone(); // need to lift this

  useEffect(() => {
    window.sejfa?.onGlobalShortcut((action) => {
      if (action === "toggle-voice") {
        toggleRecording();
      }
    });
  }, [toggleRecording]);

  // ... rest of component
}
```

Note: This requires restructuring slightly — the `useMicrophone` hook should be called in `App` and passed to `VoiceRail` as props instead of being called inside `VoiceRail`. Update `VoiceRail` to accept `recording` and `onToggle` as props.

**Step 6: Verify**

Run: `cd desktop && npx tsc --noEmit && npm run dev`
Expected: Voice Rail renders with mic button, queue, and connection dots. Clicking mic requests microphone permission.

**Step 7: Commit**

```bash
git add desktop/src/components/ desktop/src/hooks/useMicrophone.ts desktop/src/App.tsx
git commit -m "feat: add Voice Rail with mic recording, queue display, and connection status"
```

**Verification Gate:**
1. Automated: `cd desktop && npx tsc --noEmit` — no type errors
2. Manual: mic button pulses when recording; queue shows items if voice pipeline is running
3. Regression: `cd desktop && npx vitest run` — store tests still pass
4. Review: diff is scoped to Voice Rail + mic hook

> **GATE RULE:** Do not proceed to Task 4 until all checks pass.

---

## Task 4: Loop Canvas — Phase Visualization

**Chunk estimate:** ~30 min (Sonnet)

**Files:**
- Create: `desktop/src/components/LoopCanvas.tsx`
- Create: `desktop/src/components/LoopCanvas.module.css`
- Modify: `desktop/src/App.tsx`

**Step 1: Create the canvas styles**

Create `desktop/src/components/LoopCanvas.module.css`:

```css
.canvas {
  display: grid;
  place-content: center;
  text-align: center;
  padding: 32px;
  position: relative;
  overflow: hidden;
  min-height: 300px;
}

/* Ambient phase bleed background */
.canvas::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at center,
    rgba(var(--active-phase-rgb, 142, 142, 147), 0.08) 0%,
    transparent 70%
  );
  transition: background 600ms ease;
  pointer-events: none;
}

.phase-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.caption {
  font-size: 1.8rem;
  font-weight: 600;
  line-height: 1.3;
  max-width: 400px;
  margin-bottom: 16px;
}

.ticket {
  font-family: var(--font-mono);
  font-size: 1rem;
  padding: 4px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  display: inline-block;
  margin-bottom: 20px;
}

.metrics {
  display: flex;
  gap: 24px;
  justify-content: center;
}

.metric {
  text-align: center;
}

.metric-value {
  font-family: var(--font-mono);
  font-size: 1.2rem;
  font-weight: 600;
  display: block;
}

.metric-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-top: 4px;
}

.step {
  margin-top: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

/* Phase accent line at bottom */
.accent {
  position: absolute;
  bottom: 0;
  left: 20%;
  right: 20%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(var(--active-phase-rgb, 142, 142, 147), 0.5),
    transparent
  );
  transition: background 600ms ease;
}

/* Stuck alert overlay */
.stuck {
  margin-top: 16px;
  padding: 10px 16px;
  border-radius: 10px;
  background: rgba(255, 55, 95, 0.1);
  border: 1px solid rgba(255, 55, 95, 0.2);
  font-size: 13px;
  color: var(--phase-error);
  max-width: 400px;
}

.stuck-pattern {
  font-family: var(--font-mono);
  font-weight: 600;
}
```

**Step 2: Create the canvas component**

Create `desktop/src/components/LoopCanvas.tsx`:

```tsx
import { useAppStore, type LoopPhase } from "../stores/appStore";
import styles from "./LoopCanvas.module.css";

const phaseConfig: Record<LoopPhase, { label: string; caption: string; rgb: string }> = {
  idle: { label: "Idle", caption: "Speak the next objective", rgb: "142,142,147" },
  listening: { label: "Listening", caption: "Recording...", rgb: "48,176,199" },
  processing: { label: "Processing", caption: "Analyzing your request", rgb: "255,159,10" },
  loop: { label: "Loop Active", caption: "Ralph Loop executing", rgb: "88,86,214" },
  verify: { label: "Verifying", caption: "Running verification gates", rgb: "0,122,255" },
  error: { label: "Alert", caption: "Something needs attention", rgb: "255,55,95" },
  done: { label: "Complete", caption: "Task finished", rgb: "52,199,89" },
};

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function LoopCanvas() {
  const phase = useAppStore((s) => s.phase);
  const ticketKey = useAppStore((s) => s.ticketKey);
  const cost = useAppStore((s) => s.cost);
  const elapsedMs = useAppStore((s) => s.elapsedMs);
  const processingStep = useAppStore((s) => s.processingStep);
  const stuckAlert = useAppStore((s) => s.stuckAlert);
  const events = useAppStore((s) => s.events);

  const config = phaseConfig[phase];

  return (
    <div
      className={styles.canvas}
      style={{ "--active-phase-rgb": config.rgb } as React.CSSProperties}
    >
      <div className={styles["phase-label"]}>{config.label}</div>
      <div className={styles.caption}>{config.caption}</div>

      {ticketKey && (
        <div className={styles.ticket}>{ticketKey}</div>
      )}

      {(phase === "loop" || phase === "verify" || phase === "done") && (
        <div className={styles.metrics}>
          <div className={styles.metric}>
            <span className={styles["metric-value"]}>
              {cost ? formatCost(cost.total_usd) : "$0.00"}
            </span>
            <span className={styles["metric-label"]}>Cost</span>
          </div>
          <div className={styles.metric}>
            <span className={styles["metric-value"]}>
              {elapsedMs > 0 ? formatElapsed(elapsedMs) : "—"}
            </span>
            <span className={styles["metric-label"]}>Elapsed</span>
          </div>
          <div className={styles.metric}>
            <span className={styles["metric-value"]}>{events.length}</span>
            <span className={styles["metric-label"]}>Events</span>
          </div>
        </div>
      )}

      {processingStep && (
        <div className={styles.step}>{processingStep}</div>
      )}

      {stuckAlert && (
        <div className={styles.stuck}>
          Loop stuck on <span className={styles["stuck-pattern"]}>{stuckAlert.pattern}</span>
          {" "}— repeated {stuckAlert.repeat_count}× ({stuckAlert.tokens_burned.toLocaleString()} tokens burned)
        </div>
      )}

      <div className={styles.accent} />
    </div>
  );
}
```

**Step 3: Update App.tsx to use LoopCanvas**

Replace the placeholder `<main>` with `<LoopCanvas />`:

```tsx
import { LoopCanvas } from "./components/LoopCanvas";
// ... in the JSX:
<main className="glass-panel">
  <LoopCanvas />
</main>
```

**Step 4: Verify**

Run: `cd desktop && npx tsc --noEmit && npm run dev`
Expected: center canvas shows "Idle — Speak the next objective" with subtle grey ambient glow. Phase label, caption, and accent line all render.

**Step 5: Commit**

```bash
git add desktop/src/components/LoopCanvas.tsx desktop/src/components/LoopCanvas.module.css desktop/src/App.tsx
git commit -m "feat: add Loop Canvas with phase visualization and ambient color bleed"
```

**Verification Gate:**
1. Automated: `cd desktop && npx tsc --noEmit` — no type errors
2. Manual: canvas shows correct phase info; accent line visible at bottom
3. Regression: `cd desktop && npx vitest run` — all tests pass
4. Review: ambient color system uses CSS custom property `--active-phase-rgb` set per phase

> **GATE RULE:** Do not proceed to Task 5 until all checks pass.

---

## Task 5: Event Stream — Live Tool Events

**Chunk estimate:** ~25 min (Sonnet)

**Files:**
- Create: `desktop/src/components/EventStream.tsx`
- Create: `desktop/src/components/EventStream.module.css`
- Modify: `desktop/src/App.tsx`

**Step 1: Create event stream styles**

Create `desktop/src/components/EventStream.module.css`:

```css
.stream {
  padding: 16px 18px;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
  max-height: 280px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--text-muted);
}

.count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}

.list {
  list-style: none;
  overflow-y: auto;
  display: grid;
  gap: 6px;
}

.event {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  transition: all 200ms ease;
}

.event:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
}

.event-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.event-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.event-dot.success { background: var(--phase-done); }
.event-dot.failure { background: var(--phase-error); }
.event-dot.pending { background: var(--phase-processing); }

.event-tool {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-args {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.event-right {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.event-cost {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}

.event-time {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  min-width: 44px;
  text-align: right;
}

.empty {
  display: grid;
  place-content: center;
  min-height: 80px;
  color: var(--text-muted);
  font-size: 12px;
}
```

**Step 2: Create event stream component**

Create `desktop/src/components/EventStream.tsx`:

```tsx
import { useAppStore } from "../stores/appStore";
import styles from "./EventStream.module.css";

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "—";
  }
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function EventStream() {
  const events = useAppStore((s) => s.events);

  return (
    <div className={styles.stream}>
      <div className={styles.header}>
        <span className={styles.title}>Event Stream</span>
        <span className={styles.count}>{events.length}</span>
      </div>

      {events.length === 0 ? (
        <div className={styles.empty}>Waiting for loop events...</div>
      ) : (
        <ul className={styles.list}>
          {events.map((event) => (
            <li key={event.event_id} className={styles.event}>
              <div className={styles["event-left"]}>
                <span
                  className={`${styles["event-dot"]} ${
                    event.success === true
                      ? styles.success
                      : event.success === false
                        ? styles.failure
                        : styles.pending
                  }`}
                />
                <span className={styles["event-tool"]}>{event.tool_name}</span>
                {event.tool_args_summary && (
                  <span className={styles["event-args"]}>{event.tool_args_summary}</span>
                )}
              </div>
              <div className={styles["event-right"]}>
                {event.cost_usd != null && event.cost_usd > 0 && (
                  <span className={styles["event-cost"]}>${event.cost_usd.toFixed(4)}</span>
                )}
                {event.duration_ms != null && (
                  <span className={styles["event-time"]}>{formatDuration(event.duration_ms)}</span>
                )}
                <span className={styles["event-time"]}>{formatTime(event.timestamp)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**Step 3: Update App.tsx**

Replace event stream placeholder with `<EventStream />`:

```tsx
import { EventStream } from "./components/EventStream";
// ... in JSX:
<section className="glass-panel">
  <EventStream />
</section>
```

**Step 4: Verify**

Run: `cd desktop && npx tsc --noEmit && npm run dev`
Expected: event stream section renders with "Waiting for loop events..." empty state. If monitor API is running, events populate in real-time.

**Step 5: Commit**

```bash
git add desktop/src/components/EventStream.tsx desktop/src/components/EventStream.module.css desktop/src/App.tsx
git commit -m "feat: add live Event Stream with tool events, costs, and durations"
```

**Verification Gate:**
1. Automated: `cd desktop && npx tsc --noEmit` — no type errors
2. Manual: events render with tool name, args, cost, duration, timestamp
3. Regression: `cd desktop && npx vitest run` — all tests pass
4. Review: event list is scrollable, capped at 200 by store

> **GATE RULE:** Do not proceed to Task 6 until all checks pass.

---

## Task 6: Elapsed Time Timer + Completion State

**Chunk estimate:** ~20 min (Sonnet)

**Files:**
- Create: `desktop/src/hooks/useElapsedTimer.ts`
- Modify: `desktop/src/App.tsx`
- Modify: `desktop/src/components/LoopCanvas.tsx`

**Step 1: Create elapsed timer hook**

Create `desktop/src/hooks/useElapsedTimer.ts`:

```typescript
import { useEffect, useRef } from "react";
import { useAppStore } from "../stores/appStore";

export function useElapsedTimer() {
  const loopActive = useAppStore((s) => s.loopActive);
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    if (loopActive) {
      startTime.current = Date.now();
      const interval = setInterval(() => {
        if (startTime.current) {
          useAppStore.getState().setElapsedMs(Date.now() - startTime.current);
        }
      }, 1000);

      return () => {
        clearInterval(interval);
      };
    } else {
      startTime.current = null;
    }
  }, [loopActive]);
}
```

**Step 2: Add completion display to LoopCanvas**

In `LoopCanvas.tsx`, add a completion summary section after the stuck alert block:

```tsx
const completion = useAppStore((s) => s.completion);

// In the JSX, after the stuck alert:
{completion && phase === "done" && (
  <div className={styles.completion}>
    <div className={styles["completion-outcome"]}
      data-outcome={completion.outcome}>
      {completion.outcome === "done" ? "✓ Task Complete" :
       completion.outcome === "failed" ? "✗ Task Failed" :
       completion.outcome === "blocked" ? "⏸ Blocked" : "Unknown"}
    </div>
    {completion.pr_url && (
      <div className={styles["completion-pr"]}>
        PR: <span className="data-pill">{completion.pr_url}</span>
      </div>
    )}
  </div>
)}
```

Add matching CSS to `LoopCanvas.module.css`:

```css
.completion {
  margin-top: 20px;
  display: grid;
  gap: 8px;
}

.completion-outcome {
  font-size: 1.1rem;
  font-weight: 600;
}

.completion-outcome[data-outcome="done"] { color: var(--phase-done); }
.completion-outcome[data-outcome="failed"] { color: var(--phase-error); }
.completion-outcome[data-outcome="blocked"] { color: var(--phase-processing); }

.completion-pr {
  font-size: 13px;
  color: var(--text-secondary);
}
```

**Step 3: Wire timer in App.tsx**

```tsx
import { useElapsedTimer } from "./hooks/useElapsedTimer";

export default function App() {
  useConnections();
  useElapsedTimer();
  // ...
}
```

**Step 4: Verify**

Run: `cd desktop && npx tsc --noEmit && npm run dev`
Expected: when loop is active, elapsed time ticks up every second in the Loop Canvas metrics.

**Step 5: Commit**

```bash
git add desktop/src/hooks/useElapsedTimer.ts desktop/src/components/LoopCanvas.tsx desktop/src/components/LoopCanvas.module.css desktop/src/App.tsx
git commit -m "feat: add elapsed timer and completion state to Loop Canvas"
```

**Verification Gate:**
1. Automated: `cd desktop && npx tsc --noEmit` — no type errors
2. Manual: elapsed counter ticks when loop is active; completion summary renders on done
3. Regression: `cd desktop && npx vitest run` — all pass
4. Review: timer cleans up on unmount, no memory leak

> **GATE RULE:** Do not proceed to Task 7 until all checks pass.

---

## Task 7: Clarification Dialog

**Chunk estimate:** ~25 min (Sonnet)

**Files:**
- Create: `desktop/src/components/ClarificationDialog.tsx`
- Create: `desktop/src/components/ClarificationDialog.module.css`
- Modify: `desktop/src/App.tsx`

**Step 1: Create dialog styles**

Create `desktop/src/components/ClarificationDialog.module.css`:

```css
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 50;
  display: grid;
  place-content: center;
}

.dialog {
  width: min(480px, calc(100vw - 48px));
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(30px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  box-shadow: 0 16px 64px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  padding: 28px;
  animation: hud-enter 300ms ease-out;
}

.accent {
  position: absolute;
  top: 0;
  left: 20%;
  right: 20%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--phase-processing), transparent);
}

.title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.summary {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 20px;
}

.questions {
  list-style: none;
  display: grid;
  gap: 8px;
  margin-bottom: 20px;
}

.question {
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.45;
}

.input-area {
  display: grid;
  gap: 10px;
}

.input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 14px;
  outline: none;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: var(--phase-processing);
}

.submit {
  padding: 10px 20px;
  border-radius: 10px;
  border: none;
  background: var(--phase-processing);
  color: #000;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 200ms ease;
}

.submit:hover {
  opacity: 0.9;
}

.submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@keyframes hud-enter {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dialog {
    animation: none;
  }
}
```

**Step 2: Create dialog component**

Create `desktop/src/components/ClarificationDialog.tsx`:

```tsx
import { useState } from "react";
import { submitClarification } from "@sejfa/data-client";
import { useAppStore } from "../stores/appStore";
import styles from "./ClarificationDialog.module.css";

export function ClarificationDialog() {
  const clarification = useAppStore((s) => s.clarification);
  const voiceUrl = useAppStore((s) => s.voiceUrl);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!clarification) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !clarification) return;

    setSubmitting(true);
    try {
      await submitClarification(voiceUrl, {
        sessionId: clarification.sessionId,
        text: answer.trim(),
      });
      setAnswer("");
      useAppStore.getState().setClarification(null);
    } catch {
      // Pipeline WS will update status
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog}>
        <div className={styles.title}>Clarification Needed (Round {clarification.round})</div>

        {clarification.partialSummary && (
          <div className={styles.summary}>{clarification.partialSummary}</div>
        )}

        <ul className={styles.questions}>
          {clarification.questions.map((q, i) => (
            <li key={i} className={styles.question}>{q}</li>
          ))}
        </ul>

        <form className={styles["input-area"]} onSubmit={handleSubmit}>
          <input
            className={styles.input}
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer..."
            autoFocus
            disabled={submitting}
          />
          <button
            type="submit"
            className={styles.submit}
            disabled={!answer.trim() || submitting}
          >
            {submitting ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

**Step 3: Add dialog to App.tsx**

```tsx
import { ClarificationDialog } from "./components/ClarificationDialog";
// ... at the end of the root div, before closing tag:
<ClarificationDialog />
```

**Step 4: Verify**

Run: `cd desktop && npx tsc --noEmit && npm run dev`
Expected: no dialog visible in idle state. To test, manually set clarification in store via devtools.

**Step 5: Commit**

```bash
git add desktop/src/components/ClarificationDialog.tsx desktop/src/components/ClarificationDialog.module.css desktop/src/App.tsx
git commit -m "feat: add clarification dialog with glass HUD overlay"
```

**Verification Gate:**
1. Automated: `cd desktop && npx tsc --noEmit` — no type errors
2. Manual: dialog renders when clarification state is set; submit clears it
3. Regression: `cd desktop && npx vitest run` — all pass
4. Review: dialog uses HUD entry animation, glass-panel-strong material, reduced motion support

> **GATE RULE:** Do not proceed to Task 8 until all checks pass.

---

## Task 8: Polish — Final Assembly + Electron Build

**Chunk estimate:** ~30 min (Sonnet)

**Files:**
- Modify: `desktop/src/App.tsx` (final assembly)
- Modify: `desktop/electron/main.ts` (window refinements)
- Create: `desktop/electron-builder.yml`
- Modify: `desktop/package.json` (build config)

**Step 1: Final App.tsx assembly**

Ensure App.tsx has the complete composition:

```tsx
import { useEffect } from "react";
import { VoiceRail } from "./components/VoiceRail";
import { LoopCanvas } from "./components/LoopCanvas";
import { EventStream } from "./components/EventStream";
import { ClarificationDialog } from "./components/ClarificationDialog";
import { useConnections } from "./hooks/useConnections";
import { useElapsedTimer } from "./hooks/useElapsedTimer";
import { useMicrophone } from "./hooks/useMicrophone";
import { useAppStore } from "./stores/appStore";

export default function App() {
  useConnections();
  useElapsedTimer();

  const { recording, toggleRecording } = useMicrophone();
  const phase = useAppStore((s) => s.phase);

  // Global hotkey
  useEffect(() => {
    window.sejfa?.onGlobalShortcut((action) => {
      if (action === "toggle-voice") {
        toggleRecording();
      }
    });
  }, [toggleRecording]);

  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        gap: 12,
        padding: 12,
        background: "var(--canvas-bg)",
      }}
    >
      <div
        className="drag-region"
        style={{ position: "fixed", top: 0, left: 0, right: 0, height: 40, zIndex: 100 }}
      />

      <aside className="glass-panel">
        <VoiceRail recording={recording} onToggle={toggleRecording} />
      </aside>

      <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 12, paddingTop: 36 }}>
        <main className="glass-panel">
          <LoopCanvas />
        </main>

        <section className="glass-panel">
          <EventStream />
        </section>
      </div>

      <ClarificationDialog />
    </div>
  );
}
```

**Step 2: Electron window refinements**

In `desktop/electron/main.ts`, add vibrancy for macOS glass effect:

```typescript
mainWindow = new BrowserWindow({
  // ... existing config
  vibrancy: "under-window",
  visualEffectState: "active",
});
```

**Step 3: Create electron-builder config**

Create `desktop/electron-builder.yml`:

```yaml
appId: dev.sejfa.desktop
productName: SEJFA
directories:
  output: release
  buildResources: build
files:
  - dist/**/*
  - dist-electron/**/*
mac:
  category: public.app-category.developer-tools
  target:
    - target: dmg
      arch:
        - arm64
```

**Step 4: Test full build**

Run:
```bash
cd desktop && npm run build
```

Expected: `dist/` contains compiled React app, `dist-electron/` contains compiled Electron main/preload.

**Step 5: Test Electron app**

Run:
```bash
cd desktop && npm run electron:dev
```

Expected: frameless window opens with glass panels, traffic lights in top-left, all three sections visible (Voice Rail, Loop Canvas, Event Stream).

**Step 6: Commit**

```bash
git add desktop/
git commit -m "feat: final assembly and Electron build configuration for SEJFA desktop"
```

**Verification Gate:**
1. Automated: `cd desktop && npx tsc --noEmit && npx vitest run` — all pass
2. Manual: `npm run electron:dev` — full app renders, mic works, global hotkey registers
3. Regression: root `npm install && npm test` — no breakage
4. Review: complete app is 8 files of components + 1 store + 3 hooks + glass CSS

> **GATE RULE:** This is the final task. Verify everything works end-to-end.

---

## Summary

| Task | What | Files | Est. |
|------|------|-------|------|
| 1 | Electron + React shell with glass CSS | 11 files | 30m |
| 2 | Zustand store + connection layer | 4 files | 30m |
| 3 | Voice Rail (mic, queue, connections) | 6 files | 30m |
| 4 | Loop Canvas (phase visualization) | 3 files | 30m |
| 5 | Event Stream (live tool events) | 3 files | 25m |
| 6 | Elapsed timer + completion state | 3 files | 20m |
| 7 | Clarification dialog | 3 files | 25m |
| 8 | Polish + Electron build | 4 files | 30m |
| **Total** | | **~37 files** | **~220m** |
