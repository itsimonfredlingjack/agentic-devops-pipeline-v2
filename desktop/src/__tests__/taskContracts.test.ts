import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authHeaders,
  connectVoicePipelineSocket,
  fetchTaskInbox,
  fetchLoopQueue,
  fetchMonitorStatus,
  mapTaskRecordToTaskSummary,
  mapSessionSummaryToTaskRun,
  sendConversationMessage,
} from "@sejfa/data-client";
import type { TaskSummary } from "@sejfa/shared-types";
import { buildCommandPaletteCommands } from "../components/CommandPalette";
import { loadConversationHistoryOnce, type ConversationHistoryTracker } from "../utils/conversationHistory";
import { resolveSelectedTask } from "../utils/taskSelection";

const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  globalThis.WebSocket = originalWebSocket;
});

describe("task contract adapters", () => {
  const taskA: TaskSummary = {
    id: "SEJ-1",
    title: "First task",
    status: "todo",
    priority: "medium",
    assignee: undefined,
    labels: [],
    source: "linear",
    sourceLabel: "Linear",
    sourceType: "system-of-record",
  };

  const taskB: TaskSummary = {
    id: "SEJ-2",
    title: "Assigned task",
    status: "todo",
    priority: "high",
    assignee: "Tony",
    labels: [],
    source: "linear",
    sourceLabel: "Linear",
    sourceType: "system-of-record",
  };

  it("resolves filtered task selection by id instead of visible index", () => {
    const tasks = [taskA, taskB];
    const visibleAssignedTasks = tasks.filter((task) => Boolean(task.assignee));
    const selectedFromFilteredView = visibleAssignedTasks[0].id;

    expect(resolveSelectedTask(tasks, selectedFromFilteredView)).toBe(taskB);
  });

  it("command palette task commands select task ids, not positional indexes", () => {
    const selected: string[] = [];
    const sections: string[] = [];
    const commands = buildCommandPaletteCommands({
      tasks: [taskA, taskB],
      selectedTaskId: "SEJ-2",
      phase: "idle",
      setActiveWorkspaceSection: (section) => sections.push(section),
      onSelectTaskId: (taskId) => selected.push(taskId),
    });

    commands.find((command) => command.id === "quick-selected-task")?.action();
    commands.find((command) => command.id === "task-SEJ-2")?.action();

    expect(selected).toEqual(["SEJ-2", "SEJ-2"]);
    expect(sections).toEqual(["work"]);
  });

  it("omits selected-task quick jump when selected id is not in the current task list", () => {
    const commands = buildCommandPaletteCommands({
      tasks: [taskA],
      selectedTaskId: "SEJ-404",
      phase: "idle",
      setActiveWorkspaceSection: vi.fn(),
      onSelectTaskId: vi.fn(),
    });

    expect(commands.some((command) => command.id === "quick-selected-task")).toBe(false);
  });

  it("conversation history marks a session fetched only after success", async () => {
    const tracker: ConversationHistoryTracker = {
      fetchedSessionId: null,
      inFlightSessionId: null,
    };
    const fetchMessages = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValueOnce([]);
    const setMessages = vi.fn();

    await expect(
      loadConversationHistoryOnce(tracker, "s1", fetchMessages, setMessages),
    ).rejects.toThrow("temporary outage");
    expect(tracker.fetchedSessionId).toBeNull();

    await loadConversationHistoryOnce(tracker, "s1", fetchMessages, setMessages);

    expect(fetchMessages).toHaveBeenCalledTimes(2);
    expect(tracker.fetchedSessionId).toBe("s1");
    expect(setMessages).toHaveBeenCalledWith("s1", []);
  });

  it("conversation history suppresses duplicate in-flight fetches", async () => {
    const tracker: ConversationHistoryTracker = {
      fetchedSessionId: null,
      inFlightSessionId: "s1",
    };
    const fetchMessages = vi.fn();

    await loadConversationHistoryOnce(tracker, "s1", fetchMessages, vi.fn());

    expect(fetchMessages).not.toHaveBeenCalled();
  });

  it("builds bearer auth headers only when a token is present", () => {
    expect(authHeaders("test-token")).toEqual({ Authorization: "Bearer test-token" });
    expect(authHeaders("")).toEqual({});
  });

  it("attaches bearer auth to protected task and conversation requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
      });
    globalThis.fetch = fetchMock as typeof fetch;

    await fetchTaskInbox("http://localhost:8000", 20, { apiToken: "test-token" });
    await sendConversationMessage(
      "http://localhost:8110",
      "s1",
      { message: "hello" },
      { apiToken: "test-token" },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8000/api/tasks?max_results=20",
      { headers: { Authorization: "Bearer test-token" } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8110/sessions/s1/messages",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });

  it("throws when protected conversation writes return non-2xx", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }) as typeof fetch;

    await expect(
      sendConversationMessage(
        "http://localhost:8110",
        "s1",
        { message: "hello" },
        { apiToken: "bad-token" },
      ),
    ).rejects.toThrow("Conversation message returned HTTP 401");
  });

  it("maps Linear task payloads into task summaries", () => {
    expect(
      mapTaskRecordToTaskSummary({
        id: "SEJ-42",
        linear_id: "linear-42",
        title: "Replace fake Linear mapping",
        status: "in-progress",
        issue_type: null,
        priority: "high",
        assignee: "Tony",
        labels: ["desktop", "cleanup"],
        source: "linear",
        source_label: "Linear",
        source_type: "system-of-record",
        description: "Wire the desktop inbox to Linear.",
        url: "https://linear.app/sejfa/issue/SEJ-42/replace-fake-linear-mapping",
      }),
    ).toEqual({
      id: "SEJ-42",
      title: "Replace fake Linear mapping",
      status: "in-progress",
      priority: "high",
      assignee: "Tony",
      labels: ["desktop", "cleanup"],
      source: "linear",
      sourceLabel: "Linear",
      sourceType: "system-of-record",
      issueType: undefined,
      description: "Wire the desktop inbox to Linear.",
      url: "https://linear.app/sejfa/issue/SEJ-42/replace-fake-linear-mapping",
    });
  });

  it("coerces retired tracker sources to unknown", () => {
    expect(
      mapTaskRecordToTaskSummary({
        id: "SEJ-99",
        linear_id: "linear-99",
        title: "Carry forward compatibility reads only",
        status: "backlog",
        issue_type: null,
        priority: "low",
        assignee: null,
        labels: [],
        source: "retired-tracker" as never,
        source_label: "Retired tracker",
        source_type: "external-tracker",
        description: null,
        url: "https://linear.app/sejfa/issue/SEJ-99/carry-forward-compatibility-reads-only",
      }),
    ).toMatchObject({
      source: "unknown",
      sourceLabel: "Retired tracker",
    });
  });

  it("maps session summaries into task/run language without surfacing legacy ids", () => {
    expect(
      mapSessionSummaryToTaskRun({
        session_id: "sess-1",
        task_ref: "SEJ-42",
        started_at: "2026-04-19T09:00:00Z",
        ended_at: null,
        total_cost_usd: 0.125,
        total_events: 14,
        outcome: "unknown",
      }),
    ).toEqual({
      runId: "sess-1",
      taskRef: "SEJ-42",
      startedAt: "2026-04-19T09:00:00Z",
      endedAt: null,
      totalCostUsd: 0.125,
      totalEvents: 14,
      outcome: "pending",
    });
  });

  it("normalizes queue payloads to taskRef-first shape", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { task_ref: "SEJ-42", summary: "New queue item" },
      ],
    }) as typeof fetch;

    await expect(fetchLoopQueue("http://localhost:8000")).resolves.toEqual([
      { taskRef: "SEJ-42", summary: "New queue item" },
    ]);
  });

  it("normalizes monitor status to task_ref-first shape", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        active: true,
        session_id: "sess-7",
        task_ref: "SEJ-88",
      }),
    }) as typeof fetch;

    await expect(fetchMonitorStatus("http://localhost:8110")).resolves.toEqual({
      active: true,
      session_id: "sess-7",
      task_ref: "SEJ-88",
    });
  });

  it("normalizes loop websocket events to taskRef-first shape", () => {
    const onLoopEvent = vi.fn();

    class FakeWebSocket {
      static latest: FakeWebSocket | null = null;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(_url: string) {
        FakeWebSocket.latest = this;
      }

      close() {}
    }

    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const disconnect = connectVoicePipelineSocket(
      () => "http://localhost:8000",
      {
        appendLog: vi.fn(),
        setStatus: vi.fn(),
        setProcessingStep: vi.fn(),
        setWsConnected: vi.fn(),
        onLoopEvent,
      },
    );

    const socket = FakeWebSocket.latest;
    expect(socket).not.toBeNull();

    socket?.onmessage?.({
      data: JSON.stringify({
        type: "task_queued",
        task_ref: "SEJ-77",
        summary: "Queued event",
      }),
    });
    socket?.onmessage?.({
      data: JSON.stringify({
        type: "loop_started",
        task_ref: "SEJ-78",
      }),
    });

    expect(onLoopEvent).toHaveBeenNthCalledWith(1, {
      type: "task_queued",
      taskRef: "SEJ-77",
      summary: "Queued event",
    });
    expect(onLoopEvent).toHaveBeenNthCalledWith(2, {
      type: "loop_started",
      taskRef: "SEJ-78",
      summary: undefined,
      success: undefined,
    });

    disconnect();
  });
});
