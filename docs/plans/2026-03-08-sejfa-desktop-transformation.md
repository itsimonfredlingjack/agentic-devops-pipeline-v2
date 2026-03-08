# SEJFA Desktop Transformation Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current dashboard-like `voice-app` UI with a state-driven SEJFA desktop surface where a spoken objective transforms into a live ticket/session inside the Ralph Loop.

**Architecture:** Keep the existing backend, sockets, queue polling, and most store plumbing. Rebuild the frontend around a single `TransformationCanvas`, a narrow `SupportRail`, and a collapsible `DetailShelf`, with UI composition driven by SEJFA state rather than a fixed card grid.

**Tech Stack:** React, TypeScript, Zustand, Vitest, CSS Modules, Tauri renderer

**Decomposition Strategy:** Feature-based

**Target Model:** Sonnet 30min chunks

---

### Task 1: Establish the New Surface State Model

**Chunk estimate:** ~25 min (Sonnet)

**Files:**
- Modify: `voice-app/src/lib/mission.ts`
- Modify: `voice-app/src/stores/pipelineStore.ts`
- Modify: `voice-app/src/__tests__/mission.test.ts`
- Modify: `voice-app/src/__tests__/pipelineStore.test.ts`

**Step 1: Write the failing tests**

Add tests for a new UI-facing surface model that can drive the transformation canvas.

```ts
expect(
  deriveCanvasState({
    status: "idle",
    ticket: null,
    activeStage: null,
    completion: null,
    stuckAlert: null,
  }),
).toEqual({
  phase: "idle",
  caption: "Speak the next objective",
  emphasis: "intake",
});
```

Add coverage for:

- `idle`
- `listening`
- `processing`
- `clarifying`
- `queued`
- `running`
- `blocked`
- `done`

**Step 2: Run tests to verify they fail**

Run:

```bash
cd voice-app && npm test -- --run src/__tests__/mission.test.ts src/__tests__/pipelineStore.test.ts
```

Expected: FAIL because `deriveCanvasState` and any new helper fields do not exist yet.

**Step 3: Write minimal implementation**

Add a UI helper in `mission.ts`, for example:

```ts
export interface CanvasState {
  phase:
    | "idle"
    | "listening"
    | "processing"
    | "clarifying"
    | "queued"
    | "running"
    | "blocked"
    | "done";
  caption: string;
  emphasis: "intake" | "formation" | "loop" | "diagnostic" | "outcome";
}

export function deriveCanvasState(input: MissionStateInput): CanvasState {
  // map existing pipeline + loop state into a single UI phase
}
```

Only add new store fields if implementation truly needs them. Prefer derived helpers over new persisted state.

**Step 4: Run tests to verify they pass**

Run:

```bash
cd voice-app && npm test -- --run src/__tests__/mission.test.ts src/__tests__/pipelineStore.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add voice-app/src/lib/mission.ts \
  voice-app/src/stores/pipelineStore.ts \
  voice-app/src/__tests__/mission.test.ts \
  voice-app/src/__tests__/pipelineStore.test.ts
git commit -m "refactor: add transformation canvas state model"
```

**Verification Gate:**
1. Automated: `cd voice-app && npm test -- --run src/__tests__/mission.test.ts src/__tests__/pipelineStore.test.ts` -- all pass
2. Manual: Read `deriveCanvasState` and confirm every major UI phase is mapped exactly once
3. Regression: `cd voice-app && npm test` -- no suite regressions
4. Review: Diff only introduces state mapping and matching tests

> **GATE RULE:** Do not proceed to Task 2 until all four checks pass. If the gate fails, fix before moving on. Never skip.

### Task 2: Build the Transformation Canvas Skeleton

**Chunk estimate:** ~30 min (Sonnet)

**Files:**
- Create: `voice-app/src/components/TransformationCanvas.tsx`
- Create: `voice-app/src/styles/components/TransformationCanvas.module.css`
- Modify: `voice-app/src/App.tsx`
- Modify: `voice-app/src/__tests__/App.test.tsx`

**Step 1: Write the failing tests**

Add an integration test that expects the new center-first surface to render.

```tsx
expect(screen.getByLabelText("SEJFA transformation canvas")).toBeInTheDocument();
expect(screen.getByText("Speak the next objective")).toBeInTheDocument();
expect(screen.getByText("Ralph Loop")).toBeInTheDocument();
```

Add a state test for `recording`/`processing` captions inside the canvas.

**Step 2: Run tests to verify they fail**

Run:

```bash
cd voice-app && npm test -- --run src/__tests__/App.test.tsx
```

