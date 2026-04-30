import { useEffect, useState } from "react";
import { updateTaskRecord } from "@sejfa/data-client";
import type { TaskSummary } from "@sejfa/shared-types";
import { useAppStore } from "../stores/appStore";
import styles from "./MissionDossier.module.css";

interface MissionDossierProps {
  targetedTask: TaskSummary | null;
  variant?: "editor" | "preflight";
}

export function MissionDossier({ targetedTask, variant = "editor" }: MissionDossierProps) {
  const voiceUrl = useAppStore((state) => state.voiceUrl);
  const apiToken = useAppStore((state) => state.apiToken);
  const [title, setTitle] = useState(targetedTask?.title ?? "");
  const [description, setDescription] = useState(targetedTask?.description ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setTitle(targetedTask?.title ?? "");
    setDescription(targetedTask?.description ?? "");
    setSaveState("idle");
    setStatusMessage(null);
    setCopied(false);
  }, [targetedTask?.id, targetedTask?.title, targetedTask?.description]);

  if (!targetedTask) {
    return (
      <article className={styles.dossierEmpty} aria-label="No task selected">
        <h4 className={styles.emptyTitle}>No task selected</h4>
        <p className={styles.emptyText}>
          Choose a task from the inbox or create a new one through intake to load the current loop context.
        </p>
      </article>
    );
  }

  const statusLabel = targetedTask.status.replace("-", " ");
  const startCommand = `/start-task ${targetedTask.id}`;
  const isDemoTask = targetedTask.id.startsWith("DEMO-");
  const saveButtonLabel = isDemoTask ? "Save demo task" : "Save to Linear";
  const saveSuccessLabel = isDemoTask
    ? `Saved ${targetedTask.id} in the demo workspace.`
    : `Saved ${targetedTask.id} to Linear.`;
  const saveFailureLabel = isDemoTask
    ? "Could not save this demo task."
    : "Could not save this task to Linear.";
  const savePathDescription = isDemoTask
    ? "This task context writes to the local demo workspace so the loop stays usable without Linear."
    : "This task context writes directly to Linear through the voice-pipeline backend.";

  const handleSave = async () => {
    setSaveState("saving");
    setStatusMessage(null);
    try {
      await updateTaskRecord(
        voiceUrl,
        targetedTask.id,
        {
          title: title.trim(),
          description: description.trim(),
          priority: targetedTask.priority,
        },
        { apiToken },
      );
      setSaveState("saved");
      setStatusMessage(saveSuccessLabel);
    } catch (error) {
      setSaveState("error");
      setStatusMessage(error instanceof Error ? error.message : saveFailureLabel);
    }
  };

  const handleCopyStart = async () => {
    try {
      await navigator.clipboard.writeText(startCommand);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (variant === "preflight") {
    return (
      <article
        className={styles.preflightContainer}
        aria-label={`Loop readiness for ${targetedTask.id}`}
      >
        <div className={styles.readinessStrip} aria-label="Loop readiness checks">
          <span className={styles.readinessChip}>Task selected</span>
          <span className={styles.readinessChip}>Start command ready</span>
          <span className={styles.readinessChip}>Verification pending</span>
        </div>

        <div className={styles.preflightRows}>
          <div className={styles.preflightRow}>
            <span className={styles.preflightLabel}>Target ID</span>
            <span className={styles.preflightValue}>
              <span className={styles.preflightPill}>{targetedTask.priority} priority</span>
              {targetedTask.id}
            </span>
          </div>
          <div className={styles.preflightRow}>
            <span className={styles.preflightLabel}>Summary</span>
            <span className={styles.preflightValueStrong}>{targetedTask.title}</span>
          </div>
          <div className={styles.preflightRow}>
            <span className={styles.preflightLabel}>Status</span>
            <span className={styles.statusPill} data-status={targetedTask.status}>
              {statusLabel}
            </span>
          </div>
          <div className={styles.preflightRow}>
            <span className={styles.preflightLabel}>Assignee</span>
            <span className={styles.preflightValue}>{targetedTask.assignee ?? "Unassigned"}</span>
          </div>
        </div>

        <div className={styles.preflightBlock}>
          <span className={styles.preflightBlockLabel}>Description</span>
          <p>{targetedTask.description || "No description is available for this task."}</p>
        </div>

        <div className={styles.preflightBlock}>
          <span className={styles.preflightBlockLabel}>Context map</span>
          <div className={styles.preflightContextGrid}>
            <span>Source</span>
            <strong>{targetedTask.sourceLabel}</strong>
            <span>Issue type</span>
            <strong>{targetedTask.issueType ?? "Task"}</strong>
            <span>Labels</span>
            <strong>{targetedTask.labels.length > 0 ? targetedTask.labels.join(", ") : "None"}</strong>
            <span>Manual start</span>
            <code>{startCommand}</code>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={styles.dossierContainer}
      aria-label={`Task context for ${targetedTask.id}`}
      data-watermark={targetedTask.id}
    >
      <div className={styles.metadataStrip}>
        <span
          className={styles.statusPill}
          data-status={targetedTask.status}
          aria-label={`Status: ${statusLabel}`}
        >
          {statusLabel}
        </span>
        <span
          className={styles.priorityPill}
          data-priority={targetedTask.priority}
          aria-label={`Priority: ${targetedTask.priority}`}
        >
          {targetedTask.priority} priority
        </span>
        <span className={styles.metaInline}>
          <strong>Source</strong>
          {targetedTask.sourceLabel}
        </span>
        {targetedTask.assignee && (
          <span className={styles.metaInline}>
            <strong>Assignee</strong>
            <span className={styles.assigneeGroup}>
              <span>{targetedTask.assignee}</span>
            </span>
          </span>
        )}
      </div>

      <div className={styles.dossierHero}>
        <p className={styles.ticketId}>{targetedTask.id}</p>
        <input
          className={styles.titleInput}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Task title"
        />
      </div>

      <div className={styles.dossierDetails}>
        <div className={styles.briefingSection}>
          <h4 className={styles.sectionHeader}>Description</h4>
          <textarea
            className={styles.descriptionEditor}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            aria-label="Task description"
          />

          {targetedTask.labels.length > 0 && (
            <div className={styles.labelSection}>
              {targetedTask.labels.map((label) => (
                <span key={label} className={styles.labelPill}>
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className={styles.contextList}>
          <div className={styles.contextItem}>
            <span className={styles.contextLabel}>Save path</span>
            <span className={styles.contextValue}>{savePathDescription}</span>
          </div>

          <div className={styles.contextItem}>
            <span className={styles.contextLabel}>Manual start-task</span>
            <code className={styles.commandBlock}>{startCommand}</code>
          </div>

          <div className={styles.contextItem}>
              <span className={styles.contextLabel}>Run note</span>
            <span className={styles.contextValue}>
              Saving the task and starting the Ralph Loop are separate actions by design.
            </span>
          </div>
        </div>
      </div>

      <footer className={styles.actionArea}>
        <div className={styles.actionGroup}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleSave()}
            disabled={saveState === "saving" || !title.trim()}
          >
            {saveState === "saving" ? "Saving…" : saveButtonLabel}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => void handleCopyStart()}>
            {copied ? "Copied /start-task" : "Copy /start-task"}
          </button>
          {targetedTask.url && (
            <a className={styles.linkButton} href={targetedTask.url} target="_blank" rel="noreferrer">
              Open source record
            </a>
          )}
        </div>

        <span className={styles.ctaStatus}>{statusMessage ?? "Task record ready"}</span>
      </footer>
    </article>
  );
}
