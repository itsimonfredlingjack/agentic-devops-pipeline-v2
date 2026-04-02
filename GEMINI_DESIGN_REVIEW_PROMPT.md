# Gemini Design Review & Linear Feature Expansion Prompt

## Role & Task

You are a senior product engineer and UX/interaction designer reviewing an Electron desktop application called **SEJFA** — an agentic software-delivery command center. Your job is to:

1. **Visual Design Review** — assess the current UI quality, identify weaknesses, and suggest concrete improvements.
2. **Linear Integration Feature Design** — propose how to expand the app with real Linear integration to support a specific set of natural-language commands.

Read all provided code carefully before responding. Deliver a structured, actionable report. No filler.

---

## What SEJFA Is

SEJFA is a **voice-driven, autonomous task execution loop**. The mental model:

```
voice command or task selection
  → intent extraction
  → Ralph Loop execution (Claude Code runs the task autonomously)
  → verification gates
  → review / follow-up
  → loop closes or escalates
```

The Electron desktop app is the **control surface** for this loop. It is **not** a task manager or issue tracker — it's a cockpit. Linear is the source of truth for tasks. The app surfaces tasks, lets you voice-activate them, monitors execution, and feeds results back.

**The migration context:** Jira was previously the intake/identity/sync system. Linear is the replacement. Same integration role, completely different API (GraphQL), different data model, different UX expectations. Linear is faster, has cycles, has project-level scoping, and has a cleaner data model.

---

## Current App Architecture

**Stack:** Electron 35 + React 18 + TypeScript + Vite + Zustand + CSS Modules
**Fonts:** Inter (UI), Geist Mono (labels/IDs), JetBrains Mono (code)
**Window:** frameless, `titleBarStyle: hiddenInset`, `vibrancy: under-window`, bg `#0a0a0f`

### Layout

```
┌────────────────────────────────────────────────────┐
│  [drag region — macOS traffic lights]              │
├──────────────┬─────────────────────────────────────┤
│              │  OmniPrompt (top bar)               │
│   Sidebar    │─────────────────────────────────────│
│   260px      │                                     │
│              │  Canvas (main area)                 │
│  - telemetry │  idle: MissionDossier               │
│  - cycle     │  executing: TerminalFeed + Blockers │
│    issues    │                                     │
└──────────────┴─────────────────────────────────────┘
```

### Color tokens

| Token | Value | Usage |
|-------|-------|-------|
| `bg` | `#0b0c0f` | App background + sidebar |
| `surface` | `rgba(255,255,255,0.04)` | Active/selected items |
| `border` | `rgba(255,255,255,0.05–0.06)` | All dividers |
| `text-primary` | `#f3f4f6 / #ffffff` | Headlines, active |
| `text-secondary` | `#d1d5db` | Issue titles |
| `text-muted` | `#9ca3af / #6b7280` | Labels, IDs |
| `accent-green` | `#10b981 / #059669` | Logomark, success |
| `accent-blue` | `#3b82f6` | Voice active, focus rings |
| `accent-purple` | `#8b5cf6` | Monitor stream |
| `warn` | inherited from Linear | Blockers/stall alerts |
| `glow-blue` | `rgba(59,130,246,0.15)` | Omni idle glow mesh |
| `glow-purple` | `rgba(139,92,246,0.12)` | Omni idle glow mesh |
| `glow-green` | `rgba(16,185,129,0.08)` | Omni idle glow mesh |

### Phase state machine

```
idle → listening → processing → loop → verify → error/done
```

Loop phase drives the entire UI mode switch (idle canvas ↔ execution canvas).

---

## Complete Source Code

### `desktop/src/mockLinearData.ts`

```typescript
export type Priority = "urgent" | "high" | "medium" | "low" | "none";
export type Status = "backlog" | "todo" | "in-progress" | "review" | "done" | "canceled";

export interface LinearIssue {
  id: string; // e.g. SEJ-123
  title: string;
  status: Status;
  priority: Priority;
  assignee?: string;
}

export const mockLinearCycle: LinearIssue[] = [
  { id: "SEJ-42", title: "Implement Linear Integration in Sidebar", status: "in-progress", priority: "urgent" },
  { id: "SEJ-55", title: "OmniPrompt state synchronization", status: "todo", priority: "medium" },
  { id: "SEJ-61", title: "Add \"Move to in progress\" voice intent", status: "todo", priority: "high" },
  { id: "SEJ-68", title: "Fix Glass Morphing z-index on Blockers", status: "in-progress", priority: "high" },
  { id: "SEJ-59", title: "Migrate existing queue items to GraphQL", status: "backlog", priority: "low" },
  { id: "SEJ-43", title: "Refactor TerminalFeed row animations", status: "done", priority: "none" },
];
```

