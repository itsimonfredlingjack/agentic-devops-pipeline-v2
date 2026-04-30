import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { OmniPrompt } from "./OmniPrompt";
import { MissionDossier } from "./MissionDossier";
import { MonitorDashboard } from "./MonitorDashboard";
import { GlobalMonitorView } from "./GlobalMonitorView";
import { MissionControls } from "./MissionControls";
import { LoopConversationPanel } from "./LoopConversationPanel";
import styles from "./MasterWorkspace.module.css";
import type { MicrophonePermissionStatus } from "../hooks/useMicrophone";
import type { TaskSummary } from "@sejfa/shared-types";

interface MasterWorkspaceProps {
  tasks: TaskSummary[];
  taskLoading: boolean;
  taskError: string | null;
  selectedTask: TaskSummary | null;
  recording: boolean;
  onStartVoice: () => void;
  onStopVoice: () => void;
  permissionStatus: MicrophonePermissionStatus;
  availableDevices: MediaDeviceInfo[];
  selectedDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
  inputLevel: number;
  recordingDurationMs: number;
  errorMessage: string | null;
  onOpenCommandPalette: () => void;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatUsd(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function titleCase(value: string): string {
  return value.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function WorkspaceMetric({
  label,
  value,
  meta,
  tone = "default",
}: {
  label: string;
  value: string;
  meta: string;
  tone?: "default" | "success" | "info" | "warning" | "danger";
}) {
  return (
    <article className={`${styles.metricCard} ${styles[`metric${titleCase(tone)}`] ?? ""}`.trim()}>
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{value}</strong>
      <span className={styles.metricMeta}>{meta}</span>
    </article>
  );
}

function WorkspacePanel({
  title,
  meta,
  children,
  flush = false,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className={styles.panel}>
      <header className={styles.panelHeader}>
        <span className={styles.panelTitle}>{title}</span>
        {meta && <span className={styles.panelMeta}>{meta}</span>}
      </header>
      <div className={flush ? styles.panelBodyFlush : styles.panelBody}>{children}</div>
    </section>
  );
}

export function MasterWorkspace({
  tasks,
  taskLoading,
  taskError,
  selectedTask,
  recording,
  onStartVoice,
  onStopVoice,
  permissionStatus,
  availableDevices,
  selectedDeviceId,
  onSelectDevice,
  inputLevel,
  recordingDurationMs,
  errorMessage,
  onOpenCommandPalette,
}: MasterWorkspaceProps) {
  const {
    activeWorkspaceSection,
    loopActive,
    stuckAlert,
    completion,
    processingStep,
    phase,
    sessionId,
    events,
    conversationMessages,
    monitorConnected,
    taskRef,
    elapsedMs,
    cost,
    queue,
  } = useAppStore();
  const hasActiveContext =
    loopActive ||
    Boolean(stuckAlert) ||
    Boolean(completion) ||
    Boolean(processingStep) ||
    Boolean(sessionId);
  const isExecuting = phase === "loop" || phase === "done" || (phase === "error" && hasActiveContext);
  const crumb =
    activeWorkspaceSection === "history"
      ? "SEJFA / history"
      : isExecuting
        ? "SEJFA / active run"
        : "SEJFA / task loop";
  const headerMeta =
    selectedTask?.id ??
    taskRef ??
    (activeWorkspaceSection === "history" ? "Historic runs" : "Ready check");

  const executionMetrics = (
    <div className={styles.metricRow}>
      <WorkspaceMetric
        label="Phase"
        value={titleCase(phase)}
        meta={processingStep || "Autonomic run in progress"}
        tone="info"
      />
      <WorkspaceMetric
        label="Elapsed"
        value={formatElapsed(elapsedMs)}
        meta={taskRef ?? selectedTask?.id ?? "Awaiting task ref"}
      />
      <WorkspaceMetric
        label="Cost"
        value={cost ? formatUsd(cost.total_usd) : "$0.00"}
        meta={`${events.length} captured events`}
        tone="warning"
      />
      <WorkspaceMetric
        label="Conversation"
        value={String(conversationMessages.length)}
        meta={sessionId ? `Session ${sessionId.slice(0, 8)}` : "No live session"}
      />
    </div>
  );

  const historyMetrics = (
    <div className={styles.metricRow}>
      <WorkspaceMetric
        label="Run Stream"
        value={monitorConnected ? "Live" : "Offline"}
        meta={monitorConnected ? "Monitor API reachable" : "Monitor API unavailable"}
        tone={monitorConnected ? "success" : "warning"}
      />
      <WorkspaceMetric
        label="Queue"
        value={String(queue.length)}
        meta="Queued loop actions reported by backend"
      />
      <WorkspaceMetric
        label="Events"
        value={String(events.length)}
        meta="Recent monitor events in local session"
        tone="info"
      />
      <WorkspaceMetric
        label="Task Inbox"
        value={taskLoading ? "..." : String(tasks.length)}
        meta="Linear or demo task source"
      />
    </div>
  );

  const workspaceMode =
    activeWorkspaceSection === "history" ? "history" : isExecuting ? "run" : "command";

  return (
    <main
      className={styles.workspace}
      data-surface={activeWorkspaceSection}
      data-phase={phase}
      data-mode={workspaceMode}
    >
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.crumbRow}>
            <span className={styles.crumb}>{crumb}</span>
            <span className={styles.crumbSep}>/</span>
            <span className={styles.crumbCurrent}>{headerMeta}</span>
          </div>
        </div>

        <div className={styles.topBarRight}>
          <button
            type="button"
            className={styles.topAction}
            onClick={onOpenCommandPalette}
            aria-label="Open command palette"
            title="Open command palette"
          >
            <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <span className={styles.phasePill} data-phase={phase}>
            {titleCase(phase)}
          </span>
          <div className={styles.avatar}>AI</div>
        </div>
      </header>

      <div className={styles.contentScroll}>
        {activeWorkspaceSection === "history" ? (
          <div className={styles.pageGrid}>
            {historyMetrics}
            <WorkspacePanel title="Run history" meta="Filter outcomes and inspect execution traces" flush>
              <GlobalMonitorView />
            </WorkspacePanel>
          </div>
        ) : isExecuting ? (
          <div className={styles.pageGrid}>
            {executionMetrics}
            <div className={styles.executionGrid}>
              <WorkspacePanel title="Execution telemetry" meta={taskRef ?? selectedTask?.id ?? "Active run"} flush>
                <MonitorDashboard />
              </WorkspacePanel>

              <div className={styles.sideColumn}>
                <WorkspacePanel title="Task context" meta={selectedTask?.sourceLabel ?? "Task source"}>
                  <MissionDossier targetedTask={selectedTask} />
                </WorkspacePanel>

                <WorkspacePanel title="Run controls" meta="Abort, annotate, or steer">
                  <MissionControls />
                </WorkspacePanel>

                <WorkspacePanel title="Conversation" meta="Live loop messages" flush>
                  <LoopConversationPanel />
                </WorkspacePanel>
              </div>
            </div>
          </div>
        ) : (
          <section className={`${styles.pageGrid} ${styles.commandGrid}`} aria-label="Task loop desk">
            <WorkspacePanel
              title="Loop readiness"
              meta={selectedTask ? selectedTask.id : "Select a task to inspect"}
            >
              <MissionDossier targetedTask={selectedTask} variant="preflight" />
            </WorkspacePanel>

            <aside className={styles.intakeLane} aria-label="Intake">
              <OmniPrompt
                recording={recording}
                onStartVoice={onStartVoice}
                onStopVoice={onStopVoice}
                permissionStatus={permissionStatus}
                availableDevices={availableDevices}
                selectedDeviceId={selectedDeviceId}
                onSelectDevice={onSelectDevice}
                inputLevel={inputLevel}
                recordingDurationMs={recordingDurationMs}
                errorMessage={errorMessage}
                isExecuting={isExecuting}
                targetedTask={selectedTask}
                taskCount={tasks.length}
                taskLoading={taskLoading}
                taskError={taskError}
              />
            </aside>
          </section>
        )}
      </div>
    </main>
  );
}
