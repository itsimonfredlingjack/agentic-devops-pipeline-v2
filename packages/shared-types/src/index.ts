export type PipelineStatus =
  | "idle"
  | "recording"
  | "processing"
  | "clarifying"
  | "previewing"
  | "done"
  | "error";

export interface TaskResult {
  taskRef: string;
  taskUrl: string;
  summary: string;
}

export interface QueueItem {
  taskRef: string;
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
  type: "task_queued" | "loop_started" | "loop_completed";
  taskRef: string;
  summary?: string;
  success?: boolean;
}

export interface SessionSummary {
  session_id: string;
  task_ref?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  total_cost_usd?: number | null;
  total_events?: number | null;
  outcome?: string | null;
}

export type TaskPriority = "urgent" | "high" | "medium" | "low" | "none";

export type TaskStatus =
  | "backlog"
  | "todo"
  | "in-progress"
  | "review"
  | "done"
  | "canceled";

export type TaskSource = "linear" | "voice" | "manual" | "unknown";

export type TaskSourceType =
  | "system-of-record"
  | "external-tracker"
  | "draft"
  | "unknown";

export interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;
  labels: string[];
  source: TaskSource;
  sourceLabel: string;
  sourceType: TaskSourceType;
  issueType?: string;
  description?: string | null;
  url?: string;
}

export type TaskRunOutcome = "done" | "failed" | "blocked" | "aborted" | "pending";

export interface TaskRunSummary {
  runId: string;
  taskRef: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  totalCostUsd?: number | null;
  totalEvents?: number | null;
  outcome: TaskRunOutcome;
}

export type ConversationSender = "user" | "loop" | "system" | "blocker";

export type ConversationAction = "retry" | "clarify";

export type ConversationStatus = "info" | "success" | "warning" | "danger";

export interface LoopConversationMessage {
  message_id: string;
  session_id: string;
  timestamp: string;
  sender: ConversationSender;
  text: string;
  status?: ConversationStatus;
  details?: string | null;
  actions?: ConversationAction[];
}

export interface LoopConversationMessageSubmit {
  message: string;
  sender?: ConversationSender;
  status?: ConversationStatus;
  details?: string | null;
  actions?: ConversationAction[];
  message_id?: string;
}

export interface SessionAction {
  action: ConversationAction;
  details?: string | null;
  message_id?: string;
}

export interface SessionActionEvent {
  session_id: string;
  action: ConversationAction;
  details?: string | null;
  source?: string;
}

export interface EventRecord {
  event_id: string;
  session_id: string;
  task_ref?: string | null;
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
  task_ref?: string | null;
  outcome: "done" | "failed" | "blocked" | "aborted" | "unknown";
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
  task_ref: string;
  task_url: string;
  summary: string;
  transcribed_text?: string;
  session_id?: string;
}

export interface HealthCheckResult {
  ok: boolean;
  detail: string;
}
