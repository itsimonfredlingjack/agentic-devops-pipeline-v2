import { GlassCard } from "./GlassCard";
import type {
  CommandCenterEventEntry,
  CompletionEntry,
  QueueItem,
  TicketResult,
} from "../stores/pipelineStore";
import styles from "../styles/components/SupportRail.module.css";

interface SupportRailProps {
  queueItems: QueueItem[];
  events: CommandCenterEventEntry[];
  ticket: TicketResult | null;
  completion: CompletionEntry | null;
  loopMonitorUrl: string | null;
}

function artifactLinks(
  ticket: TicketResult | null,
  completion: CompletionEntry | null,
  loopMonitorUrl: string | null,
) {
  const hasRunContext = Boolean(ticket || completion);
  if (!hasRunContext) return [];

  return [
    ticket
      ? {
          label: "Open ticket",
          href: ticket.url,
        }
      : null,
    loopMonitorUrl
      ? {
          label: "Open loop monitor",
          href: loopMonitorUrl,
        }
      : null,
    completion?.pr_url
      ? {
          label: "Open PR",
          href: completion.pr_url,
        }
      : null,
  ].filter((item): item is { label: string; href: string } => item !== null);
}

export function SupportRail({
  queueItems,
  events,
  ticket,
  completion,
  loopMonitorUrl,
}: SupportRailProps) {
  const recentEvents = events.slice(-5).reverse();
  const links = artifactLinks(ticket, completion, loopMonitorUrl);

  return (
    <aside aria-label="SEJFA support panel" className={styles.rail}>
      <GlassCard compact className={styles.card}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Queue</div>
          <div className={styles.sectionBody}>
            {queueItems.length > 0 ? (
              <ul className={styles.list}>
                {queueItems.map((item) => (
                  <li key={item.key} className={styles.listItem}>
                    <span className={styles.key}>{item.key}</span>
                    <span className={styles.summary}>{item.summary}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>No queued tasks right now.</p>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Recent activity</div>
          <div className={styles.sectionBody}>
            {recentEvents.length > 0 ? (
              <ol className={styles.activityList}>
                {recentEvents.map((event) => (
                  <li key={event.id} className={styles.activityItem}>
                    <div className={styles.activityMeta}>
                      <span className={styles.eventKind}>{event.kind}</span>
                      <span className={styles.timestamp}>{event.timestamp}</span>
                    </div>
                    <div className={styles.eventTitle}>{event.title}</div>
                    {event.detail ? (
                      <div className={styles.eventDetail}>{event.detail}</div>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.empty}>No recent activity yet.</p>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Artifacts</div>
          <div className={styles.sectionBody}>
            {links.length > 0 ? (
              <div className={styles.links}>
                {links.map((link) => (
                  <a
                    key={link.label}
                    className={styles.link}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ) : (
              <p className={styles.empty}>
                No active task yet. Links appear when a task is created.
              </p>
            )}
          </div>
        </section>
      </GlassCard>
    </aside>
  );
}
