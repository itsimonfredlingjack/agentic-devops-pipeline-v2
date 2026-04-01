import "@fontsource/geist-mono";
import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { MasterWorkspace } from "./components/MasterWorkspace";
import { useConnections } from "./hooks/useConnections";
import { useElapsedTimer } from "./hooks/useElapsedTimer";
import { useMicrophone } from "./hooks/useMicrophone";
import styles from "./App.module.css";

export default function App() {
  useConnections();
  useElapsedTimer();
  const { recording, toggleRecording } = useMicrophone();
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);

  useEffect(() => {
    window.sejfa?.onGlobalShortcut((action) => {
      if (action === "toggle-voice") {
        toggleRecording();
      }
    });
  }, [toggleRecording]);

  return (
    <div className={styles.appRoot}>
      <div className={styles.dragRegion} />
      <Sidebar 
        selectedIndex={selectedTaskIndex}
        onSelectIndex={setSelectedTaskIndex}
      />
      <MasterWorkspace 
        selectedIndex={selectedTaskIndex} 
        recording={recording}
        onToggleVoice={toggleRecording}
      />
    </div>
  );
}
