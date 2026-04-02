import { useState } from "react";
import { approvePipeline, discardPipeline } from "@sejfa/data-client";
import { useAppStore } from "../stores/appStore";
import styles from "./IntentReview.module.css";

const ISSUE_TYPES = ["Story", "Bug", "Task", "Sub-task", "Epic"];
const PRIORITIES = ["Highest", "High", "Medium", "Low", "Lowest"];

function confidenceColor(score: number): string {
  if (score >= 0.7) return "#10b981";
  if (score >= 0.4) return "#f59e0b";
  return "#ef4444";
}

export function IntentReview() {
  const { preview, voiceUrl, setPreview, setPipelineStatus, reset } = useAppStore();
  const [submitting, setSubmitting] = useState(false);

  // Local edit state — initialized from preview intent
  const intent = preview?.intent;
  const [summary, setSummary] = useState(intent?.summary ?? "");
  const [description, setDescription] = useState(intent?.description ?? "");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(intent?.acceptanceCriteria ?? "");
  const [issueType, setIssueType] = useState(intent?.issueType ?? "Story");
  const [priority, setPriority] = useState(intent?.priority ?? "Medium");

  if (!preview || !intent) return null;

  const confidence = 1 - intent.ambiguityScore;

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      // Compute overrides: only send fields that changed
      const overrides: Record<string, unknown> = {};
      if (summary !== intent.summary) overrides.summary = summary;
      if (description !== intent.description) overrides.description = description;
      if (acceptanceCriteria !== intent.acceptanceCriteria) {
        overrides.acceptance_criteria = acceptanceCriteria;
      }
      if (issueType !== intent.issueType) overrides.issue_type = issueType;
      if (priority !== intent.priority) overrides.priority = priority;

      const hasOverrides = Object.keys(overrides).length > 0;
      await approvePipeline(voiceUrl, preview.sessionId, hasOverrides ? overrides : undefined);
      setPreview(null);
      setPipelineStatus("processing");
    } catch (e) {
      console.error("Approve failed:", e);
      setSubmitting(false);
    }
  };

  const handleDiscard = async () => {
    setSubmitting(true);
    try {
      await discardPipeline(voiceUrl, preview.sessionId);
      setPreview(null);
      setPipelineStatus("idle");
    } catch (e) {
      console.error("Discard failed:", e);
      setSubmitting(false);
    }
  };

  const handleReRecord = async () => {
    setSubmitting(true);
    try {
      await discardPipeline(voiceUrl, preview.sessionId);
      reset();
    } catch (e) {
      console.error("Re-record cleanup failed:", e);
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.reviewContainer}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.headerTitle}>INTENT VERIFICATION</span>
        <span className={styles.phasePill}>VERIFY</span>
      </div>

      {/* Transcript */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>WHAT WE HEARD</span>
        <div className={styles.transcriptBlock}>{preview.transcribedText}</div>
      </div>

      {/* Extracted intent — editable */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>EXTRACTED INTENT</span>
        <div className={styles.intentGrid}>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="review-summary">SUMMARY</label>
            <input
              id="review-summary"
              className={styles.fieldInput}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              disabled={submitting}
              aria-required="true"
            />
          </div>

          <div className={styles.fieldRowInline}>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel} htmlFor="review-type">TYPE</label>
              <select
                id="review-type"
                className={styles.fieldSelect}
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                disabled={submitting}
              >
                {ISSUE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel} htmlFor="review-priority">PRIORITY</label>
              <select
                id="review-priority"
                className={styles.fieldSelect}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={submitting}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="review-description">DESCRIPTION</label>
            <textarea
              id="review-description"
              className={styles.fieldTextarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="review-criteria">ACCEPTANCE CRITERIA</label>
            <textarea
              id="review-criteria"
              className={styles.fieldTextarea}
              value={acceptanceCriteria}
              onChange={(e) => setAcceptanceCriteria(e.target.value)}
              disabled={submitting}
            />
          </div>

          {intent.labels.length > 0 && (
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>LABELS</label>
              <div className={styles.labelsDisplay}>
                {intent.labels.map((label) => (
                  <span key={label} className={styles.labelPill}>{label}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confidence bar */}
      <div className={styles.confidenceSection}>
        <span className={styles.confidenceLabel}>CONFIDENCE</span>
        <div className={styles.confidenceBarTrack}>
          <div
            className={styles.confidenceBarFill}
            style={{
              width: `${Math.round(confidence * 100)}%`,
              backgroundColor: confidenceColor(confidence),
            }}
          />
        </div>
        <span
          className={styles.confidenceValue}
          style={{ color: confidenceColor(confidence) }}
        >
          {Math.round(confidence * 100)}%
        </span>
      </div>

      {/* Action bar */}
      <div className={styles.actionBar}>
        <div className={styles.actionBarLeft}>
          <button
            className={styles.btnReRecord}
            onClick={handleReRecord}
            disabled={submitting}
          >
            RE-RECORD
          </button>
          <button
            className={styles.btnGhost}
            onClick={handleDiscard}
            disabled={submitting}
          >
            DISCARD
          </button>
        </div>
        <button
          className={styles.btnPrimary}
          onClick={handleApprove}
          disabled={submitting || !summary.trim()}
        >
          APPROVE &amp; BUILD
        </button>
      </div>
    </div>
  );
}
