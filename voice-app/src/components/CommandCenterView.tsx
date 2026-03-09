import { deriveMissionState, humanizeStage } from "../lib/mission";
import type {
  CommandCenterEventEntry,
  CompletionEntry,
  CostEntry,
  GateEntry,
  PipelineStatus,
  StuckAlertEntry,
  TicketResult,
} from "../stores/pipelineStore";
import { GlassCard } from "./GlassCard";
import { MissionReactor } from "./MissionReactor";
import styles from "../styles/components/CommandCenterView.module.css";

interface CommandCenterViewProps {
  ticket: TicketResult | null;
  sessionId: string | null;
  status: PipelineStatus;
  processingStep: string;
  wsConnected: boolean;
  monitorConnected: boolean;
  activeStage: string | null;
  gates: GateEntry[];
  events: CommandCenterEventEntry[];
  completion: CompletionEntry | null;
  cost: CostEntry | null;
  stuckAlert: StuckAlertEntry | null;
  onBackToVoice: () => void;
}

function eventMeta(event: CommandCenterEventEntry) {
  switch (event.severity) {
    case "success":
      return styles.eventSuccess;
    case "warning":
      return styles.eventWarning;
    case "error":
      return styles.eventError;
    default:
      return styles.eventInfo;
  }
}

export function CommandCenterView({
  ticket,
  sessionId,
  status,
  processingStep,
  wsConnected,
  monitorConnected,
  activeStage,
  gates,
  events,
  completion,
  cost,
  stuckAlert,
  onBackToVoice,
}: CommandCenterViewProps) {
  const latestEvents = [...events].slice(-10).reverse();
  const mission = deriveMissionState({
    status,
    ticket,
    activeStage,
    completion,
    stuckAlert,
  });
  const sentinelGates = [
    { label: "Tests", key: "tests" },
    { label: "Lint", key: "actions" },
    { label: "Review", key: "pr" },
    { label: "CI/CD", key: "ci" },
  ];

  return (
    <div className={styles.layout}>
      <GlassCard className={styles.topRail}>
        <div className={styles.topRailRow}>
          <div className={styles.identityBlock}>
            <div className={styles.stateBadge}>{mission.label.toUpperCase()}</div>
            <div className={styles.identityText}>
              <div className={styles.commandCenterLabel}>SEJFA Command Center</div>
              <div className={styles.missionTitle}>
                {ticket ? `${ticket.key} — ${ticket.summary}` : "No active objective"}
              </div>
              <div className={styles.missionSubtitle}>
                {processingStep || mission.detail}
              </div>
            </div>
          </div>

          <div className={styles.railActions}>
            <span className={styles.railChip}>
              Voice {wsConnected ? "online" : "offline"}
            </span>
            <span className={styles.railChip}>
              Monitor {monitorConnected ? "online" : "offline"}
            </span>
            {sessionId ? <span className={styles.railChip}>Session {sessionId}</span> : null}
            <button className={styles.secondaryAction} onClick={onBackToVoice}>
              New Task
            </button>
          </div>
        </div>
      </GlassCard>

      <div className={styles.mainGrid}>
        <GlassCard className={styles.reactorPanel}>
          <MissionReactor
            ticket={ticket}
            status={status}
            activeStage={activeStage}
            gates={gates}
            completion={completion}
            stuckAlert={stuckAlert}
          />
        </GlassCard>

        <div className={styles.sideStack}>
          <GlassCard className={styles.activityPanel}>
            <div className={styles.sectionTitle}>
              Activity · {events.length} event{events.length === 1 ? "" : "s"}
            </div>
            {latestEvents.length > 0 ? (
              <div className={styles.timeline}>
                {latestEvents.map((event) => (
                  <div key={event.id} className={styles.timelineRow}>
                    <div className={`${styles.eventDot} ${eventMeta(event)}`} />
                    <div className={styles.eventBody}>
                      <div className={styles.eventTitleRow}>
                        <span className={styles.eventTitle}>{event.title}</span>
                        <span className={styles.eventTimestamp}>{event.timestamp}</span>
                      </div>
                      {event.detail ? (
                        <div className={styles.eventDetail}>{event.detail}</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>No live events yet.</div>
            )}
          </GlassCard>

          <div className={styles.metricsGrid}>
            <GlassCard>
              <div className={styles.sectionTitle}>Sentinels</div>
              <div className={styles.sentinelGrid}>
                {sentinelGates.map((gate) => {
                  const currentGate = gates.find((entry) => entry.nodeId === gate.key);
                  return (
                    <div key={gate.key} className={styles.sentinelCard}>
                      <div className={styles.sentinelLabel}>{gate.label}</div>
                      <div className={styles.sentinelStatus}>
                        {currentGate?.status ?? "pending"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            <GlassCard>
              <div className={styles.sectionTitle}>Task Snapshot</div>
              <div className={styles.snapshotList}>
                <div className={styles.snapshotRow}>
                  <span>Current stage</span>
                  <strong>{activeStage ? humanizeStage(activeStage) : "Queued"}</strong>
                </div>
                <div className={styles.snapshotRow}>
                  <span>Outcome</span>
                  <strong>{completion?.outcome ?? mission.label}</strong>
                </div>
                <div className={styles.snapshotRow}>
                  <span>Cost</span>
                  <strong>{cost ? `$${cost.total_usd.toFixed(4)}` : "pending"}</strong>
                </div>
              </div>
            </GlassCard>
          </div>

          {stuckAlert ? (
            <GlassCard className={styles.alertCard}>
              <div className={styles.sectionTitle}>Operator Alert</div>
              <div className={styles.alertText}>
                Pattern {stuckAlert.pattern} repeated {stuckAlert.repeat_count} times
                since {stuckAlert.since}.
              </div>
            </GlassCard>
          ) : null}
        </div>
      </div>

      <GlassCard className={styles.actionDock}>
        <div className={styles.actionInfo}>
          <div className={styles.sectionTitle}>Guided Controls</div>
          <div className={styles.actionCaption}>
            Safe actions only. This view shows the loop clearly without pretending
            to control systems we have not wired yet.
          </div>
        </div>
        <div className={styles.actionButtons}>
          {ticket ? (
            <a
              className={styles.primaryAction}
              href={ticket.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Ticket
            </a>
          ) : null}
          {completion?.pr_url ? (
            <a
              className={styles.secondaryAction}
              href={completion.pr_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open PR
            </a>
          ) : null}
          <button className={styles.secondaryAction} onClick={onBackToVoice}>
            Record Another
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
