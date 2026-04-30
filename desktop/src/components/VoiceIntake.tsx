import { Mic, MicOff, Keyboard } from "lucide-react";
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
  permissionStatus: string;
  inputLevel: number;
  errorMessage: string | null;
}

export function VoiceIntake({
  selectedTask,
  recording,
  onStartVoice,
  onStopVoice,
  errorMessage,
}: VoiceIntakeProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.title}>Voice Intake</div>
        <div className={styles.subtitle}>Human Context</div>
      </div>

      <div className={styles.body}>
        {selectedTask && (
          <div className={styles.contextBox}>
            <div className={styles.contextLabel}>Selected Task</div>
            <div className={styles.contextId}>{selectedTask.id}</div>
            <div className={styles.contextTitle}>{selectedTask.title}</div>
            {selectedTask.branch && (
              <div className={styles.contextMeta}>{selectedTask.branch}</div>
            )}
          </div>
        )}

        <div className={styles.inputSection}>
          <button
            className={`${styles.micButton} ${recording ? styles.micRecording : ""}`}
            onMouseDown={onStartVoice}
            onMouseUp={onStopVoice}
            onMouseLeave={recording ? onStopVoice : undefined}
            title="Hold to record"
          >
            {recording ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          <div className={styles.hint}>
            <Keyboard size={12} />
            <span>Hold cmd+shift+V to record</span>
          </div>

          {recording && (
            <div className={styles.recordingIndicator}>
              <div className={styles.recordingDot} />
              <span>Recording...</span>
            </div>
          )}
        </div>

        {errorMessage && (
          <div className={styles.error}>{errorMessage}</div>
        )}

        <div className={styles.injectSection}>
          <button className={styles.injectButton} disabled={!selectedTask}>
            Inject into Current Loop
          </button>
          <div className={styles.injectHint}>
            Context will be added without changing the selected task target
          </div>
        </div>
      </div>
    </div>
  );
}
