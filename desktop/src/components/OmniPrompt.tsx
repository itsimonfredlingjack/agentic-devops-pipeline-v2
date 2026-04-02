import { MicButton } from "./MicButton";
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

export function OmniPrompt({ recording, onToggleVoice, isExecuting, targetedTask }: any) {
  const { phase, elapsedMs, cost } = useAppStore();

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

  return (
    <div className={styles.omniContainer}>
      <div className={styles.omniGlow} />
      <div className={styles.omniBox}>
        <div className={styles.omniTextGroup}>
           {phase === "listening" ? (
             <h1 className={styles.omniH1Recording}>Listening to intent...</h1>
           ) : (
             <>
               <h1 className={styles.omniH1}>What should we build next?</h1>
               <p className={styles.omniSub}>Describe an objective, or assign a task from the queue.</p>
             </>
           )}
        </div>
        
        <div className={styles.omniAction}>
           <MicButton recording={recording} onClick={onToggleVoice} />
           <div className={`${styles.shortcutHint} ${phase === "idle" ? styles.shortcutPulse : ""}`}>
              <span>Hold <kbd>&#x2318;&#x21E7;V</kbd> to record</span>
           </div>
        </div>
      </div>
    </div>
  );
}
