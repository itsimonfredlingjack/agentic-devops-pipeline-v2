import styles from "./Sidebar.module.css";

interface Task {
  id: string;
  title: string;
  status?: string;
}

interface SidebarProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  selectedTaskId: string | null;
  onSelectTaskId: (taskId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({
  tasks,
  loading,
  error,
  selectedTaskId,
  onSelectTaskId,
}: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.accentLine} />
      
      <div className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.brandDot} />
          <span className={styles.brandText}>SEJFA COMMAND</span>
        </div>
        
        <div className={styles.modeSwitch}>
          <button className={`${styles.modeBtn} ${styles.modeActive}`}>
            Task Loop
          </button>
          <button className={styles.modeBtn}>History</button>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>System Telemetry</div>
        <div className={styles.telemetryItem}>
          <div className={`${styles.telemetryDot} ${styles.telemetryActive}`} />
          <span>Run Monitor</span>
        </div>
        <div className={styles.telemetryItem}>
          <div className={styles.telemetryDot} />
          <span>Voice Intake</span>
        </div>
        <div className={styles.telemetryItem}>
          <div className={`${styles.telemetryDot} ${styles.telemetryWarning}`} />
          <span>Agent Health</span>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.viewSwitch}>
          <button className={`${styles.viewBtn} ${styles.viewActive}`}>Tasks</button>
          <button className={styles.viewBtn}>My Tasks</button>
          <button className={styles.viewBtn}>Projects</button>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Task Loop</div>
        <div className={styles.taskList}>
          {loading && (
            <div className={styles.taskItem}>
              <div className={styles.taskId}>Loading...</div>
            </div>
          )}
          {error && (
            <div className={styles.taskItem}>
              <div className={styles.taskId}>Error loading tasks</div>
            </div>
          )}
          {tasks.length === 0 && !loading && !error && (
            <div className={styles.taskItem}>
              <div className={styles.taskId}>No tasks available</div>
            </div>
          )}
          {tasks.map((task) => (
            <button
              key={task.id}
              className={`${styles.taskItem} ${task.id === selectedTaskId ? styles.taskActive : ""}`}
              onClick={() => onSelectTaskId(task.id)}
            >
              <div className={styles.taskId}>{task.id}</div>
              <div className={styles.taskTitle}>{task.title}</div>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.footerLabel}>Logged in as</div>
        <div className={styles.footerRow}>
          <span className={styles.footerUser}>sejfa</span>
          <span className={styles.footerStatus}>IDLE</span>
        </div>
        <div className={styles.footerRow}>
          <span>Inbox</span>
          <span className={styles.footerCount}>4</span>
        </div>
      </div>
    </aside>
  );
}
