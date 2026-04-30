import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import styles from "./Dialog.module.css";

type FocusableRef = RefObject<HTMLElement | null>;

interface DialogProps {
  open: boolean;
  titleId: string;
  onClose: () => void;
  initialFocusRef?: FocusableRef;
  restoreFocusRef?: FocusableRef;
  closeOnBackdrop?: boolean;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true",
  );
}

export function Dialog({
  open,
  titleId,
  onClose,
  initialFocusRef,
  restoreFocusRef,
  closeOnBackdrop = true,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const fallbackRestoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    fallbackRestoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      const target = initialFocusRef?.current ?? (panel ? getFocusableElements(panel)[0] : null) ?? panel;
      target?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      const restoreTarget = restoreFocusRef?.current ?? fallbackRestoreRef.current;
      restoreTarget?.focus();
    };
  }, [initialFocusRef, open, restoreFocusRef]);

  if (!open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;

    const panel = panelRef.current;
    if (!panel) return;

    const focusable = getFocusableElements(panel);
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
