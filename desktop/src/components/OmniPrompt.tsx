import { MicButton } from "./MicButton";
import { PipelineStageRail } from "./PipelineStageRail";
import styles from "./OmniPrompt.module.css";
import { useAppStore } from "../stores/appStore";
import type { LinearIssue } from "../mockLinearData";
import type { MicrophonePermissionStatus } from "../hooks/useMicrophone";

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatRecordingDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
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

function MiniSparkline() {
  return (
    <svg width="40" height="12" viewBox="0 0 40 12" className={styles.sparkline}>
      <path
        d="M0,8 L5,8 L10,3 L15,10 L20,6 L25,6 L30,4 L35,9 L40,7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="40" cy="7" r="2" fill="currentColor" />
    </svg>
  );
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
  targetedTask: LinearIssue | null;
  issueCount: number;
  issueLoading: boolean;
  issueError: string | null;
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
  issueCount,
  issueLoading,
  issueError,
}: OmniPromptProps) {
  const { phase, elapsedMs, cost, processingStep } = useAppStore();
  const recordingBlocked = permissionStatus === "denied";
  const noInputDevices = availableDevices.length === 0;
  const permissionRecoveryText =
    "Enable microphone access in System Settings > Privacy & Security > Microphone for SEJFA COMMAND.";
  const deviceRecoveryText =
    "Connect a microphone, select it above, then hold ⌘⇧V to record.";

  const getShortcutMessage = () => {
    if (recordingBlocked) return "Microphone permission required to record";
    if (noInputDevices) return "No microphone detected";
    if (issueLoading) return "Loading queue";
    if (issueError) return "Jira is unavailable";
    return <>Hold <kbd>&#x2318;&#x21E7;V</kbd> to record</>;
  };

  if (isExecuting) {
    return (
      <header className={styles.topBar}>
        <div className={styles.topBarContent}>
          <div className={styles.barLeft}>
            <div className={styles.pulseActive}></div>
            <div className={styles.taskMeta}>
              <span className={styles.tKey}>{targetedTask?.id || "ACTIVE-MISSION"}</span>
              <span className={styles.tSum}>{targetedTask?.title || "Automation run in progress"}</span>
            </div>
          </div>

          <div className={styles.barRight}>
            <div className={styles.phasePill}>{phase.toUpperCase()}</div>
            <div className={styles.telemetryStat}>
              <span className={styles.telLabel}>TIME</span>
              <span className={styles.telVal}>{elapsedMs > 0 ? formatElapsed(elapsedMs) : "—"}</span>
            </div>
            <div className={styles.telemetryStat}>
              <span className={styles.telLabel}>BURN RATIO <MiniSparkline /></span>
              <span
                className={`${styles.telVal} ${
                  cost?.total_usd && cost.total_usd > 1.0 ? styles.warnBurn : ""
                }`}
              >
                {cost ? formatCost(cost.total_usd) : "$0.00"}
              </span>
            </div>
          </div>
        </div>
      </header>
    );
  }

  const isProcessing = phase === "processing";
  const hasJira = issueCount > 0;

  return (
    <div className={styles.omniContainer}>
      <div className={styles.omniGlow} />
      <div className={styles.omniBox}>
        <div className={styles.omniTextGroup} aria-live="polite" aria-atomic="true">
          <h1 className={isProcessing ? styles.omniH1Processing : styles.omniH1}>
            {isProcessing
              ? "Processing voice input"
              : hasJira
                ? "What should we work on next?"
                : issueError
                  ? "Jira unavailable"
                  : "No queued work"
            }
          </h1>
          <p className={styles.omniSub}>
            {hasJira
              ? "Describe an objective, or open an item from the queue."
              : issueError
                ? issueError
                : "Assign work to the queue in Jira to see tasks in the work surface."}
          </p>
        </div>

        <PipelineStageRail className={styles.stageRail} />

        {isProcessing ? (
          <div className={styles.omniAction}>
            <div className={styles.processingDetail}>{processingStep || "Running voice intake pipeline..."}</div>
          </div>
        ) : (
          <div className={styles.omniAction}>
            <MicButton
              recording={recording}
              onHoldStart={onStartVoice}
              onHoldEnd={onStopVoice}
              disabled={recordingBlocked || Boolean(issueLoading)}
            />
            <div
              className={`${styles.shortcutHint} ${
                phase === "idle" && !recordingBlocked && !noInputDevices
                  ? styles.shortcutPulse
                  : ""
              } ${recordingBlocked || noInputDevices ? styles.shortcutWarn : ""}`}
              aria-live="polite"
            >
              <span>{getShortcutMessage()}</span>
            </div>

            <div className={styles.voiceHud}>
              <div className={styles.voiceHudRow}>
                <span className={styles.voiceHudLabel}>Permission</span>
                <span
                  className={`${styles.voiceHudValue} ${permissionStatus === "denied" ? styles.voiceHudWarn : ""}`}
                >
                  {permissionLabel(permissionStatus)}
                </span>
              </div>

              {recordingBlocked && (
                <div className={styles.voiceRecoveryHint} role="status" aria-live="polite">
                  {permissionRecoveryText}
                </div>
              )}

              <div className={styles.voiceHudRow}>
                <label htmlFor="voice-device" className={styles.voiceHudLabel}>
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

              {!recordingBlocked && noInputDevices && (
                <div className={styles.voiceRecoveryHint} role="status" aria-live="polite">
                  {deviceRecoveryText}
                </div>
              )}

              <div className={styles.voiceHudRow}>
                <span className={styles.voiceHudLabel}>Input level</span>
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

              <div className={styles.voiceHudRow}>
                <span className={styles.voiceHudLabel}>Recording</span>
                <span className={`${styles.voiceHudValue} ${recording ? styles.voiceHudHot : ""}`}>
                  {recording ? `LIVE ${formatRecordingDuration(recordingDurationMs)}` : "Standby"}
                </span>
              </div>

              {errorMessage && <div className={styles.voiceError}>{errorMessage}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
