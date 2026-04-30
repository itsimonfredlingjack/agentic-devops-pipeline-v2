from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_monitor_hook():
    module_name = "test_monitor_hook_module"
    module_path = Path(__file__).resolve().parents[2] / ".claude" / "hooks" / "monitor_hook.py"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules.pop(module_name, None)
    spec.loader.exec_module(module)
    return module


def test_handle_pre_tool_use_emits_task_ref_without_ticket_id(monkeypatch) -> None:
    hook = _load_monitor_hook()
    emitted: list[dict[str, object]] = []

    monkeypatch.setattr(hook, "post_event", lambda event: emitted.append(event))
    monkeypatch.setattr(hook, "_get_task_ref", lambda: "SEJ-42")

    hook.handle_pre_tool_use(
        {
            "tool_name": "Bash",
            "tool_input": {"command": "pytest tests/voice_pipeline -q"},
        }
    )

    assert len(emitted) == 1
    assert emitted[0]["task_ref"] == "SEJ-42"
    assert "ticket_id" not in emitted[0]


def test_handle_stop_emits_task_ref_without_ticket_id(monkeypatch) -> None:
    hook = _load_monitor_hook()
    emitted: list[dict[str, object]] = []

    monkeypatch.setattr(hook, "post_event", lambda event: emitted.append(event))
    monkeypatch.setattr(hook, "_get_task_ref", lambda: "SEJ-99")

    hook.handle_stop({})

    assert len(emitted) == 1
    assert emitted[0]["task_ref"] == "SEJ-99"
    assert emitted[0]["event_type"] == "stop"
    assert "ticket_id" not in emitted[0]
