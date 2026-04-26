import { useState } from "react";
import { useAppStore } from "../stores/appStore";
import { abortMission, sendTacticalInstruction, forceCheckpoint } from "@sejfa/data-client";
import styles from "./MissionControls.module.css";

export function MissionControls() {
  const { sessionId, monitorUrl, loopActive, reset } = useAppStore();
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAbort = async () => {
    if (!sessionId || !confirm("Are you sure you want to ABORT the current mission? This will kill the loop immediately.")) return;
    setLoading(true);
    await abortMission(monitorUrl, sessionId);
    reset(); // Return to command center immediately
    setLoading(false);
  };

  const handleCheckpoint = async () => {
    if (!sessionId) return;
    setLoading(true);
    await forceCheckpoint(monitorUrl, sessionId);
    setLoading(false);
  };

  const handleSubmitInstruction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !instruction.trim()) return;
    setLoading(true);
    await sendTacticalInstruction(monitorUrl, sessionId, instruction.trim());
    setInstruction("");
    setLoading(false);
  };

  if (!loopActive && !sessionId) return null;

  return (
    <div className={styles.controlsContainer}>
      <div className={styles.controlHeader}>TACTICAL MISSION CONTROL</div>
      
      <div className={styles.controlRow}>
        <button 
          className={styles.abortBtn} 
          onClick={handleAbort} 
          disabled={loading}
          title="Kill active loop session"
        >
          ABORT MISSION
        </button>

        <form className={styles.instructionForm} onSubmit={handleSubmitInstruction}>
          <input 
            className={styles.instructionInput}
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="Send tactical instruction to Claude..."
            disabled={loading}
          />
          <button type="submit" className={styles.sendBtn} disabled={loading || !instruction.trim()}>
            PIVOT
          </button>
        </form>

        <button 
          className={styles.checkpointBtn} 
          onClick={handleCheckpoint} 
          disabled={loading}
          title="Force a git checkpoint"
        >
          CHECKPOINT
        </button>
      </div>
    </div>
  );
}
