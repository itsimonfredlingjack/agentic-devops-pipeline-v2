import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePipelineStore } from "../stores/pipelineStore";
import { invoke } from "@tauri-apps/api/core";

// Mock the WebSocket module to prevent actual connections during render
vi.mock("../lib/ws", () => ({
  connectWebSocket: vi.fn(),
  disconnectWebSocket: vi.fn(),
}));

vi.mock("../lib/monitor", () => ({
  connectMonitorSocket: vi.fn(),
  disconnectMonitorSocket: vi.fn(),
}));

// Mock useMicLevel to avoid Tauri API calls
vi.mock("../hooks/useMicLevel", () => ({
  useMicLevel: () => [],
}));

// Mock @tauri-apps/api/core invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("App", () => {
  beforeEach(() => {
    // Reset store to known state before each test
    usePipelineStore.setState({
      status: "idle",
      appMode: "voice",
      previousAppMode: "voice",
      transcription: "",
      log: [],
      serverUrl: "http://localhost:8000",
      monitorUrl: "http://localhost:8100",
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

    vi.mocked(invoke).mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true }),
      })),
    );
  });

  it("should render the app header", async () => {
    // Dynamic import to ensure mocks are in place
    const { default: App } = await import("../App");
    render(<App />);
    expect(screen.getByText("Voice Mission Control")).toBeInTheDocument();
  });

  it("should render a mission briefing launch screen", async () => {
    const { default: App } = await import("../App");
    render(<App />);
    expect(screen.getByText("Mission Briefing")).toBeInTheDocument();
    expect(
      screen.getByText(/Speak the mission and SEJFA will turn it into live work/i),
    ).toBeInTheDocument();
  });

  it("should render the record button in idle state", async () => {
    const { default: App } = await import("../App");
    render(<App />);
    expect(
      screen.getByRole("button", { name: "Start recording" }),
    ).toBeInTheDocument();
  });

  it("should render the transcription card", async () => {
    const { default: App } = await import("../App");
    render(<App />);
    expect(screen.getByText("Transcription")).toBeInTheDocument();
  });

  it("should show idle hint", async () => {
    const { default: App } = await import("../App");
    render(<App />);
    expect(screen.getByText("Press Space to record")).toBeInTheDocument();
  });

  it("should render a skip action to the command center on startup", async () => {
    const { default: App } = await import("../App");
    render(<App />);

    expect(
      screen.getByRole("button", { name: "Skip to Command Center" }),
    ).toBeInTheDocument();
  });

  it("should render settings button", async () => {
    const { default: App } = await import("../App");
    render(<App />);
    expect(
      screen.getByRole("button", { name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("should render pipeline log", async () => {
    const { default: App } = await import("../App");
    render(<App />);
    expect(
      screen.getByRole("button", { name: /Pipeline Log/i }),
    ).toBeInTheDocument();
  });

  it("should show transcription text when store has transcription", async () => {
    usePipelineStore.setState({ transcription: "Hello from voice" });
    const { default: App } = await import("../App");
    render(<App />);
    expect(screen.getByText("Hello from voice")).toBeInTheDocument();
  });

  it("should transition into mission control when status is done with ticket result", async () => {
    usePipelineStore.setState({
      status: "done",
      ticketResult: {
        key: "DEV-99",
        url: "https://jira.example.com/DEV-99",
        summary: "Test ticket",
      },
    });
    const { default: App } = await import("../App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("SEJFA Command Center")).toBeInTheDocument();
    });

    expect(screen.getAllByText(/DEV-99/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Open Ticket" }),
    ).toHaveAttribute("href", "https://jira.example.com/DEV-99");
  });

  it("should render the command center when appMode is command_center", async () => {
    usePipelineStore.setState({
      appMode: "command_center",
      previousAppMode: "command_center",
    });
    const { default: App } = await import("../App");
    render(<App />);

    expect(screen.getByText("SEJFA Command Center")).toBeInTheDocument();
    expect(screen.getAllByText("Awaiting your next objective").length).toBeGreaterThan(0);
  });

  it("should switch to the command center after a successful send", async () => {
    const user = userEvent.setup();
    vi.mocked(invoke).mockResolvedValue({
      ticket_key: "DEV-42",
      ticket_url: "https://jira.example.com/DEV-42",
      summary: "Fix the login flow",
      transcribed_text: "fix the login flow",
      session_id: "sess-42",
      _endpoint_used: "pipeline_run_audio",
    });

    usePipelineStore.setState({
      status: "previewing",
      pendingSamples: [100, -100, 300, -300],
    });

    const { default: App } = await import("../App");
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("SEJFA Command Center")).toBeInTheDocument();
    });

    expect(screen.getAllByText(/DEV-42/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Open Ticket" }),
    ).toHaveAttribute("href", "https://jira.example.com/DEV-42");
    expect(usePipelineStore.getState().appMode).toBe("command_center");
    expect(usePipelineStore.getState().latestSessionId).toBe("sess-42");
  });
});
