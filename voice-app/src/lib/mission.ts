import type {
  CompletionEntry,
  GateEntry,
  PipelineStatus,
  StuckAlertEntry,
  TicketResult,
} from "../stores/pipelineStore";

export type MissionPhase =
  | "idle"
  | "capturing"
  | "processing"
  | "queued"
  | "agent_active"
  | "verifying"
  | "blocked"
  | "completed"
  | "failed";

export interface MissionStateInput {
  status: PipelineStatus;
  ticket: TicketResult | null;
  activeStage: string | null;
  completion: CompletionEntry | null;
  stuckAlert: StuckAlertEntry | null;
}

export interface MissionState {
  phase: MissionPhase;
  label: string;
  detail: string;
}

export interface SurfaceStatus {
  label: string;
  phase: MissionPhase;
  detail: string;
}

const VERIFY_STAGES = new Set(["verify", "tests", "ci", "pr"]);
const ACTIVE_STAGES = new Set(["jira", "agent", "actions", "deploy"]);

export function deriveMissionState({
  status,
  ticket,
  activeStage,
  completion,
  stuckAlert,
}: MissionStateInput): MissionState {
  if (completion?.outcome === "done") {
    return {
      phase: "completed",
      label: "Done",
      detail: "Task completed successfully",
    };
  }

  if (completion?.outcome === "blocked" || stuckAlert) {
    return {
      phase: "blocked",
      label: "Blocked",
      detail: "Operator attention requested",
    };
  }

  if (completion?.outcome === "failed" || status === "error") {
    return {
      phase: "failed",
      label: "Failed",
      detail: "The loop hit an unrecovered error",
    };
  }

  if (status === "recording") {
    return {
      phase: "capturing",
      label: "Recording",
      detail: "Listening for your objective",
    };
  }

  if (
    status === "processing" ||
    status === "clarifying" ||
    status === "previewing"
  ) {
    return {
      phase: "processing",
      label: "Igniting",
      detail: "Turning your voice into a task",
    };
  }

  if (activeStage && VERIFY_STAGES.has(activeStage)) {
    return {
      phase: "verifying",
      label: "Verifying",
      detail: "Checks and delivery evidence are in flight",
    };
  }

  if (activeStage && ACTIVE_STAGES.has(activeStage)) {
    return {
      phase: "agent_active",
      label: "Agent Running",
      detail: `${humanizeStage(activeStage)} is live`,
    };
  }

  if (ticket) {
    return {
      phase: "queued",
      label: "Queued",
      detail: "Task accepted and waiting for agent pickup",
    };
  }

  return {
    phase: "idle",
    label: "Idle",
    detail: "Awaiting your next objective",
  };
}

export function humanizeStage(stage: string | null): string {
  if (!stage) return "No active stage";
  return stage
    .replace(/[_/]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function gateStatusForNode(
  nodeId: string,
  gates: GateEntry[],
  activeStage: string | null,
): GateEntry["status"] | "idle" {
  const gate = gates.find((entry) => entry.nodeId === nodeId);
  if (gate) return gate.status;
  if (activeStage === nodeId) return "running";
  return "idle";
}
