import { useAppStore } from "../stores/appStore";
import { TerminalFeed } from "./TerminalFeed";
import { BlockersView } from "./BlockersView";
import { useSessionIntelligence } from "../hooks/useSessionIntelligence";
import styles from "./MonitorDashboard.module.css";

const LOOP_STAGES = [
  "Task",
  "Branch",
  "TDD Loop",
  "PR",
  "Review",
  "Deploy",
];

function StallRiskGauge({ probability }: { probability: string }) {
  const levels = ["LOW", "MEDIUM", "HIGH"];
  const currentIdx = levels.indexOf(probability);

  return (
    <div className={styles.riskGauge} aria-label={`Stall risk: ${probability}`}>
      {levels.map((level, idx) => {
        const isActive = idx <= currentIdx;
        return (
          <div
            key={level}
            className={`${styles.riskSegment} ${isActive ? styles.riskSegmentActive : ""}`}
            data-risk={isActive ? (currentIdx === 0 ? "LOW" : currentIdx === 1 ? "MEDIUM" : "HIGH") : "none"}
          />
        );
      })}
    </div>
  );
}

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

function deriveLoopLane(phase: string, toolName?: string): string {
  if (phase === "done") return "Complete";
  if (phase === "listening" || phase === "processing") return "Intake";
  if (!toolName) return "Plan";

  const normalizedTool = toolName.toLowerCase();
  if (normalizedTool.includes("test") || normalizedTool.includes("pytest") || normalizedTool.includes("ruff")) return "Verify";
  if (normalizedTool.includes("pr") || normalizedTool.includes("jules") || normalizedTool.includes("review")) return "Review";
  if (
    normalizedTool === "replace" ||
    normalizedTool === "write_file" ||
    normalizedTool.includes("apply_patch") ||
    normalizedTool.includes("edit")
  ) {
    return "Implement";
  }
  return "Plan";
}

function deriveLoopStageIndex(loopLane: string): number {
  switch (loopLane) {
    case "Complete":
      return 5;
    case "Review":
      return 4;
    case "Verify":
    case "Implement":
      return 2;
    case "Intake":
      return 0;
    default:
      return 1;
  }
}

export function MonitorDashboard() {
  const {
    phase,
    events,
    cost,
    elapsedMs,
    taskRef,
    processingStep,
    density,
    setDensity,
    reset,
  } = useAppStore();
  const intelligence = useSessionIntelligence();
  const lastEvent = events[0];
  const loopLane = deriveLoopLane(phase, lastEvent?.tool_name);
  const activeLoopStageIndex = deriveLoopStageIndex(loopLane);

  return (
    <div className={styles.monitorDash} data-density={density}>
      <div className={styles.dashHeader}>
        <div className={styles.headerLeft}>
          <button className={styles.exitBtn} onClick={() => reset()} aria-label="Close run view">✕</button>
          <div className={styles.pulseActive} aria-hidden="true"></div>
          <div className={styles.missionInfo}>
            <span className={styles.missionId}>{taskRef || "TASK-PENDING"}</span>
            <span className={styles.missionStatus}>AUTOMATED RUN ACTIVE</span>
          </div>
        </div>
        <div className={styles.headerRight}>
           <div className={styles.telemetryBox}>
              <span className={styles.telLabel}>ELAPSED TIME</span>
              <span className={styles.telVal}>{formatElapsed(elapsedMs)}</span>
           </div>
           <div className={styles.telemetryBox}>
              <span className={styles.telLabel}>TOTAL COST</span>
              <span className={styles.telVal}>{cost ? formatCost(cost.total_usd) : "$0.00"}</span>
           </div>
           {intelligence.burnRatePerMin > 0 && (
             <div className={styles.telemetryBox}>
                <span className={styles.telLabel}>BURN RATE</span>
                <span className={styles.telVal}>${intelligence.burnRatePerMin.toFixed(3)}/m</span>
             </div>
           )}
            <div className={styles.densityWrapper}>
              <span className={styles.densityLabel}>Density</span>
              <div className={styles.densitySwitcher} role="group" aria-label="Display density">
                <button
                  type="button"
                  onClick={() => setDensity("comfort")}
                  aria-pressed={density === "comfort"}
                  className={`${styles.densityBtn} ${density === "comfort" ? styles.densityBtnActive : ""}`}
                >
                  Comfort
                </button>
                <button
                  type="button"
                  onClick={() => setDensity("compact")}
                  aria-pressed={density === "compact"}
                  className={`${styles.densityBtn} ${density === "compact" ? styles.densityBtnActive : ""}`}
                >
                  Compact
                </button>
              </div>
            </div>
        </div>
      </div>

      <div className={styles.progressRail}>
        <div className={styles.agentLoopRail} role="group" aria-label="Agentic DevOps loop stages">
          {LOOP_STAGES.map((stage, index) => {
            const isActive = index === activeLoopStageIndex;
            const isComplete = index < activeLoopStageIndex;
            return (
              <div
                key={stage}
                className={`${styles.loopNode} ${isActive ? styles.loopNodeActive : ""} ${isComplete ? styles.loopNodeComplete : ""}`.trim()}
                aria-label={`${stage}: ${isComplete ? "complete" : isActive ? "active" : "pending"}`}
              >
                <span className={styles.loopNodeKey}>
                  {String(index + 1).padStart(2, "0")}
                  {isActive ? " · now" : ""}
                </span>
                <span className={styles.loopNodeLabel}>{stage}</span>
              </div>
            );
          })}
        </div>
        <div className={styles.loopLane} aria-live="polite">
          Current loop lane: <span className={styles.loopLaneValue}>{loopLane}</span>
        </div>
      </div>

      <div className={styles.contentGrid}>
        <div className={styles.feedPanel}>
          <div className={styles.panelHeader}>
             <span className={styles.panelTitle}>EXECUTION EVENTS</span>
             {processingStep && <span className={styles.liveIndicator} aria-live="polite">LIVE: {processingStep}</span>}
          </div>
          <TerminalFeed />
        </div>
        
        <div className={styles.insightPanel}>
           <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>BLOCKERS AND HEALTH</span>
           </div>
           <BlockersView />
           
           <div className={styles.qualityCard}>
              <span className={styles.cardTitle}>RUN HEALTH</span>
              <div className={styles.qualityMetrics}>
                 <div className={styles.metricRow}>
                    <span>TOOL SUCCESS RATE</span>
                    <span className={`${styles.metricVal} ${intelligence.successRate < 80 ? styles.valWarn : ""}`}>
                      {intelligence.successRate}%
                    </span>
                 </div>
                 <div className={styles.metricRow}>
                    <span>STALL RISK</span>
                    <span className={styles.metricVal}>
	                      <StallRiskGauge probability={intelligence.stallProbability} />
	                      <span className={
	                        intelligence.stallProbability === 'HIGH' ? styles.valDanger :
	                        intelligence.stallProbability === 'MEDIUM' ? styles.valWarn : ""
	                      }>
                        {intelligence.stallProbability}
                      </span>
                    </span>
                 </div>
                 <div className={styles.metricRow}>
                    <span>TOTAL EVENTS</span>
                    <span className={styles.metricVal}>{intelligence.totalEvents}</span>
                 </div>
                 {intelligence.failedTools.length > 0 && (
                   <div className={styles.failedTools}>
                      <span className={styles.subLabel}>REPEATED FAILURES</span>
                      <div className={styles.toolList}>
                        {intelligence.failedTools.map(t => <span key={t} className={styles.toolPill}>{t}</span>)}
                      </div>
                  </div>
                )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
