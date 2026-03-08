import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePipelineStore } from "./stores/pipelineStore";
import { connectWebSocket, disconnectWebSocket } from "./lib/ws";
import type { LoopEvent } from "./lib/ws";
import {
  connectMonitorSocket,
  disconnectMonitorSocket,
  type MonitorCompletion,
  type MonitorCostUpdate,
  type MonitorPipelineStage,
  type MonitorSessionStart,
  type MonitorStuckAlert,
  type MonitorToolEvent,
} from "./lib/monitor";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useMicLevel } from "./hooks/useMicLevel";
import { AppShell } from "./components/AppShell";
import { Header } from "./components/Header";
import { ClarificationDialog } from "./components/ClarificationDialog";
import { AudioPreview } from "./components/AudioPreview";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { ToastContainer } from "./components/Toast";
import { TransformationCanvas } from "./components/TransformationCanvas";
import { SupportRail } from "./components/SupportRail";
import { DetailShelf } from "./components/DetailShelf";
import { deriveCanvasState } from "./lib/mission";
import type { QueueItem } from "./stores/pipelineStore";
import railStyles from "./styles/components/SupportRail.module.css";

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function buildConnectionHelpMessage(serverUrl: string): string {
  const target = normalizeUrl(serverUrl) || "<empty>";
  return `Cannot reach backend at ${target}. Check Settings and make sure the backend is reachable from this Mac.`;
}

function formatRequestError(err: unknown, serverUrl: string): string {
  const raw = String(err);
  if (
    raw.includes("HTTP request failed") ||
    raw.includes("error sending request for url") ||
    raw.includes("Connection refused") ||
    raw.includes("timed out")
  ) {
    return buildConnectionHelpMessage(serverUrl);
  }

  return `Request failed: ${raw}`;
}

function defaultMissionError(): string {
  return "Couldn’t create the mission. Check Details and try again.";
}

function buildLoopMonitorUrl(
  monitorUrl: string,
  sessionId: string | null,
  ticketKey: string | null,
): string | null {
  const base = normalizeUrl(monitorUrl);
  if (!base) return null;

  try {
    const url = new URL(base);
    if (sessionId) {
      url.searchParams.set("session_id", sessionId);
    }
    if (ticketKey) {
      url.searchParams.set("ticket_key", ticketKey);
    }
    return url.toString();
  } catch {
    return base;
  }
}

async function checkBackendHealth(
  serverUrl: string,
): Promise<{ ok: boolean; detail: string }> {
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
  } catch (err) {
    return { ok: false, detail: String(err) };
  } finally {
    clearTimeout(timeout);
  }
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

async function fetchLoopQueue(serverUrl: string): Promise<QueueItem[]> {
  const base = normalizeUrl(serverUrl);
  if (!base) return [];

  const resp = await fetch(`${base}/api/loop/queue`);
  if (!resp.ok) {
    throw new Error(`Queue returned HTTP ${resp.status}`);
  }

  return normalizeQueueItems(await resp.json());
}

