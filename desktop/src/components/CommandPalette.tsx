import { useState, useEffect, useRef, useMemo } from "react";
import { useAppStore } from "../stores/appStore";
import { useJiraIssues } from "../hooks/useJiraIssues";
import styles from "./CommandPalette.module.css";

interface Command {
  id: string;
  label: string;
  icon: string;
  group: "Navigation" | "Issues";
  isQuickJump?: boolean;
  shortcut?: string;
  action: () => void;
}

const RECENT_COMMANDS_STORAGE_KEY = "sejfa.commandPalette.recent";
const MAX_RECENT_COMMANDS = 5;

export function CommandPalette({ isOpen, onClose, onSelectTask }: { 
  isOpen: boolean; 
  onClose: () => void;
  onSelectTask: (idx: number) => void;
}) {
  const { setActiveWorkspaceSection, phase } = useAppStore();
  const { issues: jiraIssues } = useJiraIssues();
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const taskIssues = jiraIssues;

  const commands: Command[] = useMemo(() => {
    const list: Command[] = [
      {
        id: "nav-work",
        label: "Open Work View",
        icon: "WRK",
        group: "Navigation",
        action: () => setActiveWorkspaceSection("work"),
      },
      {
        id: "nav-history",
        label: "Open Run History",
        icon: "HIS",
        group: "Navigation",
        action: () => setActiveWorkspaceSection("history"),
      },
    ];

    if (phase === "loop" || phase === "verify" || phase === "done" || phase === "error") {
      list.push({
        id: "nav-current-run",
        label: "Focus Current Run",
        icon: "RUN",
        group: "Navigation",
        isQuickJump: true,
        action: () => setActiveWorkspaceSection("work"),
      });
    }

    if (taskIssues.length > 0) {
      list.push({
        id: "quick-selected-issue",
        label: "Jump to Selected Issue",
        icon: "JMP",
        group: "Navigation",
        isQuickJump: true,
        action: () => onSelectTask(0),
      });
    }

    taskIssues.forEach((issue, idx) => {
      list.push({
        id: `task-${issue.id}`,
        label: `Open ${issue.id}: ${issue.title}`,
        icon: "TSK",
        group: "Issues",
        action: () => onSelectTask(idx)
      });
    });

    return list;
  }, [setActiveWorkspaceSection, phase, onSelectTask, taskIssues]);

  const orderedCommands = useMemo(() => {
    const recentSet = new Set(recentCommandIds);
    const getPriority = (command: Command): number => {
      if (recentSet.has(command.id)) return 0;
      if (command.group === "Navigation") return 1;
      return 2;
    };
    return [...commands].sort((a, b) => {
      const byPriority = getPriority(a) - getPriority(b);
      if (byPriority !== 0) return byPriority;
      if (a.group !== b.group) return a.group.localeCompare(b.group);
      return a.label.localeCompare(b.label);
    });
  }, [commands, recentCommandIds]);

  const filteredCommands = useMemo(() => {
    if (!search) return orderedCommands;
    const s = search.toLowerCase();
    return orderedCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(s) ||
        c.id.toLowerCase().includes(s) ||
        c.group.toLowerCase().includes(s),
    );
  }, [orderedCommands, search]);

  const groupedCommands = useMemo(() => {
    const recents = filteredCommands.filter((command) => recentCommandIds.includes(command.id));
    const navigation = filteredCommands.filter(
      (command) => command.group === "Navigation" && !recentCommandIds.includes(command.id),
    );
    const issues = filteredCommands.filter(
      (command) => command.group === "Issues" && !recentCommandIds.includes(command.id),
    );
    return { recents, navigation, issues };
  }, [filteredCommands, recentCommandIds]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_COMMANDS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setRecentCommandIds(parsed.filter((value): value is string => typeof value === "string"));
      }
    } catch {
      // Ignore storage failures.
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  const persistRecentCommand = (id: string) => {
    setRecentCommandIds((current) => {
      const next = [id, ...current.filter((entry) => entry !== id)].slice(0, MAX_RECENT_COMMANDS);
      try {
        window.localStorage.setItem(RECENT_COMMANDS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
  };

  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(Math.max(0, filteredCommands.length - 1));
    }
  }, [filteredCommands, selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredCommands.length === 0) {
      if (e.key === "Escape") onClose();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        const selectedCommand = filteredCommands[selectedIndex];
        selectedCommand.action();
        persistRecentCommand(selectedCommand.id);
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-label="Command palette" aria-modal="true">
        <div className={styles.searchContainer}>
          <span className={styles.searchIcon}>⠿</span>
          <input 
            ref={inputRef}
            className={styles.searchInput}
            placeholder="Type a command or search tasks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search commands"
          />
        </div>

        <div className={styles.commandList} role="listbox" aria-label="Commands">
          {groupedCommands.recents.length > 0 && (
            <div className={styles.groupLabel}>RECENT</div>
          )}
          {groupedCommands.recents.map((cmd) => {
            const idx = filteredCommands.findIndex((command) => command.id === cmd.id);
            return (
              <button
                key={cmd.id}
                role="option"
                aria-selected={idx === selectedIndex}
                className={`${styles.commandItem} ${idx === selectedIndex ? styles.activeItem : ""}`}
                onClick={() => {
                  cmd.action();
                  persistRecentCommand(cmd.id);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className={styles.itemLeft}>
                  <span className={styles.itemIcon}>{cmd.icon}</span>
                  <span className={styles.itemLabel}>{cmd.label}</span>
                </div>
                <span className={styles.itemMeta}>Recent</span>
              </button>
            );
          })}

          {groupedCommands.navigation.length > 0 && (
            <div className={styles.groupLabel}>NAVIGATION</div>
          )}
          {groupedCommands.navigation.map((cmd) => {
            const idx = filteredCommands.findIndex((command) => command.id === cmd.id);
            return (
              <button
                key={cmd.id}
                role="option"
                aria-selected={idx === selectedIndex}
                className={`${styles.commandItem} ${idx === selectedIndex ? styles.activeItem : ""}`}
                onClick={() => {
                  cmd.action();
                  persistRecentCommand(cmd.id);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className={styles.itemLeft}>
                  <span className={styles.itemIcon}>{cmd.icon}</span>
                  <span className={styles.itemLabel}>{cmd.label}</span>
                </div>
                <span className={styles.itemMeta}>{cmd.isQuickJump ? "Quick jump" : cmd.group}</span>
              </button>
            );
          })}

          {groupedCommands.issues.length > 0 && (
            <div className={styles.groupLabel}>ISSUES</div>
          )}
          {groupedCommands.issues.map((cmd) => {
            const idx = filteredCommands.findIndex((command) => command.id === cmd.id);
            return (
              <button
                key={cmd.id}
                role="option"
                aria-selected={idx === selectedIndex}
                className={`${styles.commandItem} ${idx === selectedIndex ? styles.activeItem : ""}`}
                onClick={() => {
                  cmd.action();
                  persistRecentCommand(cmd.id);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className={styles.itemLeft}>
                  <span className={styles.itemIcon}>{cmd.icon}</span>
                  <span className={styles.itemLabel}>{cmd.label}</span>
                </div>
                <span className={styles.itemMeta}>{cmd.group}</span>
              </button>
            );
          })}
          {filteredCommands.length === 0 && (
            <div className={styles.emptyState}>
              <strong>No matching command found.</strong>
              <span>Try another keyword or clear the filter to browse all commands.</span>
            </div>
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