Expected: FAIL because the new component does not exist and `App.tsx` still mounts the old surface.

**Step 3: Write minimal implementation**

Create the new component skeleton:

```tsx
export function TransformationCanvas(props: TransformationCanvasProps) {
  return (
    <section aria-label="SEJFA transformation canvas" className={styles.canvas}>
      <div className={styles.intakeAperture}>{/* record control */}</div>
      <div className={styles.workCore}>{/* current objective or ticket/session */}</div>
      <div className={styles.loopRing}>{/* stage ring */}</div>
      <div className={styles.caption}>{props.canvasState.caption}</div>
    </section>
  );
}
```

Wire it into `App.tsx` while preserving existing recording handlers and data sources.

**Step 4: Run tests to verify they pass**

Run:

```bash
cd voice-app && npm test -- --run src/__tests__/App.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add voice-app/src/components/TransformationCanvas.tsx \
  voice-app/src/styles/components/TransformationCanvas.module.css \
  voice-app/src/App.tsx \
  voice-app/src/__tests__/App.test.tsx
git commit -m "feat: add transformation canvas shell"
```

**Verification Gate:**
1. Automated: `cd voice-app && npm test -- --run src/__tests__/App.test.tsx` -- pass
2. Manual: Launch `cd voice-app && npm run dev` and confirm the center canvas is the dominant object on idle
3. Regression: `cd voice-app && npm test` -- full suite passes
4. Review: `git diff --stat HEAD~1..HEAD` shows only the new shell and test updates

> **GATE RULE:** Do not proceed to Task 3 until all four checks pass. If the gate fails, fix before moving on. Never skip.

### Task 3: Move Queue, Events, and Links into a Narrow Support Rail

**Chunk estimate:** ~25 min (Sonnet)

**Files:**
- Create: `voice-app/src/components/SupportRail.tsx`
- Create: `voice-app/src/styles/components/SupportRail.module.css`
- Modify: `voice-app/src/App.tsx`
- Modify: `voice-app/src/__tests__/App.test.tsx`

**Step 1: Write the failing tests**

Add test coverage that expects queue, activity, and artifacts in one support rail instead of multiple peer cards.

```tsx
expect(screen.getByLabelText("SEJFA support rail")).toBeInTheDocument();
expect(screen.getByText("Pending queue")).toBeInTheDocument();
expect(screen.getByText("Activity")).toBeInTheDocument();
```

For a completed run, assert artifact links are surfaced in the rail.

**Step 2: Run tests to verify they fail**

Run:

```bash
cd voice-app && npm test -- --run src/__tests__/App.test.tsx
```

Expected: FAIL because the support rail component does not exist.

**Step 3: Write minimal implementation**

Create a compact rail component:

```tsx
export function SupportRail({ queueItems, events, ticket, completion, loopMonitorUrl }: SupportRailProps) {
  return (
    <aside aria-label="SEJFA support rail" className={styles.rail}>
      <section>{/* queue stack */}</section>
      <section>{/* live tape */}</section>
      <section>{/* artifacts */}</section>
    </aside>
  );
}
```

Move queue/activity/artifact rendering out of the center layout and into this component. Keep health indicators small.

**Step 4: Run tests to verify they pass**

Run:

```bash
cd voice-app && npm test -- --run src/__tests__/App.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add voice-app/src/components/SupportRail.tsx \
  voice-app/src/styles/components/SupportRail.module.css \
  voice-app/src/App.tsx \
  voice-app/src/__tests__/App.test.tsx
git commit -m "feat: add SEJFA support rail"
```

**Verification Gate:**
1. Automated: `cd voice-app && npm test -- --run src/__tests__/App.test.tsx` -- pass
2. Manual: In the browser, confirm queue/activity/artifacts read as one subordinate rail
3. Regression: `cd voice-app && npm test` -- full suite passes
4. Review: Rail content is visually secondary to the center canvas

> **GATE RULE:** Do not proceed to Task 4 until all four checks pass. If the gate fails, fix before moving on. Never skip.

### Task 4: Add the Detail Shelf and Remove Dashboard Clutter

**Chunk estimate:** ~25 min (Sonnet)

**Files:**
- Create: `voice-app/src/components/DetailShelf.tsx`
- Create: `voice-app/src/styles/components/DetailShelf.module.css`
- Modify: `voice-app/src/App.tsx`
- Modify: `voice-app/src/components/AudioPreview.tsx`
- Modify: `voice-app/src/components/ClarificationDialog.tsx`
- Modify: `voice-app/src/components/SuccessCard.tsx`
- Modify: `voice-app/src/__tests__/components.test.tsx`

