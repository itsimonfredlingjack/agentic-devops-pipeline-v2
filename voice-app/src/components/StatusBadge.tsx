import type { PipelineStatus } from "../stores/pipelineStore";
import styles from "../styles/components/StatusBadge.module.css";

export type StatusBadgeTone =
  | PipelineStatus
  | "queued"
  | "running"
  | "blocked";

interface StatusBadgeProps {
  status?: PipelineStatus;
  label?: string;
  tone?: StatusBadgeTone;
}

const LABEL: Record<PipelineStatus, string> = {
  idle: "Ready",
  recording: "Recording",
  processing: "Processing",
  clarifying: "Need detail",
  previewing: "Review",
  done: "Created",
  error: "Issue",
};

const PULSING: Set<StatusBadgeTone> = new Set([
  "recording",
  "processing",
  "clarifying",
  "previewing",
  "running",
]);

export function StatusBadge({
  status = "idle",
  label,
  tone,
}: StatusBadgeProps) {
  const resolvedTone = tone ?? status;
  const resolvedLabel = label ?? LABEL[status];
  const dotClass = [styles.dot, PULSING.has(resolvedTone) && styles.dotPulse]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={`${styles.badge} ${styles[resolvedTone]}`}
      role="status"
      aria-live="polite"
    >
      <span className={dotClass} aria-hidden="true" />
      {resolvedLabel}
    </span>
  );
}
