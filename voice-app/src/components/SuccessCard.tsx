import type { TicketResult } from "../stores/pipelineStore";
import styles from "../styles/components/SuccessCard.module.css";

interface SuccessCardProps {
  ticket: TicketResult;
  sessionId: string | null;
  monitorConnected: boolean;
  loopMonitorUrl?: string | null;
  onRecordAnother: () => void;
}

export function SuccessCard({
  ticket,
  sessionId,
  monitorConnected,
  onRecordAnother,
}: SuccessCardProps) {
  return (
    <section className={styles.card} aria-label="Task queued">
      <div className={styles.summary}>
        <div className={styles.kicker}>Task queued</div>
        <div className={styles.headline}>{ticket.summary}</div>
        <div className={styles.support}>{ticket.key} queued for execution.</div>
      </div>

      <div className={styles.actions}>
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