**Step 1: Write the failing tests**

Add tests that expect transcript and technical details to live in a collapsible bottom shelf.

```tsx
expect(screen.getByRole("button", { name: /Show technical details/i })).toBeInTheDocument();
expect(screen.getByLabelText("SEJFA detail shelf")).toBeInTheDocument();
```

Update existing tests so success and clarification content no longer appear as separate primary dashboard sections.

**Step 2: Run tests to verify they fail**

Run:

```bash
cd voice-app && npm test -- --run src/__tests__/components.test.tsx src/__tests__/App.test.tsx
```

Expected: FAIL because the new shelf and revised expectations are not implemented.

**Step 3: Write minimal implementation**

Create a detail shelf:

```tsx
export function DetailShelf({ transcription, detailsEntries, children }: DetailShelfProps) {
  return (
    <section aria-label="SEJFA detail shelf" className={styles.shelf}>
      {/* transcript */}
      {/* extracted context / clarification */}
      {/* technical log panel */}
    </section>
  );
}
```

Reduce `SuccessCard` to a signal/outcome summary rather than a primary dashboard block. Keep clarification anchored to the center flow.

**Step 4: Run tests to verify they pass**

Run:

```bash
cd voice-app && npm test -- --run src/__tests__/components.test.tsx src/__tests__/App.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add voice-app/src/components/DetailShelf.tsx \
  voice-app/src/styles/components/DetailShelf.module.css \
  voice-app/src/App.tsx \
  voice-app/src/components/AudioPreview.tsx \
  voice-app/src/components/ClarificationDialog.tsx \
  voice-app/src/components/SuccessCard.tsx \
  voice-app/src/__tests__/components.test.tsx \
  voice-app/src/__tests__/App.test.tsx
git commit -m "refactor: move transcript and logs into detail shelf"
```

**Verification Gate:**
1. Automated: `cd voice-app && npm test -- --run src/__tests__/components.test.tsx src/__tests__/App.test.tsx` -- pass
2. Manual: Confirm idle no longer looks like a stack of co-equal content cards
3. Regression: `cd voice-app && npm test` -- full suite passes
4. Review: Transcript/log detail now sits below the main experience rather than inside the center story

> **GATE RULE:** Do not proceed to Task 5 until all four checks pass. If the gate fails, fix before moving on. Never skip.

### Task 5: Implement Distinct State Compositions and Motion

**Chunk estimate:** ~30 min (Sonnet)

**Files:**
- Modify: `voice-app/src/components/TransformationCanvas.tsx`
- Modify: `voice-app/src/styles/components/TransformationCanvas.module.css`
- Modify: `voice-app/src/components/MissionReactor.tsx`
- Modify: `voice-app/src/styles/components/MissionReactor.module.css`
- Modify: `voice-app/src/__tests__/App.test.tsx`

**Step 1: Write the failing tests**

Add UI-state coverage for the main compositions:

```tsx
expect(screen.getByText("Listening for the objective")).toBeInTheDocument();
expect(screen.getByText("Waiting for one missing detail")).toBeInTheDocument();
expect(screen.getByText("Queued for Ralph Loop")).toBeInTheDocument();
expect(screen.getByText("Blocked in deploy")).toBeInTheDocument();
```

Add tests ensuring `running` renders the active loop stage prominently and `done` surfaces outcome links through the center flow.

**Step 2: Run tests to verify they fail**

Run:

```bash
cd voice-app && npm test -- --run src/__tests__/App.test.tsx
```

Expected: FAIL because the state compositions are still too uniform.

**Step 3: Write minimal implementation**

Refine the transformation canvas:

```tsx
switch (canvasState.phase) {
  case "listening":
    return <ListeningCanvas ... />;
  case "clarifying":
    return <ClarificationCanvas ... />;
  case "blocked":
    return <BlockedCanvas ... />;
  default:
    return <BaseCanvas ... />;
}
```

Use CSS transitions for:

- intake energy
- work-core condensation
- ring activation
- clarification seam
- blocked jam
- done settle

Avoid introducing a heavy animation framework in pass 1.

**Step 4: Run tests to verify they pass**

Run:

```bash
cd voice-app && npm test -- --run src/__tests__/App.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add voice-app/src/components/TransformationCanvas.tsx \
  voice-app/src/styles/components/TransformationCanvas.module.css \
  voice-app/src/components/MissionReactor.tsx \
  voice-app/src/styles/components/MissionReactor.module.css \
  voice-app/src/__tests__/App.test.tsx
git commit -m "feat: add state-driven SEJFA canvas compositions"
```

