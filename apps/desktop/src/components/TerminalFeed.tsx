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

// Simulated data for demo purposes
function getSimulatedDetail(e: EventRecord): string | null {
  if (e.detail) return e.detail;
  if (e.error) return e.error;

  if (e.tool_name === "Bash") {
    if (e.tool_args_summary?.includes("pytest")) {
      return "============================= test session starts =============================\nplatform darwin -- Python 3.11.0, pytest-8.1.1, pluggy-1.4.0\nrootdir: /Users/coffeedev/Projects/agentic-devops\nplugins: asyncio-0.23.5, cov-4.1.0\ncollected 4 items\n\ntests/test_logic.py ....                                                 [100%]\n\n============================== 4 passed in 0.12s ==============================";
    }
    if (e.tool_args_summary?.includes("ruff")) {
      return "All checks passed! No linting errors found in 42 files.";
    }
  }

  if (e.tool_name === "Edit" || e.tool_name === "replace") {
    return "--- desktop/src/components/Sidebar.tsx\n+++ desktop/src/components/Sidebar.tsx\n@@ -42,5 +42,6 @@\n-  const [isOpen, setIsOpen] = useState(false);\n+  const [isOpen, setIsOpen] = useState(true);\n+  const activeGlobalView = useAppStore(s => s.activeGlobalView);";
  }

  return null;
}

export function TerminalFeed() {
  const events = useAppStore((s) => s.events);
  const processingStep = useAppStore((s) => s.processingStep);
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
    <div className={styles.feedWrapper}>
      {events.map((e) => {
        const isExpanded = expandedId === e.event_id;
        const detail = getSimulatedDetail(e);
        const hasDetail = !!detail;

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
              <div className={styles.logBody}>
                <div className={styles.logToolGroup}>
                  <div className={styles.logTool}>{e.tool_name}</div>
                  {hasDetail && <span className={styles.expandIndicator}>{isExpanded ? "▼" : "▶"}</span>}
                </div>
                {e.tool_args_summary && <div className={styles.logArgs}>{e.tool_args_summary}</div>}
              </div>
              <div className={styles.logMeta}>
                 {e.duration_ms ? `${(e.duration_ms / 1000).toFixed(1)}s` : "—"}
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
