# App — UI kit (SEJFA admin dashboard)

Paper-colored Flask admin view. Five routes:

- **Dashboard** — KPIs, recent pipeline runs, agent-log card, monitor checks
- **Newsflash** — articles list + new-article form (newsflash module)
- **Expenses** — month-to-date + recent entries (expense_tracker module)
- **Monitor** — health checks + uptime KPIs (monitor module)
- **Admin** — owner profile + MFA (core module)

Files:
- `index.html` — the click-thru prototype; picks the right view from sidebar
- `style.css` — layout + component styles on top of the global tokens
- `Components.jsx` — shared React components (sidebar, topbar, KPI, Panel, Table, StatusPill, Button, Field)

Icons come from Lucide via CDN. Route is persisted to localStorage.
