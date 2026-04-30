# UI/UX Polish Plan: Brutal Review Fixes

## Goal
Fix the most severe visual and interaction design issues identified in the desktop app and ChatGPT companion widget so the product feels intentional, cohesive, and polished — not like "a competent engineer's UI."

## Scope
1. **Design-system consolidation** — collapse the sprawl of background/foreground colors and spacing tokens.
2. **Typography dethroning** — remove monospace overuse; reserve it for IDs, code, timestamps.
3. **Sidebar cohesion** — fix the green-shifted orphan background and unreadable micro-text.
4. **MonitorDashboard cleanup** — remove scanlines, fix loop-rail active states, add visual weight.
5. **Cross-product type unification** — align desktop and companion widget font stacks.
6. **Button & CTA affordance** — increase contrast so buttons look pressable.
7. **Empty-state warmth** — rewrite copy and add micro-actions.
8. **OmniPrompt animation** — animate the voice-panel open/close to stop layout jumps.
9. **Phase visibility** — strengthen ambient phase communication (gradients, borders, icons).
10. **Dead-code & micro-bugs** — remove `display: none` on `.pageTitle`, delete unused tokens.

## Files Likely Touched
- `desktop/src/index.css`
- `desktop/src/App.module.css`
- `desktop/src/components/Sidebar.module.css`
- `desktop/src/components/Sidebar.tsx`
- `desktop/src/components/MasterWorkspace.module.css`
- `desktop/src/components/MasterWorkspace.tsx`
- `desktop/src/components/MonitorDashboard.module.css`
- `desktop/src/components/MonitorDashboard.tsx`
- `desktop/src/components/OmniPrompt.module.css`
- `desktop/src/components/OmniPrompt.tsx`
- `chatgpt-companion/web/src/styles.css`
- `chatgpt-companion/web/src/App.tsx`
- `desktop/src/components/MicButton.module.css` (if hover/active states are inadequate)

## Ordered Steps

### Step 1 — Audit & token consolidation (index.css)
- **Task**: Reduce background colors to 3 depths: `canvas`, `raised`, `panel`.
- **Task**: Reduce foreground opacities to 3: `primary` (0.96), `secondary` (0.72), `muted` (0.44).
- **Task**: Delete or alias redundant tokens (`--appkit-vault-*` duplicates, `--surface-command-*`, `--surface-monitor-*` families).
- **Task**: Establish a 4px base grid; replace arbitrary gap values (14, 18, 22, 28) with multiples of 8 (8, 16, 24, 32).
- **Validation**: `index.css` token count drops by ~30 %. No visual regressions in Storybook or dev build.

### Step 2 — Typography purge
- **Task**: In `index.css`, add explicit `--font-ui` (Inter) and `--font-data` (Geist Mono) tokens.
- **Task**: In `Sidebar.module.css`, change `.orgTitle`, `.sectionTitle`, `.modeBtn`, `.viewBtn` from `var(--font-mono)` to `var(--font-body)` or `var(--font-ui)`.
- **Task**: In `MasterWorkspace.module.css`, change `.crumb`, `.panelTitle`, `.panelMeta`, `.metricLabel`, `.metricMeta` to `var(--font-ui)`.
- **Task**: Keep mono only for: IDs, timestamps, metric **values**, code snippets, status pills.
- **Validation**: Visual check — top bar, sidebar, panel headers no longer look like a terminal.

### Step 3 — Sidebar cohesion
- **Task**: Change `.sidebar` background from `#0b0d0a` (green-shifted orphan) to `var(--bg-shell)` or `var(--appkit-vault-950)` so it belongs to the same product.
- **Task**: Increase `.modeBtn` and `.viewBtn` font-size from `10px`/`9px` to `11px` minimum; increase padding for touch targets.
- **Task**: Replace the raw green square logomark (`background: linear-gradient(135deg, #10b981, #059669)`) with a neutral or brand-accented treatment that matches the loop green (`--appkit-loop`) if accent is needed, or use the actual SVG logo.
- **Validation**: Sidebar no longer looks like a different app pasted in.

### Step 4 — MonitorDashboard fixes
- **Task**: Remove `repeating-linear-gradient` scanlines from `.monitorDash` background.
- **Task**: Redesign `.agentLoopRail` active node: add left border accent, stronger background shift, or icon indicator. Current `inset 0 -2px 0` is too subtle.
- **Task**: Add a label or tooltip to the density switcher so users know what "Comfort / Compact" means.
- **Validation**: No scanlines visible; active loop stage is scannable at 3m distance.

