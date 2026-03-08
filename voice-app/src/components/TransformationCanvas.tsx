import { Children, type ReactNode } from "react";
import { type CanvasState } from "../lib/mission";
import type {
  CompletionEntry,
  GateEntry,
  PipelineStatus,
  StuckAlertEntry,
  TicketResult,
} from "../stores/pipelineStore";
import { GlassCard } from "./GlassCard";
import { MissionReactor } from "./MissionReactor";
import { RecordButton } from "./RecordButton";
import { SuccessCard } from "./SuccessCard";
import styles from "../styles/components/TransformationCanvas.module.css";

interface TransformationCanvasProps {
  status: PipelineStatus;
  canvasState: CanvasState;
  processingStep: string;
  ticket: TicketResult | null;
  errorMessage: string | null;
  micLevels: number[];
  wsConnected: boolean;
  monitorConnected: boolean;
  sessionId: string | null;
  activeStage: string | null;
  gates: GateEntry[];
  completion: CompletionEntry | null;
  stuckAlert: StuckAlertEntry | null;
  loopMonitorUrl: string | null;
  onToggleRecord: () => void;
  onRetry: () => void;
  onRecordAnother: () => void;
  onOpenSettings: () => void;
  children?: ReactNode;
}

interface CanvasCopy {
  title: string;
  description: string;
  helper: string;
}

function humanizeStage(stage: string | null): string {
  if (!stage) return "loop";
  return stage.replace(/[_/]+/g, " ").toLowerCase();
}

function getCanvasCopy(
  canvasState: CanvasState,
  status: PipelineStatus,
  ticket: TicketResult | null,
  errorMessage: string | null,
  activeStage: string | null,
  completion: CompletionEntry | null,
): CanvasCopy {
  if (status === "error") {
    return {
      title: "Couldn’t create the mission",
      description:
        errorMessage ??
        "The run needs attention before it can continue.",
      helper: "Retry the request, record again, or open settings.",
    };
  }

  switch (canvasState.phase) {
    case "listening":
      return {
        title: "Listening for the objective",
        description: "Voice is flowing into SEJFA while the run takes shape.",
        helper: "Keep speaking. The machine is taking in your objective.",
      };
    case "processing":
      if (status === "previewing") {
        return {
          title: "Review the captured objective",
          description: "Confirm the capture before it condenses into work.",
          helper: "Play it back or create the mission when it sounds right.",
        };
      }

      return {
        title: "Extracting task context",
        description: "SEJFA is turning the objective into structured work.",
        helper: "The work core is forming from the captured objective.",
      };
    case "clarifying":
      return {
        title: "Waiting for one missing detail",
        description: "The run is paused until one missing piece is supplied.",
        helper: "Answer the clarification to complete the work core.",
      };
    case "queued":
      return {
        title: "Queued for Ralph Loop",
        description: ticket
          ? `${ticket.key} is ready for loop pickup.`
          : "This objective is ready to enter Ralph Loop.",
        helper: "Stay here while the loop picks up the run.",
      };
    case "running":
      return {
        title: `Running ${humanizeStage(activeStage)}`,
        description: "Ralph Loop is actively moving this session through work.",
        helper: "Watch the active stage while the loop advances the run.",
      };
    case "blocked":
      return {
        title: `Blocked in ${humanizeStage(activeStage)}`,
        description:
          "The loop jammed in one stage and needs operator attention.",
        helper: "Review the failed stage and retry when the path is clear.",
      };
    case "done":
      return {
        title: "Run completed",
        description: completion?.pr_url
          ? "Delivery artifacts are ready to inspect from the center flow."
          : "The run settled successfully and the outcome is ready to inspect.",
        helper: "Inspect the outcome, then launch the next objective when ready.",
      };
    case "idle":
    default:
      return {
        title: "Speak the next objective",
        description: "Your objective becomes structured work and then a live run.",
        helper: "Speak the objective to start the SEJFA run.",
      };
  }
}

function getProgressLabel(status: PipelineStatus, processingStep: string): string {
  if (processingStep) return processingStep;

  switch (status) {
    case "recording":
      return "Listening…";
    case "previewing":
      return "Capture ready for review.";
    case "processing":
      return "Extracting task context.";
    case "clarifying":
      return "Waiting for one missing detail.";
    case "done":
      return "Run is settled.";
    case "error":
      return "Mission creation is blocked until retry.";
    case "idle":
    default:
      return "Ready for your next objective.";
  }
}

