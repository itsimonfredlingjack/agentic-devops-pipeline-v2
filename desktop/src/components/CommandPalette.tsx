import { useState, useEffect, useRef, useMemo, type KeyboardEvent } from "react";
import type { TaskSummary } from "@sejfa/shared-types";
import { useAppStore } from "../stores/appStore";
import { Dialog } from "./Dialog";
import styles from "./CommandPalette.module.css";

export interface Command {
  id: string;
  label: string;
  icon: string;
  group: "Navigation" | "Tasks";
  isQuickJump?: boolean;
  shortcut?: string;
  action: () => void;
}

interface BuildCommandPaletteCommandsOptions {
  tasks: TaskSummary[];
  selectedTaskId: string | null;
  phase: string;
  setActiveWorkspaceSection: (section: "work" | "history") => void;
  onSelectTaskId: (taskId: string) => void;
}

export function buildCommandPaletteCommands({
  tasks,
  selectedTaskId,
  phase,
  setActiveWorkspaceSection,
  onSelectTaskId,
}: BuildCommandPaletteCommandsOptions): Command[] {
  const list: Command[] = [
    {
      id: "nav-work",
      label: "Open Task Loop",
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

  const selectedTask = selectedTaskId
    ? tasks.find((task) => task.id === selectedTaskId)
    : null;

  if (selectedTask) {
    list.push({
      id: "quick-selected-task",
      label: "Open Selected Task Context",
      icon: "JMP",
      group: "Navigation",
      isQuickJump: true,
      action: () => {
        setActiveWorkspaceSection("work");
        onSelectTaskId(selectedTask.id);
      },
    });
  }

  tasks.forEach((task) => {
    list.push({
      id: `task-${task.id}`,
      label: `Open ${task.id}: ${task.title}`,
      icon: "TSK",
      group: "Tasks",
      action: () => onSelectTaskId(task.id),
    });
  });

  return list;
}

const RECENT_COMMANDS_STORAGE_KEY = "sejfa.commandPalette.recent";
const MAX_RECENT_COMMANDS = 5;
const LISTBOX_ID = "command-palette-listbox";
const TITLE_ID = "command-palette-title";

function optionId(commandId: string): string {
  return `command-palette-option-${commandId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function CommandPalette({ isOpen, onClose, tasks, selectedTaskId, onSelectTaskId }: {
  isOpen: boolean;
  onClose: () => void;
  tasks: TaskSummary[];
  selectedTaskId: string | null;
  onSelectTaskId: (taskId: string) => void;
}) {
  const { setActiveWorkspaceSection, phase } = useAppStore();
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const commands: Command[] = useMemo(() => {
    return buildCommandPaletteCommands({
      tasks,
      selectedTaskId,
      phase,
      setActiveWorkspaceSection,
      onSelectTaskId,
    });
  }, [setActiveWorkspaceSection, phase, onSelectTaskId, selectedTaskId, tasks]);

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
    const tasks = filteredCommands.filter(
      (command) => command.group === "Tasks" && !recentCommandIds.includes(command.id),
    );
    return { recents, navigation, tasks };
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

  const executeCommand = (command: Command) => {
    command.action();
    persistRecentCommand(command.id);
    onClose();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
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
        executeCommand(filteredCommands[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const activeOptionId =
    filteredCommands.length > 0 && filteredCommands[selectedIndex]
      ? optionId(filteredCommands[selectedIndex].id)
      : undefined;

  const renderCommand = (cmd: Command, meta: string) => {
    const idx = filteredCommands.findIndex((command) => command.id === cmd.id);
    const isActive = idx === selectedIndex;

    return (
      <div
        key={cmd.id}
        id={optionId(cmd.id)}
        role="option"
        aria-selected={isActive}
        tabIndex={-1}
        className={`${styles.commandItem} ${isActive ? styles.activeItem : ""}`}
        onClick={() => executeCommand(cmd)}
        onMouseEnter={() => {
          if (idx >= 0) setSelectedIndex(idx);
        }}
      >
        <div className={styles.itemLeft}>
          <span className={styles.itemIcon}>{cmd.icon}</span>
          <span className={styles.itemLabel}>{cmd.label}</span>
        </div>
        <span className={styles.itemMeta}>{meta}</span>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      titleId={TITLE_ID}
      onClose={onClose}
      initialFocusRef={inputRef}
      restoreFocusRef={triggerRef}
    >
      <div className={styles.modal}>
        <h2 id={TITLE_ID} className={styles.paletteTitle}>
          Command palette
        </h2>
        <div className={styles.searchContainer}>
          <span className={styles.searchIcon}>⠿</span>
          <input 
            ref={inputRef}
            className={styles.searchInput}
            placeholder="Type a command or search tasks…"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={LISTBOX_ID}
            aria-expanded="true"
            aria-activedescendant={activeOptionId}
            aria-label="Search commands"
          />
        </div>

        <div id={LISTBOX_ID} className={styles.commandList} role="listbox" aria-label="Commands">
          {groupedCommands.recents.length > 0 && (
            <div className={styles.groupLabel}>RECENT</div>
          )}
          {groupedCommands.recents.map((cmd) => renderCommand(cmd, "Recent"))}

          {groupedCommands.navigation.length > 0 && (
            <div className={styles.groupLabel}>NAVIGATION</div>
          )}
          {groupedCommands.navigation.map((cmd) =>
            renderCommand(cmd, cmd.isQuickJump ? "Quick jump" : cmd.group),
          )}

          {groupedCommands.tasks.length > 0 && (
            <div className={styles.groupLabel}>TASKS</div>
          )}
          {groupedCommands.tasks.map((cmd) => renderCommand(cmd, cmd.group))}
          {filteredCommands.length === 0 && (
            <div className={styles.emptyState}>
              <strong>No matching command found.</strong>
              <span>Try another keyword or clear the filter to browse all commands.</span>
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          <div className={styles.instruction}>
            <kbd>↵</kbd> <span>to select</span>
          </div>
          <div className={styles.instruction}>
            <kbd>↑↓</kbd> <span>to navigate</span>
          </div>
          <div className={styles.instruction}>
            <kbd>esc</kbd> <span>to close</span>
          </div>
        </footer>
      </div>
    </Dialog>
  );
}
