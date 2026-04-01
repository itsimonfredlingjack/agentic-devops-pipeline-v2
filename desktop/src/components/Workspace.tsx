import { useState } from "react";
import { approvePipeline, discardPipeline, submitClarification } from "@sejfa/data-client";
import { useAppStore } from "../stores/appStore";
import styles from "./Workspace.module.css";
import type { EventRecord } from "@sejfa/shared-types";

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "—";
  }
}

export function Workspace({ selectedIndex }: { selectedIndex: number }) {
  const {
    phase,
    ticketKey,
    queue,
    preview,
    clarification,
    stuckAlert,
    completion,
    processingStep,
    elapsedMs,
    cost,
    events,
    voiceUrl,
    setPreview,
    setPipelineStatus,
    setClarification,
    clearStuckAlert,
  } = useAppStore();

  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isExecuting = phase !== "idle" && phase !== "listening";
  const focusTicket = isExecuting ? ticketKey : queue[selectedIndex]?.key;
  const focusSummary = isExecuting 
    ? queue.find(q => q.key === ticketKey)?.summary 
    : queue[selectedIndex]?.summary;

  const handleApprove = async () => {
    if (!preview) return;
    setSubmitting(true);
    try {
      await approvePipeline(voiceUrl, preview.sessionId);
      setPreview(null);
    } catch (e) { console.error(e); setSubmitting(false); }
  };

  const handleDiscard = async () => {
    if (!preview) return;
    setSubmitting(true);
    try {
      await discardPipeline(voiceUrl, preview.sessionId);
      setPreview(null);
      setPipelineStatus("idle");
    } catch (e) { console.error(e); setSubmitting(false); }
  };

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

  if (!focusTicket && !isExecuting) {
    return (
      <main className={styles.workspaceEmpty}>
        <div className={styles.emptyIcon}>&#x2318;</div>
        <h2>SEJFA COMMAND CENTER</h2>
        <p>No active mission. Awaiting instruction.</p>
      </main>
    );
  }

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <div className={styles.ticketId}>{focusTicket || "PENDING"}</div>
          <h1 className={styles.summary}>{focusSummary || "No Mission Selected"}</h1>
        </div>
        <div className={styles.telemetry}>
          {isExecuting && (
            <>
              <div className={`${styles.statusPill} ${styles['phase-' + phase]}`}>
                {phase.toUpperCase()}
              </div>
              <div className={styles.metric}>
                <span>ELAPSED</span>
                <strong>{elapsedMs > 0 ? formatElapsed(elapsedMs) : "—"}</strong>
              </div>
              <div className={styles.metric}>
                <span>BURN</span>
                <strong className={cost?.total_usd && cost.total_usd > 1.0 ? styles.warnText : ""}>
                  {cost ? formatCost(cost.total_usd) : "$0.00"}
                </strong>
              </div>
            </>
          )}
        </div>
      </header>

      <div className={styles.content}>
        {isExecuting && (
          <div className={styles.executionStatus}>
             <div className={styles.stepIndicator}>
                <div className={styles.spinner} />
                <span>{processingStep || "Executing autonomic loop..."}</span>
             </div>
          </div>
        )}

        {isExecuting && events.length > 0 && (
          <div className={styles.terminalFeed}>
            {events.map((e) => (
              <div key={e.event_id} className={`${styles.logEntry} ${e.success === false ? styles.logError : e.success === true ? styles.logSuccess : ""}`}>
                <div className={styles.logTime}>{formatTime(e.timestamp)}</div>
                <div className={styles.logBody}>
                  <div className={styles.logTool}>{e.tool_name}</div>
                  {e.tool_args_summary && <div className={styles.logArgs}>{e.tool_args_summary}</div>}
                </div>
                <div className={styles.logMeta}>
                   {e.duration_ms && `${(e.duration_ms/1000).toFixed(1)}s`}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isExecuting && (
          <div className={styles.dossierView}>
            <h3>MISSION DOSSIER</h3>
            <div className={styles.dossierRow}>
              <span>Status</span>
              <strong>Pending Automation Queue</strong>
            </div>
            <div className={styles.dossierRow}>
              <span>Assigned Agent</span>
              <strong>Ralph Loop</strong>
            </div>
            <div className={styles.dossierRow}>
              <span>Scope</span>
              <strong>Code generation & validation</strong>
            </div>
          </div>
        )}

        {/* Padding so scrolling puts content above docker panels if they appear */}
        <div className={styles.bottomBuffer} />
      </div>

      {preview && (
        <div className={`${styles.dockerPanel} ${styles.warningBorder}`}>
          <div className={styles.dockerHeader}>
            <strong>VERIFICATION REQUIRED: Intent Confirmation</strong>
          </div>
          <div className={styles.dockerContent}>
            <div className={styles.box}>
              <sub>Transcript</sub>
              <div>{preview.transcribedText}</div>
            </div>
            <div className={styles.box}>
              <sub>Command Summary</sub>
              <div>{preview.summary}</div>
            </div>
          </div>
          <div className={styles.dockerActions}>
            <button className={styles.btnGhost} onClick={handleDiscard} disabled={submitting}>DISCARD</button>
            <button className={styles.btnPrimary} onClick={handleApprove} disabled={submitting}>APPROVE & EXECUTE</button>
          </div>
        </div>
      )}

      {clarification && (
        <div className={`${styles.dockerPanel} ${styles.warningBorder}`}>
          <div className={styles.dockerHeader}>
            <strong>HUMAN INPUT REQUIRED: Clarification (Round {clarification.round})</strong>
            <p>{clarification.partialSummary}</p>
          </div>
          <div className={styles.dockerContent}>
             <ul className={styles.qList}>
               {clarification.questions.map((q, i) => <li key={i}>{q}</li>)}
             </ul>
          </div>
          <form className={styles.dockerActions} onSubmit={submitReply}>
            <input 
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              className={styles.inputField} 
              placeholder="Provide clarification..." 
              autoFocus 
              disabled={submitting} 
            />
            <button type="submit" className={styles.btnPrimary} disabled={!answer.trim() || submitting}>
              REPLY
            </button>
          </form>
        </div>
      )}

      {stuckAlert && (
        <div className={`${styles.dockerPanel} ${styles.errorBorder}`}>
          <div className={styles.dockerHeader}>
            <strong>FATAL STALL: Loop Repetition Detected</strong>
            <p>Pattern repeated {stuckAlert.repeat_count} times. Burned ~{stuckAlert.tokens_burned} tokens.</p>
          </div>
          <div className={styles.dockerContent}>
             <pre className={styles.codeBlock}>{stuckAlert.pattern}</pre>
          </div>
          <div className={styles.dockerActions}>
             <button className={styles.btnGhost} onClick={clearStuckAlert}>DISMISS ALERT</button>
          </div>
        </div>
      )}

      {completion && (
        <div className={`${styles.dockerPanel} ${styles.successBorder}`}>
          <div className={styles.dockerHeader}>
            <strong>MISSION COMPLETE</strong>
          </div>
          <div className={styles.dockerContent}>
            Task execution finished. Review the logs above for output references.
          </div>
        </div>
      )}

    </main>
  );
}
