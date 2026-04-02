export type Priority = "urgent" | "high" | "medium" | "low" | "none";
export type Status = "backlog" | "todo" | "in-progress" | "review" | "done" | "canceled";

export interface LinearIssue {
  id: string; // e.g. SEJ-123
  title: string;
  status: Status;
  priority: Priority;
  assignee?: string;
  assigneeAvatar?: string;
  estimate?: number;
  labels?: string[];
  description?: string;
  branch?: string;
  files?: string[];
  project?: string;
}

export const mockLinearCycle: LinearIssue[] = [
  { 
    id: "SEJ-42", 
    title: "Implement Linear Integration in Sidebar", 
    status: "in-progress", 
    priority: "urgent",
    estimate: 5,
    labels: ["Frontend", "API"],
    assignee: "Jack",
    assigneeAvatar: "https://avatar.vercel.sh/jack",
    description: "Connect the sidebar queue to the actual Linear API. We need to fetch the active cycle and display issues assigned to the current user.",
    branch: "feature/SEJ-42-linear-sidebar",
    files: ["src/components/Sidebar.tsx", "src/hooks/useLinear.ts"],
    project: "Desktop App"
  },
  { 
    id: "SEJ-55", 
    title: "OmniPrompt state synchronization", 
    status: "todo", 
    priority: "medium",
    estimate: 3,
    labels: ["Frontend"],
    description: "Ensure the OmniPrompt reflects the exact state of the voice pipeline (listening, processing, extracted).",
    branch: "fix/SEJ-55-omni-sync",
    files: ["src/components/OmniPrompt.tsx", "src/stores/appStore.ts"],
    project: "Desktop App"
  },
  { 
    id: "SEJ-61", 
    title: "Add \"Move to in progress\" voice intent", 
    status: "todo", 
    priority: "high",
    estimate: 8,
    labels: ["AI", "Backend"],
    description: "Extend the Ollama intent extraction to support moving issues to 'in progress' via voice command.",
    branch: "feature/SEJ-61-voice-intent",
    files: ["services/voice-pipeline/src/voice_pipeline/intent/prompts.py"],
    project: "Voice Pipeline"
  },
  { 
    id: "SEJ-68", 
    title: "Fix Glass Morphing z-index on Blockers", 
    status: "in-progress", 
    priority: "high",
    estimate: 2,
    labels: ["UI/UX"],
    project: "Desktop App"
  },
  { 
    id: "SEJ-59", 
    title: "Migrate existing queue items to GraphQL", 
    status: "backlog", 
    priority: "low",
    estimate: 13,
    labels: ["Backend"],
    project: "Core Engine"
  },
  { 
    id: "SEJ-43", 
    title: "Refactor TerminalFeed row animations", 
    status: "done", 
    priority: "none",
    estimate: 3,
    labels: ["Frontend"],
    project: "Desktop App"
  },
];

export const mockMyIssues: LinearIssue[] = [
  { 
    id: "SEJ-42", 
    title: "Implement Linear Integration in Sidebar", 
    status: "in-progress", 
    priority: "urgent",
    estimate: 5,
    labels: ["Frontend", "API"],
    assignee: "Jack",
    assigneeAvatar: "https://avatar.vercel.sh/jack",
    description: "Connect the sidebar queue to the actual Linear API. We need to fetch the active cycle and display issues assigned to the current user.",
    branch: "feature/SEJ-42-linear-sidebar",
    files: ["src/components/Sidebar.tsx", "src/hooks/useLinear.ts"],
    project: "Desktop App"
  },
  { id: "SEJ-72", title: "Update README with architectural diagram", status: "todo", priority: "medium", estimate: 2, labels: ["Docs"], project: "Core Engine" },
];

export interface LinearProject {
  name: string;
  issues: LinearIssue[];
}

export const mockProjects: LinearProject[] = [
  { name: "Desktop App", issues: mockLinearCycle.filter(i => i.project === "Desktop App") },
  { name: "Voice Pipeline", issues: mockLinearCycle.filter(i => i.project === "Voice Pipeline") },
  { name: "Core Engine", issues: mockLinearCycle.filter(i => i.project === "Core Engine") },
];
