import { describe, expect, it } from "vitest";
import { deriveCanvasState, deriveMissionState } from "../lib/mission";

describe("deriveMissionState", () => {
  it("should return idle when there is no mission activity", () => {
    const mission = deriveMissionState({
      status: "idle",
      ticket: null,
      activeStage: null,
      completion: null,
      stuckAlert: null,
    });

    expect(mission.phase).toBe("idle");
    expect(mission.label).toBe("Idle");
  });

  it("should treat recording as capturing", () => {
    const mission = deriveMissionState({
      status: "recording",
      ticket: null,
      activeStage: null,
      completion: null,
      stuckAlert: null,
    });

    expect(mission.phase).toBe("capturing");
    expect(mission.label).toBe("Recording");
  });

  it("should treat a created ticket without active loop stages as queued", () => {
    const mission = deriveMissionState({
      status: "done",
      ticket: {
        key: "DEV-42",
        url: "https://jira.example.com/DEV-42",
        summary: "Fix login flow",
      },
      activeStage: null,
      completion: null,
      stuckAlert: null,
    });

    expect(mission.phase).toBe("queued");
    expect(mission.label).toBe("Queued");
  });

  it("should map verification-style stages to verifying", () => {
    const mission = deriveMissionState({
      status: "done",
      ticket: {
        key: "DEV-42",
        url: "https://jira.example.com/DEV-42",
        summary: "Fix login flow",
      },
      activeStage: "verify",
      completion: null,
      stuckAlert: null,
    });

    expect(mission.phase).toBe("verifying");
    expect(mission.label).toBe("Verifying");
  });

  it("should surface completion and blocked states", () => {
    const completed = deriveMissionState({
      status: "done",
      ticket: {
        key: "DEV-42",
        url: "https://jira.example.com/DEV-42",
        summary: "Fix login flow",
      },
      activeStage: "verify",
      completion: {
        session_id: "sess-1",
        ticket_id: "DEV-42",
        outcome: "done",
        pytest_summary: null,
        ruff_summary: null,
        git_diff_summary: null,
        pr_url: null,
      },
      stuckAlert: null,
    });
    const blocked = deriveMissionState({
      status: "processing",
      ticket: {
        key: "DEV-42",
        url: "https://jira.example.com/DEV-42",
        summary: "Fix login flow",
      },
      activeStage: "agent",
      completion: null,
      stuckAlert: {
        pattern: "same tool",
        repeat_count: 3,
        tokens_burned: 1200,
        since: "2026-03-07T09:00:00Z",
      },
    });

    expect(completed.phase).toBe("completed");
    expect(blocked.phase).toBe("blocked");
  });
});

describe("deriveCanvasState", () => {
  it("should describe idle intake as an invitation to speak", () => {
    expect(
      deriveCanvasState({
        status: "idle",
        ticket: null,
        activeStage: null,
        completion: null,
        stuckAlert: null,
      }),
    ).toEqual({
      phase: "idle",
      caption: "Speak the next objective",
      emphasis: "intake",
    });
  });

  it("should treat recording as a listening state", () => {
    expect(
      deriveCanvasState({
        status: "recording",
        ticket: null,
        activeStage: null,
        completion: null,
        stuckAlert: null,
      }),
    ).toEqual({
      phase: "listening",
      caption: "Listening for the objective",
      emphasis: "intake",
    });
  });

  it("should describe processing and preview states as work formation", () => {
    expect(
      deriveCanvasState({
        status: "processing",
        ticket: null,
        activeStage: null,
        completion: null,
        stuckAlert: null,
      }),
    ).toEqual({
      phase: "processing",
      caption: "Extracting task context",
      emphasis: "formation",
    });

    expect(
      deriveCanvasState({
        status: "previewing",
        ticket: null,
        activeStage: null,
        completion: null,
        stuckAlert: null,
      }),
    ).toEqual({
      phase: "processing",
      caption: "Review the captured objective",
      emphasis: "formation",
    });
  });

  it("should surface clarification as an incomplete work core", () => {
    expect(
      deriveCanvasState({
        status: "clarifying",
        ticket: null,
        activeStage: null,
        completion: null,
        stuckAlert: null,
      }),
    ).toEqual({
      phase: "clarifying",
      caption: "Waiting for one missing detail",
      emphasis: "formation",
    });
  });

  it("should distinguish queued and running loop states", () => {
    const ticket = {
      key: "DEV-42",
      url: "https://jira.example.com/DEV-42",
      summary: "Fix login flow",
    };

    expect(
      deriveCanvasState({
        status: "done",
        ticket,
        activeStage: null,
        completion: null,
        stuckAlert: null,
      }),
    ).toEqual({
      phase: "queued",
      caption: "Queued for Ralph Loop",
      emphasis: "loop",
    });

    expect(
      deriveCanvasState({
        status: "done",
        ticket,
        activeStage: "agent",
        completion: null,
        stuckAlert: null,
      }),
    ).toEqual({
      phase: "running",
      caption: "Running Agent",
      emphasis: "loop",
    });
  });

  it("should prefer blocked and done outcomes over pipeline status", () => {
    const ticket = {
      key: "DEV-42",
      url: "https://jira.example.com/DEV-42",
      summary: "Fix login flow",
    };

    expect(
      deriveCanvasState({
        status: "processing",
        ticket,
        activeStage: "deploy",
        completion: null,
        stuckAlert: {
          pattern: "same tool",
          repeat_count: 3,
          tokens_burned: 1200,
          since: "2026-03-07T09:00:00Z",
        },
      }),
    ).toEqual({
      phase: "blocked",
      caption: "Blocked in Deploy",
      emphasis: "diagnostic",
    });

    expect(
      deriveCanvasState({
        status: "done",
        ticket,
        activeStage: "verify",
        completion: {
          session_id: "sess-1",
          ticket_id: "DEV-42",
          outcome: "done",
          pytest_summary: null,
          ruff_summary: null,
          git_diff_summary: null,
          pr_url: null,
        },
        stuckAlert: null,
      }),
    ).toEqual({
      phase: "done",
      caption: "Run completed",
      emphasis: "outcome",
    });
  });
});
