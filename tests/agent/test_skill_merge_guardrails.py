from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
START_TASK_SKILL = REPO_ROOT / ".claude/skills/start-task/SKILL.md"
FINISH_TASK_SKILL = REPO_ROOT / ".claude/skills/finish-task/SKILL.md"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_finish_task_uses_non_blocking_auto_merge_handoff() -> None:
    content = _read(FINISH_TASK_SKILL)
    assert "gh pr merge --squash --auto" in content
    assert "autoMergeRequest != null" in content


def test_start_task_requires_auto_merge_or_merged_state() -> None:
    content = _read(START_TASK_SKILL)
    assert "gh pr merge --squash --auto <PR_URL>" in content
    assert "autoMergeRequest!=null" in content


def test_blocking_polling_loop_not_reintroduced() -> None:
    forbidden = (
        "for i in {1..30}; do",
        'gh pr checks --required "${PR_URL}" && break',
        "sleep 10",
    )
    for skill_path in (START_TASK_SKILL, FINISH_TASK_SKILL):
        content = _read(skill_path)
        for pattern in forbidden:
            assert pattern not in content


def test_start_task_no_legacy_required_checks_rules() -> None:
    content = _read(START_TASK_SKILL)
    assert "Auto-merge is disabled in this repo" not in content
    assert "Wait only for required checks" not in content
