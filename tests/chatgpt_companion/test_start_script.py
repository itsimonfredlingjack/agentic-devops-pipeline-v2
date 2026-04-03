from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_start_script_exists_with_required_commands() -> None:
    script_path = REPO_ROOT / "scripts" / "start-chatgpt-companion.sh"

    assert script_path.exists()

    content = script_path.read_text(encoding="utf-8")
    assert content.startswith("#!/usr/bin/env bash")
    assert "uvicorn src.chatgpt_companion.mcp_server:app" in content
    assert "cloudflared tunnel run macos-mcp" in content
    assert "from monitor.models import init_db" in content
