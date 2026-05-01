import "@fontsource/geist-mono";
import "./design/global.css";
import { useState, useEffect, useCallback, useRef } from "react";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import { MetricsBar } from "./components/MetricsBar";
import { ExecutionLog } from "./components/ExecutionLog";
import { VoiceIntake } from "./components/VoiceIntake";
import { MissionDossier } from "./components/MissionDossier";
import { MonitorDashboard } from "./components/MonitorDashboard";
import { MissionControls } from "./components/MissionControls";
import { LoopConversationPanel } from "./components/LoopConversationPanel";
import { GlobalMonitorView } from "./components/GlobalMonitorView";
import { useAppStore } from "./stores/appStore";
import { useConnections } from "./hooks/useConnections";
import { useElapsedTimer } from "./hooks/useElapsedTimer";
import { useMicrophone } from "./hooks/useMicrophone";
import { useTaskInbox } from "./hooks/useTaskInbox";
import { resolveSelectedTask } from "./utils/taskSelection";
import styles from "./App.module.css";

function formatElapsed(ms: number): string {
  if (!ms) return "—";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export default function App() {
  useConnections();
  useElapsedTimer();

  const {
    recording,
    permissionStatus,
    availableDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    inputLevel,
    recordingDurationMs,
    errorMessage,
    startRecording,
    stopRecording,
    sendTextIntake,
  } = useMicrophone();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [_isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeMode, setActiveMode] = useState<"command" | "monitor" | "history">("command");
  const { tasks, loading: taskLoading, error: taskError } = useTaskInbox();
  const selectedTask = resolveSelectedTask(tasks, selectedTaskId);
  const {
    phase,
    events,
    cost,
    elapsedMs,
    stuckAlert,
    completion,
    loopActive,
    processingStep,
    sessionId,
    setActiveWorkspaceSection,
  } = useAppStore();

  const holdShortcutActive = useRef(false);
  const recordingRef = useRef(recording);
  const startRecordingRef = useRef(startRecording);
  const stopRecordingRef = useRef(stopRecording);

  useEffect(() => {
    if (!selectedTaskId && tasks.length > 0) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    recordingRef.current = recording;
    startRecordingRef.current = startRecording;
    stopRecordingRef.current = stopRecording;
  }, [recording, startRecording, stopRecording]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const matchesShortcut = (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "v";
      if (!matchesShortcut) return;
      event.preventDefault();
      if (holdShortcutActive.current) return;
      holdShortcutActive.current = true;
      void startRecording();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!holdShortcutActive.current) return;
      if (["v", "V", "Meta", "Control", "Shift"].includes(event.key)) {
        holdShortcutActive.current = false;
        stopRecording();
      }
    };

    const onWindowBlur = () => {
      if (!holdShortcutActive.current) return;
      holdShortcutActive.current = false;
      stopRecording();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [startRecording, stopRecording]);

  const handleSelectTask = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
  }, []);

  useEffect(() => {
    setActiveWorkspaceSection(activeMode === "history" ? "history" : "work");
  }, [activeMode, setActiveWorkspaceSection]);

  const hasActiveContext =
    loopActive || Boolean(stuckAlert) || Boolean(completion) || Boolean(processingStep) || Boolean(sessionId);
  const isExecuting = phase === "loop" || phase === "done" || (phase === "error" && hasActiveContext);

  const totalEvents = events.length;
  const failures = events.filter((event) => event.success === false || Boolean(event.error)).length;
  const successful = Math.max(0, totalEvents - failures);
  const successRate = totalEvents > 0 ? Math.round((successful / totalEvents) * 100) : completion ? (completion.outcome === "done" ? 100 : 0) : 0;
  const retries = events.filter((event) => (event.event_type ?? "").toLowerCase().includes("retry")).length;

  const incident = stuckAlert
    ? {
        state: "Stuck alert",
        text: `${stuckAlert.pattern} repeated ${stuckAlert.repeat_count} times`,
      }
    : completion && completion.outcome !== "done"
      ? {
          state: `Run ${completion.outcome}`,
          text: completion.pytest_summary ?? completion.git_diff_summary ?? "Review execution logs for details.",
        }
      : null;

  return (
    <div className={styles.appRoot} data-phase={phase}>
      <div className={styles.dragRegion} />

      <Sidebar
        tasks={tasks}
        loading={taskLoading}
        error={taskError}
        selectedTaskId={selectedTask?.id ?? null}
        onSelectTaskId={handleSelectTask}
        isCollapsed={_isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!_isSidebarCollapsed)}
        activeMode={activeMode}
        onModeChange={setActiveMode}
        phase={phase}
      />

      <main className={styles.main}>
        <WorkspaceHeader
          selectedTask={selectedTask}
          phase={phase}
        />

        <div className={styles.content} data-phase={phase}>
          <MetricsBar
            toolCalls={totalEvents}
            cost={cost?.total_usd ?? 0}
            duration={formatElapsed(elapsedMs)}
            successRate={successRate}
            retries={retries > 0 ? retries : undefined}
            incident={incident}
          />

          {activeMode === "history" ? (
            <section className={styles.historyView}>
              <GlobalMonitorView />
            </section>
          ) : activeMode === "monitor" || isExecuting ? (
            <section className={styles.monitorView}>
              <div className={styles.monitorMain}>
                <MonitorDashboard />
              </div>
              <aside className={styles.monitorSide}>
                <MissionDossier targetedTask={selectedTask} />
                <MissionControls />
                <LoopConversationPanel />
              </aside>
            </section>
          ) : (
            <section className={styles.commandView}>
              <VoiceIntake
                selectedTask={selectedTask}
                recording={recording}
                onStartVoice={() => void startRecording()}
                onStopVoice={stopRecording}
                onTextIntake={(text) => void sendTextIntake(text)}
                permissionStatus={permissionStatus}
                inputLevel={inputLevel}
                errorMessage={errorMessage}
              />

              <div className={styles.dossierSection}>
                <MissionDossier targetedTask={selectedTask} variant="preflight" />
              </div>

              <div className={styles.logSection}>
                <ExecutionLog />
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
