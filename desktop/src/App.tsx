import { useEffect } from "react";
import { VoiceRail } from "./components/VoiceRail";
import { LoopCanvas } from "./components/LoopCanvas";
import { EventStream } from "./components/EventStream";
import { ClarificationDialog } from "./components/ClarificationDialog";
import { useConnections } from "./hooks/useConnections";
import { useElapsedTimer } from "./hooks/useElapsedTimer";
import { useMicrophone } from "./hooks/useMicrophone";
import styles from "./App.module.css";

export default function App() {
  useConnections();
  useElapsedTimer();
  const { recording, toggleRecording } = useMicrophone();

  useEffect(() => {
    window.sejfa?.onGlobalShortcut((action) => {
      if (action === "toggle-voice") {
        toggleRecording();
      }
    });
  }, [toggleRecording]);

  return (
    <div className={styles.shell}>
      <div className={styles.dragRegion} />

      <aside className="glass-panel">
        <VoiceRail recording={recording} onToggle={toggleRecording} />
      </aside>

      <div className={styles.workspace}>
        <main className="glass-panel">
          <LoopCanvas />
        </main>

        <section className="glass-panel">
          <EventStream />
        </section>
      </div>

      <ClarificationDialog />
    </div>
  );
}
