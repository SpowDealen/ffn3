import type {KnowledgeRecurrence} from "./extractionTypes";
import type {KnowledgeGovernanceResult} from "./governanceTypes";
import type {KnowledgeDomain, KnowledgeFingerprint, KnowledgeKind, KnowledgeValidityState} from "./types";

export const GOVERNED_KNOWLEDGE_RETRIEVAL_VERSION = "1.0.0" as const;

export type GovernedRetrievalDimension = "entity" | "entity_type" | "capability" | "producer" | "editorial_context" | "issue" | "relationship" | "case";

export type GovernedKnowledgeQuery = Readonly<{
  caseId: string;
  evaluatedAt: string;
  entityKeys?: readonly string[];
  entityTypes?: readonly KnowledgeDomain[];
  capabilityIds?: readonly string[];
  producerIds?: readonly string[];
  editorialContextCodes?: readonly string[];
  issueCodes?: readonly string[];
  relationshipKeys?: readonly string[];
  currentEvidenceFingerprints: readonly KnowledgeFingerprint[];
  limit?: number;
}>;

export type GovernedRetrievalInput = Readonly<{
  governance: KnowledgeGovernanceResult;
  recurrence?: readonly KnowledgeRecurrence[];
  query: GovernedKnowledgeQuery;
}>;

export type GovernedRankComponents = Readonly<{
  relevance: number;
  sourceIndependence: number;
  recurrence: number;
  validity: number;
  contextualProximity: number;
  total: number;
}>;

export type GovernedKnowledgeCandidate = Readonly<{
  rank: number;
  knowledgeId: string;
  revision: number;
  knowledgeFingerprint: KnowledgeFingerprint;
  contentFingerprint: KnowledgeFingerprint;
  domain: KnowledgeDomain;
  kind: KnowledgeKind;
  subjectKey: string;
  claimCode: string;
  safeSummary: string;
  validityState: Extract<KnowledgeValidityState, "current" | "temporal">;
  matchedDimensions: readonly GovernedRetrievalDimension[];
  matchedContextCodes: readonly string[];
  components: GovernedRankComponents;
  reasonCodes: readonly string[];
  sourceFingerprints: readonly KnowledgeFingerprint[];
  evidenceFingerprints: readonly KnowledgeFingerprint[];
  provenanceFingerprint: KnowledgeFingerprint;
  recurrenceFingerprint?: KnowledgeFingerprint;
  limitations: readonly string[];
  rankFingerprint: KnowledgeFingerprint;
  advisoryOnly: true;
  replacesCurrentEvidence: false;
}>;

export type GovernedKnowledgeRecommendationAction = "consider_historical_knowledge" | "inspect_current_evidence" | "avoid_known_risk" | "request_human_review";

export type GovernedKnowledgeRecommendation = Readonly<{
  recommendationId: string;
  action: GovernedKnowledgeRecommendationAction;
  knowledgeId: string;
  safeExplanation: string;
  reasonCodes: readonly string[];
  provenance: Readonly<{
    knowledgeFingerprint: KnowledgeFingerprint;
    provenanceFingerprint: KnowledgeFingerprint;
    sourceFingerprints: readonly KnowledgeFingerprint[];
  }>;
  context: Readonly<{
    caseId: string;
    matchedDimensions: readonly GovernedRetrievalDimension[];
    matchedContextCodes: readonly string[];
    queryFingerprint: KnowledgeFingerprint;
  }>;
  historicalEvidence: Readonly<{
    evidenceFingerprints: readonly KnowledgeFingerprint[];
    observationCount: number;
    independentSourceCount: number;
    recurrenceFingerprint?: KnowledgeFingerprint;
  }>;
  limitations: readonly string[];
  recommendationFingerprint: KnowledgeFingerprint;
  advisoryOnly: true;
  requiresCurrentEvidence: true;
  replacesCurrentEvidence: false;
}>;

export type GovernedKnowledgeExclusionReason = "invalidated" | "superseded" | "expired" | "contradictory" | "under_review" | "temporal_not_current" | "not_relevant" | "duplicate";

export type GovernedKnowledgeRetrievalResult = Readonly<{
  schemaVersion: typeof GOVERNED_KNOWLEDGE_RETRIEVAL_VERSION;
  status: "ranked" | "no_relevant_knowledge" | "insufficient_context";
  queryFingerprint: KnowledgeFingerprint;
  candidates: readonly GovernedKnowledgeCandidate[];
  recommendations: readonly GovernedKnowledgeRecommendation[];
  excluded: Readonly<Record<GovernedKnowledgeExclusionReason, number>>;
  retrievedCount: number;
  deduplicatedCount: number;
  retrievalFingerprint: KnowledgeFingerprint;
  reasonCodes: readonly string[];
  advisoryOnly: true;
  requiresCurrentEvidence: true;
  replacesCurrentEvidence: false;
  modifiesDecisions: false;
  appliesRecommendations: false;
  writes: false;
}>;

export const governedKnowledgeRetrievalSecurity = Object.freeze({
  pure: true,
  deterministic: true,
  explainableRanking: true,
  acceptsGovernedKnowledgeOnly: true,
  historicalConfidenceGrantsAuthority: false,
  retrievesFromStores: false,
  createsStores: false,
  launchesPlanners: false,
  invokesExecutors: false,
  launchesSchedulers: false,
  createsParallelRuntime: false,
  accessesSanity: false,
  accessesNetwork: false,
  modifiesDecisions: false,
  appliesRecommendations: false,
  persists: false,
  writes: false,
  storesPayloads: false,
  storesSecrets: false,
  advisoryOnly: true,
  replacesCurrentEvidence: false,
} as const);
