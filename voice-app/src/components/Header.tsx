import type { PipelineStatus } from "../stores/pipelineStore";
import { StatusBadge } from "./StatusBadge";
import styles from "../styles/components/Header.module.css";

interface HeaderProps {
  status: PipelineStatus;
  onSettingsClick: () => void;
}

export function Header({ status, onSettingsClick }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.brandBlock}>
        <span className={styles.eyebrow}>SEJFA</span>
        <span className={styles.title}>Voice Intake</span>
      </div>

      <div className={styles.actions}>
        <StatusBadge status={status} />
        <button
          className={styles.settingsBtn}
          onClick={onSettingsClick}
          aria-label="Settings"
          type="button"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M16.167 12.5a1.375 1.375 0 00.275 1.517l.05.05a1.667 1.667 0 11-2.359 2.358l-.05-.05a1.375 1.375 0 00-1.516-.275 1.375 1.375 0 00-.834 1.258v.142a1.667 1.667 0 11-3.333 0v-.075a1.375 1.375 0 00-.9-1.258 1.375 1.375 0 00-1.517.275l-.05.05a1.667 1.667 0 11-2.358-2.359l.05-.05A1.375 1.375 0 003.9 12.567a1.375 1.375 0 00-1.258-.834h-.142a1.667 1.667 0 110-3.333h.075a1.375 1.375 0 001.258-.9 1.375 1.375 0 00-.275-1.517l-.05-.05a1.667 1.667 0 112.358-2.358l.05.05A1.375 1.375 0 007.433 3.9a1.375 1.375 0 00.834-1.258v-.142a1.667 1.667 0 113.333 0v.075a1.375 1.375 0 00.9 1.258 1.375 1.375 0 001.517-.275l.05-.05a1.667 1.667 0 112.358 2.358l-.05.05a1.375 1.375 0 00-.275 1.517 1.375 1.375 0 001.258.834h.142a1.667 1.667 0 010 3.333h-.075a1.375 1.375 0 00-1.258.9z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
