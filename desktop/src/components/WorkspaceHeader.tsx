import styles from "./WorkspaceHeader.module.css";

interface Task {
  id: string;
  title: string;
}

interface WorkspaceHeaderProps {
  selectedTask: Task | null;
  phase: string;
}

export function WorkspaceHeader({ selectedTask, phase }: WorkspaceHeaderProps) {
  const getPhaseStyle = () => {
    switch (phase) {
      case "loop":
      case "running":
        return styles.phaseRunning;
      case "error":
      case "blocked":
        return styles.phaseBlocked;
      case "done":
        return styles.phaseDone;
      default:
        return styles.phaseIdle;
    }
  };

  const getPhaseLabel = () => {
    switch (phase) {
      case "loop":
      case "running":
        return "RUNNING";
      case "error":
        return "FAILED";
      case "blocked":
        return "BLOCKED";
      case "done":
        return "COMPLETE";
      default:
        return "IDLE";
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.breadcrumb}>
        <span className={styles.breadcrumbItem}>SEJFA</span>
        <span className={styles.breadcrumbSep}>/</span>
        <span className={styles.breadcrumbItem}>Task Loop</span>
        <span className={styles.breadcrumbSep}>/</span>
        <span className={styles.breadcrumbCurrent}>
          {selectedTask ? `${selectedTask.id}: ${selectedTask.title}` : "Ready check"}
        </span>
      </div>

      <div className={styles.actions}>
        <div className={`${styles.phaseBadge} ${getPhaseStyle()}`}>
          <span className={styles.phaseDot} />
          {getPhaseLabel()}
        </div>
        <div className={styles.avatar}>AI</div>
      </div>
    </header>
  );
}
