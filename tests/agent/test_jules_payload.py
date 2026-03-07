"""Unit tests for scripts/jules_payload.py.

Important: These tests avoid invoking git directly. In this repo, running `git init`
inside pytest temp dirs can be risky (worktree/shared gitdir). Instead we mock
`run_git` to validate selection and truncation behavior.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

SCRIPT_PATH = Path("scripts/jules_payload.py")

spec = importlib.util.spec_from_file_location("jules_payload", SCRIPT_PATH)
assert spec is not None
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def test_mask_line_redacts_sensitive_values() -> None:
    line = "Authorization: Bearer abcdefghijklmnop"
    assert "[REDACTED]" in module.mask_line(line)


def test_is_excluded_path_filters_vendor_and_binaries() -> None:
    assert module.is_excluded_path("vendor/pkg/file.py")
    assert module.is_excluded_path("assets/logo.png")
    assert not module.is_excluded_path("src/voice_pipeline/main.py")


def test_build_compact_diff_selects_top_file_by_size(monkeypatch) -> None:
    def fake_run_git(args: list[str]) -> str:
        # args examples:
        # ['diff', '--numstat', 'base..head']
        # ['diff', '--name-status', 'base..head']
        # ['diff', '--unified=3', 'base..head', '--', 'file']
        if args[:2] == ["diff", "--numstat"]:
            return "10\t0\tbig.py\n1\t0\tsmall.py\n"
        if args[:2] == ["diff", "--name-status"]:
            return "M\tbig.py\nM\tsmall.py\n"
        if args[:2] == ["diff", "--unified=3"] and args[-1] == "big.py":
            return "diff --git a/big.py b/big.py\n@@ -1 +1 @@\n-x\n+y\n"
        if args[:2] == ["diff", "--unified=3"] and args[-1] == "small.py":
            return "diff --git a/small.py b/small.py\n@@ -1 +1 @@\n-a\n+b\n"
        return ""

    monkeypatch.setattr(module, "run_git", fake_run_git)

    budget = module.ProfileBudget(
        max_diff_chars=4000,
        max_log_lines=50,
        max_context_chars=2000,
        max_files=1,
        max_hunks_per_file=5,
        max_error_snippets=5,
    )

    diff, patch_index, files_changed_count = module.build_compact_diff(
        base_sha="base",
        head_sha="head",
        budget=budget,
    )

    assert files_changed_count == 2
    assert patch_index[0]["path"] == "big.py"
    assert "FILE: big.py" in diff


def test_trim_context_limits_payload_size() -> None:
    context = {
        "changed_files": ["a.py", "b.py", "c.py"],
        "patch_index": [{"path": "a.py"}, {"path": "b.py"}, {"path": "c.py"}],
        "compact_diff": "A" * 1000,
        "error_snippets": ["B" * 200, "C" * 200],
    }

    trimmed = module.trim_context(context, max_chars=280)
    serialized = module.json.dumps(trimmed, ensure_ascii=True, separators=(",", ":"))

    assert len(serialized) <= 280
