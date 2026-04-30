import type { TaskSummary } from "@sejfa/shared-types";
import type { MicrophonePermissionStatus } from "../hooks/useMicrophone";
import { useAppStore } from "../stores/appStore";
import { MicButton } from "./MicButton";
import { PipelineStageRail } from "./PipelineStageRail";
import styles from "./OmniPrompt.module.css";

function formatRecordingDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function permissionLabel(status: MicrophonePermissionStatus): string {
  switch (status) {
    case "granted":
      return "Granted";
    case "denied":
      return "Denied";
    case "prompt":
      return "Prompt";
    default:
      return "Unknown";
  }
}

interface OmniPromptProps {
  recording: boolean;
  onStartVoice: () => void;
  onStopVoice: () => void;
  permissionStatus: MicrophonePermissionStatus;
  availableDevices: MediaDeviceInfo[];
  selectedDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
  inputLevel: number;
  recordingDurationMs: number;
  errorMessage: string | null;
  isExecuting: boolean;
  targetedTask: TaskSummary | null;
  taskCount: number;
  taskLoading: boolean;
  taskError: string | null;
}

export function OmniPrompt({
  recording,
  onStartVoice,
  onStopVoice,
  permissionStatus,
  availableDevices,
  selectedDeviceId,
  onSelectDevice,
  inputLevel,
  recordingDurationMs,
  errorMessage,
  isExecuting,
  targetedTask,
  taskCount,
  taskLoading,
  taskError,
}: OmniPromptProps) {
  const { phase, processingStep } = useAppStore();
  const recordingBlocked = permissionStatus === "denied";
  const noInputDevices = availableDevices.length === 0;
  const isProcessing = phase === "processing";
  const showStageRail = recording || isProcessing || isExecuting || phase === "listening" || phase === "verify";
  const showVoicePanel =
    recording ||
    recordingBlocked ||
    noInputDevices ||
    Boolean(errorMessage) ||
    isProcessing ||
    isExecuting;
  const shortcutText = recordingBlocked
    ? "Microphone permission required"
    : noInputDevices
      ? "No microphone detected"
      : "Hold cmd+shift+V to record";

  return (
    <section className={styles.card} data-voice-panel={showVoicePanel ? "open" : "closed"}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <h2 className={styles.title}>
            {isExecuting ? "Capture follow-up context" : "Add intake"}
          </h2>
          <p className={styles.subtitle}>
            {isExecuting
              ? "The run is active. Voice intake stays available for clarifications and task context."
              : "Add task context by text or voice without changing the selected loop target."}
          </p>
        </div>

        <div className={styles.contextBlock}>
          <span className={styles.contextLabel}>Selected task</span>
          <span className={styles.contextValue}>
            {targetedTask ? `${targetedTask.id} · ${targetedTask.title}` : "No task selected"}
          </span>
          <span className={styles.contextMeta}>
            {taskLoading
              ? "Loading task inbox..."
              : taskError
                ? taskError
                : `${taskCount} tasks available in the current inbox`}
          </span>
        </div>
      </div>

      {showStageRail && <PipelineStageRail className={styles.stageRail} />}

      <div className={styles.actionArea}>
        <div className={styles.micColumn}>
          <MicButton
            recording={recording}
            onHoldStart={onStartVoice}
            onHoldEnd={onStopVoice}
            disabled={recordingBlocked}
          />
          <div
            className={`${styles.shortcutHint} ${
              recordingBlocked || noInputDevices ? styles.shortcutWarn : ""
            }`.trim()}
          >
            {shortcutText}
          </div>
        </div>

        <div className={`${styles.voicePanel} ${showVoicePanel ? styles.voicePanelOpen : styles.voicePanelClosed}`}>
            <div className={styles.voiceRow}>
              <span className={styles.voiceLabel}>Voice intake</span>
              <span
                className={`${styles.voiceValue} ${
                  permissionStatus === "denied" ? styles.voiceWarn : ""
                }`.trim()}
              >
                {permissionLabel(permissionStatus)}
              </span>
            </div>

            <div className={styles.voiceRow}>
              <label htmlFor="voice-device" className={styles.voiceLabel}>
                Microphone
              </label>
              <select
                id="voice-device"
                className={styles.voiceSelect}
                value={selectedDeviceId}
                onChange={(event) => onSelectDevice(event.target.value)}
                disabled={recording || availableDevices.length === 0}
                aria-label="Select microphone input"
              >
                {availableDevices.length === 0 && <option value="">Default microphone</option>}
                {availableDevices.map((device, index) => (
                  <option key={device.deviceId || `mic-${index}`} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.voiceRow}>
              <span className={styles.voiceLabel}>Input level</span>
              <div
                className={styles.levelTrack}
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(inputLevel * 100)}
              >
                <div className={styles.levelFill} style={{ width: `${Math.round(inputLevel * 100)}%` }} />
              </div>
            </div>

            <div className={styles.voiceRow}>
              <span className={styles.voiceLabel}>Recording</span>
              <span className={`${styles.voiceValue} ${recording ? styles.voiceHot : ""}`.trim()}>
                {recording ? `Live ${formatRecordingDuration(recordingDurationMs)}` : "Standby"}
              </span>
            </div>

            {(recordingBlocked || noInputDevices) && (
              <div className={styles.recoveryHint}>
                {recordingBlocked
                  ? "Enable microphone access in macOS privacy settings for SEJFA."
                  : "Connect a microphone and choose it above before starting voice intake."}
              </div>
            )}

            {(isProcessing || isExecuting) && (
              <div className={styles.busyNote}>
                {processingStep || "The intake and loop pipeline are updating live."}
              </div>
            )}

            {errorMessage && <div className={styles.errorBox}>{errorMessage}</div>}
          </div>
      </div>
    </section>
  );
}
