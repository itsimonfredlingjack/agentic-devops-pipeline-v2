import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;
let connectAttemptId = 0;
const LOCAL_MONITOR_FALLBACK_PORT = "8110";

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
  onResolvedUrl?: (url: string) => void;
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

function getMonitorCandidates(monitorUrl: string): string[] {
  const normalized = normalizeUrl(monitorUrl);
  if (!normalized) {
    return [];
  }

  const candidates = new Set([normalized]);

  try {
    const parsed = new URL(normalized);
    const isDefaultLocalPort =
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
      parsed.port === "8100";

    if (isDefaultLocalPort) {
      const fallbackHost =
        parsed.hostname === "localhost" ? "127.0.0.1" : "localhost";
      parsed.port = LOCAL_MONITOR_FALLBACK_PORT;
      candidates.add(parsed.toString().replace(/\/$/, ""));

      const alternate = new URL(parsed.toString());
      alternate.hostname = fallbackHost;
      candidates.add(alternate.toString().replace(/\/$/, ""));
    }
  } catch {
    return [...candidates];
  }

  return [...candidates];
}

async function isHealthyMonitor(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(`${url}/status`, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as Record<string, unknown>;
    return typeof data.active === "boolean";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function connectMonitorSocket(
  getMonitorUrl: () => string,
  handlers: MonitorHandlers,
): void {
  disconnectMonitorSocket();
  const attemptId = ++connectAttemptId;

  const monitorUrl = normalizeUrl(getMonitorUrl());
  if (!monitorUrl) {
    handlers.appendLog("[monitor] Monitor URL is empty");
    handlers.onConnectionChange(false);
    return;
  }

  void (async () => {
    let resolvedUrl = monitorUrl;
    const candidates = getMonitorCandidates(monitorUrl);

    for (const candidate of candidates) {
      const healthy = await isHealthyMonitor(candidate);
      if (attemptId !== connectAttemptId) {
        return;
      }
      if (!healthy) {
        continue;
      }
      resolvedUrl = candidate;
      break;
    }

    if (resolvedUrl !== monitorUrl) {
      handlers.appendLog(
        `[monitor] Using ${resolvedUrl} instead of ${monitorUrl}`,
      );
      handlers.onResolvedUrl?.(resolvedUrl);
    }

    handlers.appendLog(`[monitor] Connecting to ${resolvedUrl}/monitor...`);
    socket = io(`${resolvedUrl}/monitor`, {
      transports: ["websocket"],
      reconnection: true,
    });

    socket.on("connect", () => {
      handlers.appendLog("[monitor] Connected");
      handlers.onConnectionChange(true);
    });

    socket.on("disconnect", (reason) => {
      handlers.appendLog(`[monitor] Disconnected: ${reason}`);
      handlers.onConnectionChange(false);
    });

    socket.on("connect_error", (error) => {
      handlers.appendLog(`[monitor] Connection error: ${error.message}`);
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
  })();
}

export function disconnectMonitorSocket(): void {
  connectAttemptId += 1;
  socket?.disconnect();
  socket = null;
}
