import type {AgentSnapshot} from "../../agent-ready/model";
import type {ReviewCase, ReviewPriority} from "../../review/types";
import type {NucleusRisk} from "../../review/nucleus";
import type {AgentDiagnosis, AgentProposal, AgentReasoningContext} from "../model";
import type {EditorialIntelligence, EditorialPriority, EditorialSufficiencyView} from "../editorial-model";

export const AGENT_CONTEXT_CONTRACT_VERSION = "ag3-agent-context/1" as const;

export type AgentContextState = "ready" | "no_action" | "needs_attention" | "in_progress" | "resolved" | "blocked";
export type AgentContextItemKind = "review_case" | "editorial_insight" | "diagnosis" | "process" | "dependency";
export type AgentContextDecisionNeed = "none" | "review_recommended" | "human_decision_required" | "blocked";
export type AgentContextAuthorityTarget = "Review" | "AU7" | "AU8" | "none" | "unknown";
export type AgentContextEpistemicStatus = "fact" | "inference" | "hypothesis" | "recommendation";
export type AgentContextFreshnessStatus = "fresh" | "stale" | "unknown";

export type AgentContextConfidence = Readonly<{
  source: "review_presentation" | "ag1_diagnosis" | "ag2_editorial";
  level: "low" | "medium" | "high";
  value?: number;
}>;

export type AgentContextRisk = Readonly<{
  level: NucleusRisk | "unavailable";
  source: "review_nucleus" | "unavailable";
}>;

export type AgentContextSufficiency = Readonly<{
  status: "sufficient" | "partial" | "insufficient" | "contradictory" | "conflicting" | "stale" | "unavailable" | "unknown";
  source: "review_nucleus" | "ag2_editorial" | "unknown";
  determinesReadiness: false;
}>;

export type AgentContextAuthorityHint = Readonly<{
  target: AgentContextAuthorityTarget;
  source: string;
  destination?: string;
  invokes: false;
}>;

export type AgentContextReferences = Readonly<{
  reviewCaseId?: string;
  observationIds: readonly string[];
  diagnosisIds: readonly string[];
  proposalIds: readonly string[];
  insightIds: readonly string[];
  evidenceIds: readonly string[];
  fingerprints: readonly string[];
}>;

export type AgentContextItem = Readonly<{
  id: string;
  kind: AgentContextItemKind;
  durable: boolean;
  title: string;
  summary: string;
  source: Readonly<{id: string; label: string}>;
  entity: Readonly<{type: string; label: string; id?: string}>;
  state: AgentContextState;
  stateLabel: string;
  domainPriority: ReviewPriority | EditorialPriority | "unavailable";
  blocked: boolean;
  decisionNeed: AgentContextDecisionNeed;
  confidences: readonly AgentContextConfidence[];
  risk: AgentContextRisk;
  sufficiency: readonly AgentContextSufficiency[];
  recommendationIds: readonly string[];
  authorityHint: AgentContextAuthorityHint;
  freshness: Readonly<{status: AgentContextFreshnessStatus; updatedAt?: string; version?: number}>;
  references: AgentContextReferences;
}>;

export type AgentContextStatement = Readonly<{
  id: string;
  epistemicStatus: AgentContextEpistemicStatus;
  summary: string;
  source: string;
  relatedItemId?: string;
  evidenceIds: readonly string[];
}>;

export type AgentContextRecommendation = Readonly<{
  id: string;
  summary: string;
  source: "Review" | "AG2";
  relatedItemId?: string;
  confidence?: AgentContextConfidence;
  basis: "fact" | "inference" | "hypothesis" | "unknown";
  clarity: "clear" | "requires_review" | "insufficient";
  authorityHint: AgentContextAuthorityHint;
}>;

export type AgentContextSummary = Readonly<{
  totalRelevantItems: number;
  readyCount: number;
  noActionCount: number;
  needsAttentionCount: number;
  inProgressCount: number;
  resolvedCount: number;
  blockedStateCount: number;
  blockedCount: number;
  highConfidenceRecommendationCount: number;
  humanDecisionRequiredCount: number;
}>;

export type AgentContextAggregation = Readonly<{
  id: string;
  label: string;
  total: number;
  ready: number;
  noAction: number;
  needsAttention: number;
  inProgress: number;
  resolved: number;
  blocked: number;
}>;

export type AgentContext = Readonly<{
  contractVersion: typeof AGENT_CONTEXT_CONTRACT_VERSION;
  generatedAt: string;
  snapshotIdentity: string;
  summary: AgentContextSummary;
  items: readonly AgentContextItem[];
  groups: Readonly<Record<AgentContextState, readonly string[]>>;
  sourceSummaries: readonly AgentContextAggregation[];
  prioritySummaries: readonly AgentContextAggregation[];
  entitySummaries: readonly AgentContextAggregation[];
  statements: readonly AgentContextStatement[];
  recommendations: readonly AgentContextRecommendation[];
  changes: Readonly<{changed: boolean; eventIds: readonly string[]}>;
  editorialSufficiency: EditorialSufficiencyView;
  freshness: Readonly<{
    status: AgentContextFreshnessStatus;
    observationId: string;
    observationFingerprint: string;
    snapshotIdentity: string;
  }>;
  boundary: Readonly<{
    readOnly: true;
    projectionOnly: true;
    executes: false;
    persists: false;
    plans: false;
    createsAuthority: false;
    decidesAutonomy: false;
  }>;
}>;

export type AgentContextInput = Readonly<{
  generatedAt: string;
  snapshot: AgentSnapshot;
  reasoning: AgentReasoningContext;
  diagnoses: readonly AgentDiagnosis[];
  proposals: readonly AgentProposal[];
  editorial: EditorialIntelligence;
  reviewCases: readonly ReviewCase[];
}>;