function App() {
  const {
    status,
    transcription,
    errorMessage,
    log,
    serverUrl,
    monitorUrl,
    clarification,
    latestSessionId,
    monitorConnected,
    activeStage,
    gates,
    completion,
    commandCenterEvents,
    loopEvents,
    queueItems,
    stuckAlert,
    toasts,
    processingStep,
    pendingSamples,
    ticketResult,
    wsConnected,
    setStatus,
    setTranscription,
    setErrorMessage,
    appendLog,
    setServerUrl,
    setMonitorUrl,
    clearClarification,
    setClarification,
    addCommandCenterEvent,
    setLatestSessionId,
    setMonitorConnected,
    setActiveStage,
    upsertGate,
    setCompletion,
    setCost,
    setStuckAlert,
    addToast,
    removeToast,
    setProcessingStep,
    setPendingSamples,
    setQueueItems,
    setTicketResult,
    resetRunState,
  } = usePipelineStore();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const serverUrlRef = useRef(serverUrl);
  const monitorUrlRef = useRef(monitorUrl);
  const wasBackendReachableRef = useRef<boolean | null>(null);
  const lastHealthCheckUrlRef = useRef("");

  serverUrlRef.current = serverUrl;
  monitorUrlRef.current = monitorUrl;

  const micLevels = useMicLevel(status === "recording");
  const canvasState = deriveCanvasState({
    status,
    ticket: ticketResult,
    activeStage,
    completion,
    stuckAlert,
  });
  const headerBadge = (() => {
    switch (canvasState.phase) {
      case "listening":
        return { label: "Listening", tone: "recording" as const };
      case "processing":
        return {
          label: status === "previewing" ? "Review" : "Preparing",
          tone: status === "previewing" ? ("previewing" as const) : ("processing" as const),
        };
      case "clarifying":
        return { label: "Need detail", tone: "clarifying" as const };
      case "queued":
        return { label: "Queued", tone: "queued" as const };
      case "running":
        return { label: "Running", tone: "running" as const };
      case "blocked":
        return { label: "Blocked", tone: "blocked" as const };
      case "done":
        return { label: "Done", tone: "done" as const };
      default:
        return { label: "Ready", tone: "idle" as const };
    }
  })();

  const refreshQueue = useCallback(async () => {
    try {
      const items = await fetchLoopQueue(serverUrlRef.current);
      setQueueItems(items);
    } catch (err) {
      appendLog(`[client] Queue refresh failed: ${String(err)}`);
    }
  }, [appendLog, setQueueItems]);

  useEffect(() => {
    connectWebSocket(
      () => serverUrlRef.current,
      appendLog,
      (nextStatus) => {
        const store = usePipelineStore.getState();
        store.setStatus(nextStatus);

        if (nextStatus === "done") {
          store.setErrorMessage(null);
          if (!store.ticketResult) {
            store.addToast("success", "Mission processing completed");
          }
        } else if (nextStatus === "error") {
          if (!store.errorMessage) {
            store.setErrorMessage(defaultMissionError());
          }
          store.addToast("error", "Pipeline encountered an error");
        }
      },
      (step) => {
        usePipelineStore.getState().setProcessingStep(step);
      },
      (connected) => {
        usePipelineStore.getState().setWsConnected(connected);
      },
      (data) => {
        const store = usePipelineStore.getState();
        store.setLatestSessionId(data.session_id);
        store.setErrorMessage(null);
        store.setClarification({
          sessionId: data.session_id,
          questions: data.questions,
          partialSummary: data.partial_summary,
          round: data.round,
        });
      },
      (event: LoopEvent) => {
        const timestamp = new Date().toLocaleTimeString();
        usePipelineStore.getState().addLoopEvent({
          type: event.type,
          issueKey: event.issue_key,
          summary: event.summary,
          success: event.success,
          timestamp,
        });
        usePipelineStore.getState().addCommandCenterEvent({
          id: `loop-${timestamp}-${event.type}-${event.issue_key}`,
          timestamp,
          kind: "loop",
          severity:
            event.type === "loop_completed" && event.success === false
              ? "error"
              : event.type === "loop_completed"
                ? "success"
                : "info",
          title:
            event.type === "ticket_queued"
              ? `Queued ${event.issue_key}`
              : event.type === "loop_started"
                ? `Loop started for ${event.issue_key}`
                : `Loop ${event.success ? "completed" : "failed"} for ${event.issue_key}`,
          detail: event.summary,
        });
      },
    );

    return () => disconnectWebSocket();
  }, [appendLog]);

  useEffect(() => {
    function monitorMatchesSession(sessionId: string | null, ticketId: string | null) {
      const state = usePipelineStore.getState();
      if (state.latestSessionId && sessionId) {
        return state.latestSessionId === sessionId;
      }
      if (state.ticketResult?.key && ticketId) {
        return state.ticketResult.key === ticketId;
      }
      return true;
    }

    function pushMonitorEvent(
      title: string,
      detail: string | undefined,
      severity: "info" | "success" | "warning" | "error" = "info",
    ) {
      usePipelineStore.getState().addCommandCenterEvent({
        id: `monitor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toLocaleTimeString(),
        kind: "monitor",
        severity,
        title,
        detail,
      });
    }

    connectMonitorSocket(() => monitorUrlRef.current, {
      appendLog,
      onConnectionChange: (connected) => {
        setMonitorConnected(connected);
      },
      onToolEvent: (event: MonitorToolEvent) => {
        if (!monitorMatchesSession(event.session_id, event.ticket_id)) return;
        pushMonitorEvent(
          `${event.tool_name} ${event.success === false ? "failed" : "ran"}`,
          event.tool_args_summary || event.error || undefined,
          event.success === false ? "error" : "info",
        );
      },
      onCostUpdate: (monitorCost: MonitorCostUpdate) => {
        if (!monitorMatchesSession(monitorCost.session_id, null)) return;
        setCost(monitorCost);
      },
      onStuckAlert: (alert: MonitorStuckAlert) => {
        setStuckAlert(alert);
        pushMonitorEvent(
          "Potential stuck loop detected",
          `${alert.pattern} repeated ${alert.repeat_count} times`,
          "warning",
        );
      },
      onSessionStart: (session: MonitorSessionStart) => {
        if (!monitorMatchesSession(session.session_id, session.ticket_id)) return;
        usePipelineStore.getState().setLatestSessionId(session.session_id);
        pushMonitorEvent(
          "Agent session started",
          session.ticket_id ? `Ticket ${session.ticket_id}` : session.session_id,
          "info",
        );
      },
      onSessionComplete: (monitorCompletion: MonitorCompletion) => {
        if (
          !monitorMatchesSession(
            monitorCompletion.session_id,
            monitorCompletion.ticket_id,
          )
        ) {
          return;
        }
        setCompletion(monitorCompletion);
        pushMonitorEvent(
          `Agent session ${monitorCompletion.outcome}`,
          monitorCompletion.pr_url || monitorCompletion.pytest_summary || undefined,
          monitorCompletion.outcome === "done" ? "success" : "warning",
        );
      },
      onPipelineStage: (stage: MonitorPipelineStage) => {
        setActiveStage(stage.active ? stage.stage : null);
        upsertGate({
          nodeId: stage.stage,
          status: stage.active ? "running" : "passed",
          updatedAt: new Date().toISOString(),
          message: stage.active ? "Active" : "Completed",
        });
        pushMonitorEvent(
          stage.active ? `Stage active: ${stage.stage}` : `Stage complete: ${stage.stage}`,
          undefined,
          stage.active ? "info" : "success",
        );
      },
    });

    return () => disconnectMonitorSocket();
  }, [
    appendLog,
    setActiveStage,
    setCompletion,
    setCost,
    setMonitorConnected,
    setStuckAlert,
    upsertGate,
  ]);

  useEffect(() => {
    void refreshQueue();
    const intervalId = window.setInterval(() => {
      void refreshQueue();
    }, 10_000);

    return () => window.clearInterval(intervalId);
  }, [refreshQueue]);

  useEffect(() => {
    if (!ticketResult && !completion && loopEvents.length === 0) return;
    void refreshQueue();
  }, [ticketResult, completion, loopEvents.length, refreshQueue]);

  useEffect(() => {
    if (settingsOpen) return;
    const normalized = normalizeUrl(serverUrl);
    if (!normalized || normalized === lastHealthCheckUrlRef.current) return;

    const timer = setTimeout(async () => {
      const result = await checkBackendHealth(serverUrl);
      lastHealthCheckUrlRef.current = normalized;

      if (result.ok) {
        if (wasBackendReachableRef.current === false) {
          addToast("success", `Connected to backend: ${normalized}`);
        }
        wasBackendReachableRef.current = true;
        appendLog(`[client] Backend reachable: ${normalized}`);
      } else {
        if (wasBackendReachableRef.current !== false) {
          addToast("error", buildConnectionHelpMessage(serverUrl));
        }
        wasBackendReachableRef.current = false;
        appendLog(`[client] Backend health check failed: ${result.detail}`);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [serverUrl, settingsOpen, addToast, appendLog]);

  const ensureBackendAvailable = useCallback(
    async (operation: string): Promise<boolean> => {
      const result = await checkBackendHealth(serverUrl);
      if (result.ok) return true;

      const message = buildConnectionHelpMessage(serverUrl);
      appendLog(`[client] Backend unavailable while ${operation}: ${result.detail}`);
      addToast("error", message);
      return false;
    },
    [serverUrl, appendLog, addToast],
  );

  const handleRecordAnother = useCallback(() => {
    resetRunState();
  }, [resetRunState]);

  const handleToggle = useCallback(async () => {
    if (status === "recording") {
      try {
        appendLog("[client] Stopping mic...");
        const samples: number[] = await invoke("stop_mic");
        appendLog(`[client] Captured ${samples.length} samples`);
        setErrorMessage(null);
        setPendingSamples(samples);
        setStatus("previewing");
      } catch (err) {
        const message = `Couldn’t finish recording. ${String(err)}`;
        appendLog(`[client] Error: ${err}`);
        setErrorMessage(message);
        setStatus("error");
        addToast("error", message);
      }
      return;
    }

    if (status === "idle" || status === "done" || status === "error") {
      try {
        resetRunState();
        appendLog("[client] Starting mic...");
        await invoke("start_mic");
        setStatus("recording");
        appendLog("[client] Recording...");
      } catch (err) {
        const message = `Couldn’t start recording. ${String(err)}`;
        appendLog(`[client] Error: ${err}`);
        setErrorMessage(message);
        setStatus("error");
        addToast("error", message);
      }
    }
  }, [
    status,
    appendLog,
    setErrorMessage,
    setPendingSamples,
    setStatus,
    addToast,
    resetRunState,
  ]);

  const handleSendAudio = useCallback(async () => {
    if (!pendingSamples) return;

    const samples = pendingSamples;
    setErrorMessage(null);
    setStatus("processing");
    setProcessingStep("Sending audio...");
    appendLog(`[client] Sending ${samples.length} samples...`);

    try {
      const backendOk = await ensureBackendAvailable("sending audio");
      if (!backendOk) {
        setStatus("previewing");
        setProcessingStep("");
        return;
      }

      const result = await invoke<Record<string, unknown>>("send_audio", {
        samples,
        serverUrl,
      });

      const endpointUsed =
        typeof result._endpoint_used === "string"
          ? result._endpoint_used
          : "unknown";

      const transcribedText =
        typeof result.transcribed_text === "string"
          ? result.transcribed_text
          : typeof result.text === "string"
            ? result.text
            : "";
      if (transcribedText) {
        setTranscription(transcribedText);
      }

      if (result.status === "clarification_needed") {
        const sessionId =
          typeof result.session_id === "string" ? result.session_id : "";
        const questions = Array.isArray(result.questions)
          ? result.questions.filter((question): question is string => typeof question === "string")
          : [];
        const partialSummary =
          typeof result.partial_summary === "string"
            ? result.partial_summary
            : "";
        const round = typeof result.round === "number" ? result.round : 1;

        if (!sessionId || questions.length === 0) {
          const message =
            "Couldn’t continue this mission. The clarification response was invalid.";
          appendLog(
            `[client] Invalid clarification payload (${endpointUsed}): ${JSON.stringify(result)}`,
          );
          setErrorMessage(message);
          setStatus("error");
          addToast("error", message);
          return;
        }

        setClarification({
          sessionId,
          questions,
          partialSummary,
          round,
        });
        setPendingSamples(null);
        setLatestSessionId(sessionId);
        appendLog(`[client] Clarification needed (${endpointUsed})`);
        return;
      }

      const ticketKey =
        typeof result.ticket_key === "string" ? result.ticket_key : "";
      const ticketUrl =
        typeof result.ticket_url === "string" ? result.ticket_url : "";
      const summary =
        typeof result.summary === "string" ? result.summary : ticketKey;
      const sessionId =
        typeof result.session_id === "string" ? result.session_id : null;

      if (ticketKey && ticketUrl) {
        clearClarification();
        setErrorMessage(null);
        setProcessingStep("");
        setPendingSamples(null);
        setTicketResult({
          key: ticketKey,
          url: ticketUrl,
          summary: summary || ticketKey,
        });
        setLatestSessionId(sessionId);
        addCommandCenterEvent({
          id: `voice-success-${ticketKey}`,
          timestamp: new Date().toLocaleTimeString(),
          kind: "voice",
          severity: "success",
          title: `Ticket created: ${ticketKey}`,
          detail: sessionId ? `Session ${sessionId}` : summary || ticketKey,
        });
        appendLog(`[client] Ticket created: ${ticketKey} — ${ticketUrl}`);
        setStatus("done");
        addToast("success", `Mission created: ${ticketKey}`);
        return;
      }

      if (typeof result.text === "string") {
        const message =
          "The objective was transcribed, but the mission was not created.";
        appendLog(`[client] Transcription received (${endpointUsed})`);
        setProcessingStep("");
        setErrorMessage(message);
        setStatus("error");
        addToast("error", message);
        return;
      }

      const message =
        "Couldn’t create the mission. The server returned an unexpected response.";
      appendLog(
        `[client] Unexpected response payload (${endpointUsed}): ${JSON.stringify(result)}`,
      );
      setErrorMessage(message);
      setStatus("error");
      addToast("error", message);
    } catch (err) {
      const message = formatRequestError(err, serverUrl);
      appendLog(`[client] Error: ${err}`);
      setErrorMessage(message);
      setStatus("error");
      addToast("error", message);
    }
  }, [
    pendingSamples,
    serverUrl,
    appendLog,
    setErrorMessage,
    setStatus,
    setProcessingStep,
    ensureBackendAvailable,
    setPendingSamples,
    setTranscription,
    setClarification,
    setLatestSessionId,
    clearClarification,
    setTicketResult,
    addCommandCenterEvent,
    addToast,
  ]);

  const handleDiscardAudio = useCallback(() => {
    setPendingSamples(null);
    setProcessingStep("");
    setErrorMessage(null);
    setStatus("idle");
    appendLog("[client] Recording discarded");
    addToast("info", "Recording discarded");
  }, [
    setPendingSamples,
    setProcessingStep,
    setErrorMessage,
    setStatus,
    appendLog,
    addToast,
  ]);

  const handleClarifySubmit = useCallback(
    async (answer: string) => {
      if (!clarification) return;

      const backendOk = await ensureBackendAvailable("sending clarification");
      if (!backendOk) {
        setStatus("clarifying");
        return;
      }

      appendLog(`[client] Sending clarification: ${answer}`);
      setErrorMessage(null);
      setStatus("processing");
      setProcessingStep("Sending clarification...");

      try {
        const resp = await fetch(`${serverUrl}/api/pipeline/clarify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: clarification.sessionId,
            text: answer,
          }),
        });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const data = await resp.json();

        if (data.status === "clarification_needed") {
          usePipelineStore.getState().setLatestSessionId(data.session_id);
          setClarification({
            sessionId: data.session_id,
            questions: data.questions,
            partialSummary: data.partial_summary,
            round: data.round,
          });
          appendLog(`[client] More clarification needed (round ${data.round})`);
          return;
        }

        clearClarification();
        setProcessingStep("");

        if (data.ticket_key && data.ticket_url) {
          setTicketResult({
            key: data.ticket_key,
            url: data.ticket_url,
            summary: data.summary || data.ticket_summary || data.ticket_key,
          });
          setLatestSessionId(
            typeof data.session_id === "string" ? data.session_id : null,
          );
          addCommandCenterEvent({
            id: `clarify-success-${data.ticket_key}`,
            timestamp: new Date().toLocaleTimeString(),
            kind: "voice",
            severity: "success",
            title: `Ticket created: ${data.ticket_key}`,
            detail:
              typeof data.session_id === "string"
                ? `Session ${data.session_id}`
                : data.summary || data.ticket_key,
          });
          appendLog(
            `[client] Ticket created: ${data.ticket_key} — ${data.ticket_url}`,
          );
          setStatus("done");
          addToast("success", `Mission created: ${data.ticket_key}`);
          return;
        }

        const message =
          "Couldn’t create the mission. The clarification response was incomplete.";
        setErrorMessage(message);
        setStatus("error");
        addToast("error", message);
      } catch (err) {
        const message = formatRequestError(err, serverUrl);
        appendLog(`[client] Clarification error: ${err}`);
        setErrorMessage(message);
        setStatus("error");
        addToast("error", message);
      }
    },
    [
      clarification,
      ensureBackendAvailable,
      appendLog,
      setErrorMessage,
      setStatus,
      setProcessingStep,
      serverUrl,
      setClarification,
      clearClarification,
      setTicketResult,
      setLatestSessionId,
      addCommandCenterEvent,
      addToast,
    ],
  );

  const handleClarifySkip = useCallback(() => {
    clearClarification();
    setErrorMessage(null);
    setProcessingStep("");
    setStatus("idle");
    appendLog("[client] Clarification skipped");
    addToast("info", "Clarification skipped");
  }, [
    clearClarification,
    setErrorMessage,
    setProcessingStep,
    setStatus,
    appendLog,
    addToast,
  ]);

  const handleRetry = useCallback(() => {
    if (pendingSamples) {
      void handleSendAudio();
      return;
    }
    handleRecordAnother();
  }, [pendingSamples, handleSendAudio, handleRecordAnother]);

  const loopMonitorUrl = buildLoopMonitorUrl(
    monitorUrl,
    latestSessionId,
    ticketResult?.key ?? null,
  );

  useKeyboardShortcuts({
    onToggleRecord: handleToggle,
    onEscape: () => {
      if (settingsOpen) {
        setSettingsOpen(false);
      } else if (clarification) {
        handleClarifySkip();
      }
    },
  });

  return (
    <AppShell>
      <Header
        status={status}
        statusLabel={headerBadge.label}
        statusTone={headerBadge.tone}
        onSettingsClick={() => setSettingsOpen(true)}
      />
      <div className={railStyles.surface}>
        <TransformationCanvas
          status={status}
          canvasState={canvasState}
          processingStep={processingStep}
          ticket={ticketResult}
          errorMessage={errorMessage}
          micLevels={micLevels}
          wsConnected={wsConnected}
          monitorConnected={monitorConnected}
          sessionId={latestSessionId}
          activeStage={activeStage}
          gates={gates}
          completion={completion}
          stuckAlert={stuckAlert}
          loopMonitorUrl={loopMonitorUrl}
          onToggleRecord={handleToggle}
          onRetry={handleRetry}
          onRecordAnother={handleRecordAnother}
          onOpenSettings={() => setSettingsOpen(true)}
        >
          {status === "previewing" && pendingSamples ? (
            <AudioPreview
              samples={pendingSamples}
              onSend={handleSendAudio}
              onDiscard={handleDiscardAudio}
            />
          ) : null}
          {clarification ? (
            <ClarificationDialog
              questions={clarification.questions}
              partialSummary={clarification.partialSummary}
              round={clarification.round}
              disabled={status === "processing"}
              onSubmit={handleClarifySubmit}
              onSkip={handleClarifySkip}
            />
          ) : null}
        </TransformationCanvas>

        <SupportRail
          queueItems={queueItems}
          events={commandCenterEvents}
          ticket={ticketResult}
          completion={completion}
          loopMonitorUrl={loopMonitorUrl}
        />
      </div>

      <DetailShelf
        transcription={transcription}
        detailsEntries={log}
      />

      <SettingsDrawer
        open={settingsOpen}
        serverUrl={serverUrl}
        monitorUrl={monitorUrl}
        onServerUrlChange={setServerUrl}
        onMonitorUrlChange={setMonitorUrl}
        onClose={() => setSettingsOpen(false)}
      />

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </AppShell>
  );
}

export default App;
