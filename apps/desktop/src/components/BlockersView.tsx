import { useState } from "react";
import { submitClarification } from "@sejfa/data-client";
import { useAppStore } from "../stores/appStore";
import styles from "./BlockersView.module.css";

export function BlockersView() {
  const { clarification, stuckAlert, completion, voiceUrl, setClarification, clearStuckAlert, reset } = useAppStore();
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  if (!clarification && !stuckAlert && !completion) return null;

  return (
    <div className={styles.dockedBlocker}>
      {clarification && (
        <div className={`${styles.blockerCard} ${styles.borderWarn}`}>
          <div className={styles.cardHeader}>CLARIFICATION ROUND {clarification.round}</div>
          <div className={styles.cardContent}>
             <p className={styles.mutedText}>{clarification.partialSummary}</p>
             <ul className={styles.qList}>
               {clarification.questions.map((q, i) => <li key={i}>{q}</li>)}
             </ul>
          </div>
          <form className={styles.promptForm} onSubmit={submitReply}>
             <div className={styles.promptPrefix}>&gt;</div>
             <input autoFocus value={answer} onChange={e => setAnswer(e.target.value)} disabled={submitting} placeholder="Provide tactical instruction..." className={styles.promptInput} aria-label="Provide clarification answer" />
             <button type="submit" className={styles.btnSend} disabled={submitting || !answer.trim()}>SEND</button>
          </form>
        </div>
      )}

      {stuckAlert && (
        <div className={`${styles.blockerCard} ${styles.borderDanger}`} role="alert">
          <div className={styles.cardHeader}>FATAL STALL: REPETITION LOOP</div>
          <div className={styles.cardContent}>
             <pre className={styles.codeBlock}>{stuckAlert.pattern}</pre>
          </div>
          <div className={styles.cardActions}>
            <button className={styles.btnGhostDanger} onClick={clearStuckAlert}>DISMISS ALERT</button>
          </div>
        </div>
      )}

      {completion && (
        <div className={`${styles.blockerCard} ${styles.borderSuccess}`} role="status">
          <div className={styles.cardHeader}>MISSION COMPLETE</div>
          <div className={styles.cardContent}>
            <p className={styles.mutedText}>Task execution cycle concluded without exception. Validating readiness state...</p>
          </div>
          <div className={styles.cardActions}>
            <button className={styles.btnPrimary} onClick={() => reset()}>CLOSE MISSION</button>
          </div>
        </div>
      )}
    </div>
  );
}
