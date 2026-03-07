import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePipelineStore } from "./stores/pipelineStore";
import { connectWebSocket, disconnectWebSocket } from "./lib/ws";
import type { LoopEvent } from "./lib/ws";
import { deriveMissionState } from "./lib/mission";
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
import { LogPanel } from "./components/LogPanel";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { ToastContainer } from "./components/Toast";
import { CommandCenterView } from "./components/CommandCenterView";
import { LaunchSequenceView } from "./components/LaunchSequenceView";

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function buildConnectionHelpMessage(serverUrl: string): string {
  const target = normalizeUrl(serverUrl) || "<empty>";
  return `Cannot reach backend at ${target}. Check Settings -> Server URL and ensure the backend is reachable from this Mac.`;
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

async function checkBackendHealth(serverUrl: string): Promise<{ ok: boolean; detail: string }> {
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

function App() {
  const {
    appMode,
    previousAppMode,
    status,
    transcription,
    log,
    serverUrl,
    monitorUrl,
    clarification,
    commandCenterEvents,
    latestSessionId,
    monitorConnected,
    activeStage,
    gates,
    completion,
    cost,
    stuckAlert,
    toasts,
    processingStep,
    pendingSamples,
    ticketResult,
    wsConnected,
    setAppMode,
    setStatus,
    setTranscription,
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
    setTicketResult,
  } = usePipelineStore();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const serverUrlRef = useRef(serverUrl);
  const monitorUrlRef = useRef(monitorUrl);
  const wasBackendReachableRef = useRef<boolean | null>(null);
  const lastHealthCheckUrlRef = useRef("");
  serverUrlRef.current = serverUrl;
  monitorUrlRef.current = monitorUrl;
  const effectiveAppMode =
    appMode === "clarification_overlay" ? previousAppMode : appMode;
  const mission = deriveMissionState({
    status,
    ticket: ticketResult,
    activeStage,
    completion,
    stuckAlert,
  });

  useEffect(() => {
    if (appMode === "voice" && status === "done" && ticketResult) {
      setAppMode("command_center");
    }
  }, [appMode, status, ticketResult, setAppMode]);

  // Mic level visualization
  const micLevels = useMicLevel(status === "recording");

  useEffect(() => {
    connectWebSocket(
      () => serverUrlRef.current,
      appendLog,
      (s) => {
        const store = usePipelineStore.getState();
        store.setStatus(s);

        // Trigger toast on completion/error from WS
        if (s === "done") {
          store.addToast("success", "Pipeline completed successfully");
        } else if (s === "error") {
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
        usePipelineStore.getState().setLatestSessionId(data.session_id);
        usePipelineStore.getState().setClarification({
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

      const msg = buildConnectionHelpMessage(serverUrl);
      appendLog(`[client] Backend unavailable while ${operation}: ${result.detail}`);
      addToast("error", msg);
      return false;
    },
    [serverUrl, appendLog, addToast],
  );

  const handleToggle = useCallback(async () => {
    if (status === "recording") {
      try {
        appendLog("[client] Stopping mic...");
        const samples: number[] = await invoke("stop_mic");
        appendLog(`[client] Captured ${samples.length} samples`);

        // Show preview instead of sending immediately
        setPendingSamples(samples);
        setStatus("previewing");
      } catch (err) {
        appendLog(`[client] Error: ${err}`);
        setStatus("error");
        addToast("error", `Recording failed: ${err}`);
      }
    } else if (status === "idle" || status === "done" || status === "error") {
      try {
        // Reset state for new recording
        setTicketResult(null);
        setProcessingStep("");
        appendLog("[client] Starting mic...");
        await invoke("start_mic");
        setStatus("recording");
        appendLog("[client] Recording...");
      } catch (err) {
        appendLog(`[client] Error: ${err}`);
        setStatus("error");
        addToast("error", `Failed to start recording: ${err}`);
      }
    }
  }, [
    status,
    appendLog,
    setStatus,
    setPendingSamples,
    addToast,
    setTicketResult,
    setProcessingStep,
  ]);

  const handleSendAudio = useCallback(async () => {
    if (!pendingSamples) return;

    const samples = pendingSamples;
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

      setPendingSamples(null);

      const result = await invoke<Record<string, unknown>>(
        "send_audio",
        { samples, serverUrl },
      );

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
          ? result.questions.filter((q): q is string => typeof q === "string")
          : [];
        const partialSummary =
          typeof result.partial_summary === "string"
            ? result.partial_summary
            : "";
        const round = typeof result.round === "number" ? result.round : 1;

        if (!sessionId || questions.length === 0) {
          appendLog(
            `[client] Invalid clarification payload (${endpointUsed}): ${JSON.stringify(result)}`,
          );
          setStatus("error");
          addToast("error", "Invalid clarification response from server");
          return;
        }

        setClarification({
          sessionId,
          questions,
          partialSummary,
          round,
        });
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
        setProcessingStep("");
        setTicketResult({
          key: ticketKey,
          url: ticketUrl,
          summary: summary || ticketKey,
        });
        setLatestSessionId(sessionId);
        setAppMode("command_center");
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
        addToast("success", `Ticket ${ticketKey} created`);
        return;
      }

      if (typeof result.text === "string") {
        appendLog(`[client] Transcription received (${endpointUsed})`);
        // Don't set "done" here in pipeline mode — wait for WS completion.
        // In fallback mode (/api/transcribe), this is our completion signal.
        setStatus("done");
        return;
      }

      appendLog(
        `[client] Unexpected response payload (${endpointUsed}): ${JSON.stringify(result)}`,
      );
      setStatus("error");
      addToast("error", "Unexpected server response");
    } catch (err) {
      appendLog(`[client] Error: ${err}`);
      setStatus("error");
      addToast("error", formatRequestError(err, serverUrl));
    }
  }, [
    pendingSamples,
    serverUrl,
    appendLog,
    setStatus,
    setTranscription,
    setPendingSamples,
    setProcessingStep,
    addToast,
    setClarification,
    clearClarification,
    setTicketResult,
    setLatestSessionId,
    setAppMode,
    addCommandCenterEvent,
    ensureBackendAvailable,
  ]);

  const handleDiscardAudio = useCallback(() => {
    setPendingSamples(null);
    setStatus("idle");
    appendLog("[client] Recording discarded");
    addToast("info", "Recording discarded");
  }, [setPendingSamples, setStatus, appendLog, addToast]);

  const handleClarifySubmit = async (answer: string) => {
    if (!clarification) return;

    const backendOk = await ensureBackendAvailable("sending clarification");
    if (!backendOk) {
      setStatus("clarifying");
      return;
    }

    appendLog(`[client] Sending clarification: ${answer}`);
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
      } else {
        clearClarification();
        setProcessingStep("");

        // Store ticket result
        if (data.ticket_key && data.ticket_url) {
          setTicketResult({
            key: data.ticket_key,
            url: data.ticket_url,
            summary: data.summary || data.ticket_summary || data.ticket_key,
          });
          setLatestSessionId(
            typeof data.session_id === "string" ? data.session_id : null,
          );
          setAppMode("command_center");
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
        }

        appendLog(
          `[client] Ticket created: ${data.ticket_key} — ${data.ticket_url}`,
        );
        setStatus("done");
        addToast("success", `Ticket ${data.ticket_key} created`);
      }
    } catch (err) {
      appendLog(`[client] Clarification error: ${err}`);
      setStatus("error");
      addToast("error", formatRequestError(err, serverUrl));
    }
  };

  const handleClarifySkip = () => {
    clearClarification();
    setStatus("idle");
    appendLog("[client] Clarification skipped");
    addToast("info", "Clarification skipped");
  };

  const handleSkipToCommandCenter = () => {
    setAppMode("command_center");
    addCommandCenterEvent({
      id: `system-skip-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      kind: "system",
      severity: "info",
      title: "Opened command center",
      detail: "Manual skip from voice start",
    });
  };

  const handleBackToVoice = () => {
    setAppMode("voice");
  };

  // Keyboard shortcuts
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
        wsConnected={wsConnected}
        onSettingsClick={() => setSettingsOpen(true)}
      />

      {effectiveAppMode === "voice" ? (
        <LaunchSequenceView
          mission={mission}
          status={status}
          processingStep={processingStep}
          transcription={transcription}
          micLevels={micLevels}
          wsConnected={wsConnected}
          monitorConnected={monitorConnected}
          onToggleRecord={handleToggle}
          onSkipToCommandCenter={handleSkipToCommandCenter}
        >
          {status === "previewing" && pendingSamples ? (
            <AudioPreview
              samples={pendingSamples}
              onSend={handleSendAudio}
              onDiscard={handleDiscardAudio}
            />
          ) : null}
        </LaunchSequenceView>
      ) : (
        <CommandCenterView
          ticket={ticketResult}
          sessionId={latestSessionId}
          status={status}
          processingStep={processingStep}
          wsConnected={wsConnected}
          monitorConnected={monitorConnected}
          activeStage={activeStage}
          gates={gates}
          events={commandCenterEvents}
          completion={completion}
          cost={cost}
          stuckAlert={stuckAlert}
          onBackToVoice={handleBackToVoice}
        />
      )}

      {/* Clarification dialog */}
      {clarification && (
        <ClarificationDialog
          questions={clarification.questions}
          partialSummary={clarification.partialSummary}
          round={clarification.round}
          disabled={status === "processing"}
          onSubmit={handleClarifySubmit}
          onSkip={handleClarifySkip}
        />
      )}

      <LogPanel entries={log} />

      <SettingsDrawer
        open={settingsOpen}
        serverUrl={serverUrl}
        monitorUrl={monitorUrl}
        onServerUrlChange={setServerUrl}
        onMonitorUrlChange={setMonitorUrl}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Toast overlay */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </AppShell>
  );
}

export default App;
