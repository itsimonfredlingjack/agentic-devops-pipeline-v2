import { describe, expect, it, vi } from "vitest";
import { applyPipelineServerResult } from "../utils/pipelineFlow";

function createActions() {
  return {
    setPipelineStatus: vi.fn(),
    setProcessingStep: vi.fn(),
    setClarification: vi.fn(),
    setPreview: vi.fn(),
    setTicketKey: vi.fn(),
  };
}

describe("pipelineFlow", () => {
  it("maps clarification_needed response", () => {
    const actions = createActions();
    const result = applyPipelineServerResult(
      {
        status: "clarification_needed",
        session_id: "sess-1",
        questions: ["What is the expected output format?"],
        partial_summary: "Need tighter output requirements",
        round: 2,
      },
      actions,
    );

    expect(result).toBe("clarification_needed");
    expect(actions.setPreview).toHaveBeenCalledWith(null);
    expect(actions.setClarification).toHaveBeenCalledWith({
      sessionId: "sess-1",
      questions: ["What is the expected output format?"],
      partialSummary: "Need tighter output requirements",
      round: 2,
    });
    expect(actions.setPipelineStatus).toHaveBeenCalledWith("clarifying");
  });

  it("maps preview_needed response", () => {
    const actions = createActions();
    const result = applyPipelineServerResult(
      {
        status: "preview_needed",
        session_id: "sess-2",
        transcribed_text: "Build a webhook listener",
        summary: "Build webhook listener",
        intent: {
          summary: "Build webhook listener",
          description: "Handle incoming callbacks",
          acceptance_criteria: "Should validate signature",
          issue_type: "Task",
          priority: "High",
          labels: ["backend"],
          ambiguity_score: 0.2,
        },
      },
      actions,
    );

    expect(result).toBe("preview_needed");
    expect(actions.setClarification).toHaveBeenCalledWith(null);
    expect(actions.setPreview).toHaveBeenCalled();
    expect(actions.setPipelineStatus).toHaveBeenCalledWith("previewing");
  });

  it("maps ticket creation response", () => {
    const actions = createActions();
    const result = applyPipelineServerResult(
      {
        ticket_key: "SEJ-123",
      },
      actions,
    );

    expect(result).toBe("ticket_created");
    expect(actions.setTicketKey).toHaveBeenCalledWith("SEJ-123");
    expect(actions.setPipelineStatus).toHaveBeenCalledWith("done");
  });

  it("returns unknown for unsupported payloads", () => {
    const actions = createActions();
    const result = applyPipelineServerResult({ status: "noop" }, actions);

    expect(result).toBe("unknown");
    expect(actions.setPipelineStatus).not.toHaveBeenCalled();
  });
});
