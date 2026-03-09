import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { connectWebSocket, disconnectWebSocket } from "../lib/ws";
import type { PipelineStatus } from "../stores/pipelineStore";

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0; // CONNECTING

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  // Test helper: simulate server sending a message
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  // Test helper: simulate connection open
  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  // Test helper: simulate raw string message
  simulateRawMessage(data: string) {
    this.onmessage?.({ data });
  }
}

describe("WebSocket utility", () => {
  let appendLog: (msg: string) => void;
  let setStatus: (s: PipelineStatus) => void;
  let setProcessingStep: (step: string) => void;
  let setWsConnected: (connected: boolean) => void;
  let onClarification: (data: {
    session_id: string;
    questions: string[];
    partial_summary: string;
    round: number;
  }) => void;
  let onLoopEvent: (event: {
    type: "ticket_queued" | "loop_started" | "loop_completed";
    issue_key: string;
    summary?: string;
    success?: boolean;
  }) => void;
  const getServerUrl = () => "http://localhost:8000";

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    // @ts-expect-error: replacing global WebSocket with mock
    globalThis.WebSocket = MockWebSocket;
    appendLog = vi.fn<(msg: string) => void>();
    setStatus = vi.fn<(s: PipelineStatus) => void>();
    setProcessingStep = vi.fn<(step: string) => void>();
    setWsConnected = vi.fn<(connected: boolean) => void>();
    onClarification = vi.fn();
    onLoopEvent = vi.fn();
  });

  afterEach(() => {
    disconnectWebSocket();
    vi.useRealTimers();
  });

  it("should create WebSocket with correct URL", () => {
    connectWebSocket(
      getServerUrl,
      appendLog,
      setStatus,
      setProcessingStep,
      setWsConnected,
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe(
      "ws://localhost:8000/ws/status",
    );
  });

  it("should convert https to wss", () => {
    connectWebSocket(
      () => "https://secure.example.com",
      appendLog,
      setStatus,
      setProcessingStep,
      setWsConnected,
    );

    expect(MockWebSocket.instances[0].url).toBe(
      "wss://secure.example.com/ws/status",
    );
  });

  it("should strip trailing slash from server URL", () => {
    connectWebSocket(
      () => "http://localhost:8000/",
      appendLog,
      setStatus,
      setProcessingStep,
      setWsConnected,
    );

    expect(MockWebSocket.instances[0].url).toBe(
      "ws://localhost:8000/ws/status",
    );
  });

  it("should set wsConnected to true on open", () => {
    connectWebSocket(
      getServerUrl,
      appendLog,
      setStatus,
      setProcessingStep,
      setWsConnected,
    );

    MockWebSocket.instances[0].simulateOpen();

    expect(setWsConnected).toHaveBeenCalledWith(true);
    expect(appendLog).toHaveBeenCalledWith("[ws] Connected");
  });

  it("should map status messages to pipeline statuses", () => {
    connectWebSocket(
      getServerUrl,
      appendLog,
      setStatus,
      setProcessingStep,
      setWsConnected,
    );

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage({ status: "transcribing" });
    expect(setStatus).toHaveBeenCalledWith("processing");
    expect(setProcessingStep).toHaveBeenCalledWith("Transcribing audio...");

    ws.simulateMessage({ status: "extracting" });
    expect(setStatus).toHaveBeenCalledWith("processing");
    expect(setProcessingStep).toHaveBeenCalledWith("Analyzing intent...");

    ws.simulateMessage({ status: "creating_ticket" });
    expect(setStatus).toHaveBeenCalledWith("processing");
    expect(setProcessingStep).toHaveBeenCalledWith("Creating Jira ticket...");

    ws.simulateMessage({ status: "completed" });
    expect(setStatus).toHaveBeenCalledWith("done");

    ws.simulateMessage({ status: "error" });
    expect(setStatus).toHaveBeenCalledWith("error");
  });

  it("should handle clarification_needed events", () => {
    connectWebSocket(
      getServerUrl,
      appendLog,
      setStatus,
      setProcessingStep,
      setWsConnected,
      onClarification,
      onLoopEvent,
    );

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage({
      type: "clarification_needed",
      session_id: "sess-abc",
      questions: ["What priority?"],
      partial_summary: "Bug report",
      round: 1,
    });

    expect(onClarification).toHaveBeenCalledWith({
      session_id: "sess-abc",
      questions: ["What priority?"],
      partial_summary: "Bug report",
      round: 1,
    });
    expect(setProcessingStep).toHaveBeenCalledWith("");
  });

  it("should handle loop events", () => {
    connectWebSocket(
      getServerUrl,
      appendLog,
      setStatus,
      setProcessingStep,
      setWsConnected,
      onClarification,
      onLoopEvent,
    );

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage({
      type: "ticket_queued",
      issue_key: "DEV-99",
      summary: "New feature",
    });

    expect(onLoopEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ticket_queued",
        issue_key: "DEV-99",
        summary: "New feature",
      }),
    );
  });

  it("should handle current_node from monitor state", () => {
    connectWebSocket(
      getServerUrl,
      appendLog,
      setStatus,
      setProcessingStep,
      setWsConnected,
    );

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage({ current_node: "transcribing" });
    expect(setStatus).toHaveBeenCalledWith("processing");

    ws.simulateMessage({ current_node: "done" });
    expect(setStatus).toHaveBeenCalledWith("done");
  });

  it("should handle non-JSON messages gracefully", () => {
    connectWebSocket(
      getServerUrl,
      appendLog,
      setStatus,
      setProcessingStep,
      setWsConnected,
    );

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateRawMessage("not valid json");

    expect(appendLog).toHaveBeenCalledWith("[ws] Raw: not valid json");
  });

  it("should set wsConnected false on close and schedule reconnect", () => {
    connectWebSocket(
      getServerUrl,
      appendLog,
      setStatus,
      setProcessingStep,
      setWsConnected,
    );

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Simulate disconnection
    ws.onclose?.();

    expect(setWsConnected).toHaveBeenCalledWith(false);
    expect(appendLog).toHaveBeenCalledWith("[ws] Disconnected");
    // Should schedule reconnect - check log message
    expect(appendLog).toHaveBeenCalledWith(
      expect.stringContaining("[ws] Reconnecting in"),
    );
  });

  it("should stop reconnecting after disconnectWebSocket()", () => {
    connectWebSocket(
      getServerUrl,
      appendLog,
      setStatus,
      setProcessingStep,
      setWsConnected,
    );

    disconnectWebSocket();

    // Advance timers - no new connections should be created
    const countBefore = MockWebSocket.instances.length;
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances.length).toBe(countBefore);
  });

  it("should clean up on disconnectWebSocket()", () => {
    connectWebSocket(
      getServerUrl,
      appendLog,
      setStatus,
      setProcessingStep,
      setWsConnected,
    );

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    disconnectWebSocket();

    expect(ws.readyState).toBe(3); // CLOSED
  });
});
