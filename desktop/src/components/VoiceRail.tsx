import { useAppStore } from "../stores/appStore";
import { MicButton } from "./MicButton";
import styles from "./VoiceRail.module.css";

interface VoiceRailProps {
  recording: boolean;
  onToggle: () => void;
}

export function VoiceRail({ recording, onToggle }: VoiceRailProps) {
  const queue = useAppStore((s) => s.queue);
  const voiceConnected = useAppStore((s) => s.voiceConnected);
  const monitorConnected = useAppStore((s) => s.monitorConnected);

  return (
    <div className={styles.rail}>
      <div className={styles.brand}>
        <span className={styles.brandLabel}>SEJFA</span>
        <span className={styles.brandName}>Mission Control</span>
      </div>

      <div className={styles.micArea}>
        <MicButton recording={recording} onClick={onToggle} />
        <span className={styles.micHint}>&#x2318;&#x21E7;V</span>
      </div>

      <div className={styles.queueSection}>
        <div className={styles.queueTitle}>Queue ({queue.length})</div>
        {queue.map((item) => (
          <div key={item.key} className={styles.queueItem}>
            <div className={styles.queueItemKey}>{item.key}</div>
            <div className={styles.queueItemSummary}>{item.summary}</div>
          </div>
        ))}
      </div>

      <div className={styles.connections}>
        <div className={styles.connection}>
          <span className={`${styles.dot} ${voiceConnected ? styles.dotConnected : ""}`} />
          Voice Pipeline
        </div>
        <div className={styles.connection}>
          <span className={`${styles.dot} ${monitorConnected ? styles.dotConnected : ""}`} />
          Monitor API
        </div>
      </div>
    </div>
  );
}
