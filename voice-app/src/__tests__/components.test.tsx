import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GlassCard } from "../components/GlassCard";
import { Header } from "../components/Header";
import { StatusBadge } from "../components/StatusBadge";
import { TranscriptionCard } from "../components/TranscriptionCard";
import { SuccessCard } from "../components/SuccessCard";
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
    render(<Header status="processing" onSettingsClick={vi.fn()} />);
    expect(screen.getByText("Processing")).toBeInTheDocument();
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

  it("should render Need detail for clarifying status", () => {
    render(<StatusBadge status="clarifying" />);
    expect(screen.getByText("Need detail")).toBeInTheDocument();
  });

  it("should render Created for done status", () => {
    render(<StatusBadge status="done" />);
    expect(screen.getByText("Created")).toBeInTheDocument();
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
      screen.getByText("Your captured objective will appear here."),
    ).toBeInTheDocument();
  });

  it("should show transcription text when provided", () => {
    render(<TranscriptionCard status="processing" text="Hello this is a test" />);
    expect(screen.getByText("Hello this is a test")).toBeInTheDocument();
  });

  it("should show captured objective label", () => {
    render(<TranscriptionCard status="idle" text="" />);
    expect(screen.getByText("Captured objective")).toBeInTheDocument();
  });
});

describe("SuccessCard", () => {
  const ticket = {
    key: "DEV-42",
    url: "https://jira.example.com/browse/DEV-42",
    summary: "Fix login bug",
  };

  it("should render mission created copy and summary", () => {
    render(
      <SuccessCard
        ticket={ticket}
        sessionId="sess-42"
        monitorConnected={true}
        loopMonitorUrl="http://localhost:8100/?session_id=sess-42&ticket_key=DEV-42"
        onRecordAnother={vi.fn()}
      />,
    );
    expect(screen.getByText("Mission created")).toBeInTheDocument();
    expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    expect(screen.getByText("DEV-42 is ready for the loop.")).toBeInTheDocument();
  });

  it("should render ticket link with correct href", () => {
    render(
      <SuccessCard
        ticket={ticket}
        sessionId={null}
        monitorConnected={false}
        loopMonitorUrl={null}
        onRecordAnother={vi.fn()}
      />,
    );
    const link = screen.getByRole("link", { name: "Open ticket" });
    expect(link).toHaveAttribute(
      "href",
      "https://jira.example.com/browse/DEV-42",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("should call record another action and render loop monitor handoff link", async () => {
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

    expect(
      screen.getByRole("link", { name: "Open loop monitor" }),
    ).toHaveAttribute(
      "href",
      "http://localhost:8100/?session_id=sess-42&ticket_key=DEV-42",
    );
    await user.click(screen.getByRole("button", { name: "Record another" }));

    expect(onRecordAnother).toHaveBeenCalledOnce();
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

  it("should render decorative blobs", () => {
    const { container } = render(
      <AppShell>
        <span>Content</span>
      </AppShell>,
    );
    const blobs = container.querySelectorAll("[class*='blob']");
    expect(blobs.length).toBeGreaterThanOrEqual(3);
  });
});
