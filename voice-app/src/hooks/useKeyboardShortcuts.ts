import { useEffect } from "react";

interface KeyboardShortcutOptions {
  onToggleRecord: () => void;
  onEscape: () => void;
  disabled?: boolean;
}

export function useKeyboardShortcuts({
  onToggleRecord,
  onEscape,
  disabled,
}: KeyboardShortcutOptions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (disabled) return;

      // Guard against text input fields
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.key === " " && !isInput) {
        e.preventDefault();
        onToggleRecord();
      }

      if (e.key === "Escape") {
        onEscape();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToggleRecord, onEscape, disabled]);
}
