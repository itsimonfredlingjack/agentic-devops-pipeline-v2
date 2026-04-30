import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";
import { sendConversationMessage, sendTacticalInstruction, submitClarification } from "@sejfa/data-client";
import styles from "./LoopConversationPanel.module.css";

type FilterType = "all" | "user" | "loop" | "system" | "blocker";

function formatTimestamp(value: string): string {
  try {
    return new Date(value).toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

function getStatusTone(status?: string): string {
  if (!status) return "";
  return styles[`status${status[0].toUpperCase() + status.slice(1)}`] ?? "";
}

function makeMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function LoopConversationPanel() {
  const {
    sessionId,
    monitorUrl,
    voiceUrl,
    apiToken,
    clarification,
    stuckAlert,
    conversationMessages,
    appendConversationMessage,
    setClarification,
  } = useAppStore();
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const composerInput = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    const normalizedFilter = search.trim().toLowerCase();
    return conversationMessages
      .filter((message) => (filter === "all" ? true : message.sender === filter))
      .filter((message) => {
        if (!normalizedFilter) return true;
        const haystack = [
          message.text,
          message.details,
          message.status,
          message.sender,
          message.session_id,
          message.message_id,
        ]
          .filter((value): value is string => typeof value === "string")
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedFilter);
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [conversationMessages, filter, search]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [list.length, conversationMessages.length]);

  const sendMessage = async (text: string) => {
    if (!sessionId || !text.trim()) return;

    const payload = {
      message: text.trim(),
      sender: "user" as const,
      status: "info" as const,
      message_id: makeMessageId("chat"),
    };

    setSending(true);
    try {
      if (clarification && clarification.sessionId === sessionId) {
        await sendConversationMessage(monitorUrl, sessionId, payload, { apiToken });
        await submitClarification(voiceUrl, { sessionId, text: text.trim() });
        setClarification(null);
        appendConversationMessage({
          message_id: payload.message_id,
          session_id: sessionId,
          timestamp: new Date().toISOString(),
          sender: "user",
          text: payload.message,
          status: "info",
        });
      } else {
        await sendTacticalInstruction(monitorUrl, sessionId, text.trim(), { apiToken });
      }
      setComposerText("");
      composerInput.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendMessage(composerText);
  };

  const filteredMessages = list.filter((message) => !sessionId || message.session_id === sessionId);
  const contextHint =
    stuckAlert && sessionId
      ? `Observed blocker: ${stuckAlert.pattern}`
      : "Operator notes persist immediately. Clarifications route to intake; live abort is handled from run controls.";

  return (
    <section className={styles.panel} aria-live="polite">
      <div className={styles.controlsRow}>
        <input
          className={styles.searchInput}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search run thread"
          aria-label="Search conversation"
        />
        <label className={styles.senderFilter}>
          <span className={styles.hiddenLabel}>Filter</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as FilterType)}
            aria-label="Filter by sender"
          >
            <option value="all">All</option>
            <option value="user">User</option>
            <option value="loop">Loop</option>
            <option value="system">System</option>
            <option value="blocker">Blockers</option>
          </select>
        </label>
      </div>

      <div className={styles.feed} role="log" aria-label="Conversation thread">
        {filteredMessages.length === 0 ? (
          <p className={styles.emptyState}>
            {!sessionId
              ? "No active run. Start a task to open the conversation channel."
              : "No messages yet for this run. Add an operator note or clarification when needed."}
          </p>
        ) : (
          filteredMessages.map((message) => {
            const senderLabel = message.sender.toUpperCase();
            return (
              <article
                key={message.message_id}
                className={`${styles.messageCard} ${styles[`from-${message.sender}`]}`}
              >
                <header className={styles.messageHeader}>
                  <span className={styles.senderChip} aria-label={`Sender: ${message.sender}`}>
                    {senderLabel}
                  </span>
                  <span className={styles.timeStamp}>
                    {formatTimestamp(message.timestamp)} • {message.session_id.slice(0, 12)}
                  </span>
                </header>

                <p className={styles.messageText}>{message.text}</p>

                {message.status && (
                  <span
                    className={`${styles.statusChip} ${getStatusTone(message.status)}`}
                    aria-label={`Status: ${message.status}`}
                  >
                    {message.status}
                  </span>
                )}

                {message.details && <p className={styles.messageDetails}>{message.details}</p>}
              </article>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form className={styles.composer} onSubmit={onSubmit}>
        <input
          ref={composerInput}
          className={styles.composerInput}
          value={composerText}
          onChange={(event) => setComposerText(event.target.value)}
          placeholder={sessionId ? "Add an operator note or clarification..." : "Start a task to add notes"}
          disabled={!sessionId || sending}
          aria-label="Conversation input"
        />
        <button
          type="submit"
          className={styles.sendButton}
          disabled={!sessionId || sending || !composerText.trim()}
        >
          SEND
        </button>
      </form>

      <p className={styles.contextHint} role="note">
        {contextHint}
      </p>
    </section>
  );
}
