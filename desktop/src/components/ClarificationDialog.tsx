import { useState } from "react";
import { submitClarification } from "@sejfa/data-client";
import { useAppStore } from "../stores/appStore";
import styles from "./ClarificationDialog.module.css";

export function ClarificationDialog() {
  const clarification = useAppStore((s) => s.clarification);
  const voiceUrl = useAppStore((s) => s.voiceUrl);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!clarification) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !clarification) return;

    setSubmitting(true);
    try {
      await submitClarification(voiceUrl, {
        sessionId: clarification.sessionId,
        text: answer.trim(),
      });
      setAnswer("");
      useAppStore.getState().setClarification(null);
    } catch {
      // Pipeline WS will update status
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog}>
        <div className={styles.accent} />
        <div className={styles.title}>Clarification Needed (Round {clarification.round})</div>

        {clarification.partialSummary && (
          <div className={styles.summary}>{clarification.partialSummary}</div>
        )}

        <ul className={styles.questions}>
          {clarification.questions.map((q, i) => (
            <li key={i} className={styles.question}>{q}</li>
          ))}
        </ul>

        <form className={styles.inputArea} onSubmit={handleSubmit}>
          <input
            className={styles.input}
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer..."
            autoFocus
            disabled={submitting}
          />
          <button
            type="submit"
            className={styles.submit}
            disabled={!answer.trim() || submitting}
          >
            {submitting ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
