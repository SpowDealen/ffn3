import type {KnowledgeConflict, KnowledgeFingerprint, KnowledgeItem, KnowledgeValidityState} from "./types";

export const KNOWLEDGE_GOVERNANCE_VERSION = "1.0.0" as const;

export type KnowledgeInvalidationDirective = Readonly<{
  knowledgeId: string;
  reasonCode: string;
  occurredAt: string;
  evidenceFingerprints: readonly KnowledgeFingerprint[];
  provenanceFingerprint: KnowledgeFingerprint;
}>;

export type KnowledgeSupersessionDirective = Readonly<{
  knowledgeId: string;
  supersededById: string;
  reasonCode: string;
  occurredAt: string;
  evidenceFingerprints: readonly KnowledgeFingerprint[];
  provenanceFingerprint: KnowledgeFingerprint;
}>;

export type KnowledgeReviewDirective = Readonly<{
  knowledgeId: string;
  reasonCodes: readonly string[];
  occurredAt: string;
  provenanceFingerprint: KnowledgeFingerprint;
}>;

export type KnowledgeLifecycleTransitionKind = "expire" | "invalidate" | "supersede" | "mark_contradictory" | "request_review";

export type KnowledgeLifecycleTransition = Readonly<{
  transitionId: string;
  kind: KnowledgeLifecycleTransitionKind;
  fromKnowledgeId: string;
  fromRevision: number;
  fromFingerprint: KnowledgeFingerprint;
  toKnowledgeId: string;
  toRevision: number;
  toFingerprint: KnowledgeFingerprint;
  reasonCodes: readonly string[];
  evidenceFingerprints: readonly KnowledgeFingerprint[];
  occurredAt: string;
  provenanceFingerprint: KnowledgeFingerprint;
  transitionFingerprint: KnowledgeFingerprint;
}>;

export type KnowledgeValidityAssessment = Readonly<{
  assessmentId: string;
  knowledgeId: string;
  revision: number;
  knowledgeFingerprint: KnowledgeFingerprint;
  previousState: KnowledgeValidityState;
  effectiveState: KnowledgeValidityState;
  reasonCodes: readonly string[];
  evaluatedAt: string;
  requiresReview: boolean;
  assessmentFingerprint: KnowledgeFingerprint;
  advisoryOnly: true;
  replacesCurrentEvidence: false;
}>;

export type KnowledgeConflictCandidate = Readonly<{
  candidateId: string;
  conflict: KnowledgeConflict;
  knowledgeItemIds: readonly string[];
  reasonCodes: readonly string[];
  candidateFingerprint: KnowledgeFingerprint;
  status: "under_review";
  winnerSelected: false;
  advisoryOnly: true;
  replacesCurrentEvidence: false;
}>;

export type GovernKnowledgeInput = Readonly<{
  items: readonly KnowledgeItem[];
  evaluatedAt: string;
  invalidations?: readonly KnowledgeInvalidationDirective[];
  supersessions?: readonly KnowledgeSupersessionDirective[];
  reviews?: readonly KnowledgeReviewDirective[];
}>;

export type KnowledgeGovernanceResult = Readonly<{
  schemaVersion: typeof KNOWLEDGE_GOVERNANCE_VERSION;
  items: readonly KnowledgeItem[];
  activeItems: readonly KnowledgeItem[];
  assessments: readonly KnowledgeValidityAssessment[];
  conflicts: readonly KnowledgeConflict[];
  conflictCandidates: readonly KnowledgeConflictCandidate[];
  transitions: readonly KnowledgeLifecycleTransition[];
  governanceFingerprint: KnowledgeFingerprint;
  advisoryOnly: true;
  replacesCurrentEvidence: false;
  retrievesKnowledge: false;
  modifiesDecisions: false;
  resolvesConflicts: false;
  writes: false;
}>;

export const knowledgeGovernanceSecurity = Object.freeze({
  pure: true,
  deterministic: true,
  versioned: true,
  preservesRevisionHistory: true,
  choosesConflictWinner: false,
  retrievesKnowledge: false,
  modifiesDecisions: false,
  createsStores: false,
  launchesPlanners: false,
  invokesExecutors: false,
  accessesSanity: false,
  accessesNetwork: false,
  persists: false,
  writes: false,
  storesPayloads: false,
  storesSecrets: false,
  advisoryOnly: true,
  replacesCurrentEvidence: false,
} as const);
