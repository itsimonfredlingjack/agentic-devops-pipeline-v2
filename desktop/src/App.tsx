import "@fontsource/geist-mono";
import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { MasterWorkspace } from "./components/MasterWorkspace";
import { CommandPalette } from "./components/CommandPalette";
import { useConnections } from "./hooks/useConnections";
import { useElapsedTimer } from "./hooks/useElapsedTimer";
import { useMicrophone } from "./hooks/useMicrophone";
import styles from "./App.module.css";

export default function App() {
  useConnections();
  useElapsedTimer();
  const { recording, toggleRecording } = useMicrophone();
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  useEffect(() => {
    window.sejfa?.onGlobalShortcut((action) => {
      if (action === "toggle-voice") {
        toggleRecording();
      }
    });
  }, [toggleRecording]);

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
    <div className={styles.appRoot}>
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
        onToggleVoice={toggleRecording}
      />
      <CommandPalette 
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTask={handleSelectTask}
      />
    </div>
  );
}
