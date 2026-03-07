import { useEffect, useState } from "react";
import type { ToastEntry } from "../stores/pipelineStore";
import styles from "../styles/components/Toast.module.css";

interface ToastProps {
  toast: ToastEntry;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), 4500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => onDismiss(toast.id), 300);
    return () => clearTimeout(timer);
  }, [exiting, onDismiss, toast.id]);

  const className = [styles.toast, styles[toast.type], exiting && styles.exit]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} role="alert">
      <span className={styles.icon}>
        {toast.type === "success"
          ? "\u2713"
          : toast.type === "error"
            ? "!"
            : "i"}
      </span>
      <span className={styles.message}>{toast.message}</span>
      <button
        className={styles.close}
        onClick={() => setExiting(true)}
        aria-label="Dismiss"
      >
        \u00d7
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastEntry[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
