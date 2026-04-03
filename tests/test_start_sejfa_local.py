from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_local_start_script_exists_with_expected_defaults() -> None:
    script_path = REPO_ROOT / "scripts" / "start-sejfa-local.sh"

    assert script_path.exists()

    content = script_path.read_text(encoding="utf-8")
    assert content.startswith("#!/usr/bin/env bash")
    assert 'MONITOR_PORT="${SEJFA_MONITOR_PORT:-8110}"' in content
    assert 'COMPANION_PORT="${SEJFA_CHATGPT_COMPANION_PORT:-8788}"' in content
    assert "uvicorn voice_pipeline.main:app" in content
    assert "uvicorn monitor.api:app" in content
    assert "uvicorn src.chatgpt_companion.mcp_server:app" in content
