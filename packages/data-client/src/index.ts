import { io, type Socket } from "socket.io-client";
import type {
  CompletionSummary,
  CostEntry,
  EventRecord,
  HealthCheckResult,
  LoopConversationMessage,
  LoopConversationMessageSubmit,
  LoopEvent,
  QueueItem,
  SessionAction,
  SessionActionEvent,
  SessionSummary,
  StuckAlert,
  TaskPriority,
  TaskRunSummary,
  TaskStatus,
  TaskSummary,
} from "@sejfa/shared-types";

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export interface ApiRequestOptions {
  apiToken?: string;
}

export function authHeaders(apiToken?: string): HeadersInit {
  const token = apiToken?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jsonHeaders(apiToken?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...authHeaders(apiToken),
  };
}

type FrontendPipelineStatus =
  | "idle"
  | "recording"
  | "processing"
  | "clarifying"
  | "previewing"
  | "done"
  | "error";

interface NormalizedVoiceSignal {
  pipelineStatus: FrontendPipelineStatus;
  processingStep: string;
}

const NODE_TO_PIPELINE_STATUS: Record<string, FrontendPipelineStatus> = {
  idle: "idle",
  recording: "recording",
  transcribing: "processing",
  extracting: "processing",
  clarifying: "clarifying",
  previewing: "previewing",
  creating_ticket: "processing",
  creating: "processing",
  completed: "done",
  done: "done",
  error: "error",
};

const NODE_STEP_LABELS: Record<string, string> = {
  idle: "",
  recording: "Capturing voice input...",
  transcribing: "Transcribing audio...",
  extracting: "Analyzing intent...",
  clarifying: "Waiting for clarification...",
  previewing: "",
  creating_ticket: "Creating task record...",
  creating: "Creating task record...",
  completed: "",
  done: "",
  error: "",
};

export function normalizeVoicePipelineSignal(payload: unknown): NormalizedVoiceSignal | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const signal =
    typeof (payload as { current_node?: unknown }).current_node === "string"
      ? (payload as { current_node: string }).current_node
      : typeof (payload as { status?: unknown }).status === "string"
        ? (payload as { status: string }).status
        : null;

  if (!signal) {
    return null;
  }

  const pipelineStatus = NODE_TO_PIPELINE_STATUS[signal];
  if (!pipelineStatus) {
    return null;
  }

  return {
    pipelineStatus,
    processingStep: NODE_STEP_LABELS[signal] ?? "",
  };
}

function normalizeQueueItems(payload: unknown): QueueItem[] {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const queueEntry = entry as {
      task_ref?: unknown;
      summary?: unknown;
    };
    const taskRef = typeof queueEntry.task_ref === "string" ? queueEntry.task_ref : null;

    if (taskRef && typeof queueEntry.summary === "string") {
      return [{ taskRef, summary: queueEntry.summary }];
    }

    return [];
  });
}

function normalizeTaskSource(source: unknown): TaskSummary["source"] {
  return source === "linear" || source === "voice" || source === "manual" ? source : "unknown";
}

function normalizeLoopEvent(payload: unknown): LoopEvent | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const event = payload as {
    type?: unknown;
    task_ref?: unknown;
    summary?: unknown;
    success?: unknown;
  };
  const rawType = event.type;
  if (
    rawType !== "task_queued" &&
    rawType !== "loop_started" &&
    rawType !== "loop_completed"
  ) {
    return null;
  }

  const taskRef = typeof event.task_ref === "string" ? event.task_ref : null;
  if (!taskRef) {
    return null;
  }

  return {
    type: rawType,
    taskRef,
    summary: typeof event.summary === "string" ? event.summary : undefined,
    success: typeof event.success === "boolean" ? event.success : undefined,
  };
}

