import { useCallback, useEffect, useRef, useState } from "react";
import styles from "../styles/components/SettingsDrawer.module.css";

interface SettingsDrawerProps {
  open: boolean;
  serverUrl: string;
  monitorUrl: string;
  onServerUrlChange: (url: string) => void;
  onMonitorUrlChange: (url: string) => void;
  onClose: () => void;
}

export function SettingsDrawer({
  open,
  serverUrl,
  monitorUrl,
  onServerUrlChange,
  onMonitorUrlChange,
  onClose,
}: SettingsDrawerProps) {
  const [closing, setClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setClosing(false);
      // Auto-focus input after animation
      const timer = setTimeout(() => inputRef.current?.focus(), 260);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleClose]);

  if (!open && !closing) return null;

  return (
    <>
      <div className={styles.overlay} onClick={handleClose} />
      <div
        className={`${styles.drawer} ${closing ? styles.drawerClosing : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className={styles.drawerHeader}>
          <span className={styles.drawerTitle}>Settings</span>
          <button
            className={styles.closeBtn}
            onClick={handleClose}
            aria-label="Close settings"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M15 5L5 15M5 5l10 10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="server-url">
            Voice backend URL
          </label>
          <input
            ref={inputRef}
            id="server-url"
            className={styles.input}
            type="text"
            value={serverUrl}
            onChange={(e) => onServerUrlChange(e.target.value)}
            placeholder="http://localhost:8000"
          />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="monitor-url">
            Loop view URL
          </label>
          <input
            id="monitor-url"
            className={styles.input}
            type="text"
            value={monitorUrl}
            onChange={(e) => onMonitorUrlChange(e.target.value)}
            placeholder="http://localhost:8110"
          />
        </div>
      </div>
    </>
  );
}
