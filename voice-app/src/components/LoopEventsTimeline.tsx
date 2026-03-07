import type { LoopEventEntry } from "../stores/pipelineStore";
import { GlassCard } from "./GlassCard";
import styles from "../styles/components/LoopEventsTimeline.module.css";

interface LoopEventsTimelineProps {
  events: LoopEventEntry[];
}

function dotClass(event: LoopEventEntry): string {
  switch (event.type) {
    case "ticket_queued":
      return styles.dotQueued;
    case "loop_started":
      return styles.dotStarted;
    case "loop_completed":
      return event.success ? styles.dotCompleted : styles.dotFailed;
  }
}

function eventText(event: LoopEventEntry) {
  switch (event.type) {
    case "ticket_queued":
      return (
        <>
          Queued <span className={styles.issueKey}>{event.issueKey}</span>
          {event.summary ? ` \u2014 ${event.summary}` : ""}
        </>
      );
    case "loop_started":
      return (
        <>
          Loop started for{" "}
          <span className={styles.issueKey}>{event.issueKey}</span>
        </>
      );
    case "loop_completed":
      return (
        <>
          Loop {event.success ? "completed" : "failed"} for{" "}
          <span className={styles.issueKey}>{event.issueKey}</span>
        </>
      );
  }
}

export function LoopEventsTimeline({ events }: LoopEventsTimelineProps) {
  if (events.length === 0) return null;

  return (
    <GlassCard>
      <div className={styles.label}>Ralph Loop Events</div>
      <div className={styles.timeline}>
        {events.map((e, i) => (
          <div
            key={i}
            className={styles.event}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className={`${styles.dot} ${dotClass(e)}`} />
            <div className={styles.timestamp}>{e.timestamp}</div>
            <div className={styles.text}>{eventText(e)}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
