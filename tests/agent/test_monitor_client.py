from __future__ import annotations

import importlib.util
from pathlib import Path


HOOK_CLIENT_PATH = (
    Path(__file__).resolve().parents[2] / ".claude" / "hooks" / "monitor_client.py"
)


def load_monitor_client():
    spec = importlib.util.spec_from_file_location("monitor_client", HOOK_CLIENT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_monitor_client_uses_configured_base_url(monkeypatch):
    monkeypatch.setenv("SEJFA_MONITOR_API_URL", "http://127.0.0.1:8110")
    client = load_monitor_client()

    assert client._monitor_events_url() == "http://127.0.0.1:8110/events"


def test_monitor_client_preserves_explicit_events_path(monkeypatch):
    monkeypatch.delenv("SEJFA_MONITOR_API_URL", raising=False)
    monkeypatch.setenv("MONITOR_URL", "http://127.0.0.1:8110/events")
    client = load_monitor_client()

    assert client._monitor_events_url() == "http://127.0.0.1:8110/events"
