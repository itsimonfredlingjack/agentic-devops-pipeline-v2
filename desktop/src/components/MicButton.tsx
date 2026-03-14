import styles from "./MicButton.module.css";

interface MicButtonProps {
  recording: boolean;
  onClick: () => void;
}

export function MicButton({ recording, onClick }: MicButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.mic} ${recording ? styles.recording : ""} no-drag`}
      onClick={onClick}
      aria-label={recording ? "Stop recording" : "Start recording"}
    >
      <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {recording ? (
          <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
        ) : (
          <>
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </>
        )}
      </svg>
    </button>
  );
}
