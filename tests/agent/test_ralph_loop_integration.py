"""Integration tests for Ralph Loop mechanism."""

import json
import subprocess
from pathlib import Path


class TestStopHookIntegration:
    """Test stop-hook.py works correctly."""

    def test_hook_blocks_without_promise(self, tmp_path):
        """Hook should return exit code 2 when promise not found and flag exists."""
        # Create ralph loop flag
        claude_dir = tmp_path / ".claude"
        claude_dir.mkdir()
        (claude_dir / ".ralph_loop_active").touch()

        # Copy stop-hook to tmp_path
        hook_source = Path(".claude/hooks/stop-hook.py")
        hook_dest = tmp_path / ".claude" / "hooks" / "stop-hook.py"
        hook_dest.parent.mkdir(parents=True, exist_ok=True)
        hook_dest.write_text(hook_source.read_text())

        # Run hook with no promise in transcript
        result = subprocess.run(
            ["python3", str(hook_dest)],
            input=json.dumps({"transcript": "no promise here"}),
            capture_output=True,
            text=True,
            cwd=tmp_path,
        )

        # Should block (exit 2) when ralph_loop_active flag exists
        assert result.returncode == 2

    def test_hook_allows_with_promise(self, tmp_path):
        """Hook should return exit code 0 when promise found."""
        # Create ralph loop flag
        claude_dir = tmp_path / ".claude"
        claude_dir.mkdir()
        (claude_dir / ".ralph_loop_active").touch()

        # Copy stop-hook to tmp_path
        hook_source = Path(".claude/hooks/stop-hook.py")
        hook_dest = tmp_path / ".claude" / "hooks" / "stop-hook.py"
        hook_dest.parent.mkdir(parents=True, exist_ok=True)
        hook_dest.write_text(hook_source.read_text())

        # Run hook WITH promise in transcript
        result = subprocess.run(
            ["python3", str(hook_dest)],
            input=json.dumps({"transcript": "<promise>DONE</promise>"}),
            capture_output=True,
            text=True,
            cwd=tmp_path,
        )

        # Should allow exit (exit 0) because promise found
        assert result.returncode == 0

    def test_hook_allows_without_flag(self, tmp_path):
        """Hook should return exit code 0 when no ralph_loop_active flag exists."""
        # Create .claude dir but NO ralph_loop_active flag
        claude_dir = tmp_path / ".claude"
        claude_dir.mkdir()

        # Copy stop-hook to tmp_path
        hook_source = Path(".claude/hooks/stop-hook.py")
        hook_dest = tmp_path / ".claude" / "hooks" / "stop-hook.py"
        hook_dest.parent.mkdir(parents=True, exist_ok=True)
        hook_dest.write_text(hook_source.read_text())

        # Run hook - no flag file exists
        result = subprocess.run(
            ["python3", str(hook_dest)],
            input=json.dumps({"transcript": "no promise here"}),
            capture_output=True,
            text=True,
            cwd=tmp_path,
        )

        # Without ralph_loop_active flag, should allow exit immediately
        assert result.returncode == 0

    def test_hook_increments_iteration_counter(self, tmp_path):
        """Hook should increment iteration counter on each call."""
        # Create ralph loop flag
        claude_dir = tmp_path / ".claude"
        claude_dir.mkdir()
        (claude_dir / ".ralph_loop_active").touch()

        # Copy stop-hook to tmp_path
        hook_source = Path(".claude/hooks/stop-hook.py")
        hook_dest = tmp_path / ".claude" / "hooks" / "stop-hook.py"
        hook_dest.parent.mkdir(parents=True, exist_ok=True)
        hook_dest.write_text(hook_source.read_text())

        # Run hook multiple times
        for _ in range(3):
            subprocess.run(
                ["python3", str(hook_dest)],
                input=json.dumps({"transcript": "no promise"}),
                capture_output=True,
                text=True,
                cwd=tmp_path,
            )

        # Check state file has correct iteration count
        state_file = tmp_path / ".claude" / "ralph-state.json"
        assert state_file.exists()

        with open(state_file) as f:
            state = json.load(f)
        assert state["iterations"] == 3
