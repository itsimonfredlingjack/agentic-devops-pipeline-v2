import { useEffect } from "react";

interface KeyboardShortcutOptions {
  onToggleRecord: () => void;
  onEscape: () => void;
  onToggleCommandPalette?: () => void;
  onSubmitPrimary?: () => void;
  disabled?: boolean;
}

export function useKeyboardShortcuts({
  onToggleRecord,
  onEscape,
  onToggleCommandPalette,
  onSubmitPrimary,
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

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onToggleCommandPalette?.();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onSubmitPrimary?.();
        return;
      }

      if (e.key === " " && !isInput) {
        e.preventDefault();
        onToggleRecord();
        return;
      }

      if (e.key === "Escape") {
        onEscape();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    onToggleRecord,
    onEscape,
    onToggleCommandPalette,
    onSubmitPrimary,
    disabled,
  ]);
}
