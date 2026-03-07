import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AudioPreview } from "../components/AudioPreview";

describe("AudioPreview", () => {
  const sampleRate = 16_000;
  // 3 seconds of silence (48000 samples at 16kHz)
  const threeSecs = new Array(sampleRate * 3).fill(0);
  // 1 minute 30 seconds
  const ninetySecSamples = new Array(sampleRate * 90).fill(0);

  const defaultProps = {
    samples: threeSecs,
    onSend: vi.fn(),
    onDiscard: vi.fn(),
  };

  it("should render the Recording Preview title", () => {
    render(<AudioPreview {...defaultProps} />);
    expect(screen.getByText("Recording Preview")).toBeInTheDocument();
  });

  it("should display formatted duration", () => {
    render(<AudioPreview {...defaultProps} />);
    expect(screen.getByText("00:03")).toBeInTheDocument();
  });

  it("should format longer durations correctly", () => {
    render(<AudioPreview {...defaultProps} samples={ninetySecSamples} />);
    expect(screen.getByText("01:30")).toBeInTheDocument();
  });

  it("should render play button with correct label", () => {
    render(<AudioPreview {...defaultProps} />);
    const playBtn = screen.getByRole("button", { name: "Play recording" });
    expect(playBtn).toBeInTheDocument();
  });

  it("should render Send and Discard buttons", () => {
    render(<AudioPreview {...defaultProps} />);
    expect(screen.getByText("Send")).toBeInTheDocument();
    expect(screen.getByText("Discard")).toBeInTheDocument();
  });

  it("should call onSend when Send button is clicked", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<AudioPreview {...defaultProps} onSend={onSend} />);

    await user.click(screen.getByText("Send"));
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("should call onDiscard when Discard button is clicked", async () => {
    const onDiscard = vi.fn();
    const user = userEvent.setup();
    render(<AudioPreview {...defaultProps} onDiscard={onDiscard} />);

    await user.click(screen.getByText("Discard"));
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it("should render waveform SVG", () => {
    const { container } = render(<AudioPreview {...defaultProps} />);
    const svg = container.querySelector("svg.waveform");
    expect(svg).toBeInTheDocument();
  });

  it("should handle empty samples array", () => {
    render(<AudioPreview {...defaultProps} samples={[]} />);
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByText("Recording Preview")).toBeInTheDocument();
  });
});
