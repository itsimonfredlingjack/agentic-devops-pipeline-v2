import { useAppStore } from "../stores/appStore";
import { OmniPrompt } from "./OmniPrompt";
import { MissionDossier } from "./MissionDossier";
import { MonitorDashboard } from "./MonitorDashboard";
import { GlobalMonitorView } from "./GlobalMonitorView";
import { IntentReview } from "./IntentReview";
import { ClarificationReview } from "./ClarificationReview";
import styles from "./MasterWorkspace.module.css";
import { mockLinearCycle } from "../mockLinearData";
import type { MicrophonePermissionStatus } from "../hooks/useMicrophone";

interface MasterWorkspaceProps {
  selectedIndex: number;
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
}

export function MasterWorkspace({
  selectedIndex,
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
}: MasterWorkspaceProps) {
  const {
    phase,
    ticketKey,
    activeGlobalView,
    clarification,
    preview,
    loopActive,
    stuckAlert,
    completion,
  } = useAppStore();

  if (activeGlobalView === "monitor") {
    return (
      <main className={styles.workspace}>
        <GlobalMonitorView />
      </main>
    );
  }

  if (clarification) {
    return (
      <main className={styles.workspace}>
        <ClarificationReview />
      </main>
    );
  }

  if (preview) {
    return (
      <main className={styles.workspace}>
        <IntentReview />
      </main>
    );
  }

  // Keep intake errors in the intake surface. MonitorDashboard should only appear for loop execution states.
  const hasLoopContext = loopActive || Boolean(stuckAlert) || Boolean(completion);
  const isExecuting = phase === "loop" || phase === "done" || (phase === "error" && hasLoopContext);

  const targetedTask = isExecuting
    ? mockLinearCycle.find(q => q.id === ticketKey) || mockLinearCycle[selectedIndex]
    : mockLinearCycle[selectedIndex];

  return (
    <main className={styles.workspace}>
      {isExecuting ? (
        <MonitorDashboard />
      ) : (
        <>
          <OmniPrompt
            recording={recording}
            onStartVoice={onStartVoice}
            onStopVoice={onStopVoice}
            permissionStatus={permissionStatus}
            availableDevices={availableDevices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={onSelectDevice}
            inputLevel={inputLevel}
            recordingDurationMs={recordingDurationMs}
            errorMessage={errorMessage}
            isExecuting={false}
            targetedTask={targetedTask}
          />
          <div className={`${styles.canvas} ${styles.canvasIdle}`}>
            <MissionDossier targetedTask={targetedTask} />
          </div>
        </>
      )}
    </main>
  );
}
