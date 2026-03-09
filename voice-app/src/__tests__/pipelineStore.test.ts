import { describe, it, expect, beforeEach } from "vitest";
import { usePipelineStore } from "../stores/pipelineStore";
import type { PipelineStatus } from "../stores/pipelineStore";

// Reset store between tests
function resetStore() {
  usePipelineStore.setState({
    appMode: "voice",
    previousAppMode: "voice",
    status: "idle",
    transcription: "",
    errorMessage: null,
    log: [],
    serverUrl: "http://localhost:8000",
    monitorUrl: "http://localhost:8110",
    clarification: null,
    loopEvents: [],
    commandCenterEvents: [],
    latestSessionId: null,
    monitorConnected: false,
    activeStage: null,
    gates: [],
    completion: null,
    cost: null,
    stuckAlert: null,
    toasts: [],
    processingStep: "",
    pendingSamples: null,
    ticketResult: null,
    wsConnected: false,
  });
}

describe("pipelineStore", () => {
  beforeEach(() => {
    resetStore();
    window.localStorage.clear();
  });

  describe("initial state", () => {
    it("should start in voice mode", () => {
      const state = usePipelineStore.getState();
      expect(state.appMode).toBe("voice");
    });

    it("should have idle status by default", () => {
      const state = usePipelineStore.getState();
      expect(state.status).toBe("idle");
    });

    it("should start with empty transcription", () => {
      const state = usePipelineStore.getState();
      expect(state.transcription).toBe("");
    });

    it("should start with no error message", () => {
      const state = usePipelineStore.getState();
      expect(state.errorMessage).toBeNull();
    });

    it("should start with empty log", () => {
      const state = usePipelineStore.getState();
      expect(state.log).toEqual([]);
    });

    it("should start with no toasts", () => {
      const state = usePipelineStore.getState();
      expect(state.toasts).toEqual([]);
    });

    it("should start with wsConnected false", () => {
      const state = usePipelineStore.getState();
      expect(state.wsConnected).toBe(false);
    });

    it("should start with the local monitor default", () => {
      const state = usePipelineStore.getState();
      expect(state.monitorUrl).toBe("http://localhost:8110");
    });
  });

  describe("app mode and session handoff", () => {
    it("should switch into command center mode", () => {
      usePipelineStore.getState().setAppMode("command_center");
      expect(usePipelineStore.getState().appMode).toBe("command_center");
      expect(usePipelineStore.getState().previousAppMode).toBe(
        "command_center",
      );
    });

    it("should keep current app mode while clarification is active", () => {
      usePipelineStore.getState().setAppMode("command_center");
      usePipelineStore.getState().setClarification({
        sessionId: "sess-123",
        questions: ["What broke?"],
        partialSummary: "Need details",
        round: 1,
      });

      expect(usePipelineStore.getState().appMode).toBe("command_center");

      usePipelineStore.getState().clearClarification();

      expect(usePipelineStore.getState().appMode).toBe("command_center");
    });

    it("should store the latest session id", () => {
      usePipelineStore.getState().setLatestSessionId("sess-42");
      expect(usePipelineStore.getState().latestSessionId).toBe("sess-42");
    });
  });

  describe("setStatus", () => {
    it("should update status to recording", () => {
      usePipelineStore.getState().setStatus("recording");
      expect(usePipelineStore.getState().status).toBe("recording");
    });

    it("should cycle through all valid statuses", () => {
      const statuses: PipelineStatus[] = [
        "idle",
        "recording",
        "processing",
        "clarifying",
        "previewing",
        "done",
        "error",
      ];
      for (const s of statuses) {
        usePipelineStore.getState().setStatus(s);
        expect(usePipelineStore.getState().status).toBe(s);
      }
    });
  });

  describe("setTranscription", () => {
    it("should update transcription text", () => {
      usePipelineStore.getState().setTranscription("Hello world");
      expect(usePipelineStore.getState().transcription).toBe("Hello world");
    });

    it("should handle empty string", () => {
      usePipelineStore.getState().setTranscription("Some text");
      usePipelineStore.getState().setTranscription("");
      expect(usePipelineStore.getState().transcription).toBe("");
    });
  });

  describe("setErrorMessage", () => {
    it("should update the error message", () => {
      usePipelineStore.getState().setErrorMessage("Something broke");
      expect(usePipelineStore.getState().errorMessage).toBe("Something broke");
    });

    it("should clear the error message with null", () => {
      usePipelineStore.getState().setErrorMessage("Something broke");
      usePipelineStore.getState().setErrorMessage(null);
      expect(usePipelineStore.getState().errorMessage).toBeNull();
    });
  });

  describe("appendLog", () => {
    it("should add timestamped entries to the log", () => {
      usePipelineStore.getState().appendLog("Test message");
      const log = usePipelineStore.getState().log;
      expect(log).toHaveLength(1);
      expect(log[0]).toContain("Test message");
      // Verify timestamp prefix pattern [HH:MM:SS]
      expect(log[0]).toMatch(/^\[.*\] Test message$/);
    });

    it("should accumulate multiple log entries", () => {
      usePipelineStore.getState().appendLog("First");
      usePipelineStore.getState().appendLog("Second");
      usePipelineStore.getState().appendLog("Third");
      expect(usePipelineStore.getState().log).toHaveLength(3);
    });
  });

  describe("setServerUrl", () => {
    it("should update server URL", () => {
      usePipelineStore.getState().setServerUrl("http://example.com:9000");
      expect(usePipelineStore.getState().serverUrl).toBe(
        "http://example.com:9000",
      );
    });

    it("should persist server URL to localStorage", () => {
      usePipelineStore.getState().setServerUrl("http://myserver:8000");
      expect(localStorage.getItem("sejfa-voice-server-url")).toBe(
        "http://myserver:8000",
      );
    });
  });

  describe("setMonitorUrl", () => {
    it("should update and persist monitor URL", () => {
      usePipelineStore.getState().setMonitorUrl("http://monitor.local:8100");

      expect(usePipelineStore.getState().monitorUrl).toBe(
        "http://monitor.local:8100",
      );
      expect(localStorage.getItem("sejfa-monitor-server-url")).toBe(
        "http://monitor.local:8100",
      );
    });
  });

  describe("setClarification / clearClarification", () => {
    it("should set clarification state and switch status to clarifying", () => {
      usePipelineStore.getState().setClarification({
        sessionId: "sess-123",
        questions: ["What priority?", "Which component?"],
        partialSummary: "A bug in the login page",
        round: 1,
      });

      const state = usePipelineStore.getState();
      expect(state.status).toBe("clarifying");
      expect(state.clarification).not.toBeNull();
      expect(state.clarification!.sessionId).toBe("sess-123");
      expect(state.clarification!.questions).toHaveLength(2);
      expect(state.clarification!.round).toBe(1);
    });

    it("should clear clarification state", () => {
      usePipelineStore.getState().setClarification({
        sessionId: "sess-1",
        questions: ["Q1"],
        partialSummary: "Summary",
        round: 1,
      });
      usePipelineStore.getState().clearClarification();
      expect(usePipelineStore.getState().clarification).toBeNull();
    });
  });

  describe("addLoopEvent", () => {
    it("should add loop events to the array", () => {
      usePipelineStore.getState().addLoopEvent({
        type: "ticket_queued",
        issueKey: "DEV-42",
        summary: "Fix login bug",
        timestamp: "12:00:00",
      });

      const events = usePipelineStore.getState().loopEvents;
      expect(events).toHaveLength(1);
      expect(events[0].issueKey).toBe("DEV-42");
      expect(events[0].type).toBe("ticket_queued");
    });

    it("should accumulate multiple events", () => {
      usePipelineStore.getState().addLoopEvent({
        type: "ticket_queued",
        issueKey: "DEV-1",
        timestamp: "12:00:00",
      });
      usePipelineStore.getState().addLoopEvent({
        type: "loop_started",
        issueKey: "DEV-1",
        timestamp: "12:01:00",
      });
      usePipelineStore.getState().addLoopEvent({
        type: "loop_completed",
        issueKey: "DEV-1",
        success: true,
        timestamp: "12:05:00",
      });
      expect(usePipelineStore.getState().loopEvents).toHaveLength(3);
    });
  });

  describe("addToast / removeToast", () => {
    it("should add a toast with auto-generated id", () => {
      usePipelineStore.getState().addToast("success", "Operation complete");
      const toasts = usePipelineStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].type).toBe("success");
      expect(toasts[0].message).toBe("Operation complete");
      expect(toasts[0].id).toMatch(/^toast-/);
    });

    it("should add multiple toasts", () => {
      usePipelineStore.getState().addToast("success", "Done");
      usePipelineStore.getState().addToast("error", "Failed");
      usePipelineStore.getState().addToast("info", "Note");
      expect(usePipelineStore.getState().toasts).toHaveLength(3);
    });

    it("should remove a toast by id", () => {
      usePipelineStore.getState().addToast("info", "Test toast");
      const toastId = usePipelineStore.getState().toasts[0].id;
      usePipelineStore.getState().removeToast(toastId);
      expect(usePipelineStore.getState().toasts).toHaveLength(0);
    });

    it("should only remove the specified toast", () => {
      usePipelineStore.getState().addToast("success", "First");
      usePipelineStore.getState().addToast("error", "Second");
      const firstId = usePipelineStore.getState().toasts[0].id;
      usePipelineStore.getState().removeToast(firstId);
      const remaining = usePipelineStore.getState().toasts;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].message).toBe("Second");
    });
  });

  describe("processing and samples", () => {
    it("should set processing step", () => {
      usePipelineStore.getState().setProcessingStep("Transcribing audio...");
      expect(usePipelineStore.getState().processingStep).toBe(
        "Transcribing audio...",
      );
    });

    it("should set pending samples", () => {
      const samples = [100, -200, 300, -400];
      usePipelineStore.getState().setPendingSamples(samples);
      expect(usePipelineStore.getState().pendingSamples).toEqual(samples);
    });

    it("should clear pending samples with null", () => {
      usePipelineStore.getState().setPendingSamples([1, 2, 3]);
      usePipelineStore.getState().setPendingSamples(null);
      expect(usePipelineStore.getState().pendingSamples).toBeNull();
    });
  });

  describe("ticket result", () => {
    it("should set ticket result", () => {
      const ticket = {
        key: "DEV-42",
        url: "https://jira.example.com/DEV-42",
        summary: "Fix the thing",
      };
      usePipelineStore.getState().setTicketResult(ticket);
      expect(usePipelineStore.getState().ticketResult).toEqual(ticket);
    });

    it("should clear ticket result with null", () => {
      usePipelineStore.getState().setTicketResult({
        key: "DEV-1",
        url: "https://jira.example.com/DEV-1",
        summary: "Test",
      });
      usePipelineStore.getState().setTicketResult(null);
      expect(usePipelineStore.getState().ticketResult).toBeNull();
    });
  });

  describe("wsConnected", () => {
    it("should set WebSocket connected state", () => {
      usePipelineStore.getState().setWsConnected(true);
      expect(usePipelineStore.getState().wsConnected).toBe(true);
      usePipelineStore.getState().setWsConnected(false);
      expect(usePipelineStore.getState().wsConnected).toBe(false);
    });
  });

  describe("resetRunState", () => {
    it("should clear run-specific mission state", () => {
      usePipelineStore.getState().setStatus("done");
      usePipelineStore.getState().setTranscription("Ship it");
      usePipelineStore.getState().setErrorMessage("Nope");
      usePipelineStore.getState().setClarification({
        sessionId: "sess-1",
        questions: ["Why?"],
        partialSummary: "Need context",
        round: 2,
      });
      usePipelineStore.getState().addLoopEvent({
        type: "ticket_queued",
        issueKey: "DEV-77",
        timestamp: "12:00:00",
      });
      usePipelineStore.getState().addCommandCenterEvent({
        id: "evt-1",
        timestamp: "12:00:00",
        kind: "voice",
        severity: "success",
        title: "Ticket created",
      });
      usePipelineStore.getState().setLatestSessionId("sess-1");
      usePipelineStore.getState().setActiveStage("agent");
      usePipelineStore.getState().upsertGate({
        nodeId: "agent",
        status: "running",
        updatedAt: "2026-03-07T10:00:00Z",
      });
      usePipelineStore.getState().setCompletion({
        session_id: "sess-1",
        ticket_id: "DEV-77",
        outcome: "done",
        pytest_summary: null,
        ruff_summary: null,
        git_diff_summary: null,
        pr_url: null,
      });
      usePipelineStore.getState().setCost({
        session_id: "sess-1",
        total_usd: 1.25,
        breakdown: {
          input_usd: 0.5,
          output_usd: 0.6,
          cache_usd: 0.15,
        },
      });
      usePipelineStore.getState().setStuckAlert({
        pattern: "repeat",
        repeat_count: 4,
        tokens_burned: 5000,
        since: "now",
      });
      usePipelineStore.getState().setProcessingStep("Creating ticket...");
      usePipelineStore.getState().setPendingSamples([1, 2, 3]);
      usePipelineStore.getState().setTicketResult({
        key: "DEV-77",
        url: "https://jira.example.com/DEV-77",
        summary: "Ship it",
      });

      usePipelineStore.getState().resetRunState();

      const state = usePipelineStore.getState();
      expect(state.status).toBe("idle");
      expect(state.transcription).toBe("");
      expect(state.errorMessage).toBeNull();
      expect(state.clarification).toBeNull();
      expect(state.loopEvents).toEqual([]);
      expect(state.commandCenterEvents).toEqual([]);
      expect(state.latestSessionId).toBeNull();
      expect(state.activeStage).toBeNull();
      expect(state.gates).toEqual([]);
      expect(state.completion).toBeNull();
      expect(state.cost).toBeNull();
      expect(state.stuckAlert).toBeNull();
      expect(state.processingStep).toBe("");
      expect(state.pendingSamples).toBeNull();
      expect(state.ticketResult).toBeNull();
    });
  });

  describe("command center state", () => {
    it("should add command center timeline events", () => {
      usePipelineStore.getState().addCommandCenterEvent({
        id: "evt-1",
        timestamp: "2026-03-07T10:00:00Z",
        kind: "monitor",
        severity: "info",
        title: "Monitor connected",
      });

      expect(usePipelineStore.getState().commandCenterEvents).toHaveLength(1);
      expect(usePipelineStore.getState().commandCenterEvents[0]?.title).toBe(
        "Monitor connected",
      );
    });

    it("should track monitor connection", () => {
      usePipelineStore.getState().setMonitorConnected(true);
      expect(usePipelineStore.getState().monitorConnected).toBe(true);
    });

    it("should track active stage and gate state", () => {
      usePipelineStore.getState().setActiveStage("agent");
      usePipelineStore.getState().upsertGate({
        nodeId: "agent",
        status: "running",
        updatedAt: "2026-03-07T10:00:00Z",
        message: "Claude is coding",
      });

      expect(usePipelineStore.getState().activeStage).toBe("agent");
      expect(usePipelineStore.getState().gates).toEqual([
        {
          nodeId: "agent",
          status: "running",
          updatedAt: "2026-03-07T10:00:00Z",
          message: "Claude is coding",
        },
      ]);
    });
  });
});
