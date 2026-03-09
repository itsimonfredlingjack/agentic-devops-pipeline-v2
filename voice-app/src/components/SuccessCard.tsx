import type { TicketResult } from "../stores/pipelineStore";
import styles from "../styles/components/SuccessCard.module.css";

interface SuccessCardProps {
  ticket: TicketResult;
  sessionId: string | null;
  monitorConnected: boolean;
  loopMonitorUrl: string | null;
  onRecordAnother: () => void;
}

export function SuccessCard({
  ticket,
  sessionId,
  monitorConnected,
  loopMonitorUrl,
  onRecordAnother,
}: SuccessCardProps) {
  return (
    <section className={styles.card} aria-label="Task created">
      <div className={styles.summary}>
        <div className={styles.kicker}>Task created</div>
        <div className={styles.headline}>{ticket.summary}</div>
        <div className={styles.support}>{ticket.key} is ready for the loop.</div>
      </div>

      <div className={styles.actions}>
        <a
          className={styles.primaryAction}
          href={ticket.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open ticket
        </a>
        {loopMonitorUrl ? (
          <a
            className={styles.secondaryAction}
            href={loopMonitorUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open loop monitor
          </a>
        ) : null}
        <button
          type="button"
          className={styles.tertiaryAction}
          onClick={onRecordAnother}
        >
          Record another
        </button>
      </div>

      <div className={styles.metaRow}>
        <span className={styles.metaItem}>
          Loop monitor {monitorConnected ? "available" : "unavailable"}
        </span>
        {sessionId ? <span className={styles.metaItem}>Session {sessionId}</span> : null}
      </div>
    </section>
  );
}
