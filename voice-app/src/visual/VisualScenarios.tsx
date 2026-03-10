import type { ReactNode } from "react";
import { AppShell } from "../components/AppShell";
import { ClarificationDialog } from "../components/ClarificationDialog";
import { Header } from "../components/Header";
import { LaunchSequenceView } from "../components/LaunchSequenceView";
import type { PipelineStatus, TicketResult } from "../stores/pipelineStore";

type VisualScenario = "idle" | "processing" | "clarifying" | "done" | "error";

interface ScenarioConfig {
  status: PipelineStatus;
  ticket: TicketResult | null;
  errorMessage: string | null;
  processingStep: string;
  transcription: string;
  children?: ReactNode;
}

const SAMPLE_TICKET: TicketResult = {
  key: "DEV-420",
  url: "https://example.com/browse/DEV-420",
  summary: "Polish warm clinical voice UI baseline",
};

const BASE_DETAILS = [
  "[visual] fixture mode",
  "[visual] deterministic render",
];

const SCENARIOS: Record<VisualScenario, ScenarioConfig> = {
  idle: {
    status: "idle",
    ticket: null,
    errorMessage: null,
    processingStep: "",
    transcription: "",
  },
  processing: {
    status: "processing",
    ticket: null,
    errorMessage: null,
    processingStep: "Extracting intent and preparing task handoff...",
    transcription: "Create a ticket for desktop warm theme rollout.",
  },
  clarifying: {
    status: "clarifying",
    ticket: null,
    errorMessage: null,
    processingStep: "",
    transcription: "Improve user experience",
    children: (
      <ClarificationDialog
        questions={[
          "Which area should be improved first?",
          "Do we prioritize readability or speed?",
        ]}
        partialSummary="Improve user experience"
        round={1}
        disabled={false}
        onSubmit={() => undefined}
        onSkip={() => undefined}
      />
    ),
  },
  done: {
    status: "done",
    ticket: SAMPLE_TICKET,
    errorMessage: null,
    processingStep: "",
    transcription: "Warm clinical theme baseline has been created.",
  },
  error: {
    status: "error",
    ticket: null,
    errorMessage:
      "Task creation could not continue because the transcript was too short.",
    processingStep: "",
    transcription: "",
  },
};

function getScenarioFromUrl(): VisualScenario {
  const params = new URLSearchParams(window.location.search);
  const candidate = params.get("scenario");
  if (
    candidate === "idle" ||
    candidate === "processing" ||
    candidate === "clarifying" ||
    candidate === "done" ||
    candidate === "error"
  ) {
    return candidate;
  }

  return "idle";
}

export function VisualScenarios() {
  const scenario = getScenarioFromUrl();
  const config = SCENARIOS[scenario];

  return (
    <AppShell>
      <Header status={config.status} onSettingsClick={() => undefined} />
      <LaunchSequenceView
        status={config.status}
        processingStep={config.processingStep}
        transcription={config.transcription}
        ticket={config.ticket}
        errorMessage={config.errorMessage}
        micLevels={[0.14, 0.21, 0.38, 0.3, 0.17]}
        wsConnected={true}
        monitorConnected={true}
        sessionId="visual-session"
        loopMonitorUrl="http://localhost:8110/?session_id=visual-session&ticket_key=DEV-420"
        detailsEntries={BASE_DETAILS}
        onToggleRecord={() => undefined}
        onRetry={() => undefined}
        onRecordAnother={() => undefined}
        onOpenSettings={() => undefined}
      >
        {config.children}
      </LaunchSequenceView>
    </AppShell>
  );
}
