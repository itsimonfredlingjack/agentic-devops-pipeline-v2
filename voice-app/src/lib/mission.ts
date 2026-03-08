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

export type CanvasPhase =
  | "idle"
  | "listening"
  | "processing"
  | "clarifying"
  | "queued"
  | "running"
  | "blocked"
  | "done";

export type CanvasEmphasis =
  | "intake"
  | "formation"
  | "loop"
  | "diagnostic"
  | "outcome";

export interface CanvasState {
  phase: CanvasPhase;
  caption: string;
  emphasis: CanvasEmphasis;
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
      detail: "Manual review needed",
    };
  }

  if (completion?.outcome === "failed" || status === "error") {
    return {
      phase: "failed",
      label: "Failed",
      detail: "Task failed in the current stage",
    };
  }

  if (status === "recording") {
    return {
      phase: "capturing",
      label: "Listening",
      detail: "Capturing your request",
    };
  }

  if (
    status === "processing" ||
    status === "clarifying" ||
    status === "previewing"
  ) {
    return {
      phase: "processing",
      label: "Preparing",
      detail: "Converting voice input into task details",
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
      label: "Running",
      detail: `${humanizeStage(activeStage)} is active`,
    };
  }

  if (ticket) {
    return {
      phase: "queued",
      label: "Queued",
      detail: "Task queued for agent pickup",
    };
  }

  return {
    phase: "idle",
    label: "Ready",
    detail: "Ready for your next request",
  };
}

export function deriveCanvasState({
  status,
  ticket,
  activeStage,
  completion,
  stuckAlert,
}: MissionStateInput): CanvasState {
  if (completion?.outcome === "done") {
    return {
      phase: "done",
      caption: "Task completed",
      emphasis: "outcome",
    };
  }

  if (completion?.outcome === "blocked" || stuckAlert) {
    return {
      phase: "blocked",
      caption: `Blocked in ${humanizeStage(activeStage ?? "loop")}`,
      emphasis: "diagnostic",
    };
  }

  if (status === "recording") {
    return {
      phase: "listening",
      caption: "Listening for your request",
      emphasis: "intake",
    };
  }

  if (status === "clarifying") {
    return {
      phase: "clarifying",
      caption: "Need one more detail",
      emphasis: "formation",
    };
  }

  if (status === "processing") {
    return {
      phase: "processing",
      caption: "Preparing task details",
      emphasis: "formation",
    };
  }

  if (status === "previewing") {
    return {
      phase: "processing",
      caption: "Review your recording",
      emphasis: "formation",
    };
  }

  if (activeStage && (VERIFY_STAGES.has(activeStage) || ACTIVE_STAGES.has(activeStage))) {
    return {
      phase: "running",
      caption: `Running ${humanizeStage(activeStage)}`,
      emphasis: "loop",
    };
  }

  if (ticket) {
    return {
      phase: "queued",
      caption: "Task queued",
      emphasis: "loop",
    };
  }

  return {
    phase: "idle",
    caption: "Start with a request",
    emphasis: "intake",
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
