import type {
  AgentContextAuthorityHint,
  AgentContextConfidence,
  AgentContextFreshnessStatus,
  AgentContextItem,
  AgentContextRisk,
  AgentContextSufficiency,
} from "../types";

export const AGENT_STRUCTURED_PROPOSAL_VERSION = "ag3-structured-proposal/1" as const;

export type AgentProposalClass =
  | "duplicate_resolution"
  | "identity_resolution"
  | "relationship_resolution"
  | "missing_entity"
  | "incomplete_event"
  | "blocked_review"
  | "resume_flow"
  | "no_action"
  | "other";

export type AgentProposalSubjectKind =
  | "review_case"
  | "news"
  | "event"
  | "fighter"
  | "organization"
  | "discipline"
  | "weight_category"
  | "relationship"
  | "process"
  | "dependency"
  | "unknown";

export type AgentProposalEvidence = Readonly<{
  id: string;
  epistemicStatus: "fact" | "inference" | "hypothesis";
  label: string;
  summary: string;
  source: string;
  referenceIds: readonly string[];
  confidence?: AgentContextConfidence;
}>;

export type AgentProposalAlternativeKind = "candidate" | "authority_review" | "maintain_state" | "no_action";

export type AgentProposalAlternative = Readonly<{
  id: string;
  kind: AgentProposalAlternativeKind;
  optionId?: string;
  role?: "recommended" | "alternative" | "possible";
  label: string;
  summary: string;
  capability: string | null;
  authorityHint: AgentContextAuthorityHint;
  confidence?: AgentContextConfidence;
  benefits: readonly string[];
  risks: readonly string[];
  limitations: readonly string[];
  supportedByEvidence: boolean;
  viable: boolean;
  unavailableReason: string | null;
}>;

export type AgentProposalConfidence = Readonly<{
  status: "known" | "mixed" | "unknown" | "not_applicable";
  entries: readonly AgentContextConfidence[];
  aggregated: false;
}>;

export type AgentProposalRisk = Readonly<{
  status: "known" | "unknown";
  value: AgentContextRisk["level"];
  source: AgentContextRisk["source"];
  inferredFromConfidence: false;
}>;

export type AgentProposalSufficiency = Readonly<{
  status: AgentContextSufficiency["status"] | "mixed";
  entries: readonly AgentContextSufficiency[];
  determinesReadiness: false;
}>;

export type AgentHumanDecisionRequirement = Readonly<{
  status: "not_required" | "recommended" | "required" | "blocked";
  reasons: readonly string[];
}>;

export type AgentExpectedOutcome = Readonly<{
  kind: "expected";
  summary: string;
  observed: false;
}>;

export type AgentUnresolvedQuestion = Readonly<{
  id: string;
  question: string;
  sourceStatementIds: readonly string[];
}>;

export type AgentProposalRecommendation = Readonly<{
  alternativeId: string;
  sourceRecommendationId?: string;
  summary: string;
  confidence?: AgentContextConfidence;
  rationale: Readonly<{
    primaryReasons: readonly string[];
    rejectedAlternatives: readonly Readonly<{alternativeId: string; reason: string}>[];
    caveats: readonly string[];
  }>;
}>;

export type AgentStructuredProposal = Readonly<{
  id: string;
  version: typeof AGENT_STRUCTURED_PROPOSAL_VERSION;
  proposalClass: AgentProposalClass;
  sourcePriority: AgentContextItem["domainPriority"];
  subject: Readonly<{
    kind: AgentProposalSubjectKind;
    id: string | null;
    label: string;
    source: string | null;
  }>;
  issue: Readonly<{
    codes: readonly string[];
    label: string;
    summary: string;
    reason: string;
  }>;
  facts: readonly AgentProposalEvidence[];
  inferences: readonly AgentProposalEvidence[];
  hypotheses: readonly AgentProposalEvidence[];
  alternatives: readonly AgentProposalAlternative[];
  recommendation: AgentProposalRecommendation | null;
  confidence: AgentProposalConfidence;
  risk: AgentProposalRisk;
  sufficiency: AgentProposalSufficiency;
  humanDecision: AgentHumanDecisionRequirement;
  authorityHint: AgentContextAuthorityHint;
  expectedOutcome: AgentExpectedOutcome | null;
  unresolvedQuestions: readonly AgentUnresolvedQuestion[];
  trace: Readonly<{
    agentContextSnapshotIdentity: string;
    contextItemId: string;
    reviewCaseId?: string;
    observationIds: readonly string[];
    diagnosisIds: readonly string[];
    proposalIds: readonly string[];
    insightIds: readonly string[];
    sourceReferences: readonly string[];
  }>;
  freshness: Readonly<{
    status: AgentContextFreshnessStatus;
    agentContextGeneratedAt: string;
    itemUpdatedAt?: string;
    itemVersion?: number;
    fingerprints: readonly string[];
  }>;
  durable: false;
  boundary: Readonly<{
    decisionSupportOnly: true;
    executes: false;
    persists: false;
    plans: false;
    createsAuthority: false;
    mutatesReview: false;
    decidesAutonomy: false;
  }>;
}>;