export async function checkVoicePipelineHealth(
  serverUrl: string,
): Promise<HealthCheckResult> {
  const base = normalizeUrl(serverUrl);
  if (!base) {
    return { ok: false, detail: "Server URL is empty" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(`${base}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!resp.ok) {
      return { ok: false, detail: `Health check returned HTTP ${resp.status}` };
    }

    return { ok: true, detail: "ok" };
  } catch (error) {
    return { ok: false, detail: String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchLoopQueue(serverUrl: string): Promise<QueueItem[]> {
  const base = normalizeUrl(serverUrl);
  if (!base) return [];

  const resp = await fetch(`${base}/api/loop/queue`);
  if (!resp.ok) {
    throw new Error(`Queue returned HTTP ${resp.status}`);
  }

  return normalizeQueueItems(await resp.json());
}

export async function submitClarification(
  serverUrl: string,
  payload: {
    sessionId: string;
    text: string;
  },
): Promise<Response> {
  const base = normalizeUrl(serverUrl);
  return fetch(`${base}/api/pipeline/clarify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: payload.sessionId,
      text: payload.text,
    }),
  });
}

export async function approvePipeline(
  serverUrl: string,
  sessionId: string,
  overrides?: Record<string, unknown>,
): Promise<Response> {
  const base = normalizeUrl(serverUrl);
  return fetch(`${base}/api/pipeline/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionId,
      ...(overrides ? { overrides } : {}),
    }),
  });
}

export async function discardPipeline(
  serverUrl: string,
  sessionId: string,
): Promise<Response> {
  const base = normalizeUrl(serverUrl);
  return fetch(`${base}/api/pipeline/discard`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionId,
    }),
  });
}

export function connectVoicePipelineSocket(
  getServerUrl: () => string,
  handlers: {
    appendLog: (msg: string) => void;
    setStatus: (status: string) => void;
    setProcessingStep: (step: string) => void;
    setWsConnected: (connected: boolean) => void;
    onClarification?: (payload: {
      session_id: string;
      questions: string[];
      partial_summary: string;
      round: number;
    }) => void;
    onPreview?: (payload: {
      sessionId: string;
      transcribedText: string;
      summary: string;
      intent?: {
        summary: string;
        description: string;
        acceptance_criteria: string;
        issue_type: string;
        priority: string;
        labels: string[];
        ambiguity_score: number;
      };
    }) => void;
    onLoopEvent?: (event: LoopEvent) => void;
  },
) {
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let shouldConnect = true;

  const maxReconnectDelay = 30_000;
  const baseReconnectDelay = 1_000;

  function scheduleReconnect() {
    if (!shouldConnect) return;
    const delay = Math.min(
      baseReconnectDelay * 2 ** reconnectAttempts,
      maxReconnectDelay,
    );
    reconnectAttempts += 1;
    handlers.appendLog(
      `[ws] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})...`,
    );
    reconnectTimer = setTimeout(connect, delay + Math.random() * 500);
  }

  function connect() {
    if (!shouldConnect) return;

    const serverUrl = normalizeUrl(getServerUrl());
    const wsUrl = serverUrl.replace(/^http/, "ws") + "/ws/status";

    handlers.appendLog(`[ws] Connecting to ${wsUrl}...`);

    try {
      socket = new WebSocket(wsUrl);
    } catch (error) {
      handlers.appendLog(`[ws] Connection error: ${error}`);
      handlers.setWsConnected(false);
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      reconnectAttempts = 0;
      handlers.setWsConnected(true);
      handlers.appendLog("[ws] Connected");
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handlers.appendLog(`[ws] ${JSON.stringify(data)}`);

        if (data.type === "clarification_needed" && handlers.onClarification) {
          handlers.setStatus("clarifying");
          handlers.setProcessingStep("Waiting for clarification...");
          handlers.onClarification({
            session_id: data.session_id,
            questions: data.questions,
            partial_summary: data.partial_summary,
            round: data.round,
          });
          return;
        }

        if (data.type === "preview_needed" && handlers.onPreview) {
          handlers.setStatus("previewing");
          handlers.setProcessingStep("");
          handlers.onPreview({
            sessionId: data.session_id,
            transcribedText: data.transcribed_text,
            summary: data.summary,
            intent: data.intent,
          });
          return;
        }

        if (
          handlers.onLoopEvent
        ) {
          const loopEvent = normalizeLoopEvent(data);
          if (loopEvent) {
            handlers.onLoopEvent(loopEvent);
            return;
          }
        }

        if (
          handlers.onLoopEvent &&
          (data.type === "task_queued" ||
            data.type === "loop_started" ||
            data.type === "loop_completed")
        ) {
          return;
        }

        const normalizedSignal = normalizeVoicePipelineSignal(data);
        if (normalizedSignal) {
          handlers.setStatus(normalizedSignal.pipelineStatus);
          handlers.setProcessingStep(normalizedSignal.processingStep);
        }
      } catch {
        handlers.appendLog(`[ws] Raw: ${event.data}`);
      }
    };

    socket.onclose = () => {
      handlers.appendLog("[ws] Disconnected");
      handlers.setWsConnected(false);
      socket = null;
      scheduleReconnect();
    };

    socket.onerror = () => {
      handlers.appendLog("[ws] Error");
    };
  }

  connect();

  return () => {
    shouldConnect = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    if (socket) {
      socket.close();
    }
  };
}

export async function fetchMonitorSessions(
  monitorUrl: string,
  options: ApiRequestOptions = {},
): Promise<SessionSummary[]> {
  const base = normalizeUrl(monitorUrl);
  const resp = await fetch(`${base}/sessions`, {
    headers: authHeaders(options.apiToken),
  });
  if (!resp.ok) {
    throw new Error(`Sessions returned HTTP ${resp.status}`);
  }
  const payload = (await resp.json()) as SessionSummary[];
  return payload.map((session) => ({
    session_id: session.session_id,
    task_ref: session.task_ref ?? null,
    started_at: session.started_at ?? null,
    ended_at: session.ended_at ?? null,
    total_cost_usd: session.total_cost_usd ?? null,
    total_events: session.total_events ?? null,
    outcome: session.outcome ?? null,
  }));
}

export function mapSessionSummaryToTaskRun(session: SessionSummary): TaskRunSummary {
  const taskRef = session.task_ref ?? null;
  const outcome =
    session.outcome === "done"
      ? "done"
      : session.outcome === "blocked"
        ? "blocked"
        : session.outcome === "aborted"
          ? "aborted"
          : session.outcome && session.outcome !== "unknown"
            ? "failed"
            : "pending";

  return {
    runId: session.session_id,
    taskRef,
    startedAt: session.started_at ?? null,
    endedAt: session.ended_at ?? null,
    totalCostUsd: session.total_cost_usd ?? null,
    totalEvents: session.total_events ?? null,
    outcome,
  };
}

export async function fetchTaskRuns(
  monitorUrl: string,
  options: ApiRequestOptions = {},
): Promise<TaskRunSummary[]> {
  const sessions = await fetchMonitorSessions(monitorUrl, options);
  return sessions.map(mapSessionSummaryToTaskRun);
}

export async function fetchMonitorEvents(
  monitorUrl: string,
  sessionId?: string,
): Promise<EventRecord[]> {
  const base = normalizeUrl(monitorUrl);
  const url = new URL(`${base}/events`);
  if (sessionId) {
    url.searchParams.set("session_id", sessionId);
  }
  const resp = await fetch(url.toString());
  if (!resp.ok) {
    throw new Error(`Events returned HTTP ${resp.status}`);
  }
  const payload = (await resp.json()) as EventRecord[];
  return payload.map((event) => ({
    ...event,
    task_ref: event.task_ref ?? null,
  }));
}

function normalizeConversationMessage(payload: unknown): LoopConversationMessage | null {
  if (!payload || typeof payload !== "object") return null;

  const message = payload as {
    message_id?: unknown;
    session_id?: unknown;
    timestamp?: unknown;
    sender?: unknown;
    text?: unknown;
    status?: unknown;
    details?: unknown;
    actions?: unknown;
  };

  if (typeof message.message_id !== "string" || typeof message.session_id !== "string") {
    return null;
  }
  if (typeof message.timestamp !== "string" || typeof message.text !== "string") {
    return null;
  }

  const sender = message.sender;
  if (sender !== "user" && sender !== "loop" && sender !== "system" && sender !== "blocker") {
    return null;
  }

  if (
    message.status !== undefined &&
    message.status !== null &&
    message.status !== "info" &&
    message.status !== "success" &&
    message.status !== "warning" &&
    message.status !== "danger"
  ) {
    return null;
  }

  const maybeActions =
    Array.isArray(message.actions) &&
    message.actions.every(
      (value) => value === "retry" || value === "clarify",
    )
      ? (message.actions as LoopConversationMessage["actions"])
      : undefined;

  const normalizedStatus =
    message.status === "info" || message.status === "success" || message.status === "warning" || message.status === "danger"
      ? message.status
      : undefined;

  return {
    message_id: message.message_id,
    session_id: message.session_id,
    timestamp: message.timestamp,
    sender: sender,
    text: message.text,
    status: normalizedStatus,
    details:
      typeof message.details === "string" ? message.details : message.details === null ? null : undefined,
    actions: maybeActions,
  };
}

export async function fetchConversationMessages(
  monitorUrl: string,
  sessionId: string,
  limit = 100,
  options: ApiRequestOptions = {},
): Promise<LoopConversationMessage[]> {
  const base = normalizeUrl(monitorUrl);
  const url = new URL(`${base}/sessions/${sessionId}/messages`);
  url.searchParams.set("limit", String(limit));

  const resp = await fetch(url.toString(), {
    headers: authHeaders(options.apiToken),
  });
  if (!resp.ok) {
    throw new Error(`Conversation messages returned HTTP ${resp.status}`);
  }

  const payload = (await resp.json()) as unknown[];
  return payload.flatMap((entry) => {
    const message = normalizeConversationMessage(entry);
    return message ? [message] : [];
  });
}

export async function fetchMonitorStatus(
  monitorUrl: string,
): Promise<{ active: boolean; session_id?: string; task_ref?: string }> {
  const base = normalizeUrl(monitorUrl);
  const resp = await fetch(`${base}/status`);
  if (!resp.ok) {
    throw new Error(`Status returned HTTP ${resp.status}`);
  }
  const payload = (await resp.json()) as {
    active: boolean;
    session_id?: string;
    task_ref?: string;
  };
  return {
    active: payload.active,
    session_id: payload.session_id,
    task_ref: payload.task_ref,
  };
}

export async function abortMission(
  monitorUrl: string,
  sessionId: string,
  options: ApiRequestOptions = {},
): Promise<void> {
  const base = normalizeUrl(monitorUrl);
  const response = await fetch(`${base}/sessions/${sessionId}/abort`, {
    method: "POST",
    headers: authHeaders(options.apiToken),
  });

  if (!response.ok) {
    throw new Error(`Abort returned HTTP ${response.status}`);
  }
}

export async function sendTacticalInstruction(
  monitorUrl: string,
  sessionId: string,
  text: string,
  options: ApiRequestOptions = {},
): Promise<void> {
  const base = normalizeUrl(monitorUrl);
  const response = await fetch(`${base}/sessions/${sessionId}/instructions`, {
    method: "POST",
    headers: jsonHeaders(options.apiToken),
    body: JSON.stringify({ message: text }),
  });

  if (!response.ok) {
    throw new Error(`Instruction returned HTTP ${response.status}`);
  }
}

export async function sendConversationMessage(
  monitorUrl: string,
  sessionId: string,
  payload: LoopConversationMessageSubmit,
  options: ApiRequestOptions = {},
): Promise<void> {
  const base = normalizeUrl(monitorUrl);
  const response = await fetch(`${base}/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: jsonHeaders(options.apiToken),
    body: JSON.stringify({
      message: payload.message,
      sender: payload.sender ?? "user",
      status: payload.status ?? "info",
      details: payload.details ?? null,
      actions: payload.actions ?? [],
      message_id: payload.message_id,
    }),
  });

  if (!response.ok) {
    throw new Error(`Conversation message returned HTTP ${response.status}`);
  }
}

