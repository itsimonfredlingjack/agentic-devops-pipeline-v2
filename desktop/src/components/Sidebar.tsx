import { KeyboardEvent, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";
import { mockLinearCycle, mockMyIssues, mockProjects, Priority, Status, LinearIssue } from "../mockLinearData";
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

const IssueItem = ({ 
  issue, 
  idx, 
  selectedIndex, 
  onSelectIndex, 
  isCollapsed, 
  issueButtonRefs, 
  handleIssueKeyDown 
}: { 
  issue: LinearIssue, 
  idx: number, 
  selectedIndex: number, 
  onSelectIndex: (i: number) => void, 
  isCollapsed: boolean,
  issueButtonRefs: any,
  handleIssueKeyDown: any
}) => {
  return (
    <button
      type="button"
      onClick={() => onSelectIndex(idx)}
      onFocus={() => onSelectIndex(idx)}
      onKeyDown={(event) => handleIssueKeyDown(event, idx)}
      ref={(element) => { issueButtonRefs.current[idx] = element; }}
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
            {!isCollapsed && issue.estimate && <span className={styles.estimatePill}>{issue.estimate}</span>}
         </div>
         {!isCollapsed && (
           <div className={styles.issueMetaRight}>
              {issue.labels && issue.labels.length > 0 && (
                <div className={styles.labelDots}>
                  {issue.labels.slice(0, 2).map(l => (
                    <div key={l} className={styles.labelDot} title={l} />
                  ))}
                </div>
              )}
              <StatusIcon status={issue.status} />
           </div>
         )}
      </div>
      {!isCollapsed && <div className={styles.qTitle}>{issue.title}</div>}
    </button>
  );
};

export function Sidebar({ 
  selectedIndex, 
  onSelectIndex, 
  isCollapsed, 
  onToggleCollapse 
}: { 
  selectedIndex: number, 
  onSelectIndex: (i: number) => void,
  isCollapsed: boolean,
  onToggleCollapse: () => void
}) {
  const voiceConnected = useAppStore((s) => s.voiceConnected);
  const monitorConnected = useAppStore((s) => s.monitorConnected);
  const issueButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeView, setActiveView] = useState<'cycle' | 'assigned' | 'projects'>('cycle');
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  const activeGlobalView = useAppStore((s) => s.activeGlobalView);
  const setActiveGlobalView = useAppStore((s) => s.setActiveGlobalView);

  const toggleProject = (name: string) => {
    setExpandedProjects(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const getIssues = () => {
    switch (activeView) {
      case 'cycle': return mockLinearCycle;
      case 'assigned': return mockMyIssues;
      case 'projects': return []; // Handled separately
      default: return [];
    }
  };

  const issues = getIssues();
  const issuesSize = issues.length;

  const selectAndFocusIndex = (index: number) => {
    onSelectIndex(index);
    issueButtonRefs.current[index]?.focus();
  };

  const handleIssueKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    const size = activeView === 'projects' ? 0 : issuesSize; // Simple key nav for now
    if (size === 0) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight": {
        event.preventDefault();
        selectAndFocusIndex((currentIndex + 1) % size);
        break;
      }
      case "ArrowUp":
      case "ArrowLeft": {
        event.preventDefault();
        selectAndFocusIndex((currentIndex - 1 + size) % size);
        break;
      }
      case "Home": {
        event.preventDefault();
        selectAndFocusIndex(0);
        break;
      }
      case "End": {
        event.preventDefault();
        selectAndFocusIndex(size - 1);
        break;
      }
    }
  };

  return (
    <nav className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ""}`}>
      <div className={styles.macSpacer} />
      
      <div className={styles.orgHeader}>
        <button className={styles.orgLogomark} onClick={onToggleCollapse} aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} type="button" />
        {!isCollapsed && <span className={styles.orgTitle}>SEJFA COMMAND</span>}
      </div>

      {!isCollapsed && (
        <div className={styles.globalModeSwitcher}>
          <button 
            className={`${styles.modeBtn} ${activeGlobalView === 'command' ? styles.modeBtnActive : ""}`}
            onClick={() => setActiveGlobalView('command')}
          >
            COMMAND
          </button>
          <button 
            className={`${styles.modeBtn} ${activeGlobalView === 'monitor' ? styles.modeBtnActive : ""}`}
            onClick={() => setActiveGlobalView('monitor')}
          >
            MONITOR
          </button>
        </div>
      )}

      <div className={styles.navSection}>
        {!isCollapsed && <h3 className={styles.sectionTitle}>SYSTEM TELEMETRY</h3>}
        <div className={styles.telemetryItem} role="status" aria-label={`Voice Intake: ${voiceConnected ? "Connected" : "Disconnected"}`}>
          <div className={`${styles.dot} ${voiceConnected ? styles.dotVoiceOn : ""}`} aria-hidden="true" />
          {!isCollapsed && <span>Voice Intake</span>}
        </div>
        <div className={styles.telemetryItem} role="status" aria-label={`Monitor Stream: ${monitorConnected ? "Connected" : "Disconnected"}`}>
          <div className={`${styles.dot} ${monitorConnected ? styles.dotMonitorOn : ""}`} aria-hidden="true" />
          {!isCollapsed && <span>Monitor Stream</span>}
        </div>
      </div>

      {!isCollapsed && (
        <div className={styles.viewSwitcher}>
          <button 
            className={`${styles.viewBtn} ${activeView === 'cycle' ? styles.viewBtnActive : ""}`}
            onClick={() => setActiveView('cycle')}
          >
            CYCLE
          </button>
          <button 
            className={`${styles.viewBtn} ${activeView === 'assigned' ? styles.viewBtnActive : ""}`}
            onClick={() => setActiveView('assigned')}
          >
            MY ISSUES
          </button>
          <button 
            className={`${styles.viewBtn} ${activeView === 'projects' ? styles.viewBtnActive : ""}`}
            onClick={() => setActiveView('projects')}
          >
            PROJECTS
          </button>
        </div>
      )}

      <div className={styles.navSection}>
        {!isCollapsed && <h3 className={styles.sectionTitle}>{activeView.toUpperCase()}</h3>}
        
        {activeView === 'projects' ? (
           <div className={styles.projectList}>
             {mockProjects.map(project => (
               <div key={project.name} className={styles.projectFolder}>
                 <button
                   className={styles.projectHeader}
                   onClick={() => toggleProject(project.name)}
                   aria-expanded={expandedProjects.includes(project.name)}
                 >
                   <span className={`${styles.chevron} ${expandedProjects.includes(project.name) ? styles.chevronOpen : ""}`}>▸</span>
                   <span className={styles.projectName}>{project.name}</span>
                 </button>
                 {expandedProjects.includes(project.name) && (
                   <ul className={styles.projectBacklog}>
                     {project.issues.map((issue, idx) => (
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
                     ))}
                   </ul>
                 )}
               </div>
             ))}
           </div>
        ) : (
          <ul className={styles.queueList} aria-label="Issue list">
            {issues.length === 0 ? (
              <li className={styles.emptyQueue}>{isCollapsed ? "—" : "All issues complete."}</li>
            ) : (
              issues.map((issue, idx) => (
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
              ))
            )}
          </ul>
        )}
      </div>
    </nav>
  );
}