### `desktop/src/stores/appStore.ts`

```typescript
export type LoopPhase =
  | "idle" | "listening" | "processing" | "loop" | "verify" | "error" | "done";

// State includes:
// - voiceConnected, monitorConnected (connection dots)
// - pipelineStatus, processingStep, clarification, preview
// - loopActive, ticketKey, sessionId, elapsedMs
// - events: EventRecord[]
// - cost: CostEntry, stuckAlert: StuckAlert, completion: CompletionSummary
// - queue: QueueItem[]
// Phase is derived from the combination of the above

function derivePhase(state): LoopPhase {
  if (state.stuckAlert) return "error";
  if (state.completion) return "done";
  if (state.loopActive) return "loop";
  switch (state.pipelineStatus) {
    case "recording": return "listening";
    case "processing": case "clarifying": return "processing";
    case "previewing": return "verify";
    case "error": return "error";
    default: return "idle";
  }
}
```

### `desktop/src/App.tsx`

```tsx
export default function App() {
  useConnections();    // polls voice+monitor health
  useElapsedTimer();   // ticks elapsedMs during loop
  const { recording, toggleRecording } = useMicrophone();
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);

  useEffect(() => {
    window.sejfa?.onGlobalShortcut((action) => {
      if (action === "toggle-voice") toggleRecording();
    });
  }, [toggleRecording]);

  return (
    <div className={styles.appRoot}>
      <div className={styles.dragRegion} />
      <Sidebar selectedIndex={selectedTaskIndex} onSelectIndex={setSelectedTaskIndex} />
      <MasterWorkspace selectedIndex={selectedTaskIndex} recording={recording} onToggleVoice={toggleRecording} />
    </div>
  );
}
```

### `desktop/src/components/Sidebar.tsx`

```tsx
// Shows: org header (green logomark + "SEJFA COMMAND"),
// SYSTEM TELEMETRY section (voice dot + monitor dot),
// ACTIVE CYCLE section (issue list from mockLinearCycle)
// Each issue: priority icon + ID + status icon + title
// Keyboard navigation: arrow keys, Home/End
// Data: currently 100% mock — no real Linear API calls
```

### `desktop/src/components/MasterWorkspace.tsx`

```tsx
// Renders OmniPrompt on top always.
// Canvas below switches based on isExecuting:
//   - idle: <MissionDossier targetedTask={...} />
//   - executing: <TerminalFeed /> + <BlockersView />
// targetedTask is derived from mockLinearCycle
```

### `desktop/src/components/OmniPrompt.tsx`

```tsx
// Dual mode:
// IDLE: centered "What should we build next?" + mic button + ⌘⇧V hint
//       + animated radial glow mesh (blue/purple/green)
// EXECUTING: compact top bar with:
//   - pulse dot + ticket ID + ticket title
//   - phase pill (LOOP/VERIFY/etc)
//   - TIME counter
//   - BURN RATIO (cost USD) + sparkline
```

### `desktop/src/components/MissionDossier.tsx`

```tsx
// Shows selected issue details in idle state
// Currently only displays: TARGET ID + SUMMARY
// Minimal — needs expansion for real Linear data
```

### `desktop/src/components/BlockersView.tsx`

```tsx
// Docked bottom panel that appears during execution when:
// - preview: "INTENT VERIFICATION" card (DISCARD/APPROVE & EXECUTE)
// - clarification: "CLARIFICATION ROUND N" with questions + text input
// - stuckAlert: "FATAL STALL: REPETITION LOOP"
// - completion: "MISSION COMPLETE"
```

### `desktop/electron/main.ts`

```typescript
// frameless window, vibrancy: "under-window"
// bg: "#0a0a0f"
// globalShortcut: Cmd+Shift+V → toggle-voice
// contextIsolation: true, nodeIntegration: false
// preload exposes: window.sejfa.config, window.sejfa.onGlobalShortcut
```

---

## What I Need From You

### PART 1: Visual Design Review

Review the app design based on the code and design tokens above. Assess:

