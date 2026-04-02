import { useEffect, useState } from "react";
import { useAppStore } from "../stores/appStore";
import { SessionSummary } from "@sejfa/shared-types";
import styles from "./GlobalMonitorView.module.css";

export function GlobalMonitorView() {
  const { monitorUrl } = useAppStore();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>SESSION ARCHIVE</h1>
        <p className={styles.subtitle}>Historical autonomic mission execution logs</p>
      </header>

      {loading ? (
        <div className={styles.loading}>Accessing telemetry vault...</div>
      ) : (
        <div className={styles.sessionList}>
          <div className={styles.listHeader}>
             <span>SESSION ID</span>
             <span>MISSION</span>
             <span>STARTED</span>
             <span>COST</span>
             <span>OUTCOME</span>
          </div>
          {sessions.map(s => (
            <div key={s.session_id} className={styles.sessionRow}>
              <span className={styles.sessionId}>{s.session_id.slice(0, 8)}...</span>
              <span className={styles.ticketId}>{s.ticket_id || "—"}</span>
              <span>{s.started_at ? new Date(s.started_at).toLocaleString() : "—"}</span>
              <span className={styles.cost}>{s.total_cost_usd ? `$${s.total_cost_usd.toFixed(3)}` : "$0.000"}</span>
              <span className={`${styles.outcome} ${s.outcome === 'done' ? styles.outcomeSuccess : styles.outcomeFail}`}>
                {(s.outcome || "unknown").toUpperCase()}
              </span>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className={styles.empty}>No historical telemetry found.</div>
          )}
        </div>
      )}
    </div>
  );
}
