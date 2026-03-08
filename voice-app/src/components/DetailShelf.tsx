import { GlassCard } from "./GlassCard";
import { LogPanel } from "./LogPanel";
import styles from "../styles/components/DetailShelf.module.css";

interface DetailShelfProps {
  transcription: string;
  detailsEntries: string[];
}

export function DetailShelf({
  transcription,
  detailsEntries,
}: DetailShelfProps) {
  return (
    <section aria-label="SEJFA detail shelf" className={styles.shelf}>
      <GlassCard className={styles.card}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>Transcript</div>
          <div className={styles.title}>Captured request</div>
        </div>

        <div className={styles.transcript}>
          {transcription || "Your transcript appears here after recording."}
        </div>

        <LogPanel
          collapsedLabel="Show technical details"
          expandedLabel="Hide technical details"
          emptyMessage="No details yet."
          entries={detailsEntries}
        />
      </GlassCard>
    </section>
  );
}
