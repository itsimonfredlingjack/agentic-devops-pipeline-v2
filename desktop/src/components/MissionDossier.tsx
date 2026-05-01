import { useEffect, useState } from "react";
import { updateTaskRecord } from "@sejfa/data-client";
import type { TaskSummary } from "@sejfa/shared-types";
import { useAppStore } from "../stores/appStore";
import styles from "./MissionDossier.module.css";

interface MissionDossierProps {
  targetedTask: TaskSummary | null;
  variant?: "editor" | "preflight";
}

export function MissionDossier({ targetedTask, variant: _variant }: MissionDossierProps) {
  const voiceUrl = useAppStore((state) => state.voiceUrl);
  const apiToken = useAppStore((state) => state.apiToken);
  const [intent, setIntent] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    setIntent("");
    setSaveState("idle");
  }, [targetedTask?.id]);

  if (!targetedTask) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>⚡</span>
        <p className={styles.emptyTitle}>Select a task or describe a new mission</p>
        <p className={styles.emptyText}>
          Use the command prompt above or pick a task from the inbox to load the loop context.
        </p>
      </div>
    );
  }

  const statusLabel = targetedTask.status.replace("-", " ");
  const isDemoTask = targetedTask.id.startsWith("DEMO-");

  const handleSave = async () => {
    setSaveState("saving");
    try {
      await updateTaskRecord(
        voiceUrl ?? "",
        targetedTask.id,
        {
          title: targetedTask.title,
          description: (intent.trim() || targetedTask.description) ?? undefined,
          priority: targetedTask.priority,
        },
        { apiToken },
      );
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  return (
    <div className={styles.container}>
      {/* Hero intent prompt */}
      <textarea
        className={styles.intentPrompt}
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        placeholder="Describe what you want SEJFA to do…"
        aria-label="Mission intent"
        rows={3}
      />

      {/* Collapsible task details */}
      <button
        className={styles.detailsToggle}
        onClick={() => setShowDetails(!showDetails)}
        aria-expanded={showDetails}
      >
        <span className={styles.detailsId}>{targetedTask.id}</span>
        <span className={styles.detailsStatus} data-status={targetedTask.status}>
          {statusLabel}
        </span>
        <span className={styles.detailsChevron}>{showDetails ? "▾" : "▸"}</span>
      </button>

      {showDetails && (
        <div className={styles.detailsPanel}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Summary</span>
            <span className={styles.detailValue}>{targetedTask.title}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Priority</span>
            <span className={styles.detailValue}>{targetedTask.priority}</span>
          </div>
          {targetedTask.description && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Description</span>
              <span className={styles.detailValue}>{targetedTask.description}</span>
            </div>
          )}
          {targetedTask.assignee && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Assignee</span>
              <span className={styles.detailValue}>{targetedTask.assignee}</span>
            </div>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className={styles.actions}>
        <button
          className={styles.btnPrimary}
          onClick={() => void handleSave()}
          disabled={saveState === "saving"}
        >
          {saveState === "saving" ? "Saving…" : isDemoTask ? "Save Draft" : "Submit to Loop"}
        </button>
        <span className={styles.actionStatus}>
          {saveState === "saved" ? "✓ Saved" : saveState === "error" ? "✗ Failed" : ""}
        </span>
      </div>
    </div>
  );
}
