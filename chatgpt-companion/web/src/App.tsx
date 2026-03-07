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
  ticket?: { key?: string; summary?: string; status?: string } | null;
  active_session?: {
    session_id?: string;
    ticket_id?: string;
    total_cost_usd?: number;
    total_events?: number;
    outcome?: string | null;
  } | null;
  latest_session?: {
    session_id?: string;
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
  queue?: { has_pending_ticket?: boolean; latest_pending?: { key?: string; summary?: string } | null };
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
  const [status, setStatus] = useState("Connecting to host bridge…");
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
        if (message.error) {
          pendingRequest.reject(message.error);
        } else {
          pendingRequest.resolve(message.result);
        }
        return;
      }

      if ("method" in message && message.method === "ui/notifications/tool-result") {
        setPayload(message.params?.structuredContent ?? null);
        setStatus("Live mission context ready");
      }

      if ("method" in message && message.method === "ui/notifications/tool-input" && !payload) {
        setStatus("Waiting for mission data…");
      }
    };

    window.addEventListener("message", onMessage as EventListener, { passive: true });
    void initializeBridge();

    return () => {
      window.removeEventListener("message", onMessage as EventListener);
    };
  }, [payload]);

  async function initializeBridge() {
    try {
      await rpcRequest("ui/initialize", {
        appInfo: { name: "sejfa-companion-widget", version: "0.1.0" },
        appCapabilities: {},
        protocolVersion: "2026-01-26",
      });
      rpcNotify("ui/notifications/initialized", {});
      setStatus(window.openai?.toolOutput ? "Live mission context ready" : "Bridge initialized");
    } catch (error) {
      console.error("Bridge initialization failed", error);
      setStatus("Bridge initialization failed");
    }
  }

  function rpcNotify(method: string, params: unknown) {
    window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
  }

  function rpcRequest(method: string, params?: unknown) {
    return new Promise<any>((resolve, reject) => {
      const id = ++requestId.current;
      pending.current.set(id, { resolve, reject });
      const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
      window.parent.postMessage(request, "*");
    });
  }

  async function callTool(name: string, args?: Record<string, unknown>) {
    if (window.openai?.callTool) {
      const result = await window.openai.callTool(name, args);
      if (result?.structuredContent) {
        setPayload(result.structuredContent);
      }
      return result;
    }

    const result = await rpcRequest("tools/call", {
      name,
      arguments: args ?? {},
    });
    if (result?.structuredContent) {
      setPayload(result.structuredContent);
    }
    return result;
  }

  async function sendFollowUpMessage(prompt: string) {
    if (window.openai?.sendFollowUpMessage) {
      await window.openai.sendFollowUpMessage({ prompt });
      return;
    }

    rpcNotify("ui/message", {
      role: "user",
      content: [{ type: "text", text: prompt }],
    });
  }

  return { payload, status, callTool, sendFollowUpMessage };
}

function formatMoney(value?: number) {
  if (typeof value !== "number") return "pending";
  return `$${value.toFixed(4)}`;
}

function statusTone(status?: string) {
  switch ((status ?? "").toLowerCase()) {
    case "passed":
    case "completed":
    case "done":
      return "good";
    case "failed":
    case "blocked":
      return "bad";
    case "running":
    case "queued":
      return "active";
    default:
      return "pending";
  }
}

