import { useEffect } from "react";
import { VoiceRail } from "./components/VoiceRail";
import { useConnections } from "./hooks/useConnections";
import { useMicrophone } from "./hooks/useMicrophone";

export default function App() {
  useConnections();
  const { recording, toggleRecording } = useMicrophone();

  useEffect(() => {
    window.sejfa?.onGlobalShortcut((action) => {
      if (action === "toggle-voice") {
        toggleRecording();
      }
    });
  }, [toggleRecording]);

  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        gap: 12,
        padding: 12,
        background: "var(--canvas-bg)",
      }}
    >
      <div
        className="drag-region"
        style={{ position: "fixed", top: 0, left: 0, right: 0, height: 40, zIndex: 100 }}
      />

      <aside className="glass-panel">
        <VoiceRail recording={recording} onToggle={toggleRecording} />
      </aside>

      <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 12, paddingTop: 36 }}>
        <main className="glass-panel" style={{ padding: 24, display: "grid", placeContent: "center", textAlign: "center" }}>
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Idle — speak the next objective
          </div>
        </main>

        <section className="glass-panel" style={{ padding: 18, minHeight: 160 }}>
          <div style={{ color: "var(--text-muted)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            Event Stream
          </div>
        </section>
      </div>
    </div>
  );
}
