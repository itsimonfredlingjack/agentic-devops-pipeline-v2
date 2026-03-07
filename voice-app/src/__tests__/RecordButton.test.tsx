import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordButton } from "../components/RecordButton";
import type { PipelineStatus } from "../stores/pipelineStore";

describe("RecordButton", () => {
  const defaultProps = {
    status: "idle" as PipelineStatus,
    processingStep: "",
    onClick: vi.fn(),
  };

  it("should render with mic icon in idle state", () => {
    render(<RecordButton {...defaultProps} />);
    const button = screen.getByRole("button", { name: "Start recording" });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('should show "Press Space to record" hint in idle state', () => {
    render(<RecordButton {...defaultProps} />);
    expect(screen.getByText("Press Space to record")).toBeInTheDocument();
  });

  it("should show stop recording label when recording", () => {
    render(<RecordButton {...defaultProps} status="recording" />);
    const button = screen.getByRole("button", { name: "Stop recording" });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it("should show timer when recording", () => {
    render(<RecordButton {...defaultProps} status="recording" />);
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  it("should show processing state with aria-label", () => {
    render(
      <RecordButton
        {...defaultProps}
        status="processing"
        processingStep="Transcribing audio..."
      />,
    );
    const button = screen.getByRole("button", { name: "Processing audio" });
    expect(button).toBeDisabled();
  });

  it("should show processing step text", () => {
    render(
      <RecordButton
        {...defaultProps}
        status="processing"
        processingStep="Analyzing intent..."
      />,
    );
    expect(screen.getByText("Analyzing intent...")).toBeInTheDocument();
  });

  it("should disable button during clarifying state", () => {
    render(<RecordButton {...defaultProps} status="clarifying" />);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("should disable button during previewing state", () => {
    render(<RecordButton {...defaultProps} status="previewing" />);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("should be clickable in done state", () => {
    render(<RecordButton {...defaultProps} status="done" />);
    const button = screen.getByRole("button", { name: "Start recording" });
    expect(button).not.toBeDisabled();
  });

  it("should be clickable in error state", () => {
    render(<RecordButton {...defaultProps} status="error" />);
    const button = screen.getByRole("button", { name: "Start recording" });
    expect(button).not.toBeDisabled();
  });

  it("should call onClick when clicked", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<RecordButton {...defaultProps} onClick={onClick} />);

    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("should not call onClick when disabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <RecordButton {...defaultProps} onClick={onClick} status="processing" />,
    );

    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("should render waveform bars with mic levels when recording", () => {
    const { container } = render(
      <RecordButton
        {...defaultProps}
        status="recording"
        micLevels={[0.2, 0.5, 0.8, 0.3, 0.6]}
      />,
    );
    // Should render 5 reactive bars (from micLevels)
    const bars = container.querySelectorAll("[class*='bar']");
    expect(bars.length).toBeGreaterThanOrEqual(5);
  });

  it("should render default waveform bars when recording without mic levels", () => {
    const { container } = render(
      <RecordButton {...defaultProps} status="recording" />,
    );
    // Should render 5 default bars (no micLevels provided)
    const bars = container.querySelectorAll("[class*='bar']");
    expect(bars.length).toBe(5);
  });
});
