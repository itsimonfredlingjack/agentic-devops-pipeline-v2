import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;
let lastConnectErrorMessage: string | null = null;
let lastConnectErrorAt = 0;
const CONNECT_ERROR_LOG_THROTTLE_MS = 15_000;

export interface MonitorToolEvent {
  event_id: string;
  session_id: string;
  ticket_id: string | null;
  timestamp: string;
  event_type: string;
  tool_name: string;
  tool_args_summary: string;
  success: boolean | null;
  duration_ms: number | null;
  cost_usd: number | null;
  error: string | null;
}

export interface MonitorCostUpdate {
  session_id: string;
  total_usd: number;
  breakdown: {
    input_usd: number;
    output_usd: number;
    cache_usd: number;
  };
}

export interface MonitorStuckAlert {
  pattern: string;
  repeat_count: number;
  tokens_burned: number;
  since: string;
}

export interface MonitorSessionStart {
  session_id: string;
  ticket_id: string | null;
  started_at: string;
}

export interface MonitorCompletion {
  session_id: string;
  ticket_id: string | null;
  outcome: "done" | "failed" | "blocked" | "unknown";
  pytest_summary: string | null;
  ruff_summary: string | null;
  git_diff_summary: string | null;
  pr_url: string | null;
}

export interface MonitorPipelineStage {
  stage: string;
  active: boolean;
}

interface MonitorHandlers {
  appendLog: (message: string) => void;
  onConnectionChange: (connected: boolean) => void;
  onToolEvent: (event: MonitorToolEvent) => void;
  onCostUpdate: (cost: MonitorCostUpdate) => void;
  onStuckAlert: (alert: MonitorStuckAlert) => void;
  onSessionStart: (session: MonitorSessionStart) => void;
  onSessionComplete: (completion: MonitorCompletion) => void;
  onPipelineStage: (stage: MonitorPipelineStage) => void;
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function connectMonitorSocket(
  getMonitorUrl: () => string,
  handlers: MonitorHandlers,
): void {
  disconnectMonitorSocket();

  const monitorUrl = normalizeUrl(getMonitorUrl());
  if (!monitorUrl) {
    handlers.appendLog("[monitor] Monitor URL is empty");
    handlers.onConnectionChange(false);
    return;
  }

  handlers.appendLog(`[monitor] Connecting to ${monitorUrl}/monitor...`);
  socket = io(`${monitorUrl}/monitor`, {
    transports: ["websocket"],
    reconnection: true,
  });

  socket.on("connect", () => {
    handlers.appendLog("[monitor] Connected");
    handlers.onConnectionChange(true);
    lastConnectErrorMessage = null;
    lastConnectErrorAt = 0;
  });

  socket.on("disconnect", (reason) => {
    handlers.appendLog(`[monitor] Disconnected: ${reason}`);
    handlers.onConnectionChange(false);
  });

  socket.on("connect_error", (error) => {
    const message = error.message || "unknown";
    const now = Date.now();
    const shouldLog =
      message !== lastConnectErrorMessage ||
      now - lastConnectErrorAt > CONNECT_ERROR_LOG_THROTTLE_MS;

    if (shouldLog) {
      handlers.appendLog(`[monitor] Connection error: ${message}`);
      lastConnectErrorMessage = message;
      lastConnectErrorAt = now;
    }

    handlers.onConnectionChange(false);
  });

  socket.on("tool_event", (event: MonitorToolEvent) => {
    handlers.onToolEvent(event);
  });

  socket.on("cost_update", (cost: MonitorCostUpdate) => {
    handlers.onCostUpdate(cost);
  });

  socket.on("stuck_alert", (alert: MonitorStuckAlert) => {
    handlers.onStuckAlert(alert);
  });

  socket.on("session_start", (session: MonitorSessionStart) => {
    handlers.onSessionStart(session);
  });

  socket.on("session_complete", (completion: MonitorCompletion) => {
    handlers.onSessionComplete(completion);
  });

  socket.on("pipeline_stage", (stage: MonitorPipelineStage) => {
    handlers.onPipelineStage(stage);
  });
}

export function disconnectMonitorSocket(): void {
  socket?.disconnect();
  socket = null;
}
