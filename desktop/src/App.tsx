import "@fontsource/geist-mono";
import { useEffect, useState, useCallback, useRef } from "react";
import { Sidebar } from "./components/Sidebar";
import { MasterWorkspace } from "./components/MasterWorkspace";
import { CommandPalette } from "./components/CommandPalette";
import { useAppStore } from "./stores/appStore";
import { useConnections } from "./hooks/useConnections";
import { useElapsedTimer } from "./hooks/useElapsedTimer";
import { useMicrophone } from "./hooks/useMicrophone";
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
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const density = useAppStore((s) => s.density);
  const activeWorkspaceSection = useAppStore((s) => s.activeWorkspaceSection);
  const phase = useAppStore((s) => s.phase);
  const holdShortcutActive = useRef(false);
  const recordingRef = useRef(recording);
  const startRecordingRef = useRef(startRecording);
  const stopRecordingRef = useRef(stopRecording);

  useEffect(() => {
    recordingRef.current = recording;
    startRecordingRef.current = startRecording;
    stopRecordingRef.current = stopRecording;
  }, [recording, startRecording, stopRecording]);

  useEffect(() => {
    window.sejfa?.onGlobalShortcut((action) => {
      if (action === "start-voice-recording") {
        void startRecordingRef.current();
      } else if (action === "stop-voice-recording") {
        stopRecordingRef.current();
      } else if (action === "toggle-voice") {
        if (recordingRef.current) {
          stopRecordingRef.current();
        } else {
          void startRecordingRef.current();
        }
      }
    });
  }, []);

  useEffect(() => {
    const matchesShortcut = (event: KeyboardEvent): boolean => {
      return (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "v";
    };

    const isShortcutRelease = (event: KeyboardEvent): boolean => {
      return ["v", "V", "Meta", "Control", "Shift"].includes(event.key);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesShortcut(event)) return;

      event.preventDefault();
      if (holdShortcutActive.current) return;
      holdShortcutActive.current = true;
      void startRecording();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!holdShortcutActive.current || !isShortcutRelease(event)) return;

      holdShortcutActive.current = false;
      stopRecording();
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelectTask = useCallback((idx: number) => {
    setSelectedTaskIndex(idx);
    setIsCommandPaletteOpen(false);
  }, []);

  return (
    <div
      className={styles.appRoot}
      data-density={density}
      data-section={activeWorkspaceSection}
      data-phase={phase}
    >
      <div className={styles.dragRegion} />
      <Sidebar 
        selectedIndex={selectedTaskIndex}
        onSelectIndex={setSelectedTaskIndex}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      <MasterWorkspace 
        selectedIndex={selectedTaskIndex}
        recording={recording}
        onStartVoice={() => void startRecording()}
        onStopVoice={stopRecording}
        permissionStatus={permissionStatus}
        availableDevices={availableDevices}
        selectedDeviceId={selectedDeviceId}
        onSelectDevice={setSelectedDeviceId}
        inputLevel={inputLevel}
        recordingDurationMs={recordingDurationMs}
        errorMessage={errorMessage}
      />
      <CommandPalette 
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTask={handleSelectTask}
      />
    </div>
  );
}
