import { useAppStore } from "../stores/appStore";
import { derivePipelineStage, type PipelineStage } from "../utils/pipelineStage";
import styles from "./PipelineStageRail.module.css";

const STAGES: Array<{ key: PipelineStage; label: string }> = [
  { key: "record", label: "Record" },
  { key: "process", label: "Process" },
  { key: "verify", label: "Verify" },
  { key: "build", label: "Build" },
];

interface PipelineStageRailProps {
  className?: string;
}

export function PipelineStageRail({ className }: PipelineStageRailProps) {
  const { pipelineStatus, processingStep, phase, loopActive } = useAppStore();
  const activeStage = derivePipelineStage({
    pipelineStatus,
    processingStep,
    phase,
    loopActive,
  });
  const activeIndex = STAGES.findIndex((stage) => stage.key === activeStage);

  return (
    <div
      className={`${styles.rail} ${className ?? ""}`.trim()}
      role="group"
      aria-label="Voice pipeline stages"
      aria-live="polite"
      aria-atomic="true"
    >
      {STAGES.map((stage, index) => {
        const isComplete = index < activeIndex;
        const isActive = index === activeIndex;
        const stateLabel = isComplete ? "complete" : isActive ? "in progress" : "pending";

        return (
          <div key={stage.key} className={styles.stageItem} aria-label={`${stage.label}: ${stateLabel}`}>
            <div
              className={`${styles.stageDot} ${isComplete ? styles.complete : ""} ${isActive ? styles.active : ""}`.trim()}
              aria-hidden="true"
            />
            <span className={`${styles.stageLabel} ${isActive ? styles.activeLabel : ""}`.trim()}>
              {stage.label}
            </span>
            {index < STAGES.length - 1 && <div className={styles.connector} aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}
