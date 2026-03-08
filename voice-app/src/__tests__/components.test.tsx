import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GlassCard } from "../components/GlassCard";
import { Header } from "../components/Header";
import { StatusBadge } from "../components/StatusBadge";
import { TranscriptionCard } from "../components/TranscriptionCard";
import { SuccessCard } from "../components/SuccessCard";
import { SupportRail } from "../components/SupportRail";
import { DetailShelf } from "../components/DetailShelf";
import { ToastContainer } from "../components/Toast";
import { LogPanel } from "../components/LogPanel";
import { AppShell } from "../components/AppShell";

describe("GlassCard", () => {
  it("should render children", () => {
    render(<GlassCard>Hello World</GlassCard>);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const { container } = render(
      <GlassCard className="custom-class">Content</GlassCard>,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("should apply compact class when compact prop is true", () => {
    const { container } = render(<GlassCard compact>Content</GlassCard>);
    expect(container.firstChild).toHaveClass("compact");
  });

  it("should apply noPadding class when noPadding prop is true", () => {
    const { container } = render(<GlassCard noPadding>Content</GlassCard>);
    expect(container.firstChild).toHaveClass("noPadding");
  });
});

describe("Header", () => {
  it("should render app title", () => {
    render(<Header status="idle" onSettingsClick={vi.fn()} />);
    expect(screen.getByText("SEJFA Desktop")).toBeInTheDocument();
    expect(screen.getByText("SEJFA")).toBeInTheDocument();
  });

  it("should render status badge and settings button", () => {
    render(
      <Header
        status="processing"
        statusLabel="Running"
        statusTone="running"
        onSettingsClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("should call onSettingsClick when settings button is clicked", async () => {
    const onSettingsClick = vi.fn();
    const user = userEvent.setup();
    render(<Header status="idle" onSettingsClick={onSettingsClick} />);

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(onSettingsClick).toHaveBeenCalledOnce();
  });
});

describe("StatusBadge", () => {
  it("should render Ready for idle status", () => {
    render(<StatusBadge status="idle" />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("should render Needs detail for clarifying status", () => {
    render(<StatusBadge status="clarifying" />);
    expect(screen.getByText("Needs detail")).toBeInTheDocument();
  });

  it("should render Done for done status", () => {
    render(<StatusBadge status="done" />);
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("should render a custom label and tone when provided", () => {
    render(<StatusBadge status="idle" label="Running" tone="running" />);
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("should render Issue for error status", () => {
    render(<StatusBadge status="error" />);
    expect(screen.getByText("Issue")).toBeInTheDocument();
  });

  it("should have role=status for accessibility", () => {
    render(<StatusBadge status="idle" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("TranscriptionCard", () => {
  it("should show placeholder when no text", () => {
    render(<TranscriptionCard status="idle" text="" />);
    expect(
      screen.getByText("Your captured request will appear here."),
    ).toBeInTheDocument();
  });

  it("should show transcription text when provided", () => {
    render(<TranscriptionCard status="processing" text="Hello this is a test" />);
    expect(screen.getByText("Hello this is a test")).toBeInTheDocument();
  });

  it("should show captured objective label", () => {
    render(<TranscriptionCard status="idle" text="" />);
    expect(screen.getByText("Captured request")).toBeInTheDocument();
  });
});

describe("SuccessCard", () => {
  const ticket = {
    key: "DEV-42",
    url: "https://jira.example.com/browse/DEV-42",
    summary: "Fix login bug",
  };

  it("should render queued run copy and summary", () => {
    render(
      <SuccessCard
        ticket={ticket}
        sessionId="sess-42"
        monitorConnected={true}
        loopMonitorUrl="http://localhost:8100/?session_id=sess-42&ticket_key=DEV-42"
        onRecordAnother={vi.fn()}
      />,
    );
    expect(screen.getByText("Task queued")).toBeInTheDocument();
    expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    expect(screen.getByText("DEV-42 queued for execution.")).toBeInTheDocument();
  });

  it("should render session context without artifact links", () => {
    render(
      <SuccessCard
        ticket={ticket}
        sessionId={null}
        monitorConnected={false}
        loopMonitorUrl={null}
        onRecordAnother={vi.fn()}
      />,
    );
    expect(screen.queryByRole("link", { name: "Open ticket" })).not.toBeInTheDocument();
    expect(screen.getByText("Loop monitor unavailable")).toBeInTheDocument();
  });

  it("should call record another action and render the session handoff meta", async () => {
    const onRecordAnother = vi.fn();
    const user = userEvent.setup();
    render(
      <SuccessCard
        ticket={ticket}
        sessionId="sess-42"
        monitorConnected={true}
        loopMonitorUrl="http://localhost:8100/?session_id=sess-42&ticket_key=DEV-42"
        onRecordAnother={onRecordAnother}
      />,
    );

    expect(screen.getByText("Loop monitor available")).toBeInTheDocument();
    expect(screen.getByText("Session sess-42")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Record another" }));

    expect(onRecordAnother).toHaveBeenCalledOnce();
  });
});

describe("SupportRail", () => {
  const ticket = {
    key: "DEV-42",
    url: "https://jira.example.com/browse/DEV-42",
    summary: "Fix login bug",
  };

  it("should render queue, activity, and artifact sections", () => {
    render(
      <SupportRail
        queueItems={[{ key: "DEV-10", summary: "Fix CI flakes" }]}
        events={[
          {
            id: "event-1",
            timestamp: "12:00:00",
            kind: "voice",
            severity: "info",
            title: "Ticket created: DEV-42",
            detail: "Session sess-42",
          },
        ]}
        ticket={ticket}
        completion={null}
        loopMonitorUrl="http://localhost:8100/?session_id=sess-42&ticket_key=DEV-42"
      />,
    );

    expect(screen.getByLabelText("SEJFA support panel")).toBeInTheDocument();
    expect(screen.getByText("Queue")).toBeInTheDocument();
    expect(screen.getByText("Recent activity")).toBeInTheDocument();
    expect(screen.getByText("Artifacts")).toBeInTheDocument();
    expect(screen.getByText("DEV-10")).toBeInTheDocument();
    expect(screen.getByText("Ticket created: DEV-42")).toBeInTheDocument();
  });

  it("should render artifact links when run outputs are available", () => {
    render(
      <SupportRail
        queueItems={[]}
        events={[]}
        ticket={ticket}
        completion={{
          session_id: "sess-42",
          ticket_id: "DEV-42",
          outcome: "done",
          pytest_summary: "12 passed",
          ruff_summary: "clean",
          git_diff_summary: "2 files changed",
          pr_url: "https://github.com/example/repo/pull/42",
        }}
        loopMonitorUrl="http://localhost:8100/?session_id=sess-42&ticket_key=DEV-42"
      />,
    );

    expect(screen.getByRole("link", { name: "Open ticket" })).toHaveAttribute(
      "href",
      "https://jira.example.com/browse/DEV-42",
    );
    expect(
      screen.getByRole("link", { name: "Open loop monitor" }),
    ).toHaveAttribute(
      "href",
      "http://localhost:8100/?session_id=sess-42&ticket_key=DEV-42",
    );
    expect(screen.getByRole("link", { name: "Open PR" })).toHaveAttribute(
      "href",
      "https://github.com/example/repo/pull/42",
    );
  });
});

describe("DetailShelf", () => {
  it("should render the transcript and technical details inside the shelf", async () => {
    const user = userEvent.setup();
    render(
      <DetailShelf
        transcription="Fix the login flow"
        detailsEntries={["[12:00:00] Queue refreshed"]}
      />,
    );

    expect(screen.getByLabelText("SEJFA detail shelf")).toBeInTheDocument();
    expect(screen.getByText("Captured request")).toBeInTheDocument();
    expect(screen.getByText("Fix the login flow")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /Show technical details/i });
    await user.click(toggle);
    expect(screen.getByText("[12:00:00] Queue refreshed")).toBeInTheDocument();
  });
});

describe("ToastContainer", () => {
  it("should render nothing when toasts array is empty", () => {
    const { container } = render(
      <ToastContainer toasts={[]} onDismiss={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("should render toast messages", () => {
    const toasts = [
      { id: "t1", type: "success" as const, message: "All good" },
      { id: "t2", type: "error" as const, message: "Something failed" },
    ];
    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} />);
    expect(screen.getByText("All good")).toBeInTheDocument();
    expect(screen.getByText("Something failed")).toBeInTheDocument();
  });

  it("should render toasts with alert role", () => {
    const toasts = [{ id: "t1", type: "info" as const, message: "Note" }];
    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("should render dismiss button on each toast", () => {
    const toasts = [{ id: "t1", type: "success" as const, message: "Done" }];
    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });
});

describe("LogPanel", () => {
  it("should render Technical details button", () => {
    render(<LogPanel entries={[]} />);
    expect(
      screen.getByRole("button", { name: /Technical details/i }),
    ).toBeInTheDocument();
  });

  it("should show entry count", () => {
    render(<LogPanel entries={["entry1", "entry2", "entry3"]} />);
    expect(screen.getByText("(3)")).toBeInTheDocument();
  });

  it("should start collapsed (aria-expanded=false)", () => {
    render(<LogPanel entries={[]} />);
    const button = screen.getByRole("button", { name: /Technical details/i });
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("should toggle open on click", async () => {
    const user = userEvent.setup();
    render(<LogPanel entries={["log entry 1"]} />);

    const button = screen.getByRole("button", { name: /Technical details/i });
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("should show custom empty state when empty and open", async () => {
    const user = userEvent.setup();
    render(<LogPanel entries={[]} emptyMessage="No details yet." />);

    await user.click(screen.getByRole("button", { name: /Technical details/i }));
    expect(screen.getByText("No details yet.")).toBeInTheDocument();
  });
});

describe("AppShell", () => {
  it("should render children", () => {
    render(
      <AppShell>
        <div data-testid="child">Test</div>
      </AppShell>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("should render a simplified shell without decorative blobs", () => {
    const { container } = render(
      <AppShell>
        <span>Content</span>
      </AppShell>,
    );
    const blobs = container.querySelectorAll("[class*='blob']");
    expect(blobs.length).toBe(0);
  });
});
