import type { PipelineStatus } from "../stores/pipelineStore";

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let shouldConnect = false;
let activeConnectionGeneration = 0;

const MAX_RECONNECT_DELAY = 30_000;
const BASE_RECONNECT_DELAY = 1_000;

export interface LoopEvent {
  type: "ticket_queued" | "loop_started" | "loop_completed";
  issue_key: string;
  summary?: string;
  success?: boolean;
}

const STEP_LABELS: Record<string, string> = {
  transcribing: "Transcribing audio...",
  extracting: "Analyzing intent...",
  clarifying: "Waiting for clarification...",
  creating_ticket: "Creating Jira ticket...",
  creating: "Creating Jira ticket...",
  completed: "",
  error: "",
};

function getReconnectDelay(): number {
  const delay = Math.min(
    BASE_RECONNECT_DELAY * 2 ** reconnectAttempts,
    MAX_RECONNECT_DELAY,
  );
  return delay + Math.random() * 500; // jitter
}

export function connectWebSocket(
  getServerUrl: () => string,
  appendLog: (msg: string) => void,
  setStatus: (s: PipelineStatus) => void,
  setProcessingStep: (step: string) => void,
  setWsConnected: (connected: boolean) => void,
  onClarification?: (data: {
    session_id: string;
    questions: string[];
    partial_summary: string;
    round: number;
  }) => void,
  onLoopEvent?: (event: LoopEvent) => void,
): void {
  shouldConnect = true;
  const generation = ++activeConnectionGeneration;

  function isStaleConnection() {
    return generation !== activeConnectionGeneration;
  }

  function doConnect() {
    if (!shouldConnect || isStaleConnection()) return;

    const serverUrl = getServerUrl();
    const wsUrl =
      serverUrl.replace(/^http/, "ws").replace(/\/$/, "") + "/ws/status";

    appendLog(`[ws] Connecting to ${wsUrl}...`);

    try {
      const candidateSocket = new WebSocket(wsUrl);
      socket = candidateSocket;

      candidateSocket.onopen = () => {
        if (isStaleConnection() || socket !== candidateSocket) return;

        reconnectAttempts = 0;
        setWsConnected(true);
        appendLog("[ws] Connected");
      };

      candidateSocket.onmessage = (event) => {
        if (isStaleConnection() || socket !== candidateSocket) return;

        try {
          const data = JSON.parse(event.data);
          appendLog(`[ws] ${JSON.stringify(data)}`);

          // Handle clarification_needed WebSocket event
          if (data.type === "clarification_needed" && onClarification) {
            setProcessingStep("");
            onClarification({
              session_id: data.session_id,
              questions: data.questions,
              partial_summary: data.partial_summary,
              round: data.round,
            });
            return;
          }

          // Handle Ralph Loop events
          if (
            onLoopEvent &&
            (data.type === "ticket_queued" ||
              data.type === "loop_started" ||
              data.type === "loop_completed")
          ) {
            onLoopEvent(data as LoopEvent);
            return;
          }

          // Update status + processing step based on server events
          if (data.status) {
            const statusMap: Record<string, PipelineStatus> = {
              transcribing: "processing",
              extracting: "processing",
              clarifying: "clarifying",
              creating_ticket: "processing",
              completed: "done",
              error: "error",
            };
            const mapped = statusMap[data.status];
            if (mapped) {
              setStatus(mapped);
            }
            const step = STEP_LABELS[data.status];
            if (step !== undefined) {
              setProcessingStep(step);
            }
          }

          // Map current_node from monitor state
          if (data.current_node) {
            const nodeMap: Record<string, PipelineStatus> = {
              recording: "recording",
              transcribing: "processing",
              extracting: "processing",
              clarifying: "clarifying",
              creating: "processing",
              done: "done",
              error: "error",
            };
            const mapped = nodeMap[data.current_node];
            if (mapped) {
              setStatus(mapped);
            }
            const step = STEP_LABELS[data.current_node];
            if (step !== undefined) {
              setProcessingStep(step);
            }
          }
        } catch {
          appendLog(`[ws] Raw: ${event.data}`);
        }
      };

      candidateSocket.onclose = () => {
        if (isStaleConnection() || socket !== candidateSocket) return;

        appendLog("[ws] Disconnected");
        socket = null;
        setWsConnected(false);
        scheduleReconnect();
      };

      candidateSocket.onerror = () => {
        if (isStaleConnection() || socket !== candidateSocket) return;

        appendLog("[ws] Error");
        // onclose will fire after onerror, so reconnect is handled there
      };
    } catch (err) {
      appendLog(`[ws] Connection error: ${err}`);
      setWsConnected(false);
      scheduleReconnect();
      return;
    }
  }

  function scheduleReconnect() {
    if (!shouldConnect || isStaleConnection()) return;
    const delay = getReconnectDelay();
    reconnectAttempts++;
    appendLog(
      `[ws] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})...`,
    );
    reconnectTimer = setTimeout(() => {
      if (isStaleConnection()) return;
      doConnect();
    }, delay);
  }

  doConnect();
}

export function disconnectWebSocket(): void {
  shouldConnect = false;
  activeConnectionGeneration++;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
  reconnectAttempts = 0;
}
