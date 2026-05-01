import { useState } from "react";
import { Mic, MicOff, Keyboard } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import styles from "./VoiceIntake.module.css";

interface Task {
  id: string;
  title: string;
  branch?: string;
}

interface VoiceIntakeProps {
  selectedTask: Task | null;
  recording: boolean;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onTextIntake: (text: string) => void;
  permissionStatus: string;
  inputLevel: number;
  errorMessage: string | null;
}

export function VoiceIntake({
  selectedTask,
  recording,
  onStartVoice,
  onStopVoice,
  onTextIntake,
  permissionStatus,
  inputLevel,
  errorMessage,
}: VoiceIntakeProps) {
  const { phase, processingStep, pipelineStatus } = useAppStore();
  const [promptText, setPromptText] = useState("");
  const isExecuting = phase === "loop" || phase === "done" || phase === "error";
  const isCollapsed = isExecuting && !recording;
  const isIdleHero = phase === "idle" && !recording && !selectedTask;

  const handleSubmitPrompt = () => {
    const text = promptText.trim();
    if (!text) return;
    onTextIntake(text);
    setPromptText("");
  };

  const processingLabel =
    recording
      ? "Recording… speak your task context"
      : processingStep || (pipelineStatus === "processing" ? "Processing intake…" : "");

  return (
    <div className={`${styles.centerpiece} ${isCollapsed ? styles.collapsed : ""}`} data-recording={recording ? "true" : "false"} data-phase={phase}>
      {isIdleHero && (
        <div className={styles.idleHero}>
          <div className={styles.idleWordmark} aria-label="SEJFA">
            {"SEJFA".split("").map((letter, index) => (
              <span key={`${letter}-${index}`} className={styles.idleLetter}>
                {letter}
              </span>
            ))}
          </div>
          <p className={styles.idleTagline}>
            Select a task or hold <kbd>⌘</kbd><kbd>⇧</kbd><kbd>V</kbd> to speak
          </p>
        </div>
      )}

      {!isIdleHero && (
        <>
          {/* Large mic button */}
          <button
            className={`${styles.micLarge} ${recording ? styles.micActive : ""}`}
            onMouseDown={onStartVoice}
            onMouseUp={onStopVoice}
            onMouseLeave={recording ? onStopVoice : undefined}
            aria-label={recording ? "Stop recording" : "Start recording"}
            disabled={permissionStatus === "denied"}
          >
            {recording ? <MicOff size={36} strokeWidth={1.5} /> : <Mic size={36} strokeWidth={1.5} />}
          </button>

          {/* Hint text */}
          <div className={styles.hint}>
            <Keyboard size={12} />
            <span>Hold cmd+shift+V to record</span>
          </div>

          {/* Live transcription area */}
          {(recording || pipelineStatus === "processing" || Boolean(processingStep)) && (
            <div className={styles.transcript}>
              <div className={styles.recordingIndicator}>
                <div className={styles.recordingDot} />
                <span>{processingLabel}</span>
              </div>
              {recording && (
                <div className={styles.levelBar} aria-hidden="true">
                  <div
                    className={styles.levelFill}
                    style={{ width: `${Math.max(4, Math.round(inputLevel * 100))}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* SEJFA prompt line */}
      {!isCollapsed && !isIdleHero && (
        <div className={styles.promptLine}>
          <input
            className={styles.promptInput}
            value={promptText}
            onChange={(event) => setPromptText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmitPrompt();
              }
            }}
            placeholder={isExecuting ? "Add context or command…" : "Describe what you want SEJFA to do…"}
            disabled={isExecuting}
            aria-label="SEJFA command prompt"
          />
        </div>
      )}

      {/* Task context — subtle, below prompt */}
      {selectedTask && !isCollapsed && !isIdleHero && (
        <div className={styles.contextChip}>
          <span className={styles.contextId}>{selectedTask.id}</span>
          <span className={styles.contextTitle}>{selectedTask.title}</span>
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <div className={styles.error}>{errorMessage}</div>
      )}
    </div>
  );
}
