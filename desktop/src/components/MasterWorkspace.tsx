import { useAppStore } from "../stores/appStore";
import { OmniPrompt } from "./OmniPrompt";
import { MissionDossier } from "./MissionDossier";
import { MonitorDashboard } from "./MonitorDashboard";
import { GlobalMonitorView } from "./GlobalMonitorView";
import { IntentReview } from "./IntentReview";
import { ClarificationReview } from "./ClarificationReview";
import styles from "./MasterWorkspace.module.css";
import { useJiraIssues } from "../hooks/useJiraIssues";
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
    activeWorkspaceSection,
    clarification,
    preview,
    loopActive,
    stuckAlert,
    completion,
  } = useAppStore();
  const { issues, loading, error } = useJiraIssues();

  const hasLoopContext = loopActive || Boolean(stuckAlert) || Boolean(completion);
  const isExecuting = phase === "loop" || phase === "done" || (phase === "error" && hasLoopContext);
  const selectedIssue =
    issues[selectedIndex] ??
    issues[0] ??
    null;
  const activePanel =
    activeWorkspaceSection === "history"
      ? "history"
      : clarification
        ? "clarification"
        : preview
          ? "preview"
          : "work";

  return (
    <main
      className={styles.workspace}
      data-surface={activeWorkspaceSection === "history" ? "history" : "work"}
      data-running={isExecuting}
      data-panel={activePanel}
    >
      {activeWorkspaceSection === "history" ? (
        <GlobalMonitorView />
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
            isExecuting={isExecuting}
            targetedTask={selectedIssue}
            issueCount={issues.length}
            issueLoading={loading}
            issueError={error}
          />

          <div className={`${styles.canvas} ${activePanel !== "work" ? styles.canvasSingle : ""}`}>
            <section className={styles.primaryColumn} aria-label="Current task">
              {activePanel === "clarification" && <ClarificationReview />}
              {activePanel === "preview" && <IntentReview />}
              {activePanel === "work" && <MissionDossier targetedTask={selectedIssue} />}
            </section>

            {activePanel === "work" && (
              <section className={styles.secondaryColumn} aria-label="Run status">
                <MonitorDashboard />
              </section>
            )}
          </div>
        </>
      )}
    </main>
  );
}
