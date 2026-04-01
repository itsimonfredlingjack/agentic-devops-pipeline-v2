import { useAppStore } from "../stores/appStore";
import styles from "./TerminalFeed.module.css";
import { useEffect, useRef } from "react";

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
  const feedEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events, processingStep]);

  return (
    <div className={styles.feedWrapper}>
      {events.map((e) => (
        <div key={e.event_id} className={`${styles.logRow} ${e.success === false ? styles.logError : e.success === true ? styles.logSuccess : ""}`}>
          <div className={styles.logTime}>{formatTime(e.timestamp)}</div>
          <div className={styles.logBody}>
            <div className={styles.logTool}>{e.tool_name}</div>
            {e.tool_args_summary && <div className={styles.logArgs}>{e.tool_args_summary}</div>}
          </div>
          <div className={styles.logMeta}>
             {e.duration_ms ? `${(e.duration_ms / 1000).toFixed(1)}s` : "—"}
          </div>
        </div>
      ))}
      
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