export function TransformationCanvas({
  status,
  canvasState,
  processingStep,
  ticket,
  errorMessage,
  micLevels,
  wsConnected,
  monitorConnected,
  sessionId,
  activeStage,
  gates,
  completion,
  stuckAlert,
  loopMonitorUrl,
  onToggleRecord,
  onRetry,
  onRecordAnother,
  onOpenSettings,
  children,
}: TransformationCanvasProps) {
  const copy = getCanvasCopy(
    canvasState,
    status,
    ticket,
    errorMessage,
    activeStage,
    completion,
  );
  const hasTrayContent = Children.toArray(children).some(Boolean);
  const showSuccess = canvasState.phase === "queued" && ticket;
  const showReactor = ["queued", "running", "blocked", "done"].includes(
    canvasState.phase,
  );
  const showErrorActions = status === "error" || canvasState.phase === "blocked";
  const showOutcome = canvasState.phase === "done" && ticket;
  const progressLabel =
    processingStep ||
    (canvasState.phase === "queued"
      ? "Queued for Ralph Loop."
      : canvasState.phase === "running"
        ? `Running ${humanizeStage(activeStage)}.`
        : canvasState.phase === "blocked"
          ? `Blocked in ${humanizeStage(activeStage)}.`
          : canvasState.phase === "done"
            ? "Run completed."
            : getProgressLabel(status, processingStep));
  const shellClassName = [
    styles.shell,
    styles[`phase${canvasState.phase.charAt(0).toUpperCase()}${canvasState.phase.slice(1)}`],
  ]
    .filter(Boolean)
    .join(" ");
  const trayClassName =
    canvasState.phase === "clarifying" ? styles.clarificationTray : styles.reviewTray;

  return (
    <section aria-label="SEJFA transformation canvas" className={styles.canvas}>
      <GlassCard className={shellClassName}>
        <div className={styles.topRail}>
          <div>
            <div className={styles.eyebrow}>Transformation canvas</div>
            <div className={styles.loopLabel}>Ralph Loop</div>
          </div>
          <div className={styles.connectionSummary}>
            <span className={styles.connectionChip}>
              Intake {wsConnected ? "online" : "offline"}
            </span>
            <span className={styles.connectionChip}>
              Loop {monitorConnected ? "available" : "unavailable"}
            </span>
          </div>
        </div>

        <div className={styles.coreGrid}>
          <div className={styles.intakeAperture}>
            <div className={styles.apertureLabel}>Intake aperture</div>
            <RecordButton
              status={status}
              micLevels={micLevels}
              onClick={onToggleRecord}
            />
            <p className={styles.helper}>{copy.helper}</p>
          </div>

          <div className={styles.workCore}>
            <div className={styles.phaseBadge}>{canvasState.phase}</div>
            {showReactor ? (
              <div className={styles.reactorWrap}>
                <MissionReactor
                  ticket={ticket}
                  status={status}
                  activeStage={activeStage}
                  gates={gates}
                  completion={completion}
                  stuckAlert={stuckAlert}
                />
              </div>
            ) : (
              <div className={styles.phaseField} aria-hidden="true">
                <div className={styles.phaseSpark} />
                {canvasState.phase === "clarifying" ? (
                  <div className={styles.clarificationSeam} />
                ) : null}
              </div>
            )}
            <h1 className={styles.title}>{copy.title}</h1>
            <p className={styles.description}>{copy.description}</p>

            {ticket ? (
              <div className={styles.metaRow}>
                <span className={styles.metaChip}>Ticket {ticket.key}</span>
                {sessionId ? (
                  <span className={styles.metaChip}>Session {sessionId}</span>
                ) : null}
              </div>
            ) : null}

            {showSuccess && ticket ? (
              <SuccessCard
                ticket={ticket}
                sessionId={sessionId}
                monitorConnected={monitorConnected}
                onRecordAnother={onRecordAnother}
              />
            ) : null}

            {showOutcome && ticket ? (
              <div className={styles.outcomePanel}>
                <div className={styles.outcomeSummary}>
                  {completion?.pytest_summary || "Outcome artifacts are ready."}
                </div>
                <div className={styles.outcomeLinks}>
                  {completion?.pr_url ? (
                    <a
                      className={styles.outcomeLink}
                      href={completion.pr_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open PR
                    </a>
                  ) : null}
                  <a
                    className={styles.outcomeLink}
                    href={ticket.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open ticket
                  </a>
                  {loopMonitorUrl ? (
                    <a
                      className={styles.outcomeLink}
                      href={loopMonitorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open loop monitor
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            {showErrorActions ? (
              <div className={styles.errorActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={onRetry}
                >
                  Try again
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={onRecordAnother}
                >
                  Record again
                </button>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={onOpenSettings}
                >
                  Open settings
                </button>
              </div>
            ) : null}

            {hasTrayContent ? <div className={trayClassName}>{children}</div> : null}
          </div>
        </div>

        <div className={styles.progressStrip}>
          <div className={styles.stepChip}>{progressLabel}</div>
        </div>
      </GlassCard>
    </section>
  );
}
