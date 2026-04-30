import { FormEvent, useMemo, useRef, useState } from "react";
import { abortMission, sendTacticalInstruction } from "@sejfa/data-client";
import { useAppStore } from "../stores/appStore";
import { Dialog } from "./Dialog";
import styles from "./MissionControls.module.css";

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function describeOutcome(outcome?: string | null): string {
  switch (outcome) {
    case "done":
      return "Run completed. Retry is not exposed here because the task already finished cleanly.";
    case "blocked":
      return "Run blocked. Use the retry action in the blockers panel after reviewing the failure context.";
    case "aborted":
      return "Run aborted by operator. Retry is available from the blockers panel when you want to re-queue the task.";
    case "failed":
      return "Run failed. Retry is available from the blockers panel after you review the error trace.";
    default:
      return "Abort is live. Operator notes are persisted immediately and will be available at the next safe boundary.";
  }
}

export function MissionControls() {
  const { sessionId, loopActive, taskRef, elapsedMs, cost, monitorUrl, apiToken, completion } = useAppStore();
  const [instruction, setInstruction] = useState("");
  const [sendingInstruction, setSendingInstruction] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [confirmAbort, setConfirmAbort] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const abortTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelAbortRef = useRef<HTMLButtonElement>(null);

  const canSendInstruction = Boolean(sessionId);
  const canAbort = Boolean(loopActive && sessionId);
  const outcomeMessage = useMemo(() => describeOutcome(completion?.outcome), [completion?.outcome]);

  if (!loopActive && !sessionId && !completion) return null;

  const submitInstruction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sessionId || !instruction.trim()) return;

    setSendingInstruction(true);
    setActionError(null);
    try {
      await sendTacticalInstruction(monitorUrl, sessionId, instruction.trim(), { apiToken });
      setInstruction("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to send operator note.");
    } finally {
      setSendingInstruction(false);
    }
  };

  const onAbort = async () => {
    if (!sessionId) return;

    setAborting(true);
    setActionError(null);
    try {
      await abortMission(monitorUrl, sessionId, { apiToken });
      setConfirmAbort(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to abort run.");
    } finally {
      setAborting(false);
    }
  };

  return (
    <div className={styles.controlsContainer}>
      <div className={styles.controlHeader}>RUN SUMMARY</div>

      <div className={styles.controlRow}>
        <div className={styles.actionCluster}>
          <span className={styles.actionCue}>Linked task</span>
          <strong>{taskRef ?? completion?.task_ref ?? "Pending task link"}</strong>
        </div>
        <div className={styles.actionCluster}>
          <span className={styles.actionCue}>Elapsed</span>
          <strong>{formatElapsed(elapsedMs)}</strong>
        </div>
        <div className={styles.actionCluster}>
          <span className={styles.actionCue}>Cost</span>
          <strong>{cost ? formatCost(cost.total_usd) : "$0.00"}</strong>
        </div>
      </div>

      <div className={styles.controlRow}>
        <div className={styles.actionCluster}>
          <span className={styles.actionCue}>Run controls</span>
          <button
            ref={abortTriggerRef}
            type="button"
            className={styles.abortBtn}
            onClick={() => setConfirmAbort(true)}
            disabled={!canAbort || aborting}
          >
            {aborting ? "ABORTING…" : "ABORT RUN"}
          </button>
        </div>

        <form className={styles.instructionForm} onSubmit={submitInstruction}>
          <input
            className={styles.instructionInput}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            disabled={!canSendInstruction || sendingInstruction}
            placeholder={
              canSendInstruction
                ? "Add an operator note for the next safe boundary…"
                : "Start a run to send operator notes"
            }
            aria-label="Operator note"
          />
          <button
            type="submit"
            className={styles.sendBtn}
            disabled={!canSendInstruction || sendingInstruction || !instruction.trim()}
          >
            {sendingInstruction ? "SENDING…" : "SEND NOTE"}
          </button>
        </form>
      </div>

      <div className={styles.controlRow}>
        <div className={styles.actionCluster}>
          <span className={styles.actionCue}>{outcomeMessage}</span>
        </div>
      </div>

      {actionError && <p className={styles.actionError}>{actionError}</p>}

      <Dialog
        open={confirmAbort}
        titleId="abort-run-title"
        onClose={() => {
          if (!aborting) setConfirmAbort(false);
        }}
        initialFocusRef={cancelAbortRef}
        restoreFocusRef={abortTriggerRef}
        closeOnBackdrop={!aborting}
      >
        <div className={styles.modalCard}>
          <h3 id="abort-run-title" className={styles.modalTitle}>
            Abort active run?
          </h3>
          <p className={styles.modalDescription}>
            This sends a live abort signal to the runner. The current session will be marked aborted and the task will not continue until you explicitly retry it.
          </p>
          <div className={styles.modalMeta}>
            <div>
              <span className={styles.modalMetaLabel}>Task</span>
              <span className={styles.modalMetaValue}>{taskRef ?? "Unknown"}</span>
            </div>
            <div>
              <span className={styles.modalMetaLabel}>Session</span>
              <span className={styles.modalMetaValue}>{sessionId ?? "Unknown"}</span>
            </div>
            <div>
              <span className={styles.modalMetaLabel}>Elapsed</span>
              <span className={styles.modalMetaValue}>{formatElapsed(elapsedMs)}</span>
            </div>
          </div>
          <div className={styles.modalActions}>
            <button
              ref={cancelAbortRef}
              type="button"
              className={styles.modalCancel}
              onClick={() => setConfirmAbort(false)}
              disabled={aborting}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.modalAbort}
              onClick={onAbort}
              disabled={aborting}
            >
              {aborting ? "Aborting…" : "Abort run"}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
