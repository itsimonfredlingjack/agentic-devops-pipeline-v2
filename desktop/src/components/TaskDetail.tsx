import styles from "./TaskDetail.module.css";

interface Task {
  id: string;
  title: string;
  description?: string | null;
  status?: string;
  priority?: string;
  labels?: string[];
  branch?: string;
  assignee?: string;
}

interface TaskDetailProps {
  task: Task | null;
}

export function TaskDetail({ task }: TaskDetailProps) {
  if (!task) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No task selected</div>
          <div className={styles.emptyText}>
            Choose a task from the inbox to load the current loop context
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.taskMeta}>
          <span className={styles.taskId}>{task.id}</span>
          <div className={styles.statusBadges}>
            {task.status && (
              <span className={`${styles.badge} ${styles[`status${task.status}`]}`}>
                {task.status}
              </span>
            )}
            {task.priority && (
              <span className={`${styles.badge} ${styles[`priority${task.priority}`]}`}>
                {task.priority}
              </span>
            )}
          </div>
        </div>
        <h2 className={styles.title}>{task.title}</h2>
        {task.description && (
          <p className={styles.description}>{task.description}</p>
        )}
      </div>

      <div className={styles.details}>
        {task.branch && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Branch</span>
            <span className={styles.detailValue}>{task.branch}</span>
          </div>
        )}
        {task.assignee && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Assignee</span>
            <span className={styles.detailValue}>{task.assignee}</span>
          </div>
        )}
        {task.labels && task.labels.length > 0 && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Labels</span>
            <div className={styles.labels}>
              {task.labels.map((label) => (
                <span key={label} className={styles.label}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
