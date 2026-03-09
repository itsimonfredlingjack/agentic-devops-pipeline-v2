import { create } from "zustand";

export type AppMode = "voice" | "command_center" | "clarification_overlay";

export type PipelineStatus =
  | "idle"
  | "recording"
  | "processing"
  | "clarifying"
  | "previewing"
  | "done"
  | "error";

export type ToastType = "success" | "error" | "info";

export interface ToastEntry {
  id: string;
  type: ToastType;
  message: string;
}

export interface TicketResult {
  key: string;
  url: string;
  summary: string;
}

interface ClarificationState {
  sessionId: string;
  questions: string[];
  partialSummary: string;
  round: number;
}

export interface LoopEventEntry {
  type: "ticket_queued" | "loop_started" | "loop_completed";
  issueKey: string;
  summary?: string;
  success?: boolean;
  timestamp: string;
}

export type CommandCenterEventKind = "voice" | "loop" | "monitor" | "system";
export type CommandCenterEventSeverity =
  | "info"
  | "success"
  | "warning"
  | "error";

export interface CommandCenterEventEntry {
  id: string;
  timestamp: string;
  kind: CommandCenterEventKind;
  severity: CommandCenterEventSeverity;
  title: string;
  detail?: string;
}

export type GateStatus =
  | "blocked"
  | "ready"
  | "running"
  | "passed"
  | "failed"
  | "skipped";

export interface GateEntry {
  nodeId: string;
  status: GateStatus;
  updatedAt: string;
  message?: string;
}

export interface CompletionEntry {
  session_id: string;
  ticket_id: string | null;
  outcome: "done" | "failed" | "blocked" | "unknown";
  pytest_summary: string | null;
  ruff_summary: string | null;
  git_diff_summary: string | null;
  pr_url: string | null;
}

export interface CostEntry {
  session_id: string;
  total_usd: number;
  breakdown: {
    input_usd: number;
    output_usd: number;
    cache_usd: number;
  };
}

export interface StuckAlertEntry {
  pattern: string;
  repeat_count: number;
  tokens_burned: number;
  since: string;
}

interface PipelineState {
  appMode: AppMode;
  previousAppMode: Exclude<AppMode, "clarification_overlay">;
  status: PipelineStatus;
  transcription: string;
  errorMessage: string | null;
  log: string[];
  serverUrl: string;
  monitorUrl: string;
  clarification: ClarificationState | null;
  loopEvents: LoopEventEntry[];
  commandCenterEvents: CommandCenterEventEntry[];
  latestSessionId: string | null;
  monitorConnected: boolean;
  activeStage: string | null;
  gates: GateEntry[];
  completion: CompletionEntry | null;
  cost: CostEntry | null;
  stuckAlert: StuckAlertEntry | null;

  // Fas 1: toasts + processing step
  toasts: ToastEntry[];
  processingStep: string;

  // Fas 3: audio preview
  pendingSamples: number[] | null;

  // Fas 4: ticket result + WS status
  ticketResult: TicketResult | null;
  wsConnected: boolean;

  setAppMode: (mode: Exclude<AppMode, "clarification_overlay">) => void;
  setStatus: (status: PipelineStatus) => void;
  setTranscription: (text: string) => void;
  setErrorMessage: (message: string | null) => void;
  appendLog: (entry: string) => void;
  setServerUrl: (url: string) => void;
  setMonitorUrl: (url: string) => void;
  setClarification: (c: ClarificationState | null) => void;
  clearClarification: () => void;
  addLoopEvent: (event: LoopEventEntry) => void;
  addCommandCenterEvent: (event: CommandCenterEventEntry) => void;
  setLatestSessionId: (sessionId: string | null) => void;
  setMonitorConnected: (connected: boolean) => void;
  setActiveStage: (stage: string | null) => void;
  upsertGate: (gate: GateEntry) => void;
  setCompletion: (completion: CompletionEntry | null) => void;
  setCost: (cost: CostEntry | null) => void;
  setStuckAlert: (alert: StuckAlertEntry | null) => void;

  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
  setProcessingStep: (step: string) => void;
  setPendingSamples: (samples: number[] | null) => void;
  setTicketResult: (result: TicketResult | null) => void;
  setWsConnected: (connected: boolean) => void;
  resetRunState: () => void;
}

