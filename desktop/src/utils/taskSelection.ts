import type { TaskSummary } from "@sejfa/shared-types";

export function resolveSelectedTask(
  tasks: TaskSummary[],
  selectedTaskId: string | null,
): TaskSummary | null {
  if (tasks.length === 0) return null;
  if (!selectedTaskId) return tasks[0];
  return tasks.find((task) => task.id === selectedTaskId) ?? tasks[0];
}

