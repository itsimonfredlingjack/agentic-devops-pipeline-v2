"""MCP server for the SEJFA ChatGPT Developer Companion."""

from __future__ import annotations

import json

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import CallToolResult, TextContent, ToolAnnotations
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse

from src.chatgpt_companion.config import config
from src.chatgpt_companion.service import (
    MissionService,
    WorkspaceSecurityError,
    pretty_json,
)
from src.chatgpt_companion.widget import load_widget_html
from src.sejfa.integrations.jira_client import JiraAPIError

WIDGET_URI = "ui://widget/sejfa-mission-dashboard-v1.html"

mission_service = MissionService()
mcp = FastMCP(
    "sejfa-chatgpt-companion",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=config.allowed_hosts,
        allowed_origins=config.allowed_origins,
    ),
)


def _readonly_annotations() -> ToolAnnotations:
    return ToolAnnotations(
        readOnlyHint=True,
        destructiveHint=False,
        openWorldHint=False,
        idempotentHint=True,
    )


def _json_text_result(payload: dict) -> CallToolResult:
    return CallToolResult(
        content=[
            TextContent(
                type="text",
                text=json.dumps(payload, ensure_ascii=True),
            )
        ]
    )


@mcp.resource(
    WIDGET_URI,
    name="SEJFA Mission Dashboard",
    title="SEJFA Mission Dashboard",
    description="Mission visibility widget for the SEJFA ChatGPT companion.",
    mime_type="text/html;profile=mcp-app",
    meta={
        "ui": {
            "prefersBorder": True,
            "csp": {
                "connectDomains": [],
                "resourceDomains": [],
            },
        },
        "openai/widgetDescription": (
            "Displays the current SEJFA mission, session summary, timeline, and evidence."
        ),
        "openai/widgetPrefersBorder": True,
        "openai/widgetCSP": {
            "connect_domains": [],
            "resource_domains": [],
        },
    },
)
def mission_dashboard_resource() -> str:
    return load_widget_html()


@mcp.tool(
    title="Get active mission",
    description=(
        "Use this when you want the current SEJFA mission, mission phase, "
        "session state, connection health, queue state, gates, and latest events."
    ),
    annotations=_readonly_annotations(),
)
def get_active_mission() -> dict:
    return mission_service.get_active_mission()


@mcp.tool(
    title="List recent sessions",
    description=(
        "Use this when you want recent Ralph Loop and monitor sessions with outcomes, "
        "cost, ticket IDs, and event counts."
    ),
    annotations=_readonly_annotations(),
)
def list_recent_sessions(limit: int = 10) -> dict:
    return mission_service.list_recent_sessions(limit=limit)


@mcp.tool(
    title="Get session events",
    description=(
        "Use this when you want normalized event history for a session or ticket, "
        "including tool activity, errors, timestamps, and cost signals."
    ),
    annotations=_readonly_annotations(),
)
def get_session_events(
    session_id: str | None = None,
    ticket_id: str | None = None,
    limit: int = 25,
) -> dict:
    return mission_service.get_session_events(
        session_id=session_id,
        ticket_id=ticket_id,
        limit=limit,
    )


@mcp.tool(
    title="Get Jira issue",
    description=(
        "Use this when you want Jira ticket details, status, labels, parent or subtask "
        "context, and a compact comment summary."
    ),
    annotations=_readonly_annotations(),
)
def get_jira_issue(issue_key: str) -> dict:
    try:
        return mission_service.get_jira_issue(issue_key)
    except (JiraAPIError, ValueError) as exc:
        return {"error": str(exc), "issue_key": issue_key}


@mcp.tool(
    title="Search knowledge",
    description=(
        "Use this when you want ChatGPT to find relevant SEJFA project files by query "
        "using the standard MCP search pattern."
    ),
    annotations=_readonly_annotations(),
)
def search(query: str) -> CallToolResult:
    return _json_text_result(mission_service.search_documents(query=query))


@mcp.tool(
    title="Fetch document",
    description=(
        "Use this when you want the full text of a specific SEJFA project document "
        "or source file using the standard MCP fetch pattern."
    ),
    annotations=_readonly_annotations(),
)
def fetch(id: str) -> CallToolResult:
    try:
        return _json_text_result(mission_service.fetch_document(id))
    except (FileNotFoundError, WorkspaceSecurityError, ValueError) as exc:
        return _json_text_result({"id": id, "error": str(exc)})


@mcp.tool(
    title="Search workspace",
    description=(
        "Use this when you want to search the live local SEJFA workspace for code, "
        "docs, prompts, or config content by query."
    ),
    annotations=_readonly_annotations(),
)
def search_workspace(
    query: str,
    source: str = "all",
    path_prefix: str = "",
) -> dict:
    try:
        return mission_service.search_workspace(query=query, source=source, path_prefix=path_prefix)
    except ValueError as exc:
        return {"error": str(exc), "query": query}


@mcp.tool(
    title="Fetch workspace file",
    description=(
        "Use this when you want a safe excerpt from a local SEJFA workspace file, "
        "including line numbers and truncation metadata."
    ),
    annotations=_readonly_annotations(),
)
def fetch_workspace_file(
    path: str,
    start_line: int = 1,
    end_line: int | None = None,
) -> dict:
    try:
        return mission_service.fetch_workspace_file(path=path, start_line=start_line, end_line=end_line)
    except (FileNotFoundError, ValueError) as exc:
        return {"error": str(exc), "path": path}


@mcp.tool(
    title="Get project context",
    description=(
        "Use this when you want canonical SEJFA project context such as overview, "
        "architecture, workflow, voice pipeline context, or monitor API context."
    ),
    annotations=_readonly_annotations(),
)
def get_project_context(topic: str = "overview") -> dict:
    try:
        return mission_service.get_project_context(topic=topic)
    except ValueError as exc:
        return {"error": str(exc), "topic": topic}


@mcp.tool(
    title="Render mission dashboard",
    description=(
        "Use this when you want to render the SEJFA mission dashboard widget for the "
        "current mission or a specific session."
    ),
    annotations=_readonly_annotations(),
    meta={
        "openai/outputTemplate": WIDGET_URI,
        "ui": {"resourceUri": WIDGET_URI},
    },
)
def render_mission_dashboard(
    session_id: str | None = None,
    ticket_id: str | None = None,
) -> CallToolResult:
    payload = mission_service.build_dashboard_payload(session_id=session_id, ticket_id=ticket_id)
    return CallToolResult(
        content=[
            TextContent(
                type="text",
                text="Rendered the SEJFA mission dashboard for the current analysis context.",
            )
        ],
        _meta={
            "dashboardJson": pretty_json(payload),
        },
        structuredContent=payload,
    )


@mcp.custom_route("/health", methods=["GET"])
async def health(_request: Request) -> JSONResponse:
    return JSONResponse(
        {
            "status": "ok",
            "service": "sejfa-chatgpt-companion",
            "widget_built": mission_service.workspace.repo_root.joinpath(
                "chatgpt-companion", "web", "dist", "index.html"
            ).exists(),
        }
    )


@mcp.custom_route("/workspace/{path:path}", methods=["GET"])
async def workspace_file(_request: Request) -> PlainTextResponse | JSONResponse:
    path = _request.path_params["path"]
    try:
        document = mission_service.fetch_document(path)
    except FileNotFoundError:
        return JSONResponse({"error": "Not found", "path": path}, status_code=404)
    except WorkspaceSecurityError:
        return JSONResponse({"error": "Blocked", "path": path}, status_code=403)
    return PlainTextResponse(document["text"])


app = mcp.streamable_http_app()
