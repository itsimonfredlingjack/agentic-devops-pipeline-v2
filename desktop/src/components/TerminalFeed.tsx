import { useAppStore } from "../stores/appStore";
import styles from "./TerminalFeed.module.css";
import { useEffect, useRef, useState } from "react";
import { EventRecord } from "@sejfa/shared-types";

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "—";
  }
}

export function TerminalFeed() {
  const events = useAppStore((s) => s.events);
  const processingStep = useAppStore((s) => s.processingStep);
  const density = useAppStore((s) => s.density);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events, processingStep]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleCopy = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
  };

  return (
    <div className={styles.feedWrapper} data-density={density}>
      {events.length === 0 && !processingStep && (
        <div className={styles.emptyState}>
          <strong>No execution events yet.</strong>
          <span>Start a mission to populate this timeline with tool activity and outcomes.</span>
        </div>
      )}
      {events.map((e) => {
        const isExpanded = expandedId === e.event_id;
        const detail = e.detail ?? e.error ?? null;
        const hasDetail = !!detail;
        const statusLabel =
          e.success === true
            ? "Success"
            : e.success === false
              ? "Failed"
              : "Pending";

        return (
          <div key={e.event_id} className={styles.logContainer}>
            <div
                className={`${styles.logRow} ${e.success === false ? styles.logError : e.success === true ? styles.logSuccess : ""} ${hasDetail ? styles.expandable : ""}`}
              onClick={() => hasDetail && toggleExpand(e.event_id)}
              onKeyDown={(ev) => hasDetail && (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), toggleExpand(e.event_id))}
              role={hasDetail ? "button" : undefined}
              tabIndex={hasDetail ? 0 : undefined}
              aria-expanded={hasDetail ? isExpanded : undefined}
            >
              <div className={styles.logTime}>{formatTime(e.timestamp)}</div>
              <div className={styles.logToolGroup}>
                <div className={styles.logTool}>{e.tool_name}</div>
                {hasDetail && <span className={styles.expandIndicator}>{isExpanded ? "▼" : "▶"}</span>}
              </div>
              <div className={styles.logArgs}>{e.tool_args_summary || "No arguments captured."}</div>
              <div className={styles.logMeta}>
                <span className={styles.statusText}>{statusLabel}</span>
                <span>{e.duration_ms ? `${(e.duration_ms / 1000).toFixed(1)}s` : "—"}</span>
              </div>
            </div>

            {isExpanded && detail && (
              <div className={styles.logDetail}>
                <div className={styles.detailHeader}>
                  <span>DETAILED OUTPUT</span>
                  <button className={styles.copyBtn} onClick={(evt) => handleCopy(evt, detail)} aria-label="Copy details to clipboard">COPY</button>
                </div>
                <pre className={`${styles.codeBlock} ${e.success === false ? styles.codeError : ""}`}>
                  {detail}
                </pre>
              </div>
            )}

            {isExpanded && !detail && (
              <div className={styles.logDetail}>
                <div className={styles.detailHeader}>
                  <span>DETAILED OUTPUT</span>
                </div>
                <div className={styles.noDetail}>
                  No output captured for this event.
                </div>
              </div>
            )}
          </div>
        );
      })}
      
      {processingStep && (
         <div className={styles.activeStep}>
            <div className={styles.spinner}></div>
            <div className={styles.activeText}>{processingStep}</div>
         </div>
      )}
      <div ref={feedEndRef} className={styles.feedBottomBuffer} />
    </div>
  );
}
