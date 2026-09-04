import type {AgentWorkspaceModel} from "../workspace/types";

export type AgentConversationPromptId = "attention" | "blocked" | "recommendations";
export type AgentConversationSource = "ufc" | "one" | "bkfc";
export type AgentConversationReferenceHint = "context" | "previous" | "ambiguous" | "recommendation";
export type AgentConversationIntent =
  | Readonly<{type: "attention"}>
  | Readonly<{type: "blocked"}>
  | Readonly<{type: "recommendations"}>
  | Readonly<{type: "recent_changes"}>
  | Readonly<{type: "review_source"; source: AgentConversationSource}>
  | Readonly<{type: "explain_current_case"; caseId: string | null}>
  | Readonly<{type: "show_ambiguous"}>
  | Readonly<{type: "navigate_review"; caseId: string | null}>
  | Readonly<{type: "why"; reference: AgentConversationReferenceHint}>
  | Readonly<{type: "evidence"; reference: AgentConversationReferenceHint}>
  | Readonly<{type: "alternatives"; reference: AgentConversationReferenceHint}>
  | Readonly<{type: "why_recommended"; reference: AgentConversationReferenceHint}>
  | Readonly<{type: "missing_information"; reference: AgentConversationReferenceHint}>
  | Readonly<{type: "expected_next"; reference: AgentConversationReferenceHint}>
  | Readonly<{type: "explain_reference"; reference: AgentConversationReferenceHint}>
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
export type AgentConversationIntentType = AgentConversationIntent["type"];

export type AgentConversationReference = Readonly<{
  id: string;
  kind: "review_case" | "decision_support";
  label: string;
  sourceLabel: string;
  entityLabel: string;
  href: string | null;
  actionLabel: "Revisar caso" | "Ver caso" | "Abrir revisión" | null;
  decisionSupportId: string | null;
  proposalId: string | null;
  reviewCaseId: string | null;
  freshness: "fresh" | "stale" | "unknown" | null;
}>;

export type AgentConversationMessageSection = Readonly<{
  label: string;
  items: readonly string[];
}>;

export type AgentConversationMessageMetadata = Readonly<{
  intentType: AgentConversationIntentType | null;
  snapshotIdentity: string;
  referencedDecisionSupportIds: readonly string[];
  referencedProposalIds: readonly string[];
  referencedReviewCaseIds: readonly string[];
  expectedOutcomeObserved: false | null;
}>;

export type AgentConversationMessage = Readonly<{
  id: string;
  role: AgentConversationRole;
  kind: AgentConversationMessageKind;
  text: string;
  highlights: readonly string[];
  sections: readonly AgentConversationMessageSection[];
  references: readonly AgentConversationReference[];
  metadata: AgentConversationMessageMetadata;
  readOnly: true;
}>;

export type AgentConversationResponse = Readonly<{
  status: "answered" | "unsupported" | "needs_reference";
  message: AgentConversationMessage;
}>;

export type AgentConversationContext = Readonly<{
  snapshotIdentity: string;
  currentCaseId: string | null;
  focusedDecisionSupportId: string | null;
  focusedProposalId: string | null;
  previousReferencedIds: readonly string[];
  lastReferencedIds: readonly string[];
  lastIntentType: AgentConversationIntentType | null;
}>;

export type AgentConversationEvidenceItem = Readonly<{
  id: string;
  summary: string;
  source: string;
}>;

export type AgentConversationAlternative = Readonly<{
  id: string;
  label: string;
  strengths: readonly string[];
  weaknesses: readonly string[];
  unknowns: readonly string[];
  viable: boolean;
  assessment: "preferred" | "competitive" | "weaker" | "not_viable" | "unknown";
}>;

export type AgentConversationExplainabilityItem = Readonly<{
  decisionSupportId: string;
  proposalId: string;
  reviewCaseId: string | null;
  snapshotIdentity: string;
  freshness: "fresh" | "stale" | "unknown";
  source: string | null;
  label: string;
  summary: string;
  why: readonly string[];
  facts: readonly AgentConversationEvidenceItem[];
  inferences: readonly AgentConversationEvidenceItem[];
  hypotheses: readonly AgentConversationEvidenceItem[];
  alternatives: readonly AgentConversationAlternative[];
  recommendation: Readonly<{label: string; reasons: readonly string[]; rejectedAlternatives: readonly string[]; caveats: readonly string[]}> | null;
  contradictions: readonly string[];
  ambiguities: readonly string[];
  missingInformation: readonly string[];
  expectedOutcome: Readonly<{summary: string; observed: false}> | null;
  humanDecision: string | null;
  reference: AgentConversationReference;
}>;

export type AgentConversationReferenceResolution = Readonly<{
  status: "resolved" | "ambiguous" | "stale" | "missing";
  reason: "current_case" | "explicit_reference" | "last_reference" | "focused_reference" | "unique_ambiguous" | "multiple_candidates" | "stale_reference" | "missing_reference" | "snapshot_changed";
  item: AgentConversationExplainabilityItem | null;
  candidates: readonly AgentConversationExplainabilityItem[];
}>;

export type AgentConversationTurn = Readonly<{
  id: string;
  promptId: AgentConversationPromptId | null;
  route: AgentConversationRoute;
  operatorMessage: AgentConversationMessage;
  agentMessage: AgentConversationMessage;
}>;

export type AgentConversationExchange = Readonly<{
  turn: AgentConversationTurn;
  context: AgentConversationContext;
  resolution: AgentConversationReferenceResolution | null;
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
  explainabilityItems: readonly AgentConversationExplainabilityItem[];
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
