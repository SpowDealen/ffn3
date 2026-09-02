import type {AgentContextAuthorityHint, AgentContextFreshnessStatus} from "../types";
import type {
  AgentExpectedOutcome,
  AgentHumanDecisionRequirement,
  AgentProposalAlternative,
  AgentProposalConfidence,
  AgentProposalRisk,
  AgentStructuredProposal,
} from "../proposals/types";

export const AGENT_DECISION_SUPPORT_VERSION = "ag3-decision-support/1" as const;

export type AgentDecisionState =
  | "clear_recommendation"
  | "recommendation_with_caveats"
  | "human_decision_required"
  | "blocked_by_missing_information"
  | "blocked_by_contradiction"
  | "no_action_needed"
  | "insufficient_basis";

export type AgentEvidenceStrength = "strong" | "moderate" | "weak" | "mixed" | "contradictory" | "unknown";
export type AgentDecisionAttentionPriority = "critical_attention" | "high_attention" | "normal_attention" | "low_attention" | "no_attention";

export type AgentDecisionOptionAssessment = Readonly<{
  alternativeId: string;
  label: string;
  strengths: readonly string[];
  weaknesses: readonly string[];
  supportingEvidenceRefs: readonly string[];
  contradictingEvidenceRefs: readonly string[];
  unknowns: readonly string[];
  confidence?: AgentProposalAlternative["confidence"];
  risk: AgentProposalRisk;
  viable: boolean;
  relativeAssessment: "preferred" | "competitive" | "weaker" | "not_viable" | "unknown";
}>;

export type AgentTradeoff = Readonly<{
  id: string;
  alternativeIds: readonly [string, string];
  dimensions: readonly Readonly<{
    kind: "confidence" | "evidence_support" | "viability" | "known_risk";
    first: string;
    second: string;
  }>[];
  evidenceRefs: readonly string[];
}>;

export type AgentContradiction = Readonly<{
  code: string;
  summary: string;
  evidenceRefs: readonly string[];
  impact: "informational" | "reduces_confidence" | "requires_human_decision" | "blocks_decision";
}>;

export type AgentAmbiguity = Readonly<{
  code: string;
  summary: string;
  alternativeIds: readonly string[];
  evidenceRefs: readonly string[];
  impact: "reduces_confidence" | "requires_human_decision";
}>;

export type AgentMissingInformation = Readonly<{
  code: string;
  summary: string;
  sourceQuestionIds: readonly string[];
  evidenceRefs: readonly string[];
}>;

export type AgentDecisionQuestion = Readonly<{
  id: string;
  prompt: string;
  relatedAlternativeIds: readonly string[];
  sourceQuestionIds: readonly string[];
}>;

export type AgentEvidenceAssessment = Readonly<{
  strength: AgentEvidenceStrength;
  strongestEvidenceRefs: readonly string[];
  weakEvidenceRefs: readonly string[];
  contradictoryEvidenceRefs: readonly string[];
  confidence: AgentProposalConfidence;
  synthesizedConfidence: false;
}>;

export type AgentDecisionSupport = Readonly<{
  id: string;
  version: typeof AGENT_DECISION_SUPPORT_VERSION;
  proposalId: string;
  subject: AgentStructuredProposal["subject"];
  issue: AgentStructuredProposal["issue"];
  decisionState: AgentDecisionState;
  preferredOption: AgentDecisionOptionAssessment | null;
  alternatives: readonly AgentDecisionOptionAssessment[];
  evidenceAssessment: AgentEvidenceAssessment;
  tradeoffs: readonly AgentTradeoff[];
  contradictions: readonly AgentContradiction[];
  ambiguities: readonly AgentAmbiguity[];
  missingInformation: readonly AgentMissingInformation[];
  humanDecision: Readonly<AgentHumanDecisionRequirement & {explanation: string | null}>;
  decisionQuestions: readonly AgentDecisionQuestion[];
  explanation: Readonly<{
    headline: string;
    summary: string;
    why: readonly string[];
    whyNot: readonly Readonly<{alternativeId: string; reason: string}>[];
    caveats: readonly string[];
    whatNeedsHumanInput: string | null;
    whatWouldHappenNext: string | null;
  }>;
  priority: AgentDecisionAttentionPriority;
  authorityHint: AgentContextAuthorityHint;
  expectedOutcome: AgentExpectedOutcome | null;
  trace: Readonly<{
    decisionSupportId: string;
    structuredProposalId: string;
    agentContextSnapshotIdentity: string;
    contextItemId: string;
    reviewCaseId?: string;
    sourceReferences: readonly string[];
  }>;
  freshness: Readonly<{
    status: AgentContextFreshnessStatus;
    agentContextGeneratedAt: string;
    itemUpdatedAt?: string;
    itemVersion?: number;
    fingerprints: readonly string[];
    refreshPerformed: false;
  }>;
  boundary: Readonly<{
    derived: true;
    readOnly: true;
    explains: true;
    compares: true;
    executes: false;
    persists: false;
    plans: false;
    createsAuthority: false;
    mutatesProposal: false;
    mutatesReview: false;
    decidesAutonomy: false;
  }>;
}>;
