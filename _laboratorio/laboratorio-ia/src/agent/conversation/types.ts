import type {AgentWorkspaceModel} from "../workspace/types";

export type AgentConversationPromptId = "attention" | "blocked" | "recommendations";
export type AgentConversationRole = "agent" | "operator";
export type AgentConversationMessageKind = "summary" | "question" | "answer" | "system_notice";

export type AgentConversationReference = Readonly<{
  id: string;
  kind: "review_case" | "decision_support";
  label: string;
  sourceLabel: string;
  entityLabel: string;
  href: string | null;
  actionLabel: "Revisar caso" | "Ver caso" | null;
}>;

export type AgentConversationMessage = Readonly<{
  id: string;
  role: AgentConversationRole;
  kind: AgentConversationMessageKind;
  text: string;
  highlights: readonly string[];
  references: readonly AgentConversationReference[];
  readOnly: true;
}>;

export type AgentConversationResponse = Readonly<{
  status: "answered" | "unsupported";
  message: AgentConversationMessage;
}>;

export type AgentConversationTurn = Readonly<{
  id: string;
  promptId: AgentConversationPromptId;
  operatorMessage: AgentConversationMessage;
  agentMessage: AgentConversationMessage;
}>;

export type AgentConversationPreset = Readonly<{
  id: AgentConversationPromptId;
  label: string;
  response: AgentConversationResponse;
}>;

export type AgentConversationModel = Readonly<{
  snapshotIdentity: string;
  initialMessage: AgentConversationMessage;
  presets: readonly AgentConversationPreset[];
  workspaceStatus: AgentWorkspaceModel["status"];
  ephemeral: true;
  boundary: Readonly<{
    readOnly: true;
    sourceOfTruth: false;
    executes: false;
    persists: false;
    plans: false;
    createsAuthority: false;
    mutatesReview: false;
  }>;
}>;
