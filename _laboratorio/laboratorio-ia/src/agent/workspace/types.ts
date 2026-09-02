export type AgentWorkspaceStatus = "calm" | "attention" | "blocked" | "empty";
export type AgentWorkspaceLoadState = "ready" | "loading" | "error";
export type AgentWorkspaceItemKind = "recommendation" | "human_decision" | "blocked" | "attention";

export type AgentWorkspacePriorityItem = Readonly<{
  id: string;
  kind: AgentWorkspaceItemKind;
  statusLabel: string;
  title: string;
  summary: string;
  sourceLabel: string;
  entityLabel: string;
  recommendation: string | null;
  confidenceLabel: string | null;
  humanDecisionReason: string | null;
  blockedBy: string | null;
  staleWarning: string | null;
  href: string | null;
  actionLabel: "Revisar caso" | "Ver caso" | "Abrir revisión" | null;
}>;

export type AgentWorkspaceMetrics = Readonly<{
  needsAttention: number;
  clearRecommendations: number;
  humanDecisionRequired: number;
  blocked: number;
  noAction: number;
}>;

export type AgentWorkspaceModel = Readonly<{
  status: AgentWorkspaceStatus;
  statusLabel: string;
  headline: string;
  summary: string;
  metrics: AgentWorkspaceMetrics;
  priorityItems: readonly AgentWorkspacePriorityItem[];
  hiddenPriorityCount: number;
  presentationOnly: true;
  boundary: Readonly<{
    consumesDecisionSupport: true;
    readOnly: true;
    executes: false;
    persists: false;
    createsAuthority: false;
    mutatesReview: false;
  }>;
}>;
