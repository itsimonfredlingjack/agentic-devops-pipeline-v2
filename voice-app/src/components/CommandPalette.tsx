import { useEffect, useMemo, useRef, useState } from "react";
import styles from "../styles/components/CommandPalette.module.css";

export interface CommandAction {
  id: string;
  label: string;
  hint: string;
  keywords?: string[];
  enabled?: boolean;
}

interface CommandPaletteProps {
  open: boolean;
  actions: CommandAction[];
  onClose: () => void;
  onRunAction: (actionId: string) => void;
}

function matchesQuery(action: CommandAction, query: string): boolean {
  if (!query) return true;
  const haystack = `${action.label} ${action.hint} ${(action.keywords || []).join(" ")}`
    .toLowerCase()
    .trim();
  return haystack.includes(query);
}

export function CommandPalette({
  open,
  actions,
  onClose,
  onRunAction,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return actions.filter((action) => matchesQuery(action, normalizedQuery));
  }, [actions, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (selectedIndex >= filteredActions.length) {
      setSelectedIndex(Math.max(0, filteredActions.length - 1));
    }
  }, [filteredActions.length, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) =>
          filteredActions.length === 0
            ? 0
            : (prev + 1) % filteredActions.length,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) =>
          filteredActions.length === 0
            ? 0
            : (prev - 1 + filteredActions.length) % filteredActions.length,
        );
        return;
      }

      if (event.key === "Enter") {
        const selected = filteredActions[selectedIndex];
        if (!selected || selected.enabled === false) return;
        event.preventDefault();
        onRunAction(selected.id);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, filteredActions, selectedIndex, onRunAction, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className={styles.root} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>Command Palette</span>
          <span className={styles.hint}>Esc to close</span>
        </div>
        <input
          ref={inputRef}
          className={styles.search}
          type="text"
          placeholder="Search actions..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className={styles.list} role="listbox" aria-label="Available commands">
          {filteredActions.length === 0 ? (
            <div className={styles.empty}>No commands match your search.</div>
          ) : (
            filteredActions.map((action, index) => {
              const active = index === selectedIndex;
              const disabled = action.enabled === false;
              return (
                <button
                  key={action.id}
                  type="button"
                  className={`${styles.item} ${active ? styles.itemActive : ""}`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => {
                    if (disabled) return;
                    onRunAction(action.id);
                  }}
                  disabled={disabled}
                >
                  <span className={styles.itemLabel}>{action.label}</span>
                  <span className={styles.itemHint}>{action.hint}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
