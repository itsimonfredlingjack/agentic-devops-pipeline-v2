# Extreme Visual Makeover: "Aurora Command"

## Design Brief

**Problem:** The current UI is functional but visually flat — it looks like a competent engineer's dashboard, not a premium creative tool.

**User:** Technical operators who spend hours in this interface. They need status at a glance but deserve visual pleasure.

**Context:** Dark-room, focused work sessions. The app runs full-screen as a desktop companion.

**Success:** Someone screenshots the app because it looks beautiful. Status is readable from 2 meters away. The interface feels alive during active runs.

**Lane:** Operational UI with strong art-direction influence. Think "Apple Pro Display meets mission control."

**Dominant visual idea:** Atmospheric depth. Multi-layer translucent surfaces with phase-reactive ambient glow. The interface floats in a deep space with aurora light bleeding from the edges.

**Highest-risk state:** Active run (loop phase) — must feel energetic but not chaotic.

**One thing to avoid:** Gimmicky sci-fi clichés (holograms, excessive grid lines, terminal green). Keep it sophisticated and premium.

## Pillar 1: Atmospheric Canvas
- Deep multi-layer background: near-black base + subtle radial aurora gradients
- Phase-reactive ambient light: soft colored glow bleeds from corners based on current phase
- Noise texture overlay for film grain quality
- Eliminate all flat gray backgrounds

## Pillar 2: Cinematic Glass
- True glass morphism: `backdrop-filter: blur(20px)` on panels
- Light refraction edges: 1px borders with gradient fades
- Inner glow on active/hovered elements
- Layered depth: panels cast realistic shadows, not generic drop shadows

## Pillar 3: Typography Drama
- Section headers: 18–24px, weight 600, tight tracking
- Metric values: 32–40px display size for hero numbers
- Labels: 11px uppercase, generous letter-spacing, muted but readable
- Dramatic contrast between display type and metadata

## Pillar 4: Phase-Reactive Environment
- Each phase gets a distinctive ambient color that washes the interface
- Not garish — subtle, like a colored gel on a theatre light
- Top accent bar, corner glow, and selected borders shift together
- Idle = cool slate, Listening = cyan, Loop = violet, Done = emerald

## Pillar 5: Refined Telemetry
- Terminal feed: broadcast monitor aesthetic — dark well, colored status indicators, smooth row animations
- Metric cards: large hero numbers with subtle gradient backgrounds
- Timeline: clean dots with animated pulse for active items

## Pillar 6: Breathing Room
- Increase padding everywhere by 30–50%
- Border radius: 12–16px for panels, 8px for cards, 999px for pills
- Reduce border count by 60% — use spacing and shadow for separation
- Remove dashed borders entirely

## Files & Execution Order
1. `index.css` — New atmospheric tokens, shadows, aurora backgrounds
2. `App.module.css` — Canvas background with aurora layers
3. `Sidebar.module.css` — Depth-rich sidebar with glass treatment
4. `MasterWorkspace.module.css` — Cinematic metrics, refined panels
5. `MonitorDashboard.module.css` — Dramatic telemetry dashboard
6. `TerminalFeed.module.css` — Broadcast monitor aesthetic
7. `OmniPrompt.module.css` — Refined intake with glass
8. `Dialog.module.css` — Dramatic modal with depth
9. `CommandPalette.module.css` — Spotlight-style command palette
10. `MissionDossier.module.css` — Cleaner, airier dossier
11. `LoopConversationPanel.module.css` — Refined conversation cards
