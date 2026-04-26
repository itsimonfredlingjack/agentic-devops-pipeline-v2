/// <reference types="vite/client" />
import { create } from "zustand";
import type {
  ClarificationState,
  CompletionSummary,
  CostEntry,
  EventRecord,
  PipelineStatus,
  PreviewState,
  QueueItem,
  StuckAlert,
} from "@sejfa/shared-types";

export type LoopPhase =
  | "idle"
  | "listening"
  | "processing"
  | "loop"
  | "verify"
  | "error"
  | "done";

interface AppState {
  // Derived
  phase: LoopPhase;
  activeGlobalView: "command" | "monitor";

  // Connection status
  voiceConnected: boolean;
  monitorConnected: boolean;
  voiceUrl: string;
  monitorUrl: string;

  // Pipeline
  pipelineStatus: PipelineStatus;
  processingStep: string;
  clarification: ClarificationState | null;
  preview: PreviewState | null;

  // Loop
  loopActive: boolean;
  ticketKey: string | null;
  sessionId: string | null;
  elapsedMs: number;

  // Events
  events: EventRecord[];

  // Monitor data
  cost: CostEntry | null;
  stuckAlert: StuckAlert | null;
  completion: CompletionSummary | null;
  queue: QueueItem[];

  // Actions
  setVoiceConnected: (connected: boolean) => void;
  setMonitorConnected: (connected: boolean) => void;
  setPipelineStatus: (status: PipelineStatus) => void;
  setProcessingStep: (step: string) => void;
  setClarification: (clarification: ClarificationState | null) => void;
  setPreview: (preview: PreviewState | null) => void;
  setLoopActive: (active: boolean) => void;
  setTicketKey: (key: string | null) => void;
  setSessionId: (id: string | null) => void;
  setElapsedMs: (ms: number) => void;
  appendEvent: (event: EventRecord) => void;
  setCost: (cost: CostEntry) => void;
  setStuckAlert: (alert: StuckAlert) => void;
  clearStuckAlert: () => void;
  setCompletion: (completion: CompletionSummary) => void;
  setQueue: (queue: QueueItem[]) => void;
  setActiveGlobalView: (view: "command" | "monitor") => void;
  reset: () => void;
}

export function getDefaultServiceUrls() {
  const bridgeConfig =
    typeof window !== "undefined" ? window.sejfa?.config : undefined;

  return {
    voiceUrl:
      bridgeConfig?.voiceUrl ??
      import.meta.env.VITE_SEJFA_VOICE_URL ??
      "http://localhost:8000",
    monitorUrl:
      bridgeConfig?.monitorUrl ??
      import.meta.env.VITE_SEJFA_MONITOR_URL ??
      "http://localhost:8100",
  };
}

const MAX_EVENTS = 200;

function derivePhase(state: {
  stuckAlert: StuckAlert | null;
  completion: CompletionSummary | null;
  loopActive: boolean;
  pipelineStatus: PipelineStatus;
}): LoopPhase {
  if (state.stuckAlert) return "error";
  if (state.completion) return "done";
  if (state.loopActive) return "loop";

  switch (state.pipelineStatus) {
    case "recording":
      return "listening";
    case "processing":
      return "processing";
    case "clarifying":
    case "previewing":
      return "verify";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

const initialState = {
  phase: "idle" as LoopPhase,
  activeGlobalView: "command" as "command" | "monitor",
  voiceConnected: false,
  monitorConnected: false,
  ...getDefaultServiceUrls(),
  pipelineStatus: "idle" as PipelineStatus,
  processingStep: "",
  clarification: null,
  preview: null,
  loopActive: false,
  ticketKey: null,
  sessionId: null,
  elapsedMs: 0,
  events: [] as EventRecord[],
  cost: null,
  stuckAlert: null,
  completion: null,
  queue: [] as QueueItem[],
};

export const useAppStore = create<AppState>()((set) => ({
  ...initialState,

  setVoiceConnected: (connected) => set({ voiceConnected: connected }),

  setMonitorConnected: (connected) => set({ monitorConnected: connected }),

  setPipelineStatus: (status) =>
    set((state) => {
      const next = { ...state, pipelineStatus: status };
      return { pipelineStatus: status, phase: derivePhase(next) };
    }),

  setProcessingStep: (step) => set({ processingStep: step }),

  setClarification: (clarification) =>
    set((state) => {
      let pipelineStatus = state.pipelineStatus;
      if (clarification) {
        pipelineStatus = "clarifying";
      } else if (!state.preview && state.pipelineStatus === "clarifying") {
        pipelineStatus = "processing";
      }

      const next = { ...state, clarification, pipelineStatus };
      return { clarification, pipelineStatus, phase: derivePhase(next) };
    }),

  setPreview: (preview) =>
    set((state) => {
      const pipelineStatus = preview
        ? ("previewing" as PipelineStatus)
        : state.clarification
          ? ("clarifying" as PipelineStatus)
          : state.pipelineStatus;
      const clarification = preview ? null : state.clarification;
      const next = { ...state, preview, clarification, pipelineStatus };
      return { preview, clarification, pipelineStatus, phase: derivePhase(next) };
    }),

  setLoopActive: (active) =>
    set((state) => {
      const next = { ...state, loopActive: active };
      return { loopActive: active, phase: derivePhase(next) };
    }),

  setTicketKey: (key) => set({ ticketKey: key }),

  setSessionId: (id) => set({ sessionId: id }),

  setElapsedMs: (ms) => set({ elapsedMs: ms }),

  appendEvent: (event) =>
    set((state) => {
      const updated = [event, ...state.events];
      return { events: updated.slice(0, MAX_EVENTS) };
    }),

  setCost: (cost) => set({ cost }),

  setStuckAlert: (alert) =>
    set((state) => {
      const next = { ...state, stuckAlert: alert };
      return { stuckAlert: alert, phase: derivePhase(next) };
    }),

  clearStuckAlert: () =>
    set((state) => {
      const next = { ...state, stuckAlert: null };
      return { stuckAlert: null, phase: derivePhase(next) };
    }),

  setCompletion: (completion) =>
    set((state) => {
      const next = { ...state, completion };
      return { completion, phase: derivePhase(next) };
    }),

  setQueue: (queue) => set({ queue }),

  setActiveGlobalView: (view: "command" | "monitor") => set({ activeGlobalView: view }),

  reset: () => set({ ...initialState }),
}));
