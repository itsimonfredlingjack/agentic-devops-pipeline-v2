import { useAppStore } from "../stores/appStore";
import { TerminalFeed } from "./TerminalFeed";
import { BlockersView } from "./BlockersView";
import { MissionControls } from "./MissionControls";
import { useSessionIntelligence } from "../hooks/useSessionIntelligence";
import styles from "./MonitorDashboard.module.css";

const PHASES = [
  { id: "intake", label: "INTAKE" },
  { id: "plan", label: "PLAN" },
  { id: "implement", label: "IMPLEMENT" },
  { id: "verify", label: "VERIFY" },
  { id: "review", label: "REVIEW" },
];

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function MonitorDashboard() {
  const { phase, events, cost, elapsedMs, ticketKey, processingStep, reset } = useAppStore();
  const intelligence = useSessionIntelligence();

  // Determine current active internal loop phase
  const lastEvent = events[0];
  let internalPhase = "plan";
  if (phase === "listening" || phase === "processing") internalPhase = "intake";
  else if (lastEvent?.tool_name === "replace" || lastEvent?.tool_name === "write_file") internalPhase = "implement";
  else if (lastEvent?.tool_name?.includes("test") || lastEvent?.tool_name?.includes("pytest") || lastEvent?.tool_name?.includes("ruff")) internalPhase = "verify";
  else if (lastEvent?.tool_name?.includes("pr") || lastEvent?.tool_name?.includes("jules")) internalPhase = "review";
  else if (phase === "done") internalPhase = "complete";

  return (
    <div className={styles.monitorDash}>
      <div className={styles.dashHeader}>
        <div className={styles.headerLeft}>
          <button className={styles.exitBtn} onClick={() => reset()} aria-label="Exit mission view">✕</button>
          <div className={styles.pulseActive} aria-hidden="true"></div>
          <div className={styles.missionInfo}>
            <span className={styles.missionId}>{ticketKey || "ACTIVE-MISSION"}</span>
            <span className={styles.missionStatus}>AUTONOMIC EXECUTION LOOP</span>
          </div>
        </div>
        <div className={styles.headerRight}>
           <div className={styles.telemetryBox}>
              <span className={styles.telLabel}>TIME ELAPSED</span>
              <span className={styles.telVal}>{formatElapsed(elapsedMs)}</span>
           </div>
           <div className={styles.telemetryBox}>
              <span className={styles.telLabel}>ACCUMULATED COST</span>
              <span className={styles.telVal}>{cost ? formatCost(cost.total_usd) : "$0.00"}</span>
           </div>
           {intelligence.burnRatePerMin > 0 && (
             <div className={styles.telemetryBox}>
                <span className={styles.telLabel}>BURN RATE</span>
                <span className={styles.telVal}>${intelligence.burnRatePerMin.toFixed(3)}/m</span>
             </div>
           )}
        </div>
      </div>

      <div className={styles.progressRail}>
        {PHASES.map((p, idx) => {
          const isActive = internalPhase === p.id;
          const isComplete = PHASES.findIndex(x => x.id === internalPhase) > idx || internalPhase === "complete";
          
          return (
            <div key={p.id} className={`${styles.phaseStep} ${isActive ? styles.phaseActive : ""} ${isComplete ? styles.phaseComplete : ""}`}>
              <div className={styles.stepCircle}>
                {isComplete ? "✓" : idx + 1}
              </div>
              <span className={styles.stepLabel}>{p.label}</span>
              {idx < PHASES.length - 1 && <div className={styles.stepConnector}></div>}
            </div>
          );
        })}
      </div>

      <div className={styles.contentGrid}>
        <div className={styles.feedPanel}>
          <div className={styles.panelHeader}>
             <span className={styles.panelTitle}>EXECUTION FEED</span>
             {processingStep && <span className={styles.liveIndicator} aria-live="polite">LIVE: {processingStep}</span>}
          </div>
          <TerminalFeed />
        </div>
        
        <div className={styles.insightPanel}>
           <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>INSIGHTS & INTERVENTIONS</span>
           </div>
           <BlockersView />
           
           <div className={styles.qualityCard}>
              <span className={styles.cardTitle}>EXECUTION QUALITY</span>
              <div className={styles.qualityMetrics}>
                 <div className={styles.metricRow}>
                    <span>TOOL SUCCESS</span>
                    <span className={`${styles.metricVal} ${intelligence.successRate < 80 ? styles.valWarn : ""}`}>
                      {intelligence.successRate}%
                    </span>
                 </div>
                 <div className={styles.metricRow}>
                    <span>STALL PROBABILITY</span>
                    <span className={`${styles.metricVal} ${
                      intelligence.stallProbability === 'HIGH' ? styles.valDanger : 
                      intelligence.stallProbability === 'MEDIUM' ? styles.valWarn : ""
                    }`}>
                      {intelligence.stallProbability}
                    </span>
                 </div>
                 <div className={styles.metricRow}>
                    <span>TOTAL EVENTS</span>
                    <span className={styles.metricVal}>{intelligence.totalEvents}</span>
                 </div>
                 {intelligence.failedTools.length > 0 && (
                   <div className={styles.failedTools}>
                      <span className={styles.subLabel}>FLAKY TOOLS</span>
                      <div className={styles.toolList}>
                        {intelligence.failedTools.map(t => <span key={t} className={styles.toolPill}>{t}</span>)}
                      </div>
                   </div>
                 )}
              </div>
           </div>

           <MissionControls />
        </div>
      </div>
    </div>
  );
}