1. **Typography hierarchy** — is the font scale coherent? Geist Mono for labels + Inter for UI + JetBrains Mono for code — is this the right split? Are sizes (10px labels, 11px IDs, 13px body, 32px omni headline) working together?

2. **Color and contrast** — assess the palette. The muted text range (#6b7280 → #9ca3af → #d1d5db → #ffffff) — is this a well-graded ramp? Where are the accessibility risks?

3. **Density vs. breathing room** — sidebar items at 260px with 10px padding, 2px gap between items. Canvas area gets basically everything else. Is this a good split? How does it hold at 800px min-width?

4. **State communication** — how clearly do the phase transitions communicate to the user? The glow mesh in idle mode, the pulse dot + top bar in executing mode — is this visually coherent?

5. **MissionDossier weakness** — currently only shows TARGET ID + SUMMARY in the idle canvas. This is a huge underutilized space. What should it show?

6. **Top-level weaknesses** — identify the 3–5 most impactful visual/UX issues to fix.

7. **Quick wins** — 3–5 things that could be improved with small CSS or component changes.

---

### PART 2: Linear Integration Feature Design

The app is migrating from Jira to Linear. Linear uses a GraphQL API. The app currently uses 100% mock data.

The goal is to support natural-language voice commands that map to Linear operations. Here are the target command types:

| Command | Example utterance |
|---------|------------------|
| Browse project | "visa projekt X" / "show project X" |
| Add to project | "lägg till det här i projektet" |
| Create issue | "skapa ett issue i det projektet" |
| Update description | "uppdatera beskrivningen på det här ärendet" |
| Add child / follower | "lägg review-fynd som uppföljare" |
| Move status | "flytta den här till in progress" |

For each of the following, provide concrete design + implementation guidance:

#### 2a. Linear GraphQL Integration Layer

What does the data client need to look like? Design the interface. Specifically:

- What queries and mutations are needed to support the 6 command types above?
- Where should this live in the codebase? (currently `packages/data-client/` handles voice-backend calls — should Linear calls go here too, or in a new package/service?)
- How should auth work? (Linear uses OAuth2 or personal API key — which fits a desktop Electron app?)
- Should the Linear client live in the main Electron process, the renderer, or be proxied through the FastAPI voice backend?

#### 2b. Intent → Linear Action Mapping

The voice pipeline already does: audio → transcript → Ollama intent extraction → Jira ticket creation.

How should we extend this to support **Linear mutations** (not just ticket creation, but status moves, description updates, etc.)?

- Should Ollama produce a structured "Linear action" object instead of a Jira ticket?
- What does that action schema look like? (action type, target issue ID, payload fields)
- How does the app decide whether to create a new issue vs. update an existing one?
- Should there be a confirmation step (preview card) before mutating Linear?

#### 2c. Sidebar Enhancement

The sidebar currently shows a flat list of cycle issues (mock data). With real Linear:

- What additional context should each issue show? (estimate, label, assignee avatar, cycle position?)
- Should the sidebar support multiple views? (cycle vs. all assigned vs. project-level?)
- How should real-time updates work? (Linear webhooks? polling? SSE from voice backend?)
- What's the right UX for "browse project X" — does a project expand inline in the sidebar, or does it take over the canvas?

#### 2d. MissionDossier Expansion

In idle state, the MissionDossier shows the selected issue. Currently: just ID + title.

With real Linear data, design what a full issue dossier should show:
- What fields from Linear are most relevant in the cockpit context?
- How should linked issues (parents, children, blockers) be shown?
- What actions should be available directly from the dossier (buttons, right-click)?
- How does "lägg review-fynd som uppföljare" map to a UI action in the dossier?

#### 2e. Post-Execution Review → Linear Write-back

When the Ralph Loop completes a task (loop phase → "done"), what should happen in Linear?

- Should the app automatically move the issue to "Review" or "Done"?
- Should the completion summary be written as a comment on the Linear issue?
- How should this be gated — auto-commit, or user confirmation?
- Design the completion card in BlockersView to include a "Push to Linear" action.

---

### Output Format

Return:

**DESIGN REVIEW**
- Issue + severity (critical / major / minor) + specific fix

**LINEAR FEATURE SPECS**
- For each section (2a–2e): architecture decision + concrete implementation steps + estimated complexity (S/M/L)

**PRIORITY ORDER**
- What to build first and why (consider: what unlocks the most other things)

Be specific. Reference component names, file paths, and Linear API concepts by name. Assume the reader is a senior TypeScript developer who will implement this immediately.
