# Agent Console — UI kit

The signature surface of SEJFA. Three-pane terminal-native view:

- **Left** — Jira-like backlog of GE-prefixed tickets, with live agent status.
- **Center** — The six-node **Agentic DevOps Loop** stepper + a live run log + a prompt bar.
- **Right** — Run metadata (iter, tests, coverage, safety, cost, elapsed) + actions.

Everything is mono on vault (#0B0D0A). Scanlines are subtle. The loop-green accent marks agent activity and success. No icons here — just glyphs (`▸ ✓ ✕ ⟳ ▮ · →`) that the mono renders cleanly.

This kit is implemented in a single `index.html` because it's a single view — the structure *is* the layout. If you fork it into a real product, split the three panes into React components (`<TicketList>`, `<AgentLoop>`, `<RunDetail>`) and share the vault palette from `colors_and_type.css`.
