import { useAppStore } from "../stores/appStore";
import { OmniPrompt } from "./OmniPrompt";
import { TerminalFeed } from "./TerminalFeed";
import { MissionDossier } from "./MissionDossier";
import { BlockersView } from "./BlockersView";
import styles from "./MasterWorkspace.module.css";
import { mockLinearCycle } from "../mockLinearData";

export function MasterWorkspace({ selectedIndex, recording, onToggleVoice }: any) {
  const { phase, ticketKey } = useAppStore();
  
  const isExecuting = phase !== "idle" && phase !== "listening";
  const targetedTask = isExecuting 
    ? mockLinearCycle.find(q => q.id === ticketKey) || mockLinearCycle[selectedIndex]
    : mockLinearCycle[selectedIndex]; 

  return (
    <main className={styles.workspace}>
      <OmniPrompt 
        recording={recording} 
        onToggleVoice={onToggleVoice} 
        isExecuting={isExecuting} 
        targetedTask={targetedTask}
      />
      
      <div className={`${styles.canvas} ${isExecuting ? styles.canvasActive : styles.canvasIdle}`}>
        {isExecuting ? (
           <>
             <TerminalFeed />
             <BlockersView />
           </>
        ) : (
           <MissionDossier targetedTask={targetedTask} />
        )}
      </div>
    </main>
  );
}
