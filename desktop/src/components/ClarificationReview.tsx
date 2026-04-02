import { useState } from "react";
import { discardPipeline, submitClarification } from "@sejfa/data-client";
import { useAppStore } from "../stores/appStore";
import { PipelineStageRail } from "./PipelineStageRail";
import { applyPipelineServerResult } from "../utils/pipelineFlow";
import styles from "./ClarificationReview.module.css";

export function ClarificationReview() {
  const {
    clarification,
    voiceUrl,
    setClarification,
    setPreview,
    setPipelineStatus,
    setProcessingStep,
    setTicketKey,
    reset,
  } = useAppStore();
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!clarification) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!answer.trim()) return;

    setSubmitting(true);
    setErrorMessage(null);
    setPipelineStatus("processing");
    setProcessingStep("Analyzing clarification...");

    try {
      const response = await submitClarification(voiceUrl, {
        sessionId: clarification.sessionId,
        text: answer.trim(),
      });

      if (!response.ok) {
        setErrorMessage(`Clarification request failed with HTTP ${response.status}`);
        setPipelineStatus("error");
        return;
      }

      const data = await response.json();
      const result = applyPipelineServerResult(data, {
        setPipelineStatus,
        setProcessingStep,
        setClarification,
        setPreview,
        setTicketKey,
      });

      if (result === "unknown") {
        setErrorMessage("Clarification response had an unknown format.");
        setPipelineStatus("error");
      } else {
        setAnswer("");
      }
    } catch {
      setErrorMessage("Could not submit clarification. Please try again.");
      setPipelineStatus("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDiscard = async () => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await discardPipeline(voiceUrl, clarification.sessionId);
      setClarification(null);
      setPreview(null);
      setPipelineStatus("idle");
      setProcessingStep("");
      setAnswer("");
    } catch {
      setErrorMessage("Could not discard this session.");
      setPipelineStatus("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReRecord = async () => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await discardPipeline(voiceUrl, clarification.sessionId);
      reset();
    } catch {
      setErrorMessage("Could not reset session for re-record.");
      setPipelineStatus("error");
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.reviewContainer}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>CLARIFICATION REVIEW</span>
        <span className={styles.phasePill}>VERIFY</span>
      </div>

      <PipelineStageRail className={styles.stageRail} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>ROUND {clarification.round}</span>
        <p className={styles.summaryText}>{clarification.partialSummary}</p>
        <ol className={styles.questionList}>
          {clarification.questions.map((question, index) => (
            <li key={`${index}-${question}`}>{question}</li>
          ))}
        </ol>
      </div>

      <form className={styles.section} onSubmit={handleSubmit}>
        <label htmlFor="clarification-answer" className={styles.sectionLabel}>
          YOUR CLARIFICATION
        </label>
        <textarea
          id="clarification-answer"
          className={styles.answerInput}
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Add tactical detail so we can produce a precise ticket."
          disabled={submitting}
          autoFocus
        />

        {errorMessage && <div className={styles.errorText}>{errorMessage}</div>}

        <div className={styles.actionBar}>
          <div className={styles.actionLeft}>
            <button type="button" className={styles.btnReRecord} onClick={handleReRecord} disabled={submitting}>
              RE-RECORD
            </button>
            <button type="button" className={styles.btnGhost} onClick={handleDiscard} disabled={submitting}>
              DISCARD
            </button>
          </div>

          <button type="submit" className={styles.btnPrimary} disabled={submitting || !answer.trim()}>
            SEND CLARIFICATION
          </button>
        </div>
      </form>
    </div>
  );
}
