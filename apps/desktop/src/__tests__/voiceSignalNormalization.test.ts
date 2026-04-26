import { describe, expect, it } from "vitest";
import { normalizeVoicePipelineSignal } from "@sejfa/data-client";

describe("normalizeVoicePipelineSignal", () => {
  it("normalizes snapshot payload using current_node", () => {
    expect(normalizeVoicePipelineSignal({ current_node: "extracting" })).toEqual({
      pipelineStatus: "processing",
      processingStep: "Analyzing intent...",
    });
  });

  it("normalizes event payload using status", () => {
    expect(normalizeVoicePipelineSignal({ status: "clarifying" })).toEqual({
      pipelineStatus: "clarifying",
      processingStep: "Waiting for clarification...",
    });
  });

  it("returns null for unsupported payload", () => {
    expect(normalizeVoicePipelineSignal({ foo: "bar" })).toBeNull();
  });
});
