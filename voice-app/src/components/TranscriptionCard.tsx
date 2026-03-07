import { GlassCard } from "./GlassCard";
import styles from "../styles/components/TranscriptionCard.module.css";

interface TranscriptionCardProps {
  text: string;
}

const MIC_PLACEHOLDER = (
  <div className={styles.emptyState}>
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      className={styles.emptyIcon}
    >
      <path
        d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    <span>Press Space to start recording</span>
  </div>
);

export function TranscriptionCard({ text }: TranscriptionCardProps) {
  return (
    <GlassCard>
      <div className={styles.label}>Transcription</div>
      {text ? <div className={styles.text}>{text}</div> : MIC_PLACEHOLDER}
    </GlassCard>
  );
}
