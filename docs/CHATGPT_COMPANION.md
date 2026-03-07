# SEJFA ChatGPT Developer Companion

The ChatGPT Developer Companion is a private Apps SDK app for reviewing SEJFA
from ChatGPT Developer Mode.

It is intentionally read-only in v1:

- inspect the live local workspace
- inspect Jira tickets
- inspect recent mission sessions and events
- render a compact mission dashboard widget in ChatGPT
- expose standard MCP `search` and `fetch` tools so ChatGPT can retrieve repo context easily

## Run locally

1. Build the widget:

```bash
cd chatgpt-companion/web
npm install
npm run build
```

2. Start everything with one command:

```bash
cd /Users/coffeedev/Projects/03_AGENTIC-DEVOPS/agentic-devops-pipeline-v2
./scripts/start-chatgpt-companion.sh start
```

Useful companion commands:

```bash
./scripts/start-chatgpt-companion.sh status
./scripts/start-chatgpt-companion.sh logs
./scripts/start-chatgpt-companion.sh stop
./scripts/start-chatgpt-companion.sh restart
```

3. Validate with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector@latest --server-url http://localhost:8787/mcp --transport http
```

## Current tool surface

- `search`
- `fetch`
- `get_active_mission`
- `list_recent_sessions`
- `get_session_events`
- `get_jira_issue`
- `search_workspace`
- `fetch_workspace_file`
- `get_project_context`
- `render_mission_dashboard`

## Safety defaults

- repo access is restricted to this project root
- `.env`, runtime databases, caches, build artifacts, and nested repos are blocked
- no shell execution
- no file mutation
- no Jira writes
- no loop-control actions

## Helpful URLs

- MCP endpoint: `https://sejfa-chat.fredlingautomation.dev/mcp`
- Safe workspace file route: `https://sejfa-chat.fredlingautomation.dev/workspace/<path>`