**Verification Gate:**
1. Automated: `cd voice-app && npm test -- --run src/__tests__/App.test.tsx` -- pass
2. Manual: Inspect idle, listening, clarifying, running, blocked, and done in the browser; each state must feel compositionally distinct
3. Regression: `cd voice-app && npm test` -- full suite passes
4. Review: Motion is purposeful and state-linked, not decorative

> **GATE RULE:** Do not proceed to Task 6 until all four checks pass. If the gate fails, fix before moving on. Never skip.

### Task 6: Remove Old Surface Code and Finalize the App Shell

**Chunk estimate:** ~25 min (Sonnet)

**Files:**
- Modify: `voice-app/src/App.tsx`
- Modify: `voice-app/src/components/Header.tsx`
- Modify: `voice-app/src/components/StatusBadge.tsx`
- Modify: `voice-app/index.html`
- Delete or stop using: `voice-app/src/components/DesktopSurfaceView.tsx`
- Delete or stop using: `voice-app/src/styles/components/DesktopSurfaceView.module.css`
- Modify: `voice-app/src/__tests__/App.test.tsx`

**Step 1: Write the failing tests**

Add or update tests that assert the old surface is gone.

```tsx
expect(screen.queryByText("Objective Console")).not.toBeInTheDocument();
expect(screen.queryByText("Ralph Loop Workspace")).not.toBeInTheDocument();
expect(screen.getByLabelText("SEJFA transformation canvas")).toBeInTheDocument();
```

**Step 2: Run tests to verify they fail**

Run:

```bash
cd voice-app && npm test -- --run src/__tests__/App.test.tsx
```

Expected: FAIL because the old labels or structure are still present.

**Step 3: Write minimal implementation**

Finalize `App.tsx` to compose:

```tsx
<AppShell>
  <Header ... />
  <TransformationCanvas ... />
  <SupportRail ... />
  <DetailShelf ... />
  <SettingsDrawer ... />
  <ToastContainer ... />
</AppShell>
```

Remove or stop importing the old `DesktopSurfaceView`.

**Step 4: Run tests to verify they pass**

Run:

```bash
cd voice-app && npm test -- --run src/__tests__/App.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add voice-app/src/App.tsx \
  voice-app/src/components/Header.tsx \
  voice-app/src/components/StatusBadge.tsx \
  voice-app/index.html \
  voice-app/src/__tests__/App.test.tsx \
  voice-app/src/components/DesktopSurfaceView.tsx \
  voice-app/src/styles/components/DesktopSurfaceView.module.css
git commit -m "refactor: replace dashboard surface with SEJFA canvas"
```

**Verification Gate:**
1. Automated: `cd voice-app && npm test -- --run src/__tests__/App.test.tsx` -- pass
2. Manual: Confirm the old dashboard language and layout are gone
3. Regression: `cd voice-app && npm test` -- full suite passes
4. Review: The app now reads as one transforming system rather than peer panels

> **GATE RULE:** Do not proceed to Task 7 until all four checks pass. If the gate fails, fix before moving on. Never skip.

### Task 7: Final Verification and Cleanup

**Chunk estimate:** ~20 min (Sonnet)

**Files:**
- Review: `voice-app/src/**`
- Review: `voice-app/index.html`
- Review: `voice-app/src-tauri/tauri.conf.json`

**Step 1: Run the full automated checks**

Run:

```bash
cd voice-app && npm test
cd voice-app && npm run build
cd voice-app && npm run lint
```

Expected:

- all Vitest suites pass
- production build succeeds
- lint exits cleanly

**Step 2: Run manual UI verification**

Run:

```bash
cd voice-app && npm run dev
```

Manually verify:

- idle feels calm and center-first
- listening visibly feeds the machine
- clarifying is in-canvas, not dashboard-like
- running highlights loop progression
- blocked is diagnostic
- done settles into outcome

**Step 3: Review the diff**

Run:

```bash
git diff --stat
git diff
```

Expected: intentional surface rewrite, no stale dashboard code, no dead imports.

**Step 4: Commit**

```bash
git add voice-app
git commit -m "feat: redesign SEJFA desktop as transformation canvas"
```

**Verification Gate:**
1. Automated: `cd voice-app && npm test && npm run build && npm run lint` -- all pass
2. Manual: UI states match the approved design document
3. Regression: No removed feature from voice intake, queue, or monitor plumbing unless intentionally replaced
4. Review: Diff is cohesive and old dashboard leftovers are removed

> **GATE RULE:** Stop here only when all four checks pass.
