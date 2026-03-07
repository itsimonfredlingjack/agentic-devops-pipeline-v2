"""Unit tests for scripts/jules_review_api.py.

These tests validate deterministic extraction of review text from session
activities without calling external APIs.
"""

from __future__ import annotations

import importlib.util
import sys
import textwrap
from pathlib import Path

SCRIPT_PATH = Path("scripts/jules_review_api.py")

spec = importlib.util.spec_from_file_location("jules_review_api", SCRIPT_PATH)
assert spec is not None
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def test_extract_agent_messages_collects_string_and_dict_messages() -> None:
    activities = [
        {"agentMessaged": {"agentMessage": "hello"}},
        {"agentMessaged": {"agentMessage": {"text": "world"}}},
        {"agentMessaged": {"agentMessage": {"content": "  trimmed  "}}},
        {"agentMessaged": {"agentMessage": {"nested": {"text": "deep"}}}},
    ]

    assert module.extract_agent_messages(activities) == [
        "hello",
        "world",
        "trimmed",
        "deep",
    ]


def test_select_best_agent_message_prefers_messages_with_severity() -> None:
    messages = [
        "All good.",
        "[LOW] foo.py:10 — Minor formatting issue",
    ]
    assert module.select_best_agent_message(messages) == messages[1]


def test_select_best_agent_message_prefers_more_findings() -> None:
    one = "[HIGH] a.py:1 — Issue A"
    two = "[HIGH] b.py:2 — Issue B\n[LOW] c.py:3 — Issue C"
    assert module.select_best_agent_message([one, two]) == two


def test_extract_review_text_strips_unified_diff_and_returns_only_added_lines() -> None:
    diff = textwrap.dedent(
        """\
        diff --git a/agent/PR_REVIEW.md b/agent/PR_REVIEW.md
        index 0000000..1111111 100644
        --- a/agent/PR_REVIEW.md
        +++ b/agent/PR_REVIEW.md
        @@ -1,6 +1,6 @@
        -## Critical Severity
        -### 1. Deletion of Monitor Hooks
        +[HIGH] tests/voice_pipeline/test_pipeline.py:16 — Quote the environment variable
        +[MEDIUM] app.py:111 — Add a return type hint
        +[LOW] foo.py:1 — Minor suggestion
        +[LOW] bar.py:2 — Minor suggestion
        """
    )
    session = {"outputs": [{"changeSet": {"diff": diff}}]}

    extracted = module.extract_review_text(session)

    assert extracted == "\n".join(
        [
            "[HIGH] tests/voice_pipeline/test_pipeline.py:16 — Quote the environment variable",
            "[MEDIUM] app.py:111 — Add a return type hint",
            "[LOW] foo.py:1 — Minor suggestion",
            "[LOW] bar.py:2 — Minor suggestion",
        ]
    )
    assert "diff --git" not in extracted
    assert "-## Critical Severity" not in extracted


def test_extract_review_text_ignores_removed_severity_lines() -> None:
    diff = textwrap.dedent(
        """\
        diff --git a/a b/a
        --- a/a
        +++ b/a
        @@ -1,2 +1,2 @@
        -[HIGH] a.py:1 — Old finding
        +No new findings
        """
    )
    session = {
        "diff": diff,
        "outputs": [{"pullRequest": {"title": "PR title for fallback"}}],
    }

    extracted = module.extract_review_text(session)

    assert "diff --git" not in extracted
    assert "-[HIGH] a.py:1 — Old finding" not in extracted


def test_extract_review_text_reads_outputs_change_set() -> None:
    diff = textwrap.dedent(
        """\
        diff --git a/agent/PR_REVIEW.md b/agent/PR_REVIEW.md
        --- a/agent/PR_REVIEW.md
        +++ b/agent/PR_REVIEW.md
        @@ -1 +1 @@
        +[HIGH] app.py:1 — Finding from changeSet
        """
    )
    session = {"outputs": [{"changeSet": {"diff": diff}}]}

    original = module._deep_find_texts

    def patched_deep_find_texts(
        obj: object,
        *,
        skip_keys: frozenset[str] = module._SKIP_KEYS,
        pattern: object = module.SEVERITY_RE,
        _depth: int = 0,
    ) -> list[str]:
        if pattern == module.SEVERITY_RE:
            return []
        assert isinstance(pattern, module.re.Pattern)
        return original(obj, skip_keys=skip_keys, pattern=pattern, _depth=_depth)

    module._deep_find_texts = patched_deep_find_texts
    try:
        extracted = module.extract_review_text(session)
    finally:
        module._deep_find_texts = original

    assert extracted == "[HIGH] app.py:1 — Finding from changeSet"
