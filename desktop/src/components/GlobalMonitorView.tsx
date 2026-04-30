import { Fragment, useCallback, useEffect, useState } from "react";
import { fetchTaskRuns } from "@sejfa/data-client";
import type { TaskRunSummary } from "@sejfa/shared-types";
import { useAppStore } from "../stores/appStore";
import styles from "./GlobalMonitorView.module.css";

type OutcomeFilter = "all" | "done" | "failed" | "blocked" | "aborted" | "pending";
type DateFilter = "all" | "today" | "week";

function resolveDateValue(run: TaskRunSummary): number | null {
  if (!run.startedAt) return null;
  const parsed = Date.parse(run.startedAt);
  return Number.isFinite(parsed) ? parsed : null;
}

export function GlobalMonitorView() {
  const { monitorUrl, density, apiToken } = useAppStore();
  const [runs, setRuns] = useState<TaskRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRuns(await fetchTaskRuns(monitorUrl, { apiToken }));
    } catch (e) {
      console.error("Failed to fetch runs", e);
      setError(e instanceof Error ? e.message : "Monitor API is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [monitorUrl, apiToken]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const filteredRuns = runs.filter((run) => {
    const normalizedSearch = search.trim().toLowerCase();
    if (normalizedSearch) {
      const inTask = (run.taskRef || "").toLowerCase().includes(normalizedSearch);
      const inRun = run.runId.toLowerCase().includes(normalizedSearch);
      if (!inTask && !inRun) return false;
    }

    if (outcomeFilter !== "all" && run.outcome !== outcomeFilter) {
      return false;
    }

    if (dateFilter !== "all") {
      const startedAt = resolveDateValue(run);
      if (!startedAt) return false;
      const now = Date.now();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartMs = todayStart.getTime();
      if (dateFilter === "today" && startedAt < todayStartMs) return false;
      if (dateFilter === "week" && startedAt < now - 7 * 24 * 60 * 60 * 1000) return false;
    }

    return true;
  });

  return (
    <div className={styles.container} data-density={density}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>History</h2>
          <p className={styles.subtitle}>Past task runs and execution details.</p>
        </div>

        <div className={styles.filters}>
          <input
            className={styles.filterInput}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter by task or run ID"
            aria-label="Filter runs by task or run ID"
          />
          <select
            className={styles.filterSelect}
            value={outcomeFilter}
            onChange={(event) => setOutcomeFilter(event.target.value as OutcomeFilter)}
            aria-label="Filter sessions by outcome"
          >
            <option value="all">All outcomes</option>
            <option value="done">Completed</option>
            <option value="failed">Failed</option>
            <option value="blocked">Blocked</option>
            <option value="aborted">Aborted</option>
            <option value="pending">Pending</option>
          </select>
          <select
            className={styles.filterSelect}
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value as DateFilter)}
            aria-label="Filter sessions by date"
          >
            <option value="all">All dates</option>
            <option value="today">Today</option>
            <option value="week">Last 7 days</option>
          </select>
        </div>
      </header>

      {loading ? (
        <div className={styles.loading} aria-label="Loading run history">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={styles.skeletonRow}>
              <div className={styles.skeletonLineShort} />
              <div className={styles.skeletonLineShort} />
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLineTiny} />
              <div className={styles.skeletonPill} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className={styles.errorState} role="alert">
          <strong>Run history unavailable.</strong>
          <span>{error}</span>
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => void loadRuns()}
          >
            Retry
          </button>
        </div>
      ) : (
        <div className={styles.sessionList} role="table" aria-label="Run history">
          <div className={styles.listHeader} role="row">
             <span role="columnheader">Run</span>
             <span role="columnheader">Task</span>
             <span role="columnheader">Started</span>
             <span role="columnheader">Cost</span>
             <span role="columnheader">Outcome</span>
          </div>
          {filteredRuns.map((run) => {
            const isExpanded = expandedSessionId === run.runId;
            return (
              <Fragment key={run.runId}>
                <div
                  className={styles.sessionRow}
                  role="row"
                  onClick={() => setExpandedSessionId(isExpanded ? null : run.runId)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedSessionId(isExpanded ? null : run.runId); } }}
                  tabIndex={0}
                  aria-expanded={isExpanded}
                >
                  <span className={styles.sessionId} role="cell">{run.runId.slice(0, 8)}…</span>
                  <span className={styles.ticketId} role="cell">{run.taskRef || "—"}</span>
                  <span role="cell">{run.startedAt ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "medium" }).format(new Date(run.startedAt)) : "—"}</span>
                  <span className={styles.cost} role="cell">{run.totalCostUsd ? `$${run.totalCostUsd.toFixed(3)}` : "$0.000"}</span>
                  <span
                    role="cell"
                    className={`${styles.outcome} ${
                      run.outcome === "done"
                        ? styles.outcomeSuccess
                        : run.outcome === "pending"
                          ? styles.outcomePending
                          : styles.outcomeFail
                    }`}
                  >
                    {run.outcome.toUpperCase()}
                  </span>
                </div>
                {isExpanded && (
                  <div className={styles.detailRow}>
                    <div className={styles.detailGrid}>
                      <div>
                        <span className={styles.detailLabel}>Run</span>
                        <span className={styles.detailValue}>{run.runId}</span>
                      </div>
                      <div>
                        <span className={styles.detailLabel}>Task</span>
                        <span className={styles.detailValue}>{run.taskRef || "No linked task"}</span>
                      </div>
                      <div>
                        <span className={styles.detailLabel}>Started</span>
                        <span className={styles.detailValue}>
                          {run.startedAt ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "full", timeStyle: "medium" }).format(new Date(run.startedAt)) : "Unknown"}
                        </span>
                      </div>
                      <div>
                        <span className={styles.detailLabel}>Cost</span>
                        <span className={styles.detailValue}>{run.totalCostUsd ? `$${run.totalCostUsd.toFixed(4)}` : "$0.0000"}</span>
                      </div>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
          {filteredRuns.length === 0 && (
            <div className={styles.empty}>
              <strong>No runs match this filter.</strong>
              <span>Adjust filters or run more sessions to populate this history.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