### Step 5 — Cross-product type unification
- **Task**: In `chatgpt-companion/web/src/styles.css`, change `font-family` from `"Space Grotesk"` to `var(--font-body)` (Inter stack).
- **Task**: Change companion mono font from `"IBM Plex Mono"` to `var(--font-mono)` (Geist Mono stack).
- **Validation**: Desktop and companion widget share the same font personalities.

### Step 6 — Button affordance
- **Task**: In companion `styles.css`, raise button `background` from `rgba(82, 210, 255, 0.12)` to at least `0.22` and border to `0.35`.
- **Task**: In desktop, audit primary/secondary button backgrounds; ensure `background` + `border` combo hits 3:1 contrast against panel backgrounds.
- **Validation**: Buttons look pressable on non-OLED displays.

### Step 7 — Empty states
- **Task**: In companion `App.tsx`, rewrite empty copy:
  - "No evidence cards yet." → "Sentinels appear after your first gate runs."
  - "No connection probes available." → "Connections will show once the monitor API is reachable."
  - "No timeline events yet." → "Events appear as the loop progresses."
- **Task**: Optionally add a small neutral icon (e.g., `Activity`, `Zap` from lucide) above empty text.
- **Validation**: Empty states feel like guidance, not dead ends.

### Step 8 — OmniPrompt animation
- **Task**: In `OmniPrompt.module.css`, add `max-height` and `opacity` transition for `.voicePanel` when `[data-voice-panel="open"]`.
- **Task**: Use `transition: max-height 220ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms ease;`.
- **Validation**: Toggling voice panel does not cause a layout jump.

### Step 9 — Phase visibility
- **Task**: In `App.module.css`, increase phase radial-gradient opacity from `0.18–0.24` to `0.35–0.45`.
- **Task**: In `MasterWorkspace.module.css`, add a `border-left: 3px solid var(--active-phase-color)` or top-bar underline that changes with phase.
- **Task**: Ensure `phasePill` uses the accent color strongly enough to be a status beacon.
- **Validation**: A user can tell the current phase from across the room without reading text.

### Step 10 — Dead-code cleanup
- **Task**: Remove `.pageTitle { display: none; }` from `MasterWorkspace.module.css` and either style it properly or remove the JSX element.
- **Task**: Delete any unused CSS classes discovered during the refactor (e.g., leftover `--surface-command-*` if fully aliased).
- **Validation**: `npm run lint` / `ruff` passes; no orphaned selectors.

## Risks
| Risk | Mitigation |
|------|------------|
| Color reduction breaks a component that relied on a deleted token | Use find-all before deletion; replace with nearest semantic alias. |
| Monospace removal makes data-heavy screens (terminal feed) harder to scan | Only purge mono from UI chrome; keep it for `.terminal`, `.metricValue`, IDs. |
| Sidebar background change feels too similar to workspace and loses separation | Add a subtle right-border or 1px shadow instead of a wildly different bg. |
| Companion widget font change alters perceived density | Adjust `font-size` and `line-height` companions if Inter reads larger than Space Grotesk. |
| Phase gradient opacity increase looks garish | Cap at 0.45 and test on cheap monitors; use `mix-blend-mode: soft-light` if needed. |

## Validation
- [ ] `npm --workspace desktop run build` passes.
- [ ] `npm --prefix chatgpt-companion/web run build` passes.
- [ ] `ruff check .` passes.
- [ ] Visual QA: sidebar, dashboard, command mode, companion widget all checked in dev build.
- [ ] Accessibility: button contrast verified via dev tools; focus rings still visible.

## Rollback
- All changes are CSS/TSX-only; no backend or data-model changes.
- If a step introduces a regression, revert the specific module file (`git checkout -- <path>`).
- If the entire branch is bad, discard branch and re-cut from `main`.

## Handoff to Builder
- Builder should execute steps in order; each step is self-contained and can be committed independently.
- Prioritize Step 1 (tokens) and Step 3 (sidebar) first — they have the highest visual impact.
- Step 5 (companion fonts) can be done in parallel if a second builder lane is available.
- After every 3 steps, run the validation block to catch regressions early.
