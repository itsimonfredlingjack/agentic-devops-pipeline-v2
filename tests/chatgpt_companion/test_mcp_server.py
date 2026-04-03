import json

from fastapi.testclient import TestClient

from src.chatgpt_companion.mcp_server import (
    _rewrite_compat_payload,
    app,
    fetch,
    get_current_mission_share,
    get_mission_share,
    get_project_overview_context,
    list_recent_sessions_default,
    mcp,
    render_current_mission_dashboard,
    render_mission_dashboard,
    search,
)
from src.chatgpt_companion.service import MissionService


def test_health_endpoint() -> None:
    client = TestClient(app)
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_render_dashboard_returns_structured_payload(monkeypatch) -> None:
    fake_payload = {
        "mission_phase": "queued",
        "ticket": {"key": "DEV-11", "summary": "Test"},
        "latest_events": [],
    }
    monkeypatch.setattr(
        "src.chatgpt_companion.mcp_server.mission_service",
        MissionService(),
    )
    monkeypatch.setattr(
        "src.chatgpt_companion.mcp_server.mission_service.build_dashboard_payload",
        lambda session_id=None, ticket_id=None: fake_payload,
    )

    result = render_mission_dashboard()

    assert result.structuredContent == fake_payload
    assert result.meta["dashboardJson"]


def test_streamable_http_allows_configured_cloudflare_host() -> None:
    security = mcp.settings.transport_security

    assert security is not None
    assert "sejfa-chat.fredlingautomation.dev" in security.allowed_hosts


def test_streamable_http_is_stateless_for_tools_list() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/mcp",
            headers={
                "accept": "application/json, text/event-stream",
                "host": "sejfa-chat.fredlingautomation.dev",
            },
            json={
                "jsonrpc": "2.0",
                "id": "1",
                "method": "tools/list",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["jsonrpc"] == "2.0"
    assert payload["id"] == "1"
    assert "result" in payload
    assert "tools" in payload["result"]


def test_direct_tool_method_is_rewritten_to_tools_call() -> None:
    payload = _rewrite_compat_payload(
        {
            "jsonrpc": "2.0",
            "id": "compat-1",
            "method": "get_active_mission",
        }
    )

    assert payload["method"] == "tools/call"
    assert payload["params"]["name"] == "get_active_mission"
    assert payload["params"]["arguments"] == {}


def test_flat_tools_call_is_rewritten_to_standard_params() -> None:
    payload = _rewrite_compat_payload(
        {
            "jsonrpc": "2.0",
            "id": "compat-2",
            "method": "tools/call",
            "name": "get_jira_issue",
            "arguments": {"issue_key": "DEV-40"},
        }
    )

    assert payload["method"] == "tools/call"
    assert payload["params"]["name"] == "get_jira_issue"
    assert payload["params"]["arguments"] == {"issue_key": "DEV-40"}


def test_search_tool_uses_standard_wrapper(monkeypatch) -> None:
    monkeypatch.setattr(
        "src.chatgpt_companion.mcp_server.mission_service.search_documents",
        lambda query: {
            "results": [
                {
                    "id": "README.md",
                    "title": "README.md",
                    "url": "https://sejfa-chat.fredlingautomation.dev/workspace/README.md",
                }
            ]
        },
    )

    result = search("mission")
    payload = json.loads(result.content[0].text)

    assert payload["results"][0]["id"] == "README.md"


def test_fetch_tool_uses_standard_wrapper(monkeypatch) -> None:
    monkeypatch.setattr(
        "src.chatgpt_companion.mcp_server.mission_service.fetch_document",
        lambda document_id: {
            "id": document_id,
            "title": "README.md",
            "text": "# SEJFA",
            "url": "https://sejfa-chat.fredlingautomation.dev/workspace/README.md",
            "metadata": {"path": "README.md"},
        },
    )

    result = fetch("README.md")
    payload = json.loads(result.content[0].text)

    assert payload["id"] == "README.md"
    assert payload["metadata"]["path"] == "README.md"


def test_workspace_route_serves_safe_project_file() -> None:
    client = TestClient(app)
    response = client.get("/workspace/README.md")

    assert response.status_code == 200
    assert "SEJFA" in response.text


def test_get_mission_share_returns_structured_payload(monkeypatch) -> None:
    fake_payload = {
        "mission_phase": "agent_active",
        "share": {
            "url": "https://share.example.com/share/session/sess-viral",
            "text": "SEJFA mission update",
        },
    }
    monkeypatch.setattr(
        "src.chatgpt_companion.mcp_server.mission_service.build_share_payload",
        lambda session_id=None, ticket_id=None, event_name=None: fake_payload,
    )

    result = get_mission_share(session_id="sess-viral")

    assert result.structuredContent == fake_payload
    assert result.meta["shareUrl"] == fake_payload["share"]["url"]


def test_wrapper_friendly_alias_tools_return_default_payloads(monkeypatch) -> None:
    monkeypatch.setattr(
        "src.chatgpt_companion.mcp_server.mission_service.list_recent_sessions",
        lambda limit=10: {"sessions": [], "count": limit},
    )
    monkeypatch.setattr(
        "src.chatgpt_companion.mcp_server.mission_service.get_project_context",
        lambda topic="overview": {"topic": topic, "path": "README.md"},
    )
    monkeypatch.setattr(
        "src.chatgpt_companion.mcp_server.mission_service.build_dashboard_payload",
        lambda session_id=None, ticket_id=None: {"mission_phase": "queued"},
    )
    monkeypatch.setattr(
        "src.chatgpt_companion.mcp_server.mission_service.build_share_payload",
        lambda session_id=None, ticket_id=None, event_name=None: {
            "share": {"url": "https://example.test/share/current", "text": "SEJFA mission update"}
        },
    )

    assert list_recent_sessions_default()["count"] == 10
    assert get_project_overview_context()["topic"] == "overview"
    assert render_current_mission_dashboard().structuredContent["mission_phase"] == "queued"
    assert get_current_mission_share().meta["shareUrl"] == "https://example.test/share/current"


def test_share_session_route_serves_public_snapshot(monkeypatch) -> None:
    monkeypatch.setattr(
        "src.chatgpt_companion.mcp_server.mission_service.render_share_page",
        lambda session_id=None: "<html><body>Shared SEJFA mission</body></html>",
    )

    client = TestClient(app)
    response = client.get("/share/session/sess-viral")

    assert response.status_code == 200
    assert "Shared SEJFA mission" in response.text
