import type { PipelineStatus } from "../stores/pipelineStore";
import { GlassCard } from "./GlassCard";
import styles from "../styles/components/TranscriptionCard.module.css";

interface TranscriptionCardProps {
  status: PipelineStatus;
  text: string;
}

function getPlaceholder(status: PipelineStatus): string {
  switch (status) {
    case "recording":
      return "Listening for your objective...";
    case "previewing":
      return "Review the capture before sending it.";
    case "processing":
      return "Preparing transcript and task context...";
    case "clarifying":
      return "Waiting for one detail before starting execution.";
    case "done":
      return "Run queued. Record another when you are ready.";
    case "error":
      return "Your last capture stays here so you can retry safely.";
    case "idle":
    default:
      return "Your captured objective will appear here.";
  }
}

export function TranscriptionCard({ status, text }: TranscriptionCardProps) {
  return (
    <GlassCard className={styles.card}>
      <div className={styles.label}>Captured objective</div>
      {text ? (
        <div className={styles.text}>{text}</div>
      ) : (
        <div className={styles.emptyState}>{getPlaceholder(status)}</div>
      )}
    </GlassCard>
  );
}
