import type {
  ClarificationState,
  IntentPreview,
  PipelineStatus,
  PreviewState,
} from "@sejfa/shared-types";

export interface PipelineFlowActions {
  setPipelineStatus: (status: PipelineStatus) => void;
  setProcessingStep: (step: string) => void;
  setClarification: (clarification: ClarificationState | null) => void;
  setPreview: (preview: PreviewState | null) => void;
  setTicketKey: (key: string | null) => void;
}

export type PipelineResultKind =
  | "clarification_needed"
  | "preview_needed"
  | "ticket_created"
  | "unknown";

interface RawIntentPayload {
  summary?: unknown;
  description?: unknown;
  acceptance_criteria?: unknown;
  issue_type?: unknown;
  priority?: unknown;
  labels?: unknown;
  ambiguity_score?: unknown;
}

interface RawPipelinePayload {
  status?: unknown;
  session_id?: unknown;
  transcribed_text?: unknown;
  summary?: unknown;
  intent?: RawIntentPayload;
  questions?: unknown;
  partial_summary?: unknown;
  round?: unknown;
  ticket_key?: unknown;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function toIntentPreview(payload: RawIntentPayload | undefined, summaryFallback = ""): IntentPreview {
  if (!payload) {
    return {
      summary: summaryFallback,
      description: "",
      acceptanceCriteria: "",
      issueType: "Story",
      priority: "Medium",
      labels: [],
      ambiguityScore: 0,
    };
  }

  return {
    summary: asString(payload.summary, summaryFallback),
    description: asString(payload.description),
    acceptanceCriteria: asString(payload.acceptance_criteria),
    issueType: asString(payload.issue_type, "Story"),
    priority: asString(payload.priority, "Medium"),
    labels: asStringArray(payload.labels),
    ambiguityScore: asNumber(payload.ambiguity_score, 0),
  };
}

export function applyPipelineServerResult(
  payload: unknown,
  actions: PipelineFlowActions,
): PipelineResultKind {
  const data = (payload ?? {}) as RawPipelinePayload;

  if (data.status === "clarification_needed") {
    actions.setPreview(null);
    actions.setClarification({
      sessionId: asString(data.session_id),
      questions: asStringArray(data.questions),
      partialSummary: asString(data.partial_summary),
      round: asNumber(data.round, 1),
    });
    actions.setProcessingStep("Waiting for clarification...");
    actions.setPipelineStatus("clarifying");
    return "clarification_needed";
  }

  if (data.status === "preview_needed") {
    const summary = asString(data.summary);
    actions.setClarification(null);
    actions.setPreview({
      sessionId: asString(data.session_id),
      transcribedText: asString(data.transcribed_text),
      summary,
      intent: toIntentPreview(data.intent, summary),
    });
    actions.setProcessingStep("");
    actions.setPipelineStatus("previewing");
    return "preview_needed";
  }

  if (typeof data.ticket_key === "string" && data.ticket_key.trim()) {
    actions.setClarification(null);
    actions.setPreview(null);
    actions.setTicketKey(data.ticket_key);
    actions.setProcessingStep("");
    actions.setPipelineStatus("done");
    return "ticket_created";
  }

  return "unknown";
}
