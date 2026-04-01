import { useAppStore, type LoopPhase } from "../stores/appStore";
import { IntentConfirmationView } from "./IntentConfirmationView";
import styles from "./LoopCanvas.module.css";

const phaseConfig: Record<LoopPhase, { label: string; caption: string; rgb: string }> = {
  idle: { label: "Idle", caption: "Speak the next objective", rgb: "142,142,147" },
  listening: { label: "Listening", caption: "Recording...", rgb: "48,176,199" },
  processing: { label: "Processing", caption: "Analyzing your request", rgb: "255,159,10" },
  loop: { label: "Loop Active", caption: "Ralph Loop executing", rgb: "88,86,214" },
  verify: { label: "Verify & Confirm", caption: "Waiting for human approval", rgb: "0,122,255" },
  error: { label: "Alert", caption: "Something needs attention", rgb: "255,55,95" },
  done: { label: "Complete", caption: "Task finished", rgb: "52,199,89" },
};

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function LoopCanvas() {
  const phase = useAppStore((s) => s.phase);
  const ticketKey = useAppStore((s) => s.ticketKey);
  const cost = useAppStore((s) => s.cost);
  const elapsedMs = useAppStore((s) => s.elapsedMs);
  const processingStep = useAppStore((s) => s.processingStep);
  const stuckAlert = useAppStore((s) => s.stuckAlert);
  const events = useAppStore((s) => s.events);
  const preview = useAppStore((s) => s.preview);

  const config = phaseConfig[phase];

  return (
    <div
      className={styles.canvas}
      style={{ "--active-phase-rgb": config.rgb } as React.CSSProperties}
    >
      <div className={styles.phaseLabel}>{config.label}</div>
      <div className={styles.caption}>{config.caption}</div>

      {ticketKey && !preview && <div className={styles.ticket}>{ticketKey}</div>}

      {(phase === "loop" || (phase === "verify" && !preview) || phase === "done") && (
        <div className={styles.metrics}>
          <div className={styles.metric}>
            <span className={styles.metricValue}>
              {cost ? formatCost(cost.total_usd) : "$0.00"}
            </span>
            <span className={styles.metricLabel}>Cost</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>
              {elapsedMs > 0 ? formatElapsed(elapsedMs) : "\u2014"}
            </span>
            <span className={styles.metricLabel}>Elapsed</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{events.length}</span>
            <span className={styles.metricLabel}>Events</span>
          </div>
        </div>
      )}

      {processingStep && <div className={styles.step}>{processingStep}</div>}

      {stuckAlert && (
        <div className={styles.stuck}>
          Loop stuck on <span className={styles.stuckPattern}>{stuckAlert.pattern}</span>
          {" "}&mdash; repeated {stuckAlert.repeat_count}&times; ({stuckAlert.tokens_burned.toLocaleString()} tokens burned)
        </div>
      )}

      {preview && <IntentConfirmationView />}

      <div className={styles.accent} />
    </div>
  );
}
