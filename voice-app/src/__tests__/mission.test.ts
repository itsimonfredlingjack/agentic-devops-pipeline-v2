import { describe, expect, it } from "vitest";
import { deriveMissionState } from "../lib/mission";

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
