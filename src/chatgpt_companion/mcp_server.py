"""MCP server for the SEJFA ChatGPT Developer Companion."""

from __future__ import annotations

import json
from typing import Any

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import CallToolResult, TextContent, ToolAnnotations
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, PlainTextResponse

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
    json_response=True,
    stateless_http=True,
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


def _instrumented_annotations() -> ToolAnnotations:
    return ToolAnnotations(
        readOnlyHint=False,
        destructiveHint=False,
        openWorldHint=False,
        idempotentHint=False,
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
    title="List recent sessions default",
    description=(
        "Use this when your MCP client can only send a method name and you want the recent "
        "SEJFA sessions without passing arguments."
    ),
    annotations=_readonly_annotations(),
)
def list_recent_sessions_default() -> dict:
    return mission_service.list_recent_sessions(limit=10)


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
        return mission_service.fetch_workspace_file(
            path=path, start_line=start_line, end_line=end_line
        )
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
    title="Get project overview context",
    description=(
        "Use this when your MCP client can only send a method name and you want the default "
        "SEJFA project overview context without passing arguments."
    ),
    annotations=_readonly_annotations(),
)
def get_project_overview_context() -> dict:
    return mission_service.get_project_context(topic="overview")


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


@mcp.tool(
    title="Render current mission dashboard",
    description=(
        "Use this when your MCP client can only send a method name and you want the default "
        "SEJFA mission dashboard for the current mission without passing arguments."
    ),
    annotations=_readonly_annotations(),
    meta={
        "openai/outputTemplate": WIDGET_URI,
        "ui": {"resourceUri": WIDGET_URI},
    },
)
def render_current_mission_dashboard() -> CallToolResult:
    return render_mission_dashboard()


@mcp.tool(
    title="Get mission share",
    description=(
        "Use this when you want a concise SEJFA status brief plus a public mission snapshot "
        "link that can be pasted into chat, Slack, Jira, or email."
    ),
    annotations=_instrumented_annotations(),
)
def get_mission_share(
    session_id: str | None = None,
    ticket_id: str | None = None,
) -> CallToolResult:
    payload = mission_service.build_share_payload(
        session_id=session_id,
        ticket_id=ticket_id,
        event_name="mission_share_requested",
    )
    share = payload.get("share") or {}
    return CallToolResult(
        content=[
            TextContent(
                type="text",
                text=f"Prepared a SEJFA mission share brief for {share.get('url', 'the current mission')}.",
            )
        ],
        structuredContent=payload,
        _meta={
            "shareUrl": share.get("url", ""),
            "shareText": share.get("text", ""),
        },
    )


@mcp.tool(
    title="Get current mission share",
    description=(
        "Use this when your MCP client can only send a method name and you want the default "
        "share link and summary for the current SEJFA mission without passing arguments."
    ),
    annotations=_instrumented_annotations(),
)
def get_current_mission_share() -> CallToolResult:
    return get_mission_share()


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


@mcp.custom_route("/share/current", methods=["GET"])
async def share_current(_request: Request) -> HTMLResponse:
    return HTMLResponse(mission_service.render_share_page())


@mcp.custom_route("/share/session/{session_id}", methods=["GET"])
async def share_session(_request: Request) -> HTMLResponse:
    return HTMLResponse(
        mission_service.render_share_page(session_id=_request.path_params["session_id"])
    )


MCP_STANDARD_METHODS = {
    "initialize",
    "notifications/initialized",
    "ping",
    "completion/complete",
    "logging/setLevel",
    "prompts/get",
    "prompts/list",
    "resources/list",
    "resources/templates/list",
    "resources/read",
    "resources/subscribe",
    "resources/unsubscribe",
    "roots/list",
    "sampling/createMessage",
    "tasks/get",
    "tasks/result",
    "tasks/list",
    "tasks/cancel",
    "tools/list",
    "tools/call",
}


def _tool_names() -> set[str]:
    return {tool.name for tool in mcp._tool_manager.list_tools()}


def _rewrite_compat_payload(payload: dict[str, Any]) -> dict[str, Any]:
    method = payload.get("method")
    if not isinstance(method, str):
        return payload

    if method == "tools/call" and "params" not in payload:
        if "name" in payload or "arguments" in payload:
            return {
                key: value
                for key, value in {
                    **payload,
                    "params": {
                        "name": payload.get("name"),
                        "arguments": payload.get("arguments", {}),
                    },
                }.items()
                if key not in {"name", "arguments"}
            }
        return payload

    if method not in MCP_STANDARD_METHODS and method in _tool_names():
        params = payload.get("params", {})
        if params is None:
            params = {}
        if not isinstance(params, dict):
            return payload
        return {
            **payload,
            "method": "tools/call",
            "params": {
                "name": method,
                "arguments": params,
            },
        }

    return payload


class MCPCompatibilityShim:
    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http" or scope["method"] != "POST" or scope["path"] != "/mcp":
            await self.app(scope, receive, send)
            return

        body_chunks: list[bytes] = []
        more_body = True
        while more_body:
            message = await receive()
            if message["type"] != "http.request":
                await self.app(scope, receive, send)
                return
            body_chunks.append(message.get("body", b""))
            more_body = message.get("more_body", False)

        original_body = b"".join(body_chunks)
        rewritten_body = original_body
        rewritten_scope = scope

        try:
            payload = json.loads(original_body)
        except json.JSONDecodeError:
            payload = None

        if isinstance(payload, dict):
            normalized = _rewrite_compat_payload(payload)
            if normalized != payload:
                rewritten_body = json.dumps(normalized, ensure_ascii=True).encode("utf-8")
                headers = [
                    (key, value)
                    for key, value in scope.get("headers", [])
                    if key.lower() != b"content-length"
                ]
                headers.append((b"content-length", str(len(rewritten_body)).encode("ascii")))
                rewritten_scope = {**scope, "headers": headers}

        sent = False

        async def replay_receive() -> dict[str, Any]:
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": rewritten_body, "more_body": False}
            return {"type": "http.disconnect"}

        await self.app(rewritten_scope, replay_receive, send)


app = MCPCompatibilityShim(mcp.streamable_http_app())
