import { useEffect, useState } from "react";
import { fetchTaskInbox } from "@sejfa/data-client";
import type { TaskSummary } from "@sejfa/shared-types";
import { useAppStore } from "../stores/appStore";

/**
 * Fetches the current task inbox through the voice-pipeline bridge.
 * The backend now resolves this against Linear and returns task-neutral data.
 */
export function useTaskInbox(interval = 30_000) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const voiceUrl = useAppStore((s) => s.voiceUrl);
  const apiToken = useAppStore((s) => s.apiToken);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const nextTasks = await fetchTaskInbox(voiceUrl, 20, { apiToken });
        if (!cancelled) {
          setTasks(nextTasks);
          setError(null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Task inbox is currently unavailable.");
          setLoading(false);
        }
      }
    }

    void load();
    const timer = setInterval(() => {
      void load();
    }, interval);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [voiceUrl, apiToken, interval]);

  return { tasks, loading, error };
}
