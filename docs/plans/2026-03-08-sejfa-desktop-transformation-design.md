# SEJFA Desktop Transformation Design

Date: 2026-03-08
Status: Approved for implementation planning

## Goal

Redesign the Tauri `voice-app` so it feels like SEJFA itself: a loop-first autonomous delivery system where a spoken objective visibly becomes structured work, enters the Ralph Loop, and resolves into a result.

## Problem Statement

The current desktop UI fails at a structural level, not just a styling level.

It still reads like a dashboard made of peer surfaces:

- voice capture card
- transcript card
- queue card
- facts card
- activity card
- loop map card

That composition makes the app feel like a scratch pad or a broken painting instead of a living delivery machine. Styling polish cannot fix that. The redesign must replace the layout model itself.

## Product Truth

This design follows the canonical repo docs:

- SEJFA is the loop-first system.
- Voice is the start or feed layer into the loop.
- Monitoring is a companion capability around the loop.
- The loop itself is the product identity.

The desktop app therefore needs to show one coherent system:

`spoken objective -> task context -> ticket/session -> Ralph Loop -> outcome`

## Chosen Direction

Recommended concept:

`Transformation Engine + Living Ticket`

The center of the app is a single machine-like canvas. It begins as an intake surface for voice. As the user speaks and submits, that same surface condenses into a structured work object, then into a live ticket/session core inside the Ralph Loop. The user never feels like they switch tools or move between unrelated panels.

## Core Design Principle

Keep one central object that changes identity:

`spoken objective -> structured work -> live run -> result`

Everything else is subordinate to that transformation.

## Screen Model

The new app is not a two-column dashboard. It is a single transforming center canvas with supporting rails.

### Top Frame

A quiet persistent header containing:

- SEJFA wordmark
- current system tone
- backend and monitor connection health
- settings access

This frame should stay compact and never compete with the center canvas.

### Center Canvas

The primary product surface. This owns most of the window.

It is the visual home for:

- voice intake
- task shaping
- ticket/session identity
- live loop execution
- blockage
- completion

### Support Rail

A narrow supporting rail, likely on the right.

It contains:

- queue stack
- compact live event tape
- artifacts and direct links
- small system health indicators

It must remain secondary to the center canvas in every state.

### Detail Shelf

A collapsible bottom shelf for verbose or technical information:

- transcript
- extracted context
- raw logs
- technical details
- debug traces

This information is important, but it should never dominate the main visual story.

## Center Canvas Anatomy

### 1. Intake Aperture

The voice entry point.

- In `idle`, it is the dominant mic control.
- In `listening`, it visibly receives audio energy.
- After submission, it stops being "the button" and becomes the feed line into the work core.

### 2. Work Core

The heart of the app.

It starts empty, then becomes:

- spoken objective
- extracted task context
- Jira ticket
- live session/run object
- completed outcome or blocked result

This object always remains in the center of the app.

### 3. Loop Ring

The Ralph Loop wrapped around the work core.

It is not a separate card. It is part of the same machine surface.

Suggested stage model:

- intake
- ticket
- agent
- actions
- verify
- done

Only relevant stages should activate. Idle stages remain subdued.

### 4. Clarification Seam

If the system needs more detail, the work core becomes visibly incomplete.

The question appears inside the machine surface, as a seam or missing segment. Clarification feels like completing the run object, not dealing with a detached modal.

### 5. Outcome Dock

When the run completes, the center object exposes the results directly:

- ticket
- PR link
- verification summary
- follow-up action
- retry path
- blocked reason if relevant

### 6. State Caption

A short plain-language caption tied to the canvas, for example:

- Listening for the objective
- Extracting task context
- Waiting for one missing detail
- Queued for Ralph Loop
- Running verification
- Blocked in deploy

This keeps the design expressive without becoming ambiguous.

## Visual Language

### Overall Feel

The app should feel like:

`industrial ritual + autonomous machine + high-signal operator surface`

Not:

- generic SaaS dashboard
- fake spaceship control room
- neon hacker UI
- glass-note board

### Form Language

- Use harder geometry, arcs, seams, tracks, rings, and anchored lines.
- Use glow sparingly and only to communicate active flow.
- Favor embedded surfaces over floating peer cards.

### Color Story

- Base field: deep navy, graphite, near-black blue
- Voice intake: warm coral, ember, copper tones
- Active execution: cold cyan and ice blue
- Verification and caution: muted amber
- Blocked or failure: restrained red
- Completion: quiet green

