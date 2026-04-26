import { describe, expect, it } from "vitest";
import { derivePipelineStage } from "../utils/pipelineStage";

describe("derivePipelineStage", () => {
  it("maps recording to Record", () => {
    expect(
      derivePipelineStage({
        pipelineStatus: "recording",
        processingStep: "",
        phase: "listening",
        loopActive: false,
      }),
    ).toBe("record");
  });

  it("maps processing extraction to Process", () => {
    expect(
      derivePipelineStage({
        pipelineStatus: "processing",
        processingStep: "Analyzing intent...",
        phase: "processing",
        loopActive: false,
      }),
    ).toBe("process");
  });

  it("maps clarifying and previewing to Verify", () => {
    expect(
      derivePipelineStage({
        pipelineStatus: "clarifying",
        processingStep: "Waiting for clarification...",
        phase: "verify",
        loopActive: false,
      }),
    ).toBe("verify");

    expect(
      derivePipelineStage({
        pipelineStatus: "previewing",
        processingStep: "",
        phase: "verify",
        loopActive: false,
      }),
    ).toBe("verify");
  });

  it("maps create/loop states to Build", () => {
    expect(
      derivePipelineStage({
        pipelineStatus: "processing",
        processingStep: "Creating Jira ticket...",
        phase: "processing",
        loopActive: false,
      }),
    ).toBe("build");

    expect(
      derivePipelineStage({
        pipelineStatus: "done",
        processingStep: "",
        phase: "done",
        loopActive: false,
      }),
    ).toBe("build");
  });
});
