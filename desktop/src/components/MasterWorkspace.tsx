import { useAppStore } from "../stores/appStore";
import { OmniPrompt } from "./OmniPrompt";
import { MissionDossier } from "./MissionDossier";
import { MonitorDashboard } from "./MonitorDashboard";
import { GlobalMonitorView } from "./GlobalMonitorView";
import styles from "./MasterWorkspace.module.css";
import { mockLinearCycle } from "../mockLinearData";

export function MasterWorkspace({ selectedIndex, recording, onToggleVoice }: any) {
  const { phase, ticketKey, activeGlobalView } = useAppStore();
  
  const isExecuting = phase !== "idle" && phase !== "listening";
  
  // Logic:
  // 1. If we are in "monitor" mode globally, show the GlobalMonitorView.
  // 2. If we are in "command" mode AND executing, show the MonitorDashboard (Live Mission).
  // 3. If we are in "command" mode AND NOT executing, show the MissionDossier (Pre-flight).

  const targetedTask = isExecuting 
    ? mockLinearCycle.find(q => q.id === ticketKey) || mockLinearCycle[selectedIndex]
    : mockLinearCycle[selectedIndex]; 

  if (activeGlobalView === "monitor") {
    return (
      <main className={styles.workspace}>
        <GlobalMonitorView />
      </main>
    );
  }

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
