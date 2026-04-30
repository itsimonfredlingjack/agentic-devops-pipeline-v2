import "@fontsource/geist-mono";
import "./design/global.css";
import { useState, useEffect, useCallback, useRef } from "react";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import { MetricsBar } from "./components/MetricsBar";
import { ExecutionLog } from "./components/ExecutionLog";
import { VoiceIntake } from "./components/VoiceIntake";
import { TaskDetail } from "./components/TaskDetail";
import { useAppStore } from "./stores/appStore";
import { useConnections } from "./hooks/useConnections";
import { useElapsedTimer } from "./hooks/useElapsedTimer";
import { useMicrophone } from "./hooks/useMicrophone";
import { useTaskInbox } from "./hooks/useTaskInbox";
import { resolveSelectedTask } from "./utils/taskSelection";
import styles from "./App.module.css";

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
  } = useMicrophone();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { tasks, loading: taskLoading, error: taskError } = useTaskInbox();
  const selectedTask = resolveSelectedTask(tasks, selectedTaskId);
  const phase = useAppStore((s) => s.phase);
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

  return (
    <div className={styles.appRoot} data-phase={phase}>
      <div className={styles.dragRegion} />
      
      <Sidebar
        tasks={tasks}
        loading={taskLoading}
        error={taskError}
        selectedTaskId={selectedTask?.id ?? null}
        onSelectTaskId={handleSelectTask}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      <main className={styles.main}>
        <WorkspaceHeader
          selectedTask={selectedTask}
          phase={phase}
        />

        <div className={styles.content}>
          <MetricsBar
            toolCalls={24}
            cost={1.24}
            duration="2m 14s"
            successRate={96}
            tokens={8420}
            retries={2}
          />

          <div className={styles.workspaceGrid}>
            <div className={styles.primaryColumn}>
              <ExecutionLog />
            </div>

            <div className={styles.secondaryColumn}>
              <TaskDetail task={selectedTask} />
              <VoiceIntake
                selectedTask={selectedTask}
                recording={recording}
                onStartVoice={() => void startRecording()}
                onStopVoice={stopRecording}
                permissionStatus={permissionStatus}
                inputLevel={inputLevel}
                errorMessage={errorMessage}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
