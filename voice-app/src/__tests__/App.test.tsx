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
    expect(screen.getByLabelText("SEJFA support rail")).toBeInTheDocument();
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
    expect(screen.getByText("Speak the next objective")).toBeInTheDocument();
    expect(screen.getByText("Ralph Loop")).toBeInTheDocument();
    expect(screen.getByText("Pending queue")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your objective becomes structured work and then a live run.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Voice Intake")).not.toBeInTheDocument();
  });

  it("should render the record button inside the transformation canvas", async () => {
    await renderApp();

    expect(
      screen.getByRole("button", { name: "Start recording" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Speak the next objective")).toBeInTheDocument();
    expect(
      screen.getByText("Speak the objective to start the SEJFA run."),
    ).toBeInTheDocument();
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
    expect(screen.getByText("Hello from voice")).toBeInTheDocument();
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
      screen.getByRole("heading", { name: "Mission created" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Test ticket")).toBeInTheDocument();
    const rail = screen.getByLabelText("SEJFA support rail");
    expect(within(rail).getByRole("link", { name: "Open ticket" })).toHaveAttribute(
      "href",
      "https://jira.example.com/DEV-99",
    );
    expect(
      within(rail).getByRole("link", { name: "Open loop monitor" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Session sess-99").length).toBeGreaterThan(0);
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

    await user.click(screen.getByRole("button", { name: "Create mission" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Mission created" }),
      ).toBeInTheDocument();
    });

    expect(usePipelineStore.getState().appMode).toBe("voice");
    expect(usePipelineStore.getState().latestSessionId).toBe("sess-42");
    expect(
      screen.getByLabelText("SEJFA transformation canvas"),
    ).toBeInTheDocument();
    const rail = screen.getByLabelText("SEJFA support rail");
    expect(
      within(rail).getByRole("link", { name: "Open loop monitor" }),
    ).toHaveAttribute("href", "http://localhost:8100/?session_id=sess-42&ticket_key=DEV-42");
  });
});
