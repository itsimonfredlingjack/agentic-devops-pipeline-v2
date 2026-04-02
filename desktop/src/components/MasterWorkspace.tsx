import { useAppStore } from "../stores/appStore";
import { OmniPrompt } from "./OmniPrompt";
import { MissionDossier } from "./MissionDossier";
import { MonitorDashboard } from "./MonitorDashboard";
import { GlobalMonitorView } from "./GlobalMonitorView";
import { IntentReview } from "./IntentReview";
import styles from "./MasterWorkspace.module.css";
import { mockLinearCycle } from "../mockLinearData";

export function MasterWorkspace({ selectedIndex, recording, onToggleVoice }: any) {
  const { phase, ticketKey, activeGlobalView } = useAppStore();

  if (activeGlobalView === "monitor") {
    return (
      <main className={styles.workspace}>
        <GlobalMonitorView />
      </main>
    );
  }

  // Verify phase: show the full-screen intent review
  if (phase === "verify") {
    return (
      <main className={styles.workspace}>
        <IntentReview />
      </main>
    );
  }

  // Only show MonitorDashboard during actual loop execution, not voice pipeline processing
  const isExecuting = phase === "loop" || phase === "done" || phase === "error";

  const targetedTask = isExecuting
    ? mockLinearCycle.find(q => q.id === ticketKey) || mockLinearCycle[selectedIndex]
    : mockLinearCycle[selectedIndex];

  return (
    <main className={styles.workspace}>
      {isExecuting ? (
        <MonitorDashboard />
      ) : (
        <>
          <OmniPrompt
            recording={recording}
            onToggleVoice={onToggleVoice}
            isExecuting={false}
            targetedTask={targetedTask}
          />
          <div className={`${styles.canvas} ${styles.canvasIdle}`}>
            <MissionDossier targetedTask={targetedTask} />
          </div>
        </>
      )}
    </main>
  );
}
