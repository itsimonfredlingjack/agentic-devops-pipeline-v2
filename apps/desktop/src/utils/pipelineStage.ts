import type { PipelineStatus } from "@sejfa/shared-types";
import type { LoopPhase } from "../stores/appStore";

export type PipelineStage = "record" | "process" | "verify" | "build";

export interface PipelineStageInput {
  pipelineStatus: PipelineStatus;
  processingStep: string;
  phase: LoopPhase;
  loopActive: boolean;
}

const BUILD_STEP_HINTS = ["creating", "ticket", "queue", "loop", "dispatch", "build"];

function isBuildStep(processingStep: string): boolean {
  const normalized = processingStep.toLowerCase();
  return BUILD_STEP_HINTS.some((hint) => normalized.includes(hint));
}

export function derivePipelineStage(input: PipelineStageInput): PipelineStage {
  if (input.loopActive || input.phase === "loop" || input.phase === "done" || input.pipelineStatus === "done") {
    return "build";
  }

  if (input.pipelineStatus === "clarifying" || input.pipelineStatus === "previewing" || input.phase === "verify") {
    return "verify";
  }

  if (input.pipelineStatus === "recording" || input.phase === "listening") {
    return "record";
  }

  if (input.pipelineStatus === "processing" || input.phase === "processing") {
    return isBuildStep(input.processingStep) ? "build" : "process";
  }

  return "record";
}
