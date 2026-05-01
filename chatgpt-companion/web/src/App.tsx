import { useEffect, useMemo, useRef, useState } from "react";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
};

type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: any;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: any;
};

type MissionPayload = {
  mission_phase?: string;
  phase_label?: string;
  task?: { task_ref?: string; key?: string; summary?: string; status?: string } | null;
  ticket?: { key?: string; summary?: string; status?: string } | null;
  share?: {
    id?: string;
    url?: string;
    text?: string;
    metrics?: Record<string, number>;
  } | null;
  active_session?: {
    session_id?: string;
    task_ref?: string;
    ticket_id?: string;
    total_cost_usd?: number;
    total_events?: number;
    outcome?: string | null;
  } | null;
  latest_session?: {
    session_id?: string;
    task_ref?: string;
    ticket_id?: string;
    total_cost_usd?: number;
    total_events?: number;
    outcome?: string | null;
  } | null;
  latest_events?: Array<{
    event_id?: string;
    timestamp?: string;
    tool_name?: string;
    tool_args_summary?: string;
    error?: string | null;
    success?: boolean | null;
  }>;
  gates?: Array<{ name: string; status: string }>;
  alerts?: string[];
  connections?: Record<string, { reachable?: boolean; status_code?: number; error?: string }>;
  queue?: {
    has_pending_task?: boolean;
    has_pending_ticket?: boolean;
    latest_pending?: { task_ref?: string; key?: string; summary?: string } | null;
  };
};

type OpenAICompat = {
  toolOutput?: MissionPayload;
  toolInput?: Record<string, unknown>;
  callTool?: (name: string, args?: Record<string, unknown>) => Promise<any>;
  sendFollowUpMessage?: (payload: { prompt: string; scrollToBottom?: boolean }) => Promise<void>;
};

declare global {
  interface Window {
    openai?: OpenAICompat;
  }
}

function useMcpBridge() {
  const [payload, setPayload] = useState<MissionPayload | null>(
    window.openai?.toolOutput ?? null,
  );
  const [status, setStatus] = useState("Connecting…");
  const requestId = useRef(0);
  const pending = useRef(new Map<number, { resolve: (value: any) => void; reject: (error: any) => void }>());

  useEffect(() => {
    const onMessage = (event: MessageEvent<JsonRpcNotification | JsonRpcResponse>) => {
      if (event.source !== window.parent) return;
      const message = event.data;
      if (!message || message.jsonrpc !== "2.0") return;
      if ("id" in message && typeof message.id === "number") {
        const pendingRequest = pending.current.get(message.id);
        if (!pendingRequest) return;
        pending.current.delete(message.id);
        if (message.error) pendingRequest.reject(message.error);
        else pendingRequest.resolve(message.result);
        return;
      }
      if ("method" in message && message.method === "ui/notifications/tool-result") {
        setPayload(message.params?.structuredContent ?? null);
        setStatus("Live");
      }
    };
    window.addEventListener("message", onMessage as EventListener, { passive: true });
    void initializeBridge();
    return () => window.removeEventListener("message", onMessage as EventListener);
  }, []);

  async function initializeBridge() {
    try {
      await rpcRequest("ui/initialize", {
        appInfo: { name: "sejfa-companion-widget", version: "0.1.0" },
        appCapabilities: {},
        protocolVersion: "2026-01-26",
      });
      rpcNotify("ui/notifications/initialized", {});
    } catch {
      setStatus("Offline");
    }
  }

  function rpcNotify(method: string, params: unknown) {
    window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
  }

  function rpcRequest(method: string, params?: unknown) {
    return new Promise<any>((resolve, reject) => {
      const id = ++requestId.current;
      pending.current.set(id, { resolve, reject });
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params } as JsonRpcRequest, "*");
    });
  }

  async function callTool(name: string, args?: Record<string, unknown>) {
    if (window.openai?.callTool) return window.openai.callTool(name, args);
    return rpcRequest("tools/call", { name, arguments: args ?? {} });
  }

  async function sendFollowUpMessage(prompt: string) {
    if (window.openai?.sendFollowUpMessage) {
      await window.openai.sendFollowUpMessage({ prompt });
      return;
    }
    rpcNotify("ui/message", { role: "user", content: [{ type: "text", text: prompt }] });
  }

  return { payload, status, callTool, sendFollowUpMessage };
}

