import type { ReactNode } from "react";
import type { MissionState } from "../lib/mission";
import type { PipelineStatus } from "../stores/pipelineStore";
import { GlassCard } from "./GlassCard";
import { RecordButton } from "./RecordButton";
import { TranscriptionCard } from "./TranscriptionCard";
import styles from "../styles/components/LaunchSequenceView.module.css";

interface LaunchSequenceViewProps {
  mission: MissionState;
  status: PipelineStatus;
  processingStep: string;
  transcription: string;
  micLevels: number[];
  wsConnected: boolean;
  monitorConnected: boolean;
  onToggleRecord: () => void;
  onSkipToCommandCenter: () => void;
  children?: ReactNode;
}

export function LaunchSequenceView({
  mission,
  status,
  processingStep,
  transcription,
  micLevels,
  wsConnected,
  monitorConnected,
  onToggleRecord,
  onSkipToCommandCenter,
  children,
}: LaunchSequenceViewProps) {
  return (
    <div className={styles.layout}>
      <GlassCard className={styles.hero}>
        <div className={styles.heroGrid}>
          <div className={styles.copyBlock}>
            <div className={styles.kicker}>Mission Briefing</div>
            <h1 className={styles.title}>Speak the mission. Watch SEJFA wake up.</h1>
            <p className={styles.subtitle}>
              Speak the mission and SEJFA will turn it into live work, then
              switch you into command center to watch the loop take over.
            </p>

            <div className={styles.badgeRow}>
              <span className={styles.badge}>Mission state {mission.label}</span>
              <span className={styles.badge}>
                Voice backend {wsConnected ? "online" : "offline"}
              </span>
              <span className={styles.badge}>
                Monitor {monitorConnected ? "online" : "offline"}
              </span>
            </div>
          </div>

          <div className={styles.rightColumn}>
            <GlassCard className={styles.launchCard}>
              <div className={styles.launchLabel}>Launch Control</div>
              <div className={styles.launchDetail}>{mission.detail}</div>
              <RecordButton
                status={status}
                processingStep={processingStep}
                micLevels={micLevels}
                onClick={onToggleRecord}
              />
              <button
                type="button"
                className={styles.skipButton}
                onClick={onSkipToCommandCenter}
              >
                Skip to Command Center
              </button>
            </GlassCard>
          </div>
        </div>
      </GlassCard>

      <div className={styles.supportGrid}>
        <TranscriptionCard text={transcription} />

        <GlassCard className={styles.flowCard}>
          <div className={styles.flowTitle}>Mission Flow</div>
          <div className={styles.flowTrack}>
            <span className={styles.flowStep}>Voice</span>
            <span className={styles.flowArrow}>→</span>
            <span className={styles.flowStep}>Ticket</span>
            <span className={styles.flowArrow}>→</span>
            <span className={styles.flowStep}>Agent</span>
            <span className={styles.flowArrow}>→</span>
            <span className={styles.flowStep}>Verify</span>
          </div>
          <p className={styles.flowCaption}>
            The launch sequence records the objective, creates the Jira mission,
            and hands you into mission control once the loop is alive.
          </p>
        </GlassCard>
      </div>

      {children}
    </div>
  );
}
