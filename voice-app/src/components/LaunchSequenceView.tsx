import { Children, type ReactNode } from "react";
import type { PipelineStatus, TicketResult } from "../stores/pipelineStore";
import { GlassCard } from "./GlassCard";
import { LogPanel } from "./LogPanel";
import { RecordButton } from "./RecordButton";
import { SuccessCard } from "./SuccessCard";
import { TranscriptionCard } from "./TranscriptionCard";
import styles from "../styles/components/LaunchSequenceView.module.css";

interface LaunchSequenceViewProps {
  status: PipelineStatus;
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

interface IntakeCopy {
  eyebrow: string;
  title: string;
  description: string;
}

function getIntakeCopy(
  status: PipelineStatus,
  ticket: TicketResult | null,
  errorMessage: string | null,
): IntakeCopy {
  switch (status) {
    case "recording":
      return {
        eyebrow: "Listening",
        title: "Recording objective",
        description: "Speak naturally. We will create the task from your request.",
      };
    case "previewing":
      return {
        eyebrow: "Review",
        title: "Review the capture",
        description: "Create the task when it sounds right, or discard and record again.",
      };
    case "processing":
      return {
        eyebrow: "Working",
        title: "Creating task from your request",
        description: "Transcribing, extracting intent, and preparing handoff.",
      };
    case "clarifying":
      return {
        eyebrow: "Needs input",
        title: "Need one detail",
        description: "Answer the follow-up so we can create the task correctly.",
      };
    case "done":
      return {
        eyebrow: ticket ? "Created" : "Captured",
        title: ticket ? "Task created" : "Request captured",
        description: ticket
          ? `${ticket.key} is ready for handoff.`
          : "The transcript is ready for review.",
      };
    case "error":
      return {
        eyebrow: "Issue",
        title: "Couldn’t create the task",
        description:
          errorMessage ??
          "Review the technical details, then retry or record again.",
      };
    case "idle":
    default:
      return {
        eyebrow: "Voice intake",
        title: "Say the objective",
        description: "Speak naturally. We will capture your request and create the task.",
      };
  }
}

function getProgressLabel(status: PipelineStatus, processingStep: string): string {
  if (status === "processing") {
    return processingStep || "Creating task from your request…";
  }
  if (status === "recording") {
    return "Listening…";
  }
  if (status === "clarifying") {
    return "Waiting for one clarification before task creation.";
  }
  if (status === "previewing") {
    return "Reviewing your capture before task creation.";
  }
  if (status === "done") {
    return "Task created successfully.";
  }
  if (status === "error") {
    return "Task creation is blocked until retry.";
  }
  return "Ready for your next objective.";
}

function buildDetailEntries(
  entries: string[],
  wsConnected: boolean,
  monitorConnected: boolean,
): string[] {
  const connectionEntries = [
    `[intake] Voice backend ${wsConnected ? "connected" : "disconnected"}`,
    `[intake] Loop view ${monitorConnected ? "connected" : "unavailable"}`,
  ];

  return [...connectionEntries, ...entries];
}

export function LaunchSequenceView({
  status,
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
}: LaunchSequenceViewProps) {
  const copy = getIntakeCopy(status, ticket, errorMessage);
  const hasTrayContent = Children.toArray(children).some(Boolean);
  const showRecorder =
    status === "idle" ||
    status === "recording" ||
    (status === "done" && !ticket);
  const showReviewTray = hasTrayContent;
  const showSuccess = status === "done" && ticket;
  const showErrorActions = status === "error";
  const progressLabel = getProgressLabel(status, processingStep);
  const detailEntries = buildDetailEntries(
    detailsEntries,
    wsConnected,
    monitorConnected,
  );

  return (
    <div className={styles.layout}>
      <GlassCard className={styles.intakeCard}>
        <div className={styles.cardIntro}>
          <div>
            <div className={styles.eyebrow}>{copy.eyebrow}</div>
            <h1 className={styles.title}>{copy.title}</h1>
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

        <p className={styles.description}>{copy.description}</p>

        {showRecorder ? (
          <div className={styles.controlBlock}>
            <RecordButton
              status={status}
              micLevels={micLevels}
              onClick={onToggleRecord}
            />
          </div>
        ) : null}

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

        {showReviewTray ? <div className={styles.reviewTray}>{children}</div> : null}

        <div className={styles.progressStrip}>
          <div className={styles.stepChip}>{progressLabel}</div>
          <LogPanel
            collapsedLabel="Show technical details"
            expandedLabel="Hide technical details"
            emptyMessage="No details yet."
            entries={detailEntries}
          />
        </div>
      </GlassCard>

      <TranscriptionCard status={status} text={transcription} />
    </div>
  );
}
