import { useEffect, useRef } from "react";
import {
  connectVoicePipelineSocket,
  connectMonitorSocket,
  fetchLoopQueue,
  fetchMonitorStatus,
  fetchConversationMessages,
} from "@sejfa/data-client";
import type {
  PipelineStatus,
  LoopConversationMessage,
} from "@sejfa/shared-types";
import { useAppStore } from "../stores/appStore";
import { loadConversationHistoryOnce, type ConversationHistoryTracker } from "../utils/conversationHistory";

const POLL_INTERVAL_MS = 5_000;

export function useConnections(): void {
  const voiceUrl = useAppStore((s) => s.voiceUrl);
  const monitorUrl = useAppStore((s) => s.monitorUrl);
  const apiToken = useAppStore((s) => s.apiToken);
  const conversationHistoryRef = useRef<ConversationHistoryTracker>({
    fetchedSessionId: null,
    inFlightSessionId: null,
  });

  const updateConversationHistory = async (sessionId: string | undefined) => {
    await loadConversationHistoryOnce(
      conversationHistoryRef.current,
      sessionId,
      (id) => fetchConversationMessages(monitorUrl, id, 250, { apiToken }),
      (id, messages) => {
        if (useAppStore.getState().sessionId === id) {
          useAppStore.getState().setConversationMessages(messages);
        }
      },
    ).catch(() => {
      // Keep historical state on network error; later polls can retry this session.
    });
  };

  // Voice pipeline WebSocket
  useEffect(() => {
    const store = useAppStore.getState();

    const appendLoopEventMessage = (
      sessionId: string | null,
      type: "started" | "completed" | "queued",
      eventTaskRef: string,
    ) => {
      if (!sessionId) return;

      const messageMap = {
        started: "Loop execution started.",
        completed: "Loop execution completed.",
        queued: "Loop task queued.",
      } as const;

      const conversationMessage: LoopConversationMessage = {
        message_id: `loop-${type}-${sessionId}-${Date.now()}`,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        sender: "system",
        status: type === "completed" ? "success" : "info",
        text: `${messageMap[type]} ${eventTaskRef ? `Task: ${eventTaskRef}` : ""}`.trim(),
      };
      store.appendConversationMessage(conversationMessage);
    };

    const disconnect = connectVoicePipelineSocket(
      () => voiceUrl,
      {
        appendLog: () => {
          // Logs are not surfaced in the desktop store
        },
        setStatus: (status: string) => {
          useAppStore.getState().setPipelineStatus(status as PipelineStatus);
        },
        setProcessingStep: (step: string) => {
          useAppStore.getState().setProcessingStep(step);
        },
        setWsConnected: (connected: boolean) => {
          useAppStore.getState().setVoiceConnected(connected);
        },
        onClarification: (payload) => {
          const storeState = useAppStore.getState();
          storeState.setPreview(null);
          storeState.setClarification({
            sessionId: payload.session_id,
            questions: payload.questions,
            partialSummary: payload.partial_summary,
            round: payload.round,
          });
        },
        onPreview: (payload) => {
          const storeState = useAppStore.getState();
          const fallbackIntent = {
            summary: payload.summary,
            description: "",
            acceptanceCriteria: "",
            issueType: "Story",
            priority: "Medium",
            labels: [] as string[],
            ambiguityScore: 0,
          };
          storeState.setClarification(null);
          storeState.setPreview({
            sessionId: payload.sessionId,
            transcribedText: payload.transcribedText,
            summary: payload.summary,
            intent: payload.intent
              ? {
                  summary: payload.intent.summary,
                  description: payload.intent.description,
                  acceptanceCriteria: payload.intent.acceptance_criteria,
                  issueType: payload.intent.issue_type,
                  priority: payload.intent.priority,
                  labels: payload.intent.labels,
                  ambiguityScore: payload.intent.ambiguity_score,
                }
              : fallbackIntent,
          });
        },
        onLoopEvent: (event) => {
          const storeState = useAppStore.getState();
          if (event.type === "task_queued") {
            store.setTaskRef(event.taskRef);
            appendLoopEventMessage(storeState.sessionId, "queued", event.taskRef);
          } else if (event.type === "loop_started") {
            store.setLoopActive(true);
            store.setTaskRef(event.taskRef);
            appendLoopEventMessage(storeState.sessionId, "started", event.taskRef);
          } else if (event.type === "loop_completed") {
            store.setLoopActive(false);
            appendLoopEventMessage(storeState.sessionId, "completed", event.taskRef);
          }
        },
      },
    );

    return disconnect;
  }, [voiceUrl]);

  // Monitor Socket.IO
  useEffect(() => {
    const disconnect = connectMonitorSocket(
      () => monitorUrl,
      {
        onConnect: () => {
          useAppStore.getState().setMonitorConnected(true);
        },
        onDisconnect: () => {
          useAppStore.getState().setMonitorConnected(false);
        },
        onToolEvent: (event) => {
          useAppStore.getState().appendEvent(event);
          if (event.event_type === "stop") {
            const store = useAppStore.getState();
            if (store.sessionId) {
              store.appendConversationMessage({
                message_id: `loop-stop-${store.sessionId}-${event.event_id}`,
                session_id: event.session_id ?? store.sessionId,
                timestamp: new Date().toISOString(),
                sender: "system",
                status: event.success ? "success" : "warning",
                text: event.success
                  ? `Loop session event: completed for ${event.task_ref || "unknown task"}`
                  : `Loop session event: ${event.error ?? "tool failed"}`,
                details: event.error ?? null,
              });
            }
          }
        },
        onCostUpdate: (cost) => {
          useAppStore.getState().setCost(cost);
        },
        onStuckAlert: (alert) => {
          useAppStore.getState().setStuckAlert(alert);
          const store = useAppStore.getState();
          if (store.sessionId) {
            store.appendConversationMessage({
              message_id: `stuck-${store.sessionId}-${Date.now()}`,
              session_id: store.sessionId,
              timestamp: new Date().toISOString(),
              sender: "blocker",
              status: "danger",
              text: `Potential stall detected: ${alert.pattern}`,
              details: `Repeated ${alert.repeat_count}x since ${alert.since}`,
            });
          }
        },
        onSessionMessage: (message) => {
          useAppStore.getState().appendConversationMessage(message);
        },
        onSessionComplete: (completion) => {
          const store = useAppStore.getState();
          store.setLoopActive(false);
          store.setCompletion(completion);
        },
      },
      () => apiToken,
    );

    return disconnect;
  }, [monitorUrl, apiToken]);

  // Polling for queue and status
  useEffect(() => {
    let active = true;

    async function poll() {
      if (!active) return;

      try {
        const queue = await fetchLoopQueue(voiceUrl);
        if (active) useAppStore.getState().setQueue(queue);
      } catch {
        // Silently ignore poll failures
      }

      try {
        const status = await fetchMonitorStatus(monitorUrl);
        if (active) {
          const store = useAppStore.getState();
          store.setLoopActive(Boolean(status.active));
          if (status.session_id) store.setSessionId(status.session_id);
          if (status.active) {
            store.setTaskRef(status.task_ref ?? null);
          }
          await updateConversationHistory(status.session_id);
        }
      } catch {
        // Silently ignore poll failures
      }
    }

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [voiceUrl, monitorUrl, apiToken]);
}
