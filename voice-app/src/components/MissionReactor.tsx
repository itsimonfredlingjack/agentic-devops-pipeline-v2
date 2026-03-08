import type { CSSProperties } from "react";
import { deriveMissionState, gateStatusForNode, humanizeStage, type MissionState } from "../lib/mission";
import type { CompletionEntry, GateEntry, PipelineStatus, StuckAlertEntry, TicketResult } from "../stores/pipelineStore";
import styles from "../styles/components/MissionReactor.module.css";

interface MissionReactorProps {
  ticket: TicketResult | null;
  status: PipelineStatus;
  activeStage: string | null;
  gates: GateEntry[];
  completion: CompletionEntry | null;
  stuckAlert: StuckAlertEntry | null;
}

const NODES = [
  { id: "jira", label: "Jira", angle: -90 },
  { id: "agent", label: "Agent", angle: -18 },
  { id: "actions", label: "Actions", angle: 54 },
  { id: "deploy", label: "Deploy", angle: 126 },
  { id: "verify", label: "Verify", angle: 198 },
] as const;

function phaseClass(mission: MissionState) {
  switch (mission.phase) {
    case "completed":
      return styles.completed;
    case "blocked":
      return styles.blocked;
    case "failed":
      return styles.failed;
    case "verifying":
      return styles.verifying;
    case "agent_active":
      return styles.active;
    case "capturing":
    case "processing":
      return styles.processing;
    case "queued":
      return styles.queued;
    default:
      return styles.idle;
  }
}

function nodeClass(status: GateEntry["status"] | "idle") {
  switch (status) {
    case "running":
      return styles.nodeRunning;
    case "passed":
      return styles.nodePassed;
    case "failed":
      return styles.nodeFailed;
    case "blocked":
      return styles.nodeBlocked;
    default:
      return styles.nodeIdle;
  }
}

export function MissionReactor({
  ticket,
  status,
  activeStage,
  gates,
  completion,
  stuckAlert,
}: MissionReactorProps) {
  const mission = deriveMissionState({
    status,
    ticket,
    activeStage,
    completion,
    stuckAlert,
  });

  return (
    <section
      aria-label="Execution pipeline map"
      className={`${styles.reactor} ${phaseClass(mission)}`}
    >
      <div className={styles.backdropRing} aria-hidden="true" />
      <div className={styles.orbitRing} aria-hidden="true" />
      <div className={styles.core}>
        <div className={styles.coreLabel}>{mission.label}</div>
        <div className={styles.coreSubLabel}>
          {activeStage ? humanizeStage(activeStage) : mission.detail}
        </div>
      </div>

      {NODES.map((node) => {
        const nodeStatus = gateStatusForNode(node.id, gates, activeStage);
        return (
          <div
            key={node.id}
            className={`${styles.node} ${nodeClass(nodeStatus)}`}
            style={{ "--angle": `${node.angle}deg` } as CSSProperties}
          >
            <div className={styles.nodeCore} />
            <div className={styles.nodeLabel}>{node.label}</div>
          </div>
        );
      })}
    </section>
  );
}