export async function signalSessionAction(
  monitorUrl: string,
  sessionId: string,
  payload: SessionAction,
  options: ApiRequestOptions = {},
): Promise<void> {
  const base = normalizeUrl(monitorUrl);
  const response = await fetch(`${base}/sessions/${sessionId}/actions`, {
    method: "POST",
    headers: jsonHeaders(options.apiToken),
    body: JSON.stringify({
      action: payload.action,
      details: payload.details ?? null,
      message_id: payload.message_id,
    }),
  });

  if (!response.ok) {
    throw new Error(`Session action returned HTTP ${response.status}`);
  }
}

export async function retryLoopTask(
  voiceUrl: string,
  taskRef: string,
): Promise<void> {
  const base = normalizeUrl(voiceUrl);
  const response = await fetch(`${base}/api/loop/retry/${encodeURIComponent(taskRef)}`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Loop retry returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { status?: string };
  if (payload.status && payload.status !== "ok") {
    throw new Error(`Loop retry returned status ${payload.status}`);
  }
}

// -----------------------------------------------------------------------
// Task read/write (via voice pipeline backend -> Linear)
// -----------------------------------------------------------------------

export interface TaskRecord {
  id: string;
  linear_id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string | null;
  labels: string[];
  source: string;
  source_label: string;
  source_type: "system-of-record" | "external-tracker" | "draft" | "unknown";
  issue_type: string | null;
  description: string | null;
  url: string;
}

function mapTaskStatus(status: string): TaskStatus {
  const normalized = status.toLowerCase();
  if (normalized.includes("done") || normalized.includes("closed") || normalized.includes("resolved")) {
    return "done";
  }
  if (normalized.includes("progress")) return "in-progress";
  if (normalized.includes("review")) return "review";
  if (normalized.includes("todo") || normalized.includes("to do") || normalized.includes("selected")) {
    return "todo";
  }
  if (normalized.includes("cancel")) return "canceled";
  return "backlog";
}

function mapTaskPriority(priority: string | null): TaskPriority {
  if (!priority) return "none";
  const normalized = priority.toLowerCase();
  if (normalized.includes("highest") || normalized.includes("blocker")) return "urgent";
  if (normalized.includes("urgent")) return "urgent";
  if (normalized.includes("high") || normalized.includes("critical")) return "high";
  if (normalized.includes("medium")) return "medium";
  if (normalized.includes("low")) return "low";
  return "none";
}

export function mapTaskRecordToTaskSummary(
  task: TaskRecord,
): TaskSummary {
  return {
    id: task.id,
    title: task.title,
    status: mapTaskStatus(task.status),
    priority: mapTaskPriority(task.priority),
    assignee: task.assignee ?? undefined,
    labels: task.labels,
    source: normalizeTaskSource(task.source),
    sourceLabel: task.source_label,
    sourceType: task.source_type,
    issueType: task.issue_type ?? undefined,
    description: task.description,
    url: task.url,
  };
}

export async function fetchTasks(
  voiceUrl: string,
  maxResults = 20,
  options: ApiRequestOptions = {},
): Promise<TaskRecord[]> {
  const base = normalizeUrl(voiceUrl);
  const params = new URLSearchParams();
  params.set("max_results", String(maxResults));
  const resp = await fetch(`${base}/api/tasks?${params}`, {
    headers: authHeaders(options.apiToken),
  });
  if (!resp.ok) throw new Error(`Task API returned HTTP ${resp.status}`);
  return (await resp.json()) as TaskRecord[];
}

export async function fetchTaskInbox(
  voiceUrl: string,
  maxResults = 20,
  options: ApiRequestOptions = {},
): Promise<TaskSummary[]> {
  const tasks = await fetchTasks(voiceUrl, maxResults, options);
  return tasks.map(mapTaskRecordToTaskSummary);
}

export async function fetchTaskRecord(
  voiceUrl: string,
  key: string,
  options: ApiRequestOptions = {},
): Promise<TaskRecord> {
  const base = normalizeUrl(voiceUrl);
  const resp = await fetch(`${base}/api/tasks/${key}`, {
    headers: authHeaders(options.apiToken),
  });
  if (!resp.ok) throw new Error(`Task API returned HTTP ${resp.status}`);
  return (await resp.json()) as TaskRecord;
}

export async function fetchTaskDetail(
  voiceUrl: string,
  key: string,
  options: ApiRequestOptions = {},
): Promise<TaskSummary> {
  const task = await fetchTaskRecord(voiceUrl, key, options);
  return mapTaskRecordToTaskSummary(task);
}

export async function createTaskRecord(
  voiceUrl: string,
  payload: { title: string; description?: string; priority?: TaskPriority },
  options: ApiRequestOptions = {},
): Promise<TaskSummary> {
  const base = normalizeUrl(voiceUrl);
  const resp = await fetch(`${base}/api/tasks`, {
    method: "POST",
    headers: jsonHeaders(options.apiToken),
    body: JSON.stringify({
      title: payload.title,
      description: payload.description ?? "",
      priority: payload.priority ?? "none",
    }),
  });
  if (!resp.ok) {
    throw new Error(`Task API returned HTTP ${resp.status}`);
  }
  return mapTaskRecordToTaskSummary((await resp.json()) as TaskRecord);
}

export async function updateTaskRecord(
  voiceUrl: string,
  taskId: string,
  payload: { title: string; description?: string; priority?: TaskPriority },
  options: ApiRequestOptions = {},
): Promise<TaskSummary> {
  const base = normalizeUrl(voiceUrl);
  const resp = await fetch(`${base}/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: jsonHeaders(options.apiToken),
    body: JSON.stringify({
      title: payload.title,
      description: payload.description ?? "",
      priority: payload.priority ?? "none",
    }),
  });
  if (!resp.ok) {
    throw new Error(`Task API returned HTTP ${resp.status}`);
  }
  return mapTaskRecordToTaskSummary((await resp.json()) as TaskRecord);
}

export function connectMonitorSocket(
  getMonitorUrl: () => string,
  handlers: {
    onConnect?: () => void;
    onDisconnect?: () => void;
    onToolEvent?: (event: EventRecord) => void;
    onCostUpdate?: (cost: CostEntry) => void;
    onStuckAlert?: (alert: StuckAlert) => void;
    onSessionComplete?: (completion: CompletionSummary) => void;
    onSessionMessage?: (message: LoopConversationMessage) => void;
    onSessionAction?: (action: SessionActionEvent) => void;
  },
  getApiToken?: () => string | undefined,
): () => void {
  const socket: Socket = io(`${normalizeUrl(getMonitorUrl())}/monitor`, {
    transports: ["websocket"],
    auth: {
      token: getApiToken?.() ?? "",
    },
  });

  socket.on("connect", () => handlers.onConnect?.());
  socket.on("disconnect", () => handlers.onDisconnect?.());
  socket.on("tool_event", (payload: EventRecord) =>
    handlers.onToolEvent?.({
      ...payload,
      task_ref: payload.task_ref ?? null,
    }),
  );
  socket.on("cost_update", (payload: CostEntry) => handlers.onCostUpdate?.(payload));
  socket.on("stuck_alert", (payload: StuckAlert) => handlers.onStuckAlert?.(payload));
  socket.on("session_complete", (payload: CompletionSummary) =>
    handlers.onSessionComplete?.({
      ...payload,
      task_ref: payload.task_ref ?? null,
    }),
  );
  socket.on("session_message", (payload: unknown) => {
    const message = normalizeConversationMessage(payload);
    if (message) {
      handlers.onSessionMessage?.(message);
    }
  });

  socket.on("session_action", (payload: SessionActionEvent) => {
    handlers.onSessionAction?.(payload);
  });

  return () => {
    socket.disconnect();
  };
}