export default function App() {
  const { payload, status, callTool, sendFollowUpMessage } = useMcpBridge();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const latestSession = payload?.active_session ?? payload?.latest_session ?? null;
  const headline = useMemo(() => {
    if (payload?.ticket?.key) {
      return `${payload.ticket.key} ${payload.ticket.summary ? `· ${payload.ticket.summary}` : ""}`;
    }
    return "No active objective";
  }, [payload]);

  async function handleRefresh() {
    setLoadingAction("refresh");
    try {
      const result = await callTool("get_active_mission");
      if (result?.structuredContent) {
        await callTool("render_mission_dashboard");
      }
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleLoadEvents() {
    if (!latestSession?.session_id) return;
    setLoadingAction("events");
    try {
      await callTool("get_session_events", { session_id: latestSession.session_id, limit: 16 });
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleAskReview() {
    setLoadingAction("review");
    try {
      await sendFollowUpMessage(
        "Review the current SEJFA mission, UI flow, and implementation context. Point out what looks underspecified, risky, or worth improving next.",
      );
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <main className="shell">
      <section className="hero card">
        <div className="eyebrow">SEJFA ChatGPT Companion</div>
        <div className="heroRow">
          <div>
            <h1>{payload?.phase_label ?? "Idle"}</h1>
            <p className="headline">{headline}</p>
          </div>
          <div className={`phaseBadge tone-${statusTone(payload?.mission_phase)}`}>
            {(payload?.mission_phase ?? "idle").replace("_", " ")}
          </div>
        </div>
        <p className="statusLine">{status}</p>
      </section>

      <section className="grid">
        <div className="column">
          <article className="card">
            <div className="sectionTitle">Mission Snapshot</div>
            <div className="statGrid">
              <div className="stat">
                <span>Session</span>
                <strong>{latestSession?.session_id ?? "waiting"}</strong>
              </div>
              <div className="stat">
                <span>Outcome</span>
                <strong>{latestSession?.outcome ?? "in progress"}</strong>
              </div>
              <div className="stat">
                <span>Cost</span>
                <strong>{formatMoney(latestSession?.total_cost_usd)}</strong>
              </div>
              <div className="stat">
                <span>Events</span>
                <strong>{latestSession?.total_events ?? 0}</strong>
              </div>
            </div>
          </article>

          <article className="card">
            <div className="sectionTitle">Sentinels</div>
            <div className="gateGrid">
              {(payload?.gates ?? []).map((gate) => (
                <div key={gate.name} className={`gateCard tone-${statusTone(gate.status)}`}>
                  <span>{gate.name}</span>
                  <strong>{gate.status}</strong>
                </div>
              ))}
              {(!payload?.gates || payload.gates.length === 0) && (
                <div className="empty">No evidence cards yet.</div>
              )}
            </div>
          </article>

          <article className="card">
            <div className="sectionTitle">Connections</div>
            <div className="connectionList">
              {Object.entries(payload?.connections ?? {}).map(([name, value]) => (
                <div key={name} className="connectionRow">
                  <span>{name}</span>
                  <strong>{value.reachable ? `online${value.status_code ? ` (${value.status_code})` : ""}` : "offline"}</strong>
                </div>
              ))}
              {Object.keys(payload?.connections ?? {}).length === 0 && (
                <div className="empty">No connection probes available.</div>
              )}
            </div>
          </article>
        </div>

        <div className="column">
          <article className="card">
            <div className="sectionTitle">Recent Activity</div>
            <div className="timeline">
              {(payload?.latest_events ?? []).map((event, index) => (
                <div key={event.event_id ?? `${event.timestamp}-${index}`} className="timelineItem">
                  <div className={`dot tone-${statusTone(event.error ? "failed" : event.success === false ? "failed" : "running")}`} />
                  <div className="timelineBody">
                    <div className="timelineHeader">
                      <strong>{event.tool_name ?? "Event"}</strong>
                      <span>{event.timestamp ?? ""}</span>
                    </div>
                    <p>{event.error ?? event.tool_args_summary ?? "No detail provided."}</p>
                  </div>
                </div>
              ))}
              {(!payload?.latest_events || payload.latest_events.length === 0) && (
                <div className="empty">No timeline events yet.</div>
              )}
            </div>
          </article>

          <article className="card">
            <div className="sectionTitle">Alerts</div>
            {payload?.alerts && payload.alerts.length > 0 ? (
              <ul className="alertList">
                {payload.alerts.map((alert) => (
                  <li key={alert}>{alert}</li>
                ))}
              </ul>
            ) : (
              <div className="empty">No active alerts.</div>
            )}
          </article>

          <article className="card actionDock">
            <div className="sectionTitle">Read-only Actions</div>
            <div className="buttonRow">
              <button onClick={handleRefresh} disabled={loadingAction !== null}>
                {loadingAction === "refresh" ? "Refreshing…" : "Refresh Mission"}
              </button>
              <button
                onClick={handleLoadEvents}
                disabled={loadingAction !== null || !latestSession?.session_id}
              >
                {loadingAction === "events" ? "Loading…" : "Load Session Events"}
              </button>
              <button onClick={handleAskReview} disabled={loadingAction !== null}>
                {loadingAction === "review" ? "Asking…" : "Ask for Review"}
              </button>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
