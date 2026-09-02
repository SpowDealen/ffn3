import type {AgentWorkspaceModel} from "../workspace/types";

export type AgentConversationPromptId = "attention" | "blocked" | "recommendations";
export type AgentConversationSource = "ufc" | "one" | "bkfc";
export type AgentConversationIntent =
  | Readonly<{type: "attention"}>
  | Readonly<{type: "blocked"}>
  | Readonly<{type: "recommendations"}>
  | Readonly<{type: "recent_changes"}>
  | Readonly<{type: "review_source"; source: AgentConversationSource}>
  | Readonly<{type: "explain_current_case"; caseId: string | null}>
  | Readonly<{type: "show_ambiguous"}>
  | Readonly<{type: "navigate_review"; caseId: string | null}>
  | Readonly<{type: "action_guard"; source: AgentConversationSource | null}>
  | Readonly<{type: "unsupported"; reason: "empty" | "ambiguous" | "unknown"}>;
export type AgentConversationRoute = Readonly<{
  input: string;
  normalizedInput: string;
  intent: AgentConversationIntent;
  readOnly: true;
}>;
export type AgentConversationRole = "agent" | "operator";
export type AgentConversationMessageKind = "summary" | "question" | "answer" | "system_notice";

export type AgentConversationReference = Readonly<{
  id: string;
  kind: "review_case" | "decision_support";
  label: string;
  sourceLabel: string;
  entityLabel: string;
  href: string | null;
  actionLabel: "Revisar caso" | "Ver caso" | "Abrir revisión" | null;
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
  promptId: AgentConversationPromptId | null;
  route: AgentConversationRoute;
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
  currentCaseId: string | null;
  responses: Readonly<{
    attention: AgentConversationResponse;
    blocked: AgentConversationResponse;
    recommendations: AgentConversationResponse;
    recentChanges: AgentConversationResponse;
    showAmbiguous: AgentConversationResponse;
    explainCurrentCase: AgentConversationResponse;
    navigateReview: AgentConversationResponse;
    sources: Readonly<Record<AgentConversationSource, AgentConversationResponse>>;
  }>;
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
