export type PipelineStatus =
  | "idle"
  | "recording"
  | "processing"
  | "clarifying"
  | "previewing"
  | "done"
  | "error";

export interface TicketResult {
  key: string;
  url: string;
  summary: string;
}

export interface QueueItem {
  key: string;
  summary: string;
}

export interface ClarificationState {
  sessionId: string;
  questions: string[];
  partialSummary: string;
  round: number;
}

export interface IntentPreview {
  summary: string;
  description: string;
  acceptanceCriteria: string;
  issueType: string;
  priority: string;
  labels: string[];
  ambiguityScore: number;
}

export interface PreviewState {
  sessionId: string;
  transcribedText: string;
  summary: string;
  intent: IntentPreview;
}

export interface LoopEvent {
  type: "ticket_queued" | "loop_started" | "loop_completed";
  issue_key: string;
  summary?: string;
  success?: boolean;
}

export interface SessionSummary {
  session_id: string;
  ticket_id: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  total_cost_usd?: number | null;
  total_events?: number | null;
  outcome?: string | null;
}

export interface EventRecord {
  event_id: string;
  session_id: string;
  ticket_id: string | null;
  timestamp: string;
  event_type: string;
  tool_name: string;
  tool_args_summary?: string;
  success?: boolean | null;
  duration_ms?: number | null;
  cost_usd?: number | null;
  error?: string | null;
  detail?: string | null;
}

export type GateStatus =
  | "blocked"
  | "ready"
  | "running"
  | "passed"
  | "failed"
  | "skipped";

export interface GateEntry {
  nodeId: string;
  status: GateStatus;
  updatedAt: string;
  message?: string;
}

export interface CompletionSummary {
  session_id: string;
  ticket_id: string | null;
  outcome: "done" | "failed" | "blocked" | "unknown";
  pytest_summary: string | null;
  ruff_summary: string | null;
  git_diff_summary: string | null;
  pr_url: string | null;
}

export interface CostEntry {
  session_id: string;
  total_usd: number;
  breakdown: {
    input_usd: number;
    output_usd: number;
    cache_usd: number;
  };
}

export interface StuckAlert {
  pattern: string;
  repeat_count: number;
  tokens_burned: number;
  since: string;
}

export type CommandCenterSection =
  | "overview"
  | "runs"
  | "queue"
  | "events"
  | "failures"
  | "review"
  | "settings";

export type StatusBadgeTone =
  | "healthy"
  | "active"
  | "warning"
  | "failed"
  | "idle";

export interface CommandCenterNavItem {
  section: CommandCenterSection;
  label: string;
  badge?: number | string;
  tone?: StatusBadgeTone;
}

export interface VoicePipelineRunResult {
  ticket_key: string;
  ticket_url: string;
  summary: string;
  transcribed_text?: string;
  session_id?: string;
}

export interface HealthCheckResult {
  ok: boolean;
  detail: string;
}
