import type { TicketResult } from "../stores/pipelineStore";
import { GlassCard } from "./GlassCard";
import styles from "../styles/components/SuccessCard.module.css";

interface SuccessCardProps {
  ticket: TicketResult;
  onRecordAnother: () => void;
}

export function SuccessCard({ ticket, onRecordAnother }: SuccessCardProps) {
  return (
    <GlassCard className={styles.card}>
      <div className={styles.checkRow}>
        <div className={styles.checkCircle}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 10l3.5 3.5L15 7"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className={styles.title}>Ticket Created</span>
      </div>

      <a
        className={styles.ticketLink}
        href={ticket.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className={styles.ticketKey}>{ticket.key}</span>
        <span className={styles.ticketSummary}>{ticket.summary}</span>
        <svg
          className={styles.externalIcon}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path
            d="M4.5 1.5H2a.5.5 0 00-.5.5v8a.5.5 0 00.5.5h8a.5.5 0 00.5-.5V7.5M7 1.5h3.5V5M5.5 6.5l5-5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>

      <button className={styles.recordBtn} onClick={onRecordAnother}>
        Record Another
      </button>
    </GlassCard>
  );
}
