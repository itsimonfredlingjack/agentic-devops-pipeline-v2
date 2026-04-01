import React, { useState } from "react";
import { approvePipeline, discardPipeline } from "@sejfa/data-client";
import { useAppStore } from "../stores/appStore";
import styles from "./IntentConfirmationView.module.css";

export function IntentConfirmationView() {
  const store = useAppStore();
  const preview = store.preview;
  const [submitting, setSubmitting] = useState(false);

  if (!preview) return null;

  async function handleApprove() {
    if (!preview) return;
    setSubmitting(true);
    try {
      await approvePipeline(store.voiceUrl, preview.sessionId);
      store.setPreview(null);
      // Wait for the backend loop output to hit WS and phase out of verify
    } catch (e) {
      console.error(e);
      setSubmitting(false);
    }
  }

  async function handleDiscard() {
    if (!preview) return;
    setSubmitting(true);
    try {
      await discardPipeline(store.voiceUrl, preview.sessionId);
      store.setPreview(null);
      store.setPipelineStatus("idle");
    } catch (e) {
      console.error(e);
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.iconWarning}>⚠</span>
        <h2>Intent Confirmation Required</h2>
      </div>
      
      <div className={styles.content}>
        <div className={styles.field}>
          <label>Raw Transcript</label>
          <div className={styles.transcriptText}>
            {preview.transcribedText}
          </div>
        </div>

        <div className={styles.field}>
          <label>Interpreted Action</label>
          <div className={styles.summaryText}>
            {preview.summary}
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button 
          className={styles.discardBtn} 
          onClick={handleDiscard}
          disabled={submitting}
        >
          DISCARD
        </button>
        <button 
          className={styles.approveBtn} 
          onClick={handleApprove}
          disabled={submitting}
        >
          ✓ APPROVE & QUEUE
        </button>
      </div>
    </div>
  );
}
