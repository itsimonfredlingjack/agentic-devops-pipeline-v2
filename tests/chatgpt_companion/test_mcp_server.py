from fastapi.testclient import TestClient

import json

from src.chatgpt_companion.mcp_server import (
    app,
    fetch,
    mcp,
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