const DEFAULT_SERVER_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:8000";
const DEFAULT_MONITOR_URL =
  import.meta.env.VITE_MONITOR_URL || "http://localhost:8100";

function loadServerUrl(): string {
  try {
    return localStorage.getItem("sejfa-voice-server-url") || DEFAULT_SERVER_URL;
  } catch {
    return DEFAULT_SERVER_URL;
  }
}

function loadMonitorUrl(): string {
  try {
    return (
      localStorage.getItem("sejfa-monitor-server-url") || DEFAULT_MONITOR_URL
    );
  } catch {
    return DEFAULT_MONITOR_URL;
  }
}

let toastId = 0;

export const usePipelineStore = create<PipelineState>((set) => ({
  appMode: "voice",
  previousAppMode: "voice",
  status: "idle",
  transcription: "",
  errorMessage: null,
  log: [],
  serverUrl: loadServerUrl(),
  monitorUrl: loadMonitorUrl(),
  clarification: null,
  loopEvents: [],
  commandCenterEvents: [],
  latestSessionId: null,
  monitorConnected: false,
  activeStage: null,
  gates: [],
  completion: null,
  cost: null,
  stuckAlert: null,
  toasts: [],
  processingStep: "",
  pendingSamples: null,
  ticketResult: null,
  wsConnected: false,

  setAppMode: (mode) => set({ appMode: mode, previousAppMode: mode }),

  setStatus: (status) => set({ status }),

  setTranscription: (text) => set({ transcription: text }),

  setErrorMessage: (message) => set({ errorMessage: message }),

  appendLog: (entry) =>
    set((state) => ({
      log: [...state.log, `[${new Date().toLocaleTimeString()}] ${entry}`],
    })),

  setServerUrl: (url) => {
    try {
      localStorage.setItem("sejfa-voice-server-url", url);
    } catch {
      // localStorage unavailable
    }
    set({ serverUrl: url });
  },

  setMonitorUrl: (url) => {
    try {
      localStorage.setItem("sejfa-monitor-server-url", url);
    } catch {
      // localStorage unavailable
    }
    set({ monitorUrl: url });
  },

  setClarification: (c) =>
    set({
      clarification: c,
      status: "clarifying",
    }),

  clearClarification: () => set({ clarification: null }),

  addLoopEvent: (event) =>
    set((state) => ({
      loopEvents: [...state.loopEvents, event],
    })),

  addCommandCenterEvent: (event) =>
    set((state) => ({
      commandCenterEvents: [...state.commandCenterEvents, event],
    })),

  setLatestSessionId: (sessionId) => set({ latestSessionId: sessionId }),

  setMonitorConnected: (connected) => set({ monitorConnected: connected }),

  setActiveStage: (stage) => set({ activeStage: stage }),

  upsertGate: (gate) =>
    set((state) => {
      const existing = state.gates.findIndex((entry) => entry.nodeId === gate.nodeId);
      if (existing === -1) {
        return { gates: [...state.gates, gate] };
      }

      const gates = [...state.gates];
      gates[existing] = gate;
      return { gates };
    }),

  setCompletion: (completion) => set({ completion }),

  setCost: (cost) => set({ cost }),

  setStuckAlert: (alert) => set({ stuckAlert: alert }),

  addToast: (type, message) => {
    const id = `toast-${++toastId}`;
    set((state) => ({
      toasts: [...state.toasts, { id, type, message }],
    }));
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  setProcessingStep: (step) => set({ processingStep: step }),

  setPendingSamples: (samples) => set({ pendingSamples: samples }),

  setTicketResult: (result) => set({ ticketResult: result }),

  setWsConnected: (connected) => set({ wsConnected: connected }),

  resetRunState: () =>
    set({
      status: "idle",
      transcription: "",
      errorMessage: null,
      clarification: null,
      loopEvents: [],
      commandCenterEvents: [],
      latestSessionId: null,
      activeStage: null,
      gates: [],
      completion: null,
      cost: null,
      stuckAlert: null,
      processingStep: "",
      pendingSamples: null,
      ticketResult: null,
    }),
}));
