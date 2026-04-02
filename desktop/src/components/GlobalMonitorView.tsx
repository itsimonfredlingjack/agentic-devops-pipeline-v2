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
            {sessions.map(s => (
              <tr key={s.session_id} className={styles.sessionRow}>
                <td className={styles.sessionId}>{s.session_id.slice(0, 8)}...</td>
                <td className={styles.ticketId}>{s.ticket_id || "—"}</td>
                <td>{s.started_at ? new Date(s.started_at).toLocaleString() : "—"}</td>
                <td className={styles.cost}>{s.total_cost_usd ? `$${s.total_cost_usd.toFixed(3)}` : "$0.000"}</td>
                <td className={`${styles.outcome} ${s.outcome === 'done' ? styles.outcomeSuccess : styles.outcomeFail}`}>
                  {(s.outcome || "unknown").toUpperCase()}
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr><td colSpan={5} className={styles.empty}>No historical telemetry found.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
