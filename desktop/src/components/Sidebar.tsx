import { Activity, Clock, Command, Inbox } from "lucide-react";
import styles from "./Sidebar.module.css";

interface Task {
  id: string;
  title: string;
  status?: string;
}

type Mode = "command" | "monitor" | "history";

interface SidebarProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  selectedTaskId: string | null;
  onSelectTaskId: (taskId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  activeMode?: Mode;
  onModeChange?: (mode: Mode) => void;
  phase?: string;
}

const MODES: { mode: Mode; label: string; icon: typeof Command }[] = [
  { mode: "command", label: "Command", icon: Command },
  { mode: "monitor", label: "Monitor", icon: Activity },
  { mode: "history", label: "History", icon: Clock },
];

export function Sidebar({
  tasks,
  loading: _loading,
  error: _error,
  selectedTaskId: _selectedTaskId,
  onSelectTaskId: _onSelectTaskId,
  isCollapsed: _isCollapsed,
  onToggleCollapse: _onToggleCollapse,
  activeMode = "command",
  onModeChange,
  phase,
}: SidebarProps) {
  const taskCount = tasks.length;

  return (
    <nav className={styles.rail} data-phase={phase}>
      <button
        className={styles.brand}
        onClick={() => onModeChange?.("command")}
        aria-label="SEJFA Command Desk"
      >
        <span className={styles.brandDot} />
      </button>

      <div className={styles.modes}>
        {MODES.map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            className={`${styles.modeBtn} ${activeMode === mode ? styles.modeActive : ""}`}
            onClick={() => onModeChange?.(mode)}
            aria-label={label}
            aria-pressed={activeMode === mode}
            title={label}
          >
            <Icon size={18} strokeWidth={1.75} />
          </button>
        ))}
      </div>

      <div className={styles.spacer} />

      <div className={styles.footer}>
        {taskCount > 0 && (
          <span className={styles.taskBadge}>{taskCount}</span>
        )}
        <button
          className={styles.inboxBtn}
          onClick={() => onModeChange?.("command")}
          title="Task inbox"
          aria-label={`${taskCount} tasks in inbox`}
        >
          <Inbox size={16} strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
}
