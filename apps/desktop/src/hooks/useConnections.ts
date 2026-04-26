import { useEffect } from "react";
import {
  connectVoicePipelineSocket,
  connectMonitorSocket,
  fetchLoopQueue,
  fetchMonitorStatus,
} from "@sejfa/data-client";
import type { PipelineStatus } from "@sejfa/shared-types";
import { useAppStore } from "../stores/appStore";

const POLL_INTERVAL_MS = 5_000;

export function useConnections(): void {
  const voiceUrl = useAppStore((s) => s.voiceUrl);
  const monitorUrl = useAppStore((s) => s.monitorUrl);

  // Voice pipeline WebSocket
  useEffect(() => {
    const store = useAppStore.getState();

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
          if (event.type === "loop_started") {
            store.setLoopActive(true);
            store.setTicketKey(event.issue_key);
          } else if (event.type === "loop_completed") {
            store.setLoopActive(false);
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
        },
        onCostUpdate: (cost) => {
          useAppStore.getState().setCost(cost);
        },
        onStuckAlert: (alert) => {
          useAppStore.getState().setStuckAlert(alert);
        },
        onSessionComplete: (completion) => {
          useAppStore.getState().setCompletion(completion);
        },
      },
    );

    return disconnect;
  }, [monitorUrl]);

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
          if (status.session_id) store.setSessionId(status.session_id);
          if (status.ticket_id) store.setTicketKey(status.ticket_id);
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
  }, [voiceUrl, monitorUrl]);
}
