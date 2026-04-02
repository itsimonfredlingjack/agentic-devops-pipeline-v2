import { useState } from "react";
import { MicButton } from "./MicButton";
import { submitClarification } from "@sejfa/data-client";
import styles from "./OmniPrompt.module.css";
import { useAppStore } from "../stores/appStore";

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

function MiniSparkline() {
  return (
    <svg width="40" height="12" viewBox="0 0 40 12" className={styles.sparkline}>
       <path d="M0,8 L5,8 L10,3 L15,10 L20,6 L25,6 L30,4 L35,9 L40,7"
             fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
       <circle cx="40" cy="7" r="2" fill="currentColor" />
    </svg>
  );
}

const PIPELINE_STEPS = [
  { key: "listening", label: "Listening" },
  { key: "transcribing", label: "Transcribing audio" },
  { key: "extracting", label: "Extracting intent" },
  { key: "review", label: "Ready for review" },
] as const;

function deriveStepIndex(processingStep: string, pipelineStatus: string): number {
  if (pipelineStatus === "recording") return 0;
  if (processingStep.toLowerCase().includes("transcrib")) return 1;
  if (
    processingStep.toLowerCase().includes("intent") ||
    processingStep.toLowerCase().includes("analyz") ||
    processingStep.toLowerCase().includes("extract")
  ) return 2;
  if (pipelineStatus === "clarifying") return 2;
  if (pipelineStatus === "previewing") return 3;
  // Default: if processing but no specific step yet, show transcribing
  if (pipelineStatus === "processing") return 1;
  return 0;
}

function PipelineStepper() {
  const { processingStep, pipelineStatus } = useAppStore();
  const activeIndex = deriveStepIndex(processingStep, pipelineStatus);

  return (
    <div className={styles.stepper} role="group" aria-label="Pipeline progress" aria-live="polite" aria-atomic="true">
      {PIPELINE_STEPS.map((step, i) => {
        const isDone = i < activeIndex;
        const isActive = i === activeIndex;
        const status = isDone ? "complete" : isActive ? "in progress" : "pending";
        return (
          <div
            key={step.key}
            className={`${styles.stepRow} ${isDone ? styles.stepDone : ""} ${isActive ? styles.stepActive : ""}`}
            aria-label={`${step.label}: ${status}`}
          >
            <div className={styles.stepIndicator} aria-hidden="true">
              {isDone ? (
                <svg width="14" height="14" viewBox="0 0 14 14" className={styles.stepCheck} role="img" aria-label="Complete">
                  <circle cx="7" cy="7" r="6" fill="currentColor" opacity="0.2" />
                  <path d="M4 7l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : isActive ? (
                <div className={styles.stepPulse} />
              ) : (
                <div className={styles.stepDot} />
              )}
            </div>
            <span className={styles.stepLabel}>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ClarificationInline() {
  const { clarification, voiceUrl, setClarification } = useAppStore();
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!clarification) return null;

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) return;
    setSubmitting(true);
    try {
      await submitClarification(voiceUrl, { sessionId: clarification.sessionId, text: answer.trim() });
      setAnswer("");
      setClarification(null);
    } catch { } finally { setSubmitting(false); }
  };

  return (
    <div className={styles.clarificationBox}>
      <div className={styles.clarificationHeader}>CLARIFICATION NEEDED</div>
      <p className={styles.clarificationSummary}>{clarification.partialSummary}</p>
      <ul className={styles.clarificationQuestions}>
        {clarification.questions.map((q, i) => <li key={i}>{q}</li>)}
      </ul>
      <form className={styles.clarificationForm} onSubmit={submitReply}>
        <label htmlFor="clarify-answer" className={styles.srOnly}>Your clarification answer</label>
        <input
          id="clarify-answer"
          autoFocus
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          disabled={submitting}
          placeholder="Type your answer..."
          className={styles.clarificationInput}
          aria-label="Provide your answer to the clarification questions"
        />
        <button type="submit" className={styles.clarificationSend} disabled={submitting || !answer.trim()}>
          SEND
        </button>
      </form>
    </div>
  );
}

export function OmniPrompt({ recording, onToggleVoice, isExecuting, targetedTask }: any) {
  const { phase, elapsedMs, cost, pipelineStatus, clarification } = useAppStore();

  if (isExecuting) {
    return (
      <header className={styles.topBar}>
        <div className={styles.topBarContent}>
           <div className={styles.barLeft}>
              <div className={styles.pulseActive}></div>
              <div className={styles.taskMeta}>
                <span className={styles.tKey}>{targetedTask?.id || "ACTIVE-MISSION"}</span>
                <span className={styles.tSum}>{targetedTask?.title || "Executing autonomic mission"}</span>
              </div>
           </div>

           <div className={styles.barRight}>
              <div className={styles.phasePill}>{phase.toUpperCase()}</div>
              <div className={styles.telemetryStat}>
                <span className={styles.telLabel}>TIME</span>
                <span className={styles.telVal}>{elapsedMs > 0 ? formatElapsed(elapsedMs) : "—"}</span>
              </div>
              <div className={styles.telemetryStat}>
                <span className={styles.telLabel}>BURN RATIO <MiniSparkline /></span>
                <span className={`${styles.telVal} ${cost?.total_usd && cost.total_usd > 1.0 ? styles.warnBurn : ""}`}>
                  {cost ? formatCost(cost.total_usd) : "$0.00"}
                </span>
              </div>
           </div>
        </div>
      </header>
    );
  }

  // Processing state: show stepper instead of mic button
  const isProcessing = phase === "processing";

  return (
    <div className={styles.omniContainer}>
      <div className={styles.omniGlow} />
      <div className={styles.omniBox}>
        <div className={styles.omniTextGroup} aria-live="polite" aria-atomic="true">
           {phase === "listening" ? (
             <h1 className={styles.omniH1Recording}>Listening to intent...</h1>
           ) : isProcessing ? (
             <h1 className={styles.omniH1Processing}>Processing voice input</h1>
           ) : (
             <>
               <h1 className={styles.omniH1}>What should we build next?</h1>
               <p className={styles.omniSub}>Describe an objective, or assign a task from the queue.</p>
             </>
           )}
        </div>

        {isProcessing ? (
          <div className={styles.omniAction}>
            <PipelineStepper />
            {clarification && <ClarificationInline />}
          </div>
        ) : (
          <div className={styles.omniAction}>
             <MicButton recording={recording} onClick={onToggleVoice} />
             <div className={`${styles.shortcutHint} ${phase === "idle" ? styles.shortcutPulse : ""}`}>
                <span>Hold <kbd>&#x2318;&#x21E7;V</kbd> to record</span>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
