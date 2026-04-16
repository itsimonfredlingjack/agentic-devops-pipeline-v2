import { Fragment, useEffect, useState } from "react";
import { useAppStore } from "../stores/appStore";
import { SessionSummary } from "@sejfa/shared-types";
import styles from "./GlobalMonitorView.module.css";

type OutcomeFilter = "all" | "done" | "failed" | "pending";
type DateFilter = "all" | "today" | "week";

function resolveOutcome(session: SessionSummary): "done" | "failed" | "pending" {
  if (session.outcome === "done") return "done";
  if (!session.outcome || session.outcome === "unknown") return "pending";
  return "failed";
}

function resolveDateValue(session: SessionSummary): number | null {
  if (!session.started_at) return null;
  const parsed = Date.parse(session.started_at);
  return Number.isFinite(parsed) ? parsed : null;
}

export function GlobalMonitorView() {
  const { monitorUrl, density } = useAppStore();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSessions() {
      try {
        const resp = await fetch(`${monitorUrl}/sessions`);
        if (resp.ok) {
          const data = await resp.json();
          setSessions(data);
        }
      } catch (e) {
        console.error("Failed to fetch sessions", e);
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, [monitorUrl]);

  const filteredSessions = sessions.filter((session) => {
    const normalizedSearch = search.trim().toLowerCase();
    if (normalizedSearch) {
      const inTicket = (session.ticket_id || "").toLowerCase().includes(normalizedSearch);
      const inSession = session.session_id.toLowerCase().includes(normalizedSearch);
      if (!inTicket && !inSession) return false;
    }

    const resolvedOutcome = resolveOutcome(session);
    if (outcomeFilter !== "all" && resolvedOutcome !== outcomeFilter) {
      return false;
    }

    if (dateFilter !== "all") {
      const startedAt = resolveDateValue(session);
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
        <h1 className={styles.title}>RUN HISTORY</h1>
        <p className={styles.subtitle}>Review past runs, filter outcomes, and inspect run details.</p>
      </header>

      <div className={styles.filters}>
        <input
          className={styles.filterInput}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter by ticket or session ID"
          aria-label="Filter sessions by ticket or session ID"
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

      {loading ? (
        <div className={styles.loading}>Loading run history...</div>
      ) : (
        <table className={styles.sessionList}>
          <thead>
            <tr className={styles.listHeader}>
               <th>SESSION ID</th>
               <th>MISSION</th>
               <th>STARTED</th>
               <th>COST</th>
               <th>OUTCOME</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.map((s) => {
              const isExpanded = expandedSessionId === s.session_id;
              const resolvedOutcome = resolveOutcome(s);
              return (
                <Fragment key={s.session_id}>
                  <tr
                    className={styles.sessionRow}
                    onClick={() => setExpandedSessionId(isExpanded ? null : s.session_id)}
                  >
                    <td className={styles.sessionId}>{s.session_id.slice(0, 8)}…</td>
                    <td className={styles.ticketId}>{s.ticket_id || "—"}</td>
                    <td>{s.started_at ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "medium" }).format(new Date(s.started_at)) : "—"}</td>
                    <td className={styles.cost}>{s.total_cost_usd ? `$${s.total_cost_usd.toFixed(3)}` : "$0.000"}</td>
                    <td
                      className={`${styles.outcome} ${
                        resolvedOutcome === "done" ? styles.outcomeSuccess : resolvedOutcome === "pending" ? styles.outcomePending : styles.outcomeFail
                      }`}
                    >
                      {resolvedOutcome.toUpperCase()}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className={styles.detailRow}>
                      <td colSpan={5}>
                        <div className={styles.detailGrid}>
                          <div>
                            <span className={styles.detailLabel}>Session</span>
                            <span className={styles.detailValue}>{s.session_id}</span>
                          </div>
                          <div>
                            <span className={styles.detailLabel}>Ticket</span>
                            <span className={styles.detailValue}>{s.ticket_id || "No linked ticket"}</span>
                          </div>
                          <div>
                            <span className={styles.detailLabel}>Started</span>
                            <span className={styles.detailValue}>
                              {s.started_at ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "full", timeStyle: "medium" }).format(new Date(s.started_at)) : "Unknown"}
                            </span>
                          </div>
                          <div>
                            <span className={styles.detailLabel}>Cost</span>
                            <span className={styles.detailValue}>{s.total_cost_usd ? `$${s.total_cost_usd.toFixed(4)}` : "$0.0000"}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filteredSessions.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  <strong>No runs match this filter.</strong>
                  <span>Adjust filters or run more sessions to populate this history.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
