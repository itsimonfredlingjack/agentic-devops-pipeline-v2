import type { LoopConversationMessage } from "@sejfa/shared-types";

export interface ConversationHistoryTracker {
  fetchedSessionId: string | null;
  inFlightSessionId: string | null;
}

export async function loadConversationHistoryOnce(
  tracker: ConversationHistoryTracker,
  sessionId: string | undefined,
  fetchMessages: (sessionId: string) => Promise<LoopConversationMessage[]>,
  setMessages: (sessionId: string, messages: LoopConversationMessage[]) => void,
): Promise<void> {
  if (!sessionId) return;
  if (tracker.fetchedSessionId === sessionId || tracker.inFlightSessionId === sessionId) {
    return;
  }

  tracker.inFlightSessionId = sessionId;
  try {
    const messages = await fetchMessages(sessionId);
    tracker.fetchedSessionId = sessionId;
    setMessages(sessionId, messages);
  } finally {
    if (tracker.inFlightSessionId === sessionId) {
      tracker.inFlightSessionId = null;
    }
  }
}

