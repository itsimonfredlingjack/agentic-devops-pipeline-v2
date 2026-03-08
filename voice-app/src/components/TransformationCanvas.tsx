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
  if (!stage) return "Loop";
  return stage
    .replace(/[_/]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
      title: "Couldn’t start task creation",
      description:
        errorMessage ??
        "The request needs attention before it can continue.",
      helper: "Retry, record again, or review settings.",
    };
  }

  switch (canvasState.phase) {
    case "listening":
      return {
        title: "Listening for your request",
        description: "Voice input is being captured for task creation.",
        helper: "Keep speaking until you have described the request.",
      };
    case "processing":
      if (status === "previewing") {
        return {
          title: "Review your recording",
          description: "Confirm the recording before we create the task.",
          helper: "Play it back, then submit when it sounds right.",
        };
      }

      return {
        title: "Preparing task details",
        description: "SEJFA is converting your request into structured task data.",
        helper: "This usually takes a few seconds.",
      };
    case "clarifying":
      return {
        title: "Need one more detail",
        description: "Task creation is paused until one missing detail is provided.",
        helper: "Answer the clarification prompt below to continue.",
      };
    case "queued":
      return {
        title: "Task queued",
        description: ticket
          ? `${ticket.key} is queued for execution.`
          : "Your request is queued for execution.",
        helper: "Stay on this screen to monitor progress.",
      };
    case "running":
      return {
        title: `Running ${humanizeStage(activeStage)}`,
        description: "The execution pipeline is processing this task.",
        helper: "Current stage updates are shown in real time.",
      };
    case "blocked":
      return {
        title: `Blocked in ${humanizeStage(activeStage)}`,
        description:
          "This task is blocked in the current stage and needs manual review.",
        helper: "Review details and retry when ready.",
      };
    case "done":
      return {
        title: "Task completed",
        description: completion?.pr_url
          ? "Execution artifacts are ready for review."
          : "Execution finished successfully and results are ready.",
        helper: "Review the outcome, then start the next request when ready.",
      };
    case "idle":
    default:
      return {
        title: "Start with a request",
        description:
          "Record a request to create a task and start execution tracking.",
        helper: "Press record and describe what you need.",
      };
  }
}

function getProgressLabel(status: PipelineStatus, processingStep: string): string {
  if (processingStep) return processingStep;

  switch (status) {
    case "recording":
      return "Listening...";
    case "previewing":
      return "Recording ready for review.";
    case "processing":
      return "Preparing task details.";
    case "clarifying":
      return "Waiting for required detail.";
    case "done":
      return "Task processing complete.";
    case "error":
      return "Task start failed. Retry to continue.";
    case "idle":
    default:
      return "Ready for a new request.";
  }
}

function phaseLabel(phase: CanvasState["phase"]): string {
  switch (phase) {
    case "listening":
      return "Listening";
    case "processing":
      return "Preparing";
    case "clarifying":
      return "Needs detail";
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "blocked":
      return "Blocked";
    case "done":
      return "Done";
    case "idle":
    default:
      return "Ready";
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
      ? "Task queued."
      : canvasState.phase === "running"
        ? `Running ${humanizeStage(activeStage)}.`
        : canvasState.phase === "blocked"
          ? `Blocked in ${humanizeStage(activeStage)}.`
          : canvasState.phase === "done"
            ? "Task completed."
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
            <div className={styles.eyebrow}>Task flow</div>
            <div className={styles.loopLabel}>Execution pipeline</div>
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
            <div className={styles.apertureLabel}>Voice capture</div>
            <RecordButton
              status={status}
              micLevels={micLevels}
              onClick={onToggleRecord}
            />
            <p className={styles.helper}>{copy.helper}</p>
          </div>

          <div className={styles.workCore}>
            <div className={styles.phaseBadge}>{phaseLabel(canvasState.phase)}</div>
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
                <span className={styles.metaChip}>Task {ticket.key}</span>
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
                  Retry
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
                  Settings
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
