import { useState } from "react";
import { useAppStore } from "../stores/appStore";
import { abortMission, sendTacticalInstruction, forceCheckpoint } from "@sejfa/data-client";
import styles from "./MissionControls.module.css";

export function MissionControls() {
  const { sessionId, monitorUrl, loopActive, reset } = useAppStore();
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAbort = async () => {
    if (!sessionId || !confirm("Stop the active run immediately? This ends the current automation loop now.")) return;
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
      <div className={styles.controlHeader}>RUN CONTROLS</div>
      
      <div className={styles.controlRow}>
        <div className={styles.actionCluster}>
          <button
            className={styles.abortBtn}
            onClick={handleAbort}
            disabled={loading}
            title="Kill active loop session"
            aria-describedby="cue-abort-mission"
          >
            STOP RUN
          </button>
          <span id="cue-abort-mission" className={styles.actionCue}>
            <span aria-hidden="true">⚠</span> Immediately ends the active loop
          </span>
        </div>

        <form className={styles.instructionForm} onSubmit={handleSubmitInstruction}>
          <input 
            className={styles.instructionInput}
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="Send instruction to the agent…"
            disabled={loading}
          />
          <div className={styles.actionCluster}>
            <button
              type="submit"
              className={styles.sendBtn}
              disabled={loading || !instruction.trim()}
              aria-describedby="cue-pivot"
            >
              SEND
            </button>
            <span id="cue-pivot" className={styles.actionCue}>
              <span aria-hidden="true">↗</span> Adjusts direction without restarting
            </span>
          </div>
        </form>

        <div className={styles.actionCluster}>
          <button
            className={styles.checkpointBtn}
            onClick={handleCheckpoint}
            disabled={loading}
            title="Force a git checkpoint"
            aria-describedby="cue-checkpoint"
          >
            CHECKPOINT
          </button>
          <span id="cue-checkpoint" className={styles.actionCue}>
            <span aria-hidden="true">✓</span> Creates a recovery save point
          </span>
        </div>
      </div>
    </div>
  );
}
