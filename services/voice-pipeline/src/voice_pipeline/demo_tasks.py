"""In-memory demo task store for local SEJFA demos."""

from __future__ import annotations

from copy import deepcopy
from typing import Any


def _normalize_priority(priority: str) -> str:
    normalized = priority.strip().lower()
    if normalized in {"urgent", "highest"}:
        return "urgent"
    if normalized == "high":
        return "high"
    if normalized == "medium":
        return "medium"
    if normalized in {"low", "lowest"}:
        return "low"
    return "none"


class DemoTaskStore:
    """Serves a small editable task inbox without external dependencies."""

    def __init__(self) -> None:
        self._next_id = 104
        self._tasks: dict[str, dict[str, Any]] = {}
        for task in self._seed_tasks():
            self._tasks[task["id"]] = task

    def _seed_tasks(self) -> list[dict[str, Any]]:
        return [
            {
                "id": "DEMO-101",
                "title": "Ship a local demo mode that feels alive",
                "status": "todo",
                "priority": "high",
                "assignee": "Operator",
                "labels": ["demo", "operator-flow"],
                "source": "manual",
                "source_label": "Demo Workspace",
                "source_type": "draft",
                "issue_type": "demo",
                "description": (
                    "Let the desktop feel useful without Linear or remote services. "
                    "The goal is confidence, not perfect parity."
                ),
                "url": None,
            },
            {
                "id": "DEMO-102",
                "title": "Capture a voice note and review the generated task draft",
                "status": "in-progress",
                "priority": "medium",
                "assignee": "Tony",
                "labels": ["voice", "review"],
                "source": "voice",
                "source_label": "Demo Workspace",
                "source_type": "draft",
                "issue_type": "story",
                "description": (
                    "Run the intake flow, let the operator edit the summary, "
                    "and keep the save path local while the real tracker is offline."
                ),
                "url": None,
            },
            {
                "id": "DEMO-103",
                "title": "Show the monitor and queue surfaces with believable sample work",
                "status": "backlog",
                "priority": "low",
                "assignee": None,
                "labels": ["monitor", "queue"],
                "source": "manual",
                "source_label": "Demo Workspace",
                "source_type": "draft",
                "issue_type": "chore",
                "description": (
                    "Make it easy to show the command desk without apologizing for missing integrations."
                ),
                "url": None,
            },
        ]

    def list_tasks(self, max_results: int = 20) -> list[dict[str, Any]]:
        return [deepcopy(task) for task in list(self._tasks.values())[:max_results]]

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        task = self._tasks.get(task_id)
        if task is None:
            return None
        return deepcopy(task)

    def create_task(self, title: str, description: str, priority: str) -> dict[str, Any]:
        task_id = f"DEMO-{self._next_id}"
        self._next_id += 1
        task = {
            "id": task_id,
            "title": title.strip(),
            "status": "todo",
            "priority": _normalize_priority(priority),
            "assignee": "Operator",
            "labels": ["demo", "new"],
            "source": "manual",
            "source_label": "Demo Workspace",
            "source_type": "draft",
            "issue_type": "demo",
            "description": description.strip(),
            "url": None,
        }
        self._tasks = {task_id: task, **self._tasks}
        return deepcopy(task)

    def update_task(
        self, task_id: str, title: str, description: str, priority: str
    ) -> dict[str, Any]:
        task = self._tasks.get(task_id)
        if task is None:
            raise KeyError(task_id)

        updated = {
            **task,
            "title": title.strip(),
            "description": description.strip(),
            "priority": _normalize_priority(priority),
        }
        self._tasks[task_id] = updated
        return deepcopy(updated)
