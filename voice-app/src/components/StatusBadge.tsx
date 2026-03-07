import type { PipelineStatus } from "../stores/pipelineStore";
import styles from "../styles/components/StatusBadge.module.css";

interface StatusBadgeProps {
  status: PipelineStatus;
}

const LABEL: Record<PipelineStatus, string> = {
  idle: "Ready",
  recording: "Recording",
  processing: "Processing",
  clarifying: "Clarifying",
  previewing: "Preview",
  done: "Done",
  error: "Error",
};

const PULSING: Set<PipelineStatus> = new Set([
  "recording",
  "processing",
  "clarifying",
  "previewing",
]);

export function StatusBadge({ status }: StatusBadgeProps) {
  const dotClass = [styles.dot, PULSING.has(status) && styles.dotPulse]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={`${styles.badge} ${styles[status]}`}
      role="status"
      aria-live="polite"
    >
      <span className={dotClass} aria-hidden="true" />
      {LABEL[status]}
    </span>
  );
}
