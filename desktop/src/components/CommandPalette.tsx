import { useState, useEffect, useRef, useMemo } from "react";
import { useAppStore } from "../stores/appStore";
import { mockLinearCycle } from "../mockLinearData";
import styles from "./CommandPalette.module.css";

interface Command {
  id: string;
  label: string;
  icon: string;
  shortcut?: string;
  action: () => void;
}

export function CommandPalette({ isOpen, onClose, onSelectTask }: { 
  isOpen: boolean; 
  onClose: () => void;
  onSelectTask: (idx: number) => void;
}) {
  const { setActiveGlobalView, phase } = useAppStore();
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = useMemo(() => {
    const list: Command[] = [
      { id: "nav-command", label: "Switch to Command Mode", icon: "CMD", action: () => setActiveGlobalView("command") },
      { id: "nav-monitor", label: "Switch to Monitor Mode", icon: "MON", action: () => setActiveGlobalView("monitor") },
      { id: "sys-reset", label: "Reset System Analyzers", icon: "RST", action: () => console.log("Resetting...") },
    ];

    if (phase !== "idle" && phase !== "listening") {
      list.push({ id: "sys-abort", label: "Abort Current Mission", icon: "ABT", shortcut: "⌘.", action: () => console.log("Aborting...") });
    }

    // Add dynamic tasks
    mockLinearCycle.forEach((issue, idx) => {
      list.push({ 
        id: `task-${issue.id}`, 
        label: `Jump to ${issue.id}: ${issue.title}`, 
        icon: "TSK", 
        action: () => onSelectTask(idx)
      });
    });

    return list;
  }, [setActiveGlobalView, phase, onSelectTask]);

  const filteredCommands = useMemo(() => {
    if (!search) return commands;
    const s = search.toLowerCase();
    return commands.filter(c => c.label.toLowerCase().includes(s) || c.id.toLowerCase().includes(s));
  }, [commands, search]);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(Math.max(0, filteredCommands.length - 1));
    }
  }, [filteredCommands, selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.searchContainer}>
          <span className={styles.searchIcon}>⠿</span>
          <input 
            ref={inputRef}
            className={styles.searchInput}
            placeholder="Type a command or search tasks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className={styles.commandList}>
          {filteredCommands.map((cmd, idx) => (
            <button
              key={cmd.id}
              className={`${styles.commandItem} ${idx === selectedIndex ? styles.activeItem : ""}`}
              onClick={() => { cmd.action(); onClose(); }}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <div className={styles.itemLeft}>
                <span className={styles.itemIcon}>{cmd.icon}</span>
                <span className={styles.itemLabel}>{cmd.label}</span>
              </div>
              {cmd.shortcut && <span className={styles.itemShortcut}>{cmd.shortcut}</span>}
            </button>
          ))}
          {filteredCommands.length === 0 && (
            <div className={styles.emptyState}>No commands found for "{search}"</div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.instruction}>
            <kbd>↵</kbd> <span>to select</span>
          </div>
          <div className={styles.instruction}>
            <kbd>↑↓</kbd> <span>to navigate</span>
          </div>
          <div className={styles.instruction}>
            <kbd>esc</kbd> <span>to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
