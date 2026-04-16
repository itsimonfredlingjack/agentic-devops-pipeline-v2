import { KeyboardEvent, type MutableRefObject, useMemo, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";
import { useJiraIssues } from "../hooks/useJiraIssues";
import type { LinearIssue, Priority, Status } from "../mockLinearData";
import {
  LinearUrgent,
  LinearHigh,
  LinearMedium,
  LinearLow,
  LinearNone,
  LinearBacklog,
  LinearTodo,
  LinearInProgress,
  LinearReview,
  LinearDone,
  LinearCanceled,
} from "./icons/LinearIcons";
import styles from "./Sidebar.module.css";

const PriorityIcon = ({ priority }: { priority: Priority }) => {
  switch (priority) {
    case "urgent":
      return <LinearUrgent className={styles.iconUrgent} />;
    case "high":
      return <LinearHigh className={styles.iconStandard} />;
    case "medium":
      return <LinearMedium className={styles.iconStandard} />;
    case "low":
      return <LinearLow className={styles.iconStandard} />;
    default:
      return <LinearNone className={styles.iconStandard} />;
  }
};

const StatusIcon = ({ status }: { status: Status }) => {
  switch (status) {
    case "backlog":
      return <LinearBacklog className={styles.iconStandard} />;
    case "todo":
      return <LinearTodo className={styles.iconStandard} />;
    case "in-progress":
      return <LinearInProgress />;
    case "review":
      return <LinearReview />;
    case "done":
      return <LinearDone />;
    case "canceled":
      return <LinearCanceled className={styles.iconStandard} />;
  }
};

function IssueItem({
  issue,
  idx,
  selectedIndex,
  onSelectIndex,
  isCollapsed,
  issueButtonRefs,
  handleIssueKeyDown,
}: {
  issue: LinearIssue;
  idx: number;
  selectedIndex: number;
  onSelectIndex: (i: number) => void;
  isCollapsed: boolean;
  issueButtonRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  handleIssueKeyDown: (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectIndex(idx)}
      onFocus={() => onSelectIndex(idx)}
      onKeyDown={(event) => handleIssueKeyDown(event, idx)}
      ref={(element) => {
        issueButtonRefs.current[idx] = element;
      }}
      className={`${styles.queueItem} ${idx === selectedIndex ? styles.activeQueueItem : ""}`}
      aria-pressed={idx === selectedIndex}
      aria-current={idx === selectedIndex ? "true" : undefined}
      title={`${issue.id}: ${issue.title}`}
      tabIndex={idx === selectedIndex ? 0 : -1}
    >
      <div className={styles.issueTopRow}>
        <div className={styles.issueMetaLeft}>
          <PriorityIcon priority={issue.priority} />
          {!isCollapsed && <span className={styles.qId}>{issue.id}</span>}
        </div>
        {!isCollapsed && (
          <div className={styles.issueMetaRight}>
            <StatusIcon status={issue.status} />
          </div>
        )}
      </div>
      {!isCollapsed && <div className={styles.qTitle}>{issue.title}</div>}
      {!isCollapsed && (
        <div className={styles.issueFooter}>
          <span className={styles.statusLabel}>{issue.status.replace("-", " ")}</span>
          {issue.assignee && <span className={styles.assigneeLabel}>{issue.assignee}</span>}
        </div>
      )}
    </button>
  );
}

export function Sidebar({
  selectedIndex,
  onSelectIndex,
  isCollapsed,
  onToggleCollapse,
}: {
  selectedIndex: number;
  onSelectIndex: (i: number) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const voiceConnected = useAppStore((s) => s.voiceConnected);
  const monitorConnected = useAppStore((s) => s.monitorConnected);
  const activeWorkspaceSection = useAppStore((s) => s.activeWorkspaceSection);
  const setActiveWorkspaceSection = useAppStore((s) => s.setActiveWorkspaceSection);
  const issueButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeView, setActiveView] = useState<"all" | "assigned">("all");
  const { issues: jiraIssues, loading, error } = useJiraIssues();

  const issues = useMemo(() => {
    if (activeView === "assigned") {
      return jiraIssues.filter((issue) => Boolean(issue.assignee));
    }
    return jiraIssues;
  }, [activeView, jiraIssues]);

  const issuesSize = issues.length;

  const selectAndFocusIndex = (index: number) => {
    onSelectIndex(index);
    issueButtonRefs.current[index]?.focus();
  };

  const handleIssueKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    if (issuesSize === 0) return;

    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        selectAndFocusIndex((currentIndex + 1) % issuesSize);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        selectAndFocusIndex((currentIndex - 1 + issuesSize) % issuesSize);
        break;
      case "Home":
        event.preventDefault();
        selectAndFocusIndex(0);
        break;
      case "End":
        event.preventDefault();
        selectAndFocusIndex(issuesSize - 1);
        break;
    }
  };

  const renderQueueState = () => {
    if (loading) {
      return (
        <li className={styles.emptyQueue}>
          {isCollapsed ? "…" : (
            <>
              <strong>Loading issues…</strong>
              <span>Fetching the latest work from Jira.</span>
            </>
          )}
        </li>
      );
    }

    if (error) {
      return (
        <li className={styles.emptyQueue}>
          {isCollapsed ? "!" : (
            <>
              <strong>Jira unavailable</strong>
              <span>{error}</span>
            </>
          )}
        </li>
      );
    }

    if (issues.length === 0) {
      const message =
        activeView === "assigned"
          ? "No assigned issues."
          : "No issues available.";
      const detail =
        activeView === "assigned"
          ? "Switch to All Issues or assign work in Jira."
          : "Create or sync an issue to start working here.";

      return (
        <li className={styles.emptyQueue}>
          {isCollapsed ? "—" : (
            <>
              <strong>{message}</strong>
              <span>{detail}</span>
            </>
          )}
        </li>
      );
    }

    return issues.map((issue, idx) => (
      <li key={issue.id}>
        <IssueItem
          issue={issue}
          idx={idx}
          selectedIndex={selectedIndex}
          onSelectIndex={onSelectIndex}
          isCollapsed={isCollapsed}
          issueButtonRefs={issueButtonRefs}
          handleIssueKeyDown={handleIssueKeyDown}
        />
      </li>
    ));
  };

  return (
    <nav className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ""}`}>
      <div className={styles.macSpacer} />

      <div className={styles.orgHeader}>
        <button
          className={styles.orgLogomark}
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          type="button"
        >
          <span className={styles.toggleGlyph} aria-hidden="true">
            {isCollapsed ? "»" : "«"}
          </span>
          {!isCollapsed && <span className={styles.toggleLabel}>Collapse</span>}
        </button>
        {!isCollapsed && <span className={styles.orgTitle}>SEJFA</span>}
      </div>

      {!isCollapsed && (
        <div className={styles.globalModeSwitcher}>
          <button
            className={`${styles.modeBtn} ${activeWorkspaceSection === "work" ? styles.modeBtnActive : ""}`}
            onClick={() => setActiveWorkspaceSection("work")}
            type="button"
          >
            WORK
          </button>
          <button
            className={`${styles.modeBtn} ${activeWorkspaceSection === "history" ? styles.modeBtnActive : ""}`}
            onClick={() => setActiveWorkspaceSection("history")}
            type="button"
          >
            HISTORY
          </button>
        </div>
      )}

      <div className={styles.navSection}>
        {!isCollapsed && <h3 className={styles.sectionTitle}>Connections</h3>}
        <div className={styles.telemetryItem} role="status" aria-label={`Voice intake: ${voiceConnected ? "Connected" : "Disconnected"}`}>
          <div className={`${styles.dot} ${voiceConnected ? styles.dotVoiceOn : ""}`} aria-hidden="true" />
          {!isCollapsed && <span>Voice intake ({voiceConnected ? "Connected" : "Disconnected"})</span>}
        </div>
        <div className={styles.telemetryItem} role="status" aria-label={`Run monitor: ${monitorConnected ? "Connected" : "Disconnected"}`}>
          <div className={`${styles.dot} ${monitorConnected ? styles.dotMonitorOn : ""}`} aria-hidden="true" />
          {!isCollapsed && <span>Run monitor ({monitorConnected ? "Connected" : "Disconnected"})</span>}
        </div>
      </div>

      {activeWorkspaceSection === "work" && !isCollapsed && (
        <div className={styles.viewSwitcher}>
          <button
            className={`${styles.viewBtn} ${activeView === "all" ? styles.viewBtnActive : ""}`}
            onClick={() => setActiveView("all")}
            type="button"
          >
            ALL ISSUES
          </button>
          <button
            className={`${styles.viewBtn} ${activeView === "assigned" ? styles.viewBtnActive : ""}`}
            onClick={() => setActiveView("assigned")}
            type="button"
          >
            ASSIGNED
          </button>
        </div>
      )}

      <div className={styles.navSection}>
        {!isCollapsed && (
          <h3 className={styles.sectionTitle}>
            {activeWorkspaceSection === "history" ? "Run History" : "Issues"}
          </h3>
        )}

        {activeWorkspaceSection === "history" ? (
          <div className={styles.historyHint}>
            {isCollapsed ? "H" : (
              <>
                <strong>Recent runs</strong>
                <span>Review outcomes, timestamps, and cost in the main panel.</span>
              </>
            )}
          </div>
        ) : (
          <ul className={styles.queueList} aria-label="Issue list">
            {renderQueueState()}
          </ul>
        )}
      </div>
    </nav>
  );
}
