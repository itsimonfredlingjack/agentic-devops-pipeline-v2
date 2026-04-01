import { useAppStore } from "../stores/appStore";
import { mockLinearCycle, Priority, Status } from "../mockLinearData";
import {
  LinearUrgent, LinearHigh, LinearMedium, LinearLow, LinearNone,
  LinearBacklog, LinearTodo, LinearInProgress, LinearReview, LinearDone, LinearCanceled
} from "./icons/LinearIcons";
import styles from "./Sidebar.module.css";

const PriorityIcon = ({ priority }: { priority: Priority }) => {
  switch (priority) {
    case "urgent": return <LinearUrgent className={styles.iconUrgent} />;
    case "high": return <LinearHigh className={styles.iconStandard} />;
    case "medium": return <LinearMedium className={styles.iconStandard} />;
    case "low": return <LinearLow className={styles.iconStandard} />;
    default: return <LinearNone className={styles.iconStandard} />;
  }
};

const StatusIcon = ({ status }: { status: Status }) => {
  switch (status) {
    case "backlog": return <LinearBacklog className={styles.iconStandard} />;
    case "todo": return <LinearTodo className={styles.iconStandard} />;
    case "in-progress": return <LinearInProgress /> /* Colors built into SVG */;
    case "review": return <LinearReview />;
    case "done": return <LinearDone />;
    case "canceled": return <LinearCanceled className={styles.iconStandard} />;
  }
};

export function Sidebar({ selectedIndex, onSelectIndex }: { selectedIndex: number, onSelectIndex: (i: number) => void }) {
  const voiceConnected = useAppStore((s) => s.voiceConnected);
  const monitorConnected = useAppStore((s) => s.monitorConnected);

  // Use the mocked Linear Cycle instead of generic queue
  const cycle = mockLinearCycle;

  return (
    <nav className={styles.sidebar}>
      <div className={styles.macSpacer} />
      
      <div className={styles.orgHeader}>
        <div className={styles.orgLogomark}></div>
        <span className={styles.orgTitle}>SEJFA COMMAND</span>
      </div>

      <div className={styles.navSection}>
        <div className={styles.sectionTitle}>SYSTEM TELEMETRY</div>
        <div className={styles.telemetryItem}>
          <div className={`${styles.dot} ${voiceConnected ? styles.dotVoiceOn : ""}`} />
          <span>Voice Intake</span>
        </div>
        <div className={styles.telemetryItem}>
          <div className={`${styles.dot} ${monitorConnected ? styles.dotMonitorOn : ""}`} />
          <span>Monitor Stream</span>
        </div>
      </div>

      <div className={styles.navSection}>
        <div className={styles.sectionTitle}>ACTIVE CYCLE</div>
        <div className={styles.queueList}>
          {cycle.length === 0 ? (
            <div className={styles.emptyQueue}>All issues complete.</div>
          ) : (
            cycle.map((issue, idx) => (
              <div 
                key={issue.id} 
                onClick={() => onSelectIndex(idx)}
                className={`${styles.queueItem} ${idx === selectedIndex ? styles.activeQueueItem : ""}`}
              >
                <div className={styles.issueTopRow}>
                   <div className={styles.issueMetaLeft}>
                      <PriorityIcon priority={issue.priority} />
                      <span className={styles.qId}>{issue.id}</span>
                   </div>
                   <StatusIcon status={issue.status} />
                </div>
                <div className={styles.qTitle}>{issue.title}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </nav>
  );
}
