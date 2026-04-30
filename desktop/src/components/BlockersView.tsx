import { useState } from "react";
import { retryLoopTask, submitClarification } from "@sejfa/data-client";
import { useAppStore } from "../stores/appStore";
import styles from "./BlockersView.module.css";

export function BlockersView() {
  const {
    clarification,
    stuckAlert,
    completion,
    voiceUrl,
    taskRef,
    setClarification,
    clearStuckAlert,
    clearCompletion,
    reset,
    setProcessingStep,
  } = useAppStore();
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const retryTarget = completion?.task_ref ?? taskRef ?? null;

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clarification || !answer.trim()) return;
    setSubmitting(true);
    try {
      await submitClarification(voiceUrl, { sessionId: clarification.sessionId, text: answer.trim() });
      setAnswer("");
      setClarification(null);
    } catch { } finally { setSubmitting(false); }
  };

  if (!clarification && !stuckAlert && !completion) {
    return (
      <div className={styles.dockedBlocker}>
        <div className={`${styles.blockerCard} ${styles.borderNeutral}`}>
          <div className={styles.cardHeader}>NO ACTIVE ISSUES</div>
          <div className={styles.cardContent}>
            <p className={styles.mutedText}>Run status is stable.</p>
            <p className={styles.mutedText}>Use the timeline, operator notes, and live abort control when you need intervention context.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dockedBlocker}>
      {clarification && (
        <div className={`${styles.blockerCard} ${styles.borderWarn}`}>
          <div className={styles.cardHeader}>CLARIFICATION NEEDED (ROUND {clarification.round})</div>
          <div className={styles.cardContent}>
             <p className={styles.mutedText}>{clarification.partialSummary}</p>
             <ul className={styles.qList}>
               {clarification.questions.map((q, i) => <li key={i}>{q}</li>)}
             </ul>
          </div>
          <form className={styles.promptForm} onSubmit={submitReply}>
             <div className={styles.promptPrefix}>&gt;</div>
             <input autoFocus value={answer} onChange={e => setAnswer(e.target.value)} disabled={submitting} placeholder="Add clarification details..." className={styles.promptInput} aria-label="Provide clarification answer" />
             <button type="submit" className={styles.btnSend} disabled={submitting || !answer.trim()}>SEND</button>
          </form>
        </div>
      )}

      {stuckAlert && (
        <div className={`${styles.blockerCard} ${styles.borderDanger}`} role="status" aria-live="polite">
          <div className={styles.cardHeader}>RUN BLOCKED: REPETITION DETECTED</div>
          <div className={styles.cardContent}>
             <pre className={styles.codeBlock}>{stuckAlert.pattern}</pre>
          </div>
          <div className={styles.cardActions}>
            <button className={styles.btnGhostDanger} onClick={clearStuckAlert}>DISMISS</button>
          </div>
        </div>
      )}

      {completion && (
        <div
          className={`${styles.blockerCard} ${
            completion.outcome === "done" ? styles.borderSuccess : styles.borderDanger
          }`}
          role="status"
        >
          <div className={styles.cardHeader}>
            {completion.outcome === "done"
              ? "RUN COMPLETE"
              : completion.outcome === "blocked"
                ? "RUN BLOCKED"
                : completion.outcome === "aborted"
                  ? "RUN ABORTED"
                  : "RUN FAILED"}
          </div>
          <div className={styles.cardContent}>
            <p className={styles.mutedText}>
              {completion.outcome === "done"
                ? "Automation run completed. Confirm outputs and readiness before closing."
                : completion.outcome === "blocked"
                  ? "The runner reported a blocked outcome. Review the conversation and re-queue when the task is unblocked."
                  : completion.outcome === "aborted"
                    ? "The run was stopped by operator action. Re-queue when you want the task to continue."
                    : "The runner exited unsuccessfully. Review the trace, then retry when ready."}
            </p>
          </div>
          <div className={styles.cardActions}>
            {completion.outcome !== "done" && retryTarget && (
              <button
                className={styles.btnPrimary}
                onClick={async () => {
                  setRetrying(true);
                  setRetryError(null);
                  try {
                    await retryLoopTask(voiceUrl, retryTarget);
                    clearStuckAlert();
                    clearCompletion();
                    setProcessingStep("Retry queued...");
                  } catch (error) {
                    setRetryError(
                      error instanceof Error ? error.message : "Failed to queue task retry.",
                    );
                  } finally {
                    setRetrying(false);
                  }
                }}
                disabled={retrying}
              >
                {retrying ? "QUEUING…" : "RETRY TASK"}
              </button>
            )}
            <button className={styles.btnPrimary} onClick={() => reset()}>CLOSE RUN</button>
          </div>
          {retryError && (
            <div className={styles.cardContent}>
              <p className={styles.mutedText}>{retryError}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
