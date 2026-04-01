export type Priority = "urgent" | "high" | "medium" | "low" | "none";
export type Status = "backlog" | "todo" | "in-progress" | "review" | "done" | "canceled";

export interface LinearIssue {
  id: string; // e.g. SEJ-123
  title: string;
  status: Status;
  priority: Priority;
  assignee?: string;
}

export const mockLinearCycle: LinearIssue[] = [
  { id: "SEJ-42", title: "Implement Linear Integration in Sidebar", status: "in-progress", priority: "urgent" },
  { id: "SEJ-55", title: "OmniPrompt state synchronization", status: "todo", priority: "medium" },
  { id: "SEJ-61", title: "Add \"Move to in progress\" voice intent", status: "todo", priority: "high" },
  { id: "SEJ-68", title: "Fix Glass Morphing z-index on Blockers", status: "in-progress", priority: "high" },
  { id: "SEJ-59", title: "Migrate existing queue items to GraphQL", status: "backlog", priority: "low" },
  { id: "SEJ-43", title: "Refactor TerminalFeed row animations", status: "done", priority: "none" },
];
