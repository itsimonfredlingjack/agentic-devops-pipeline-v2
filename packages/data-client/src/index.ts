import { io, type Socket } from "socket.io-client";
import type {
  CompletionSummary,
  CostEntry,
  EventRecord,
  HealthCheckResult,
  LoopEvent,
  QueueItem,
  SessionSummary,
  StuckAlert,
} from "@sejfa/shared-types";

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function normalizeQueueItems(payload: unknown): QueueItem[] {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((entry) => {
    if (
      entry &&
      typeof entry === "object" &&
      typeof entry.key === "string" &&
      typeof entry.summary === "string"
    ) {
      return [{ key: entry.key, summary: entry.summary }];
    }

    return [];
  });
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
    onLoopEvent?: (event: LoopEvent) => void;
  },
) {
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let shouldConnect = true;

  const maxReconnectDelay = 30_000;
  const baseReconnectDelay = 1_000;
  const stepLabels: Record<string, string> = {
    transcribing: "Transcribing audio...",
    extracting: "Analyzing intent...",
    clarifying: "Waiting for clarification...",
    creating_ticket: "Creating Jira ticket...",
    creating: "Creating Jira ticket...",
    completed: "",
    error: "",
  };

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
          handlers.setProcessingStep("");
          handlers.onClarification({
            session_id: data.session_id,
            questions: data.questions,
            partial_summary: data.partial_summary,
            round: data.round,
          });
          return;
        }

        if (
          handlers.onLoopEvent &&
          (data.type === "ticket_queued" ||
            data.type === "loop_started" ||
            data.type === "loop_completed")
        ) {
          handlers.onLoopEvent(data as LoopEvent);
          return;
        }

        if (data.status) {
          const statusMap: Record<string, string> = {
            transcribing: "processing",
            extracting: "processing",
            clarifying: "clarifying",
            creating_ticket: "processing",
            completed: "done",
            error: "error",
          };
          const mapped = statusMap[data.status];
          if (mapped) {
            handlers.setStatus(mapped);
          }
          const step = stepLabels[data.status];
          if (step !== undefined) {
            handlers.setProcessingStep(step);
          }
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
): Promise<SessionSummary[]> {
  const base = normalizeUrl(monitorUrl);
  const resp = await fetch(`${base}/sessions`);
  if (!resp.ok) {
    throw new Error(`Sessions returned HTTP ${resp.status}`);
  }
  return (await resp.json()) as SessionSummary[];
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
  return (await resp.json()) as EventRecord[];
}

export async function fetchMonitorStatus(
  monitorUrl: string,
): Promise<{ active: boolean; session_id?: string; ticket_id?: string }> {
  const base = normalizeUrl(monitorUrl);
  const resp = await fetch(`${base}/status`);
  if (!resp.ok) {
    throw new Error(`Status returned HTTP ${resp.status}`);
  }
  return (await resp.json()) as {
    active: boolean;
    session_id?: string;
    ticket_id?: string;
  };
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
  },
): () => void {
  const socket: Socket = io(`${normalizeUrl(getMonitorUrl())}/monitor`, {
    transports: ["websocket"],
  });

  socket.on("connect", () => handlers.onConnect?.());
  socket.on("disconnect", () => handlers.onDisconnect?.());
  socket.on("tool_event", (payload: EventRecord) => handlers.onToolEvent?.(payload));
  socket.on("cost_update", (payload: CostEntry) => handlers.onCostUpdate?.(payload));
  socket.on("stuck_alert", (payload: StuckAlert) => handlers.onStuckAlert?.(payload));
  socket.on("session_complete", (payload: CompletionSummary) =>
    handlers.onSessionComplete?.(payload),
  );

  return () => {
    socket.disconnect();
  };
}
