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
    render(
      <Header status="idle" wsConnected={false} onSettingsClick={vi.fn()} />,
    );
    expect(screen.getByText("Voice Mission Control")).toBeInTheDocument();
    expect(screen.getByText("SEJFA")).toBeInTheDocument();
  });

  it("should render settings button", () => {
    render(
      <Header status="idle" wsConnected={false} onSettingsClick={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("should call onSettingsClick when settings button is clicked", async () => {
    const onSettingsClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Header
        status="idle"
        wsConnected={false}
        onSettingsClick={onSettingsClick}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(onSettingsClick).toHaveBeenCalledOnce();
  });

  it("should show connected state indicator", () => {
    const { container } = render(
      <Header status="idle" wsConnected={true} onSettingsClick={vi.fn()} />,
    );
    const dot = container.querySelector("[class*='wsConnected']");
    expect(dot).toBeInTheDocument();
  });

  it("should show disconnected state indicator", () => {
    const { container } = render(
      <Header status="idle" wsConnected={false} onSettingsClick={vi.fn()} />,
    );
    const dot = container.querySelector("[class*='wsDisconnected']");
    expect(dot).toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  it("should render Ready for idle status", () => {
    render(<StatusBadge status="idle" />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("should render Recording for recording status", () => {
    render(<StatusBadge status="recording" />);
    expect(screen.getByText("Recording")).toBeInTheDocument();
  });

  it("should render Processing for processing status", () => {
    render(<StatusBadge status="processing" />);
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });

  it("should render Done for done status", () => {
    render(<StatusBadge status="done" />);
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("should render Error for error status", () => {
    render(<StatusBadge status="error" />);
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("should have role=status for accessibility", () => {
    render(<StatusBadge status="idle" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("TranscriptionCard", () => {
  it("should show placeholder when no text", () => {
    render(<TranscriptionCard text="" />);
    expect(
      screen.getByText("Press Space to start recording"),
    ).toBeInTheDocument();
  });

  it("should show transcription text when provided", () => {
    render(<TranscriptionCard text="Hello this is a test" />);
    expect(screen.getByText("Hello this is a test")).toBeInTheDocument();
  });

  it("should show Transcription label", () => {
    render(<TranscriptionCard text="" />);
    expect(screen.getByText("Transcription")).toBeInTheDocument();
  });
});

describe("SuccessCard", () => {
  const ticket = {
    key: "DEV-42",
    url: "https://jira.example.com/browse/DEV-42",
    summary: "Fix login bug",
  };

  it("should render Ticket Created title", () => {
    render(<SuccessCard ticket={ticket} onRecordAnother={vi.fn()} />);
    expect(screen.getByText("Ticket Created")).toBeInTheDocument();
  });

  it("should render ticket key and summary", () => {
    render(<SuccessCard ticket={ticket} onRecordAnother={vi.fn()} />);
    expect(screen.getByText("DEV-42")).toBeInTheDocument();
    expect(screen.getByText("Fix login bug")).toBeInTheDocument();
  });

  it("should render ticket link with correct href", () => {
    render(<SuccessCard ticket={ticket} onRecordAnother={vi.fn()} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://jira.example.com/browse/DEV-42",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("should render Record Another button", async () => {
    const onRecordAnother = vi.fn();
    const user = userEvent.setup();
    render(<SuccessCard ticket={ticket} onRecordAnother={onRecordAnother} />);

    await user.click(screen.getByText("Record Another"));
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
  it("should render Pipeline Log button", () => {
    render(<LogPanel entries={[]} />);
    expect(
      screen.getByRole("button", { name: /Pipeline Log/i }),
    ).toBeInTheDocument();
  });

  it("should show entry count", () => {
    render(<LogPanel entries={["entry1", "entry2", "entry3"]} />);
    expect(screen.getByText("(3)")).toBeInTheDocument();
  });

  it("should start collapsed (aria-expanded=false)", () => {
    render(<LogPanel entries={[]} />);
    const button = screen.getByRole("button", { name: /Pipeline Log/i });
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("should toggle open on click", async () => {
    const user = userEvent.setup();
    render(<LogPanel entries={["log entry 1"]} />);

    const button = screen.getByRole("button", { name: /Pipeline Log/i });
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("should show (no events) when empty and open", async () => {
    const user = userEvent.setup();
    render(<LogPanel entries={[]} />);

    await user.click(screen.getByRole("button", { name: /Pipeline Log/i }));
    expect(screen.getByText("(no events)")).toBeInTheDocument();
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
    // 3 blob elements + the blobs container = should have at least 3
    expect(blobs.length).toBeGreaterThanOrEqual(3);
  });
});
