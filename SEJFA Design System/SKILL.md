---
name: sejfa-design
description: Use this skill to generate well-branded interfaces and assets for SEJFA — Agentic DevOps Loop, either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, logos, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick orientation
- `README.md` — product context, content + visual foundations, iconography
- `colors_and_type.css` — the CSS variable layer; import this in any artifact
- `fonts/` — JetBrains Mono, Inter, Fraunces (woff2, latin)
- `assets/` — logos (light / dark / mark)
- `ui_kits/app/` — admin dashboard React kit (paper surface)
- `ui_kits/agent-console/` — terminal three-pane kit (vault surface) — the signature look
- `ui_kits/marketing/` — editorial home page kit (Fraunces display)
- `preview/` — small specimen cards for each design-system atom

## Non-negotiables
- No emoji. Never.
- Dark top nav (vault-950) on the app; paper content. This contrast is the product's recognition.
- Loop-green (#43A314) is reserved for agent activity, active state, success.
- Fraunces is marketing-only. Never in product UI.
- Icons: Lucide (line, 1.75px stroke) OR inline Unicode glyphs (`✓ ✕ ⟳ ▸ ▮ · →`). No custom SVG icons without reason.
- Borders are hairline; shadows are warm (`rgba(20,19,15, …)`); no backdrop-blur.