function statusTone(status?: string) {
  switch ((status ?? "").toLowerCase()) {
    case "passed": case "completed": case "done": return "good";
    case "failed": case "blocked": return "bad";
    case "running": case "queued": return "active";
    default: return "pending";
  }
}

export default function App() {
  const { payload, status, callTool, sendFollowUpMessage } = useMcpBridge();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const headline = useMemo(() => {
    const taskRef = payload?.task?.task_ref ?? payload?.task?.key ?? payload?.ticket?.key;
    const summary = payload?.task?.summary ?? payload?.ticket?.summary;
    if (taskRef) return `${taskRef}${summary ? ` · ${summary}` : ""}`;
    return "No mission loaded — ask \"what's my current task?\" to begin.";
  }, [payload]);

  const handleRefresh = () => {
    setLoadingAction("r");
    callTool("get_active_mission").finally(() => setLoadingAction(null));
  };

  const handleAskReview = () => {
    setLoadingAction("a");
    sendFollowUpMessage(
      "Review the current SEJFA mission, UI flow, and implementation context. Point out what looks underspecified, risky, or worth improving next.",
    ).finally(() => setLoadingAction(null));
  };

  const events = payload?.latest_events ?? [];
  const gates = payload?.gates ?? [];
  const alerts = payload?.alerts ?? [];
  const connections = payload?.connections ?? {};

  return (
    <main className="shell">
      {/* Status bar */}
      <header className="statusBar">
        <span className={`statusDot tone-${statusTone(payload?.mission_phase)}`} />
        <span className="phaseLabel">{payload?.phase_label ?? "Idle"}</span>
        <span className="taskRef">{headline}</span>
        <span className="connectionBadge">{status}</span>
      </header>

      {/* Threaded messages */}
      <section className="thread">
        {/* Sentinel gates as inline badges */}
        {gates.length > 0 && (
          <div className="gateRow">
            {gates.map((gate) => (
              <span key={gate.name} className={`gateBadge tone-${statusTone(gate.status)}`}>
                {gate.name}: {gate.status}
              </span>
            ))}
          </div>
        )}

        {/* Alerts as system messages */}
        {alerts.map((alert, i) => (
          <div key={`alert-${i}`} className="message system">
            <div className="messageMeta">
              <span className="sender">System</span>
              <span className="time">alert</span>
            </div>
            <p className="messageBody">{alert}</p>
          </div>
        ))}

        {/* Connections as system message */}
        {Object.keys(connections).length > 0 && (
          <div className="message system">
            <div className="messageMeta">
              <span className="sender">System</span>
              <span className="time">connections</span>
            </div>
            <p className="messageBody">
              {Object.entries(connections).map(([name, v]) => (
                <span key={name} className="inlineBadge">
                  {name}: {v.reachable ? "online" : "offline"}
                </span>
              ))}
            </p>
          </div>
        )}

        {/* Event messages */}
        {events.map((event, index) => (
          <div
            key={event.event_id ?? `evt-${index}`}
            className={`message ${event.error ? "error" : ""}`}
          >
            <div className="messageMeta">
              <span className="sender">{event.tool_name ?? "Event"}</span>
              <span className="time">{event.timestamp ?? ""}</span>
            </div>
            <p className="messageBody">
              {event.error ?? event.tool_args_summary ?? "Loading event details — refresh if needed."}
            </p>
            {event.success !== null && (
              <span className={`outcomePill ${event.success === false ? "fail" : "ok"}`}>
                {event.success === false ? "failed" : "ok"}
              </span>
            )}
          </div>
        ))}

        {events.length === 0 && alerts.length === 0 && (
          <div className="threadEmpty">Events appear as the loop progresses.</div>
        )}
      </section>

      {/* Action bar */}
      <footer className="actionBar">
        <button className="ghost" onClick={handleRefresh} disabled={loadingAction !== null}>
          Refresh
        </button>
        <button className="primary" onClick={handleAskReview} disabled={loadingAction !== null}>
          {loadingAction === "a" ? "Asking…" : "Ask for Review"}
        </button>
      </footer>
    </main>
  );
}
