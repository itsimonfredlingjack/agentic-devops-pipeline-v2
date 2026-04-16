import { useEffect, useState } from "react";
import { fetchJiraIssues, type JiraIssueCompact } from "@sejfa/data-client";
import type { LinearIssue, Priority, Status } from "../mockLinearData";
import { useAppStore } from "../stores/appStore";

/** Map Jira status names to the Status union used by UI components. */
function mapStatus(jiraStatus: string): Status {
  const s = jiraStatus.toLowerCase();
  if (s.includes("done") || s.includes("closed") || s.includes("resolved")) return "done";
  if (s.includes("progress")) return "in-progress";
  if (s.includes("review")) return "review";
  if (s.includes("todo") || s.includes("to do") || s.includes("selected")) return "todo";
  if (s.includes("cancel")) return "canceled";
  return "backlog";
}

/** Map Jira priority names to the Priority union used by UI components. */
function mapPriority(jiraPriority: string | null): Priority {
  if (!jiraPriority) return "none";
  const p = jiraPriority.toLowerCase();
  if (p.includes("highest") || p.includes("blocker")) return "urgent";
  if (p.includes("high") || p.includes("critical")) return "high";
  if (p.includes("medium")) return "medium";
  if (p.includes("low")) return "low";
  return "none";
}

function toLinearIssue(jira: JiraIssueCompact): LinearIssue {
  return {
    id: jira.key,
    title: jira.summary,
    status: mapStatus(jira.status),
    priority: mapPriority(jira.priority),
    assignee: jira.assignee ?? undefined,
    labels: jira.labels,
  };
}

/**
 * Hook that fetches Jira issues via the voice pipeline proxy.
 * Polls every `interval` ms. Falls back to empty array on error.
 */
export function useJiraIssues(interval = 30_000) {
  const [issues, setIssues] = useState<LinearIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const voiceUrl = useAppStore((s) => s.voiceUrl);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const raw = await fetchJiraIssues(voiceUrl);
        if (!cancelled) {
          setIssues(raw.map(toLinearIssue));
          setError(null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Jira issues are currently unavailable.");
          setLoading(false);
        }
      }
    }

    load();
    const timer = setInterval(load, interval);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [voiceUrl, interval]);

  return { issues, loading, error };
}
