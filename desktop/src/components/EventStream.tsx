import { useAppStore } from "../stores/appStore";
import styles from "./EventStream.module.css";

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "—";
  }
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function EventStream() {
  const events = useAppStore((s) => s.events);

  return (
    <div className={styles.stream}>
      <div className={styles.header}>
        <span className={styles.title}>Event Stream</span>
        <span className={styles.count}>{events.length}</span>
      </div>

      {events.length === 0 ? (
        <div className={styles.empty}>Waiting for loop events...</div>
      ) : (
        <ul className={styles.list}>
          {events.map((event) => (
            <li key={event.event_id} className={styles.event}>
              <div className={styles.eventLeft}>
                <span
                  className={`${styles.eventDot} ${
                    event.success === true
                      ? styles.success
                      : event.success === false
                        ? styles.failure
                        : styles.pending
                  }`}
                />
                <span className={styles.eventTool}>{event.tool_name}</span>
                {event.tool_args_summary && (
                  <span className={styles.eventArgs}>{event.tool_args_summary}</span>
                )}
              </div>
              <div className={styles.eventRight}>
                {event.cost_usd != null && event.cost_usd > 0 && (
                  <span className={styles.eventCost}>${event.cost_usd.toFixed(4)}</span>
                )}
                {event.duration_ms != null && (
                  <span className={styles.eventTime}>{formatDuration(event.duration_ms)}</span>
                )}
                <span className={styles.eventTime}>{formatTime(event.timestamp)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
