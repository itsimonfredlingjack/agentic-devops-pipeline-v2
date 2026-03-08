import { Children, type ReactNode } from "react";
import { type CanvasState } from "../lib/mission";
import type { PipelineStatus, TicketResult } from "../stores/pipelineStore";
import { GlassCard } from "./GlassCard";
import { LogPanel } from "./LogPanel";
import { RecordButton } from "./RecordButton";
import { SuccessCard } from "./SuccessCard";
import styles from "../styles/components/TransformationCanvas.module.css";

interface TransformationCanvasProps {
  status: PipelineStatus;
  canvasState: CanvasState;
  processingStep: string;
  transcription: string;
  ticket: TicketResult | null;
  errorMessage: string | null;
  micLevels: number[];
  wsConnected: boolean;
  monitorConnected: boolean;
  sessionId: string | null;
  loopMonitorUrl: string | null;
  detailsEntries: string[];
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

function getCanvasCopy(
  status: PipelineStatus,
  ticket: TicketResult | null,
  errorMessage: string | null,
): CanvasCopy {
  switch (status) {
    case "recording":
      return {
        title: "Listening for the objective",
        description: "Voice is flowing into SEJFA while the run takes shape.",
        helper: "Keep speaking. The machine is taking in your objective.",
      };
    case "previewing":
      return {
        title: "Review the captured objective",
        description: "Confirm the capture before it condenses into work.",
        helper: "Play it back or create the mission when it sounds right.",
      };
    case "processing":
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
    case "done":
      return {
        title: ticket ? "Mission created" : "Objective captured",
        description: ticket
          ? `${ticket.key} is ready to enter Ralph Loop.`
          : "The objective was captured, but the mission is not complete yet.",
        helper: ticket
          ? "Mission created. Record another when you are ready."
          : "Review the objective and try again when you are ready.",
      };
    case "error":
      return {
        title: "Couldn’t create the mission",
        description:
          errorMessage ??
          "The run needs attention before it can continue.",
        helper: "Retry the request, record again, or open settings.",
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
    case "clarifying":
      return "Waiting for one missing detail.";
    case "done":
      return "Mission created successfully.";
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
  transcription,
  ticket,
  errorMessage,
  micLevels,
  wsConnected,
  monitorConnected,
  sessionId,
  loopMonitorUrl,
  detailsEntries,
  onToggleRecord,
  onRetry,
  onRecordAnother,
  onOpenSettings,
  children,
}: TransformationCanvasProps) {
  const copy = getCanvasCopy(status, ticket, errorMessage);
  const hasTrayContent = Children.toArray(children).some(Boolean);
  const showRecorder =
    status === "idle" ||
    status === "recording" ||
    (status === "done" && !ticket);
  const showSuccess = status === "done" && ticket;
  const showErrorActions = status === "error";
  const progressLabel = getProgressLabel(status, processingStep);

  return (
    <section aria-label="SEJFA transformation canvas" className={styles.canvas}>
      <GlassCard className={styles.shell}>
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

            <div className={styles.transcriptBlock}>
              <div className={styles.blockLabel}>Objective transcript</div>
              <div className={styles.transcriptText}>
                {transcription || "Your captured objective will appear here."}
              </div>
            </div>

            {showSuccess && ticket ? (
              <SuccessCard
                ticket={ticket}
                sessionId={sessionId}
                monitorConnected={monitorConnected}
                loopMonitorUrl={loopMonitorUrl}
                onRecordAnother={onRecordAnother}
              />
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

            {hasTrayContent ? <div className={styles.reviewTray}>{children}</div> : null}
          </div>
        </div>

        <div className={styles.progressStrip}>
          <div className={styles.stepChip}>{progressLabel}</div>
          <LogPanel
            collapsedLabel="Show technical details"
            expandedLabel="Hide technical details"
            emptyMessage="No details yet."
            entries={detailsEntries}
          />
        </div>
      </GlassCard>
    </section>
  );
}
