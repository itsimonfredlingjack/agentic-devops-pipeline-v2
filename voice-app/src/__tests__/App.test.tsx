import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePipelineStore } from "../stores/pipelineStore";
import { invoke } from "@tauri-apps/api/core";

vi.mock("../lib/ws", () => ({
  connectWebSocket: vi.fn(),
  disconnectWebSocket: vi.fn(),
}));

vi.mock("../lib/monitor", () => ({
  connectMonitorSocket: vi.fn(),
  disconnectMonitorSocket: vi.fn(),
}));

vi.mock("../hooks/useMicLevel", () => ({
  useMicLevel: () => [],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

async function renderApp() {
  const { default: App } = await import("../App");
  render(<App />);
  await waitFor(() => {
    expect(screen.getByLabelText("SEJFA support panel")).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByLabelText("SEJFA detail shelf")).toBeInTheDocument();
  });
}

describe("App", () => {
  let queuePayload: Array<{ key: string; summary: string }>;

  beforeEach(() => {
    queuePayload = [];
    usePipelineStore.setState({
      status: "idle",
      appMode: "voice",
      previousAppMode: "voice",
      transcription: "",
      errorMessage: null,
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
      queueItems: [],
      ticketResult: null,
      wsConnected: false,
    });

    vi.mocked(invoke).mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);

        if (url.endsWith("/api/loop/queue")) {
          return {
            ok: true,
            json: async () => queuePayload,
          };
        }

        return {
          ok: true,
          json: async () => ({ ok: true }),
        };
      }),
    );
  });

  it("should render the SEJFA desktop shell", async () => {
    await renderApp();
    expect(screen.getByText("SEJFA Desktop")).toBeInTheDocument();
    expect(
      screen.getByLabelText("SEJFA transformation canvas"),
    ).toBeInTheDocument();
  });

  it("should render the center-first idle surface", async () => {
    await renderApp();
    expect(screen.getByText("Start with a request")).toBeInTheDocument();
    expect(screen.getByText("Execution pipeline")).toBeInTheDocument();
    expect(screen.getByText("Queue")).toBeInTheDocument();
    expect(screen.getByText("Recent activity")).toBeInTheDocument();
    expect(screen.getByLabelText("SEJFA detail shelf")).toBeInTheDocument();
    expect(screen.getByText("Captured request")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Record a request to create a task and start execution tracking.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Objective Console")).not.toBeInTheDocument();
    expect(screen.queryByText("Ralph Loop Workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("Voice Intake")).not.toBeInTheDocument();
  });

  it("should render the record button inside the transformation canvas", async () => {
    await renderApp();

    expect(
      screen.getByRole("button", { name: "Start recording" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Start with a request")).toBeInTheDocument();
    expect(
      screen.getByText("Press record and describe what you need."),
    ).toBeInTheDocument();
  });

  it("should render the listening composition while recording", async () => {
    usePipelineStore.setState({ status: "recording" });
    await renderApp();

    expect(
      screen.getByRole("heading", { name: "Listening for your request" }),
    ).toBeInTheDocument();
  });

  it("should keep clarification anchored in the canvas flow", async () => {
    usePipelineStore.setState({
      status: "clarifying",
      clarification: {
        sessionId: "sess-clarify",
        questions: ["Which deploy target is failing?"],
        partialSummary: "The release is blocked in deploy.",
        round: 2,
      },
    });

    await renderApp();

    expect(
      screen.getByRole("heading", { name: "Need one more detail" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Round 2")).toBeInTheDocument();
    expect(screen.getByText("Which deploy target is failing?")).toBeInTheDocument();
  });

  it("should render pending queue items from the loop queue endpoint", async () => {
    queuePayload = [
      { key: "DEV-10", summary: "Fix CI flakes" },
      { key: "DEV-11", summary: "Repair deploy hook" },
    ];

    await renderApp();

    await waitFor(() => {
      expect(screen.getByText("DEV-10")).toBeInTheDocument();
    });
    expect(screen.getByText("Fix CI flakes")).toBeInTheDocument();
    expect(screen.getByText("DEV-11")).toBeInTheDocument();
  });

  it("should show transcription text when store has transcription", async () => {
    usePipelineStore.setState({ transcription: "Hello from voice" });
    await renderApp();
    const shelf = screen.getByLabelText("SEJFA detail shelf");
    expect(within(shelf).getByText("Hello from voice")).toBeInTheDocument();
  });

  it("should keep success inside the intake surface when status is done with a ticket", async () => {
    usePipelineStore.setState({
      status: "done",
      latestSessionId: "sess-99",
      monitorConnected: true,
      ticketResult: {
        key: "DEV-99",
        url: "https://jira.example.com/DEV-99",
        summary: "Test ticket",
      },
    });
    await renderApp();

    expect(
      screen.getByLabelText("SEJFA transformation canvas"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Task queued" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Test ticket")).toBeInTheDocument();
    const rail = screen.getByLabelText("SEJFA support panel");
    expect(within(rail).getByRole("link", { name: "Open ticket" })).toHaveAttribute(
      "href",
      "https://jira.example.com/DEV-99",
    );
    expect(
      within(rail).getByRole("link", { name: "Open loop monitor" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Session sess-99").length).toBeGreaterThan(0);
  });

  it("should render the active loop stage prominently while running", async () => {
    usePipelineStore.setState({
      status: "done",
      activeStage: "agent",
      latestSessionId: "sess-run",
      ticketResult: {
        key: "DEV-77",
        url: "https://jira.example.com/DEV-77",
        summary: "Ship the login refactor",
      },
    });

    await renderApp();

    expect(
      screen.getByRole("heading", { name: "Running Agent" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Running");
    const reactor = screen.getByLabelText("Execution pipeline map");
    expect(reactor).toBeInTheDocument();
    expect(within(reactor).getAllByText("Agent").length).toBeGreaterThan(0);
  });

  it("should surface blocked state composition when the loop jams", async () => {
    usePipelineStore.setState({
      status: "done",
      activeStage: "deploy",
      ticketResult: {
        key: "DEV-88",
        url: "https://jira.example.com/DEV-88",
        summary: "Repair deploy step",
      },
      stuckAlert: {
        pattern: "deploy retry",
        repeat_count: 4,
        tokens_burned: 1800,
        since: new Date().toISOString(),
      },
    });

    await renderApp();

    expect(
      screen.getByRole("heading", { name: "Blocked in Deploy" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Blocked");
  });

  it("should settle into a completed run with outcome links in the center flow", async () => {
    usePipelineStore.setState({
      status: "done",
      latestSessionId: "sess-complete",
      ticketResult: {
        key: "DEV-100",
        url: "https://jira.example.com/DEV-100",
        summary: "Close the release loop",
      },
      completion: {
        session_id: "sess-complete",
        ticket_id: "DEV-100",
        outcome: "done",
        pytest_summary: "15 passed",
        ruff_summary: "clean",
        git_diff_summary: "3 files changed",
        pr_url: "https://github.com/example/repo/pull/100",
      },
    });

    await renderApp();

    expect(
      screen.getByRole("heading", { name: "Task completed" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Done");
    expect(
      within(screen.getByLabelText("SEJFA transformation canvas")).getByRole("link", {
        name: "Open PR",
      }),
    ).toHaveAttribute("href", "https://github.com/example/repo/pull/100");
  });

  it("should keep a successful send in intake and expose compact handoff link", async () => {
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

    await renderApp();

    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Task queued" }),
      ).toBeInTheDocument();
    });

    expect(usePipelineStore.getState().appMode).toBe("voice");
    expect(usePipelineStore.getState().latestSessionId).toBe("sess-42");
    expect(
      screen.getByLabelText("SEJFA transformation canvas"),
    ).toBeInTheDocument();
    const rail = screen.getByLabelText("SEJFA support panel");
    expect(
      within(rail).getByRole("link", { name: "Open loop monitor" }),
    ).toHaveAttribute("href", "http://localhost:8100/?session_id=sess-42&ticket_key=DEV-42");
  });
});
