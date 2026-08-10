import type {KnowledgeRecurrence} from "./extractionTypes";
import type {FeedbackRecord} from "./feedbackTypes";
import type {KnowledgeGovernanceResult} from "./governanceTypes";
import type {GovernedKnowledgeRetrievalResult} from "./retrievalTypes";
import type {KnowledgeFingerprint, KnowledgeItem, KnowledgeValidityState} from "./types";

/** B6 only projects public AU9 contracts for the Review Center; it owns no knowledge store. */
export const KNOWLEDGE_CENTER_VERSION = "1.0.0" as const;

export type KnowledgeCenterSnapshot = Readonly<{
  schemaVersion: typeof KNOWLEDGE_CENTER_VERSION;
  caseId: string;
  caseVersion: number;
  governance: KnowledgeGovernanceResult;
  recurrence: readonly KnowledgeRecurrence[];
  retrieval?: GovernedKnowledgeRetrievalResult;
  feedback: readonly FeedbackRecord[];
  createdAt: string;
  updatedAt: string;
  snapshotFingerprint: KnowledgeFingerprint;
  advisoryOnly: true;
  requiresCurrentEvidence: true;
  replacesCurrentEvidence: false;
  createsPolicy: false;
  elevatesAuthority: false;
  writes: false;
}>;

export type KnowledgeCenterLifecycleAction =
  | Readonly<{kind: "mark_review"; knowledgeId: string; occurredAt: string; reasonCode: string}>
  | Readonly<{kind: "invalidate"; knowledgeId: string; occurredAt: string; reasonCode: string}>
  | Readonly<{kind: "supersede"; knowledgeId: string; supersededByKnowledgeId: string; occurredAt: string; reasonCode: string}>;

export type KnowledgeSafeSummary = Readonly<{
  knowledgeId: string;
  revision: number;
  domain: KnowledgeItem["domain"];
  kind: KnowledgeItem["kind"];
  safeSummary: string;
  lifecycle: KnowledgeValidityState;
  fingerprint: string;
  provenanceFingerprint: string;
  advisoryOnly: true;
  requiresCurrentEvidence: true;
}>;

export type KnowledgeValiditySummary = Readonly<{
  knowledgeId: string;
  state: KnowledgeValidityState;
  effectiveState: KnowledgeValidityState;
  reasonCodes: readonly string[];
  validFrom: string;
  validUntil?: string;
  evaluatedAt: string;
  stale: boolean;
  requiresReview: boolean;
}>;

export type KnowledgeRecommendationSummary = Readonly<{
  recommendationId: string;
  action: string;
  safeExplanation: string;
  rank: number;
  relevance: number;
  sourceIndependence: number;
  recurrence: number;
  validity: number;
  contextualProximity: number;
  reasonCodes: readonly string[];
  matchedDimensions: readonly string[];
  limitations: readonly string[];
  fingerprint: string;
  advisoryOnly: true;
  requiresCurrentEvidence: true;
}>;

export type KnowledgeConflictSummary = Readonly<{
  conflictId: string;
  severity: "blocking" | "critical";
  knowledgeItemIds: readonly string[];
  reasonCodes: readonly string[];
  fingerprint: string;
  requiresCurrentEvidence: true;
}>;

export type KnowledgeFeedbackSummary = Readonly<{
  feedbackId: string;
  status: FeedbackRecord["status"];
  classification: FeedbackRecord["classification"];
  reasonCodes: readonly string[];
  learningEligible: boolean;
  outcomeAuthorityConfirmed: boolean;
  fingerprint: string;
  advisoryOnly: true;
  requiresCurrentEvidence: true;
}>;

export type KnowledgeCenterEntry = Readonly<{
  item: KnowledgeItem;
  summary: KnowledgeSafeSummary;
  validity: KnowledgeValiditySummary;
  recurrence?: KnowledgeRecurrence;
  predecessorIds: readonly string[];
  successorIds: readonly string[];
  conflicts: readonly KnowledgeConflictSummary[];
  actionable: boolean;
}>;

export type KnowledgeCenterViewModel = Readonly<{
  availability: "ready" | "absent" | "stale";
  snapshot?: KnowledgeCenterSnapshot;
  entries: readonly KnowledgeCenterEntry[];
  recommendations: readonly KnowledgeRecommendationSummary[];
  feedback: readonly KnowledgeFeedbackSummary[];
  conflicts: readonly KnowledgeConflictSummary[];
  lifecycleCounts: Readonly<Record<KnowledgeValidityState, number>>;
  unsupported: readonly string[];
  reasonCodes: readonly string[];
  safeToAct: boolean;
  advisoryNotice: string;
}>;

export const knowledgeCenterSecurity = Object.freeze({
  pure: true,
  createsStores: false,
  launchesPlanners: false,
  invokesExecutors: false,
  launchesSchedulers: false,
  accessesSanity: false,
  accessesNetwork: false,
  autoAppliesRecommendations: false,
  writes: false,
  storesPayloads: false,
  storesSecrets: false,
  advisoryOnly: true,
  replacesCurrentEvidence: false,
} as const);