This creates a readable emotional progression:

`warm human input -> cold machine execution -> settled result`

### Typography

- Large titles: bold and decisive
- Stage labels and small system text: mono or technical uppercase
- Explanatory body copy: short and restrained

### Composition Rules

- The center owns the screen.
- No equal-weight boxes.
- State changes reshape composition instead of just recoloring labels.
- Information density increases only when the system becomes active.

## Motion Language

Motion is functional, not decorative.

- `Listening`: energy flows inward toward the work core
- `Processing`: fragments condense into structure
- `Clarifying`: a seam opens or a segment remains incomplete
- `Running`: activity moves around the loop ring by stage
- `Blocked`: motion slows or jams at a stage
- `Done`: the system settles into a stable outcome state

No particle spectacle, gratuitous pulsing, or cinematic noise.

## State-by-State Behavior

### Idle

- Large intake aperture centered
- Faint loop ring around an empty work core
- Minimal support rail: queue and health
- Calm, open composition

Desired feeling: the system is ready to receive work.

### Listening

- Intake aperture activates immediately
- Audio energy flows inward
- Work core starts reacting
- Support rail stays visually quiet

Desired feeling: SEJFA is actively taking in the objective.

### Processing

- Intake recedes
- Transcript and intent begin condensing inside the work core
- Status caption communicates the current phase
- Loop ring starts to resolve

Desired feeling: raw speech is becoming real work.

### Clarifying

- Work core remains visible but incomplete
- Missing detail appears in a clarification seam
- Partial context stays visible in reduced form

Desired feeling: the machine almost has it and needs one final piece.

### Queued

- Ticket/session identity becomes stable
- Loop ring becomes fully legible
- Queue rail reflects placement among other work

Desired feeling: the objective is now a tracked work unit.

### Running

- Active loop stage is obvious
- Motion travels through stages
- Work core remains stable as ticket/session identity
- Support rail becomes more informative

Desired feeling: the loop is doing autonomous delivery work now.

### Blocked

- Blocked stage dominates the ring
- Motion stalls there
- Relevant evidence is elevated in the rail

Desired feeling: the user can see where the run jammed and why.

### Done

- Ring settles
- Work core becomes an outcome object
- Result links and summaries emerge directly from the center

Desired feeling: the system completed the run and is ready for inspection or follow-up.

## Information Architecture

### Center Canvas

Primary responsibilities:

- show intake
- show transformation
- show the current ticket/session
- show current loop state
- show outcome or blockage

### Support Rail

Secondary responsibilities:

- show pending queue items
- show compact event tape
- show utility links
- show tiny health and cost indicators

### Detail Shelf

Tertiary responsibilities:

- transcript
- extracted context
- raw logs
- technical diagnostics

## Recommended First Rebuild Scope

This is a frontend architecture and visual model rewrite, not a backend rewrite.

Scope for pass 1:

1. Replace the current `DesktopSurfaceView` with a `TransformationCanvas`-based layout.
2. Implement distinct compositions for `idle`, `listening`, `processing`, `clarifying`, `queued/running`, and `blocked/done`.
3. Consolidate queue, activity, artifacts, and health into a single support rail.
4. Move transcript and technical details into a bottom detail shelf.
5. Reuse the existing backend, sockets, queue polling, and store as much as possible.
6. Use restrained motion built from scale, opacity, position, ring progress, and seam transitions.

## What We Are Not Doing

- keeping the current equal-weight card layout
- keeping a peer "voice side" and "loop side"
- overbuilding a cinematic animation system
- turning the app into a fake command center
- adding a second major mode or page for monitoring
- rebuilding backend schemas unless implementation proves blocked

## Open Questions

- Should the support rail collapse further during `listening` so the center owns even more attention?
- Should `done` emphasize artifacts first or a settled loop state first?
- Should clarification support typed reply only in pass 1, or immediate voice reply inside the seam?
- How much of the current `MissionReactor` logic can be reused while replacing its visual form?

## Implementation Recommendation

Build around:

- `TransformationCanvas`
- `IntakeAperture`
- `WorkCore`
- `LoopRing`
- `ClarificationSeam`
- `SupportRail`
- `DetailShelf`

This is the cleanest way to make the desktop app feel like a system that turns spoken intent into autonomous delivery work.
