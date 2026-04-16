import { describe, it, expect, beforeEach } from "vitest";
import { getDefaultServiceUrls, useAppStore } from "../stores/appStore";

function ensureWindow(): any {
  const scope = globalThis as typeof globalThis & { window?: any };
  if (!scope.window) {
    scope.window = {};
  }
  if (!scope.window.localStorage) {
    const bag = new Map<string, string>();
    scope.window.localStorage = {
      getItem: (key: string) => bag.get(key),
      setItem: (key: string, value: string) => {
        bag.set(key, value);
      },
      removeItem: (key: string) => {
        bag.delete(key);
      },
      clear: () => {
        bag.clear();
      },
    };
  }
  return scope.window;
}

describe("appStore", () => {
  beforeEach(() => {
    delete ensureWindow().sejfa;
    ensureWindow().localStorage?.removeItem("sejfa.ui.density");
    useAppStore.setState(useAppStore.getInitialState());
  });

  it("starts in idle phase", () => {
    const state = useAppStore.getState();
    expect(state.phase).toBe("idle");
  });

  it("tracks voice pipeline connection", () => {
    useAppStore.getState().setVoiceConnected(true);
    expect(useAppStore.getState().voiceConnected).toBe(true);
  });

  it("tracks monitor connection", () => {
    useAppStore.getState().setMonitorConnected(true);
    expect(useAppStore.getState().monitorConnected).toBe(true);
  });

  it("reads runtime service urls from the Electron bridge", () => {
    ensureWindow().sejfa = {
      config: {
        voiceUrl: "http://127.0.0.1:8001",
        monitorUrl: "http://127.0.0.1:8110",
      },
      onGlobalShortcut: () => {},
    };

    expect(getDefaultServiceUrls()).toEqual({
      voiceUrl: "http://127.0.0.1:8001",
      monitorUrl: "http://127.0.0.1:8110",
    });
  });

  it("derives phase from pipeline status recording", () => {
    useAppStore.getState().setPipelineStatus("recording");
    expect(useAppStore.getState().phase).toBe("listening");
  });

  it("derives phase from pipeline status processing", () => {
    useAppStore.getState().setPipelineStatus("processing");
    expect(useAppStore.getState().phase).toBe("processing");
  });

  it("derives phase from pipeline status clarifying as verify", () => {
    useAppStore.getState().setPipelineStatus("clarifying");
    expect(useAppStore.getState().phase).toBe("verify");
  });

  it("derives phase from loop active", () => {
    useAppStore.getState().setLoopActive(true);
    expect(useAppStore.getState().phase).toBe("loop");
  });

  it("stores cost updates", () => {
    useAppStore.getState().setCost({ session_id: "s1", total_usd: 0.05, breakdown: { input_usd: 0.03, output_usd: 0.02, cache_usd: 0 } });
    expect(useAppStore.getState().cost?.total_usd).toBe(0.05);
  });

  it("appends events", () => {
    const event = {
      event_id: "e1",
      session_id: "s1",
      ticket_id: null,
      timestamp: new Date().toISOString(),
      event_type: "tool_use",
      tool_name: "Read",
    };
    useAppStore.getState().appendEvent(event);
    expect(useAppStore.getState().events).toHaveLength(1);
  });

  it("caps events at 200", () => {
    const store = useAppStore.getState();
    for (let i = 0; i < 210; i++) {
      store.appendEvent({
        event_id: `e${i}`,
        session_id: "s1",
        ticket_id: null,
        timestamp: new Date().toISOString(),
        event_type: "tool_use",
        tool_name: "Read",
      });
    }
    expect(useAppStore.getState().events.length).toBeLessThanOrEqual(200);
  });

  it("stores stuck alerts and derives error phase", () => {
    useAppStore.getState().setStuckAlert({ pattern: "Read", repeat_count: 5, tokens_burned: 10000, since: new Date().toISOString() });
    expect(useAppStore.getState().phase).toBe("error");
  });

  it("stores queue items", () => {
    useAppStore.getState().setQueue([{ key: "DEV-1", summary: "Test task" }]);
    expect(useAppStore.getState().queue).toHaveLength(1);
  });

  it("clears stuck alert and rederives phase", () => {
    useAppStore.getState().setStuckAlert({ pattern: "Read", repeat_count: 5, tokens_burned: 10000, since: new Date().toISOString() });
    useAppStore.getState().clearStuckAlert();
    expect(useAppStore.getState().stuckAlert).toBeNull();
    expect(useAppStore.getState().phase).toBe("idle");
  });

  it("sets completion and derives done phase", () => {
    useAppStore.getState().setCompletion({
      session_id: "s1",
      ticket_id: "DEV-1",
      outcome: "done",
      pytest_summary: "5 passed",
      ruff_summary: "ok",
      git_diff_summary: "3 files changed",
      pr_url: "https://github.com/example/pr/1",
    });
    expect(useAppStore.getState().phase).toBe("done");
  });

  it("resets all state", () => {
    useAppStore.getState().setLoopActive(true);
    useAppStore.getState().setTicketKey("DEV-1");
    useAppStore.getState().reset();
    expect(useAppStore.getState().phase).toBe("idle");
    expect(useAppStore.getState().ticketKey).toBeNull();
    expect(useAppStore.getState().loopActive).toBe(false);
  });

  it("defaults density to comfort", () => {
    expect(useAppStore.getState().density).toBe("comfort");
  });

  it("defaults workspace section to work", () => {
    expect(useAppStore.getState().activeWorkspaceSection).toBe("work");
  });

  it("updates workspace section", () => {
    useAppStore.getState().setActiveWorkspaceSection("history");
    expect(useAppStore.getState().activeWorkspaceSection).toBe("history");
  });

  it("updates and persists density", () => {
    useAppStore.getState().setDensity("compact");
    expect(useAppStore.getState().density).toBe("compact");
    expect(ensureWindow().localStorage?.getItem("sejfa.ui.density")).toBe("compact");
  });

  it("keeps density when resetting mission state", () => {
    useAppStore.getState().setDensity("compact");
    useAppStore.getState().setLoopActive(true);
    useAppStore.getState().reset();
    expect(useAppStore.getState().density).toBe("compact");
    expect(useAppStore.getState().phase).toBe("idle");
  });
});
