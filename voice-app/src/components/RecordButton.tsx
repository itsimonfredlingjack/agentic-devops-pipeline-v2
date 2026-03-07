import { useEffect, useRef, useState } from "react";
import type { PipelineStatus } from "../stores/pipelineStore";
import styles from "../styles/components/RecordButton.module.css";

interface RecordButtonProps {
  status: PipelineStatus;
  processingStep: string;
  micLevels?: number[];
  onClick: () => void;
}

const MIC_ICON = (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getAriaLabel(status: PipelineStatus): string {
  switch (status) {
    case "recording":
      return "Stop recording";
    case "processing":
      return "Processing audio";
    default:
      return "Start recording";
  }
}

export function RecordButton({
  status,
  processingStep,
  micLevels,
  onClick,
}: RecordButtonProps) {
  const isRecording = status === "recording";
  const isProcessing = status === "processing";
  const isIdle = status === "idle" || status === "done" || status === "error";
  const isDisabled =
    isProcessing || status === "clarifying" || status === "previewing";

  // Recording timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRecording) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsed(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const buttonClass = [styles.button, isRecording && styles.recording]
    .filter(Boolean)
    .join(" ");

  // Determine if we have real mic levels for reactive bars
  const hasLevels = micLevels && micLevels.length > 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.buttonOuter}>
        {isRecording && (
          <>
            <div className={styles.ring} />
            <div className={`${styles.ring} ${styles.ring2}`} />
          </>
        )}
        <button
          className={buttonClass}
          onClick={onClick}
          disabled={isDisabled}
          aria-label={getAriaLabel(status)}
        >
          {isRecording ? (
            <div className={styles.waveform}>
              {hasLevels
                ? micLevels
                    .slice(-5)
                    .map((level, i) => (
                      <div
                        key={i}
                        className={`${styles.bar} ${styles.barReactive}`}
                        style={{ transform: `scaleY(${0.15 + level * 0.85})` }}
                      />
                    ))
                : Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className={styles.bar} />
                  ))}
            </div>
          ) : isProcessing ? (
            <div className={styles.spinner} />
          ) : (
            MIC_ICON
          )}
        </button>
      </div>

      {/* Recording timer */}
      {isRecording && (
        <span className={styles.timer}>{formatTime(elapsed)}</span>
      )}

      {/* Processing step text */}
      {isProcessing && processingStep && (
        <span className={styles.stepText}>{processingStep}</span>
      )}

      {/* Idle hint */}
      {isIdle && <span className={styles.hint}>Press Space to record</span>}
    </div>
  );
}
