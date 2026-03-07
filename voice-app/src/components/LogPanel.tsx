import { useEffect, useRef } from "react";
import { useCollapsible } from "../hooks/useCollapsible";
import styles from "../styles/components/LogPanel.module.css";

interface LogPanelProps {
  entries: string[];
  title?: string;
  collapsedLabel?: string;
  expandedLabel?: string;
  emptyMessage?: string;
}

export function LogPanel({
  entries,
  title = "Technical details",
  collapsedLabel,
  expandedLabel,
  emptyMessage = "(no events)",
}: LogPanelProps) {
  const { isOpen, toggle } = useCollapsible(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [entries, isOpen]);

  const panelId = "pipeline-log-content";
  const triggerLabel = isOpen
    ? (expandedLabel ?? title)
    : (collapsedLabel ?? title);

  return (
    <div className={styles.panel}>
      <button
        className={styles.toggle}
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <svg
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {triggerLabel}
        <span className={styles.count}>({entries.length})</span>
      </button>
      <div
        id={panelId}
        className={`${styles.logWrap} ${isOpen ? styles.logWrapOpen : ""}`}
        role="region"
        aria-label={title}
      >
        <div ref={logRef} className={styles.log}>
          {entries.length > 0 ? (
            entries.join("\n")
          ) : (
            <span className={styles.empty}>{emptyMessage}</span>
          )}
        </div>
      </div>
    </div>
  );
}
