import type {UniversalFingerprint} from "../universal";

export const UNIVERSAL_EDITORIAL_KNOWLEDGE_VERSION = "1.0.0" as const;
export const UNIVERSAL_EDITORIAL_KNOWLEDGE_FINGERPRINT_VERSION = 1 as const;

export type KnowledgeDomain = "news" | "event" | "fighter" | "organization" | "weight_category" | "fight" | "result" | "relationship";
export type KnowledgeKind = "confirmed_fact" | "observed_pattern" | "historical_experience" | "recommendation" | "negative_evidence" | "contradiction" | "invalidated_knowledge" | "temporal_knowledge";
export type KnowledgeValidityState = "current" | "temporal" | "expired" | "invalidated" | "superseded" | "contradictory" | "under_review";
export type KnowledgeSourceKind = "checkpoint" | "inspection" | "identity" | "resolution" | "transaction" | "decision" | "outcome" | "memory" | "reconciliation" | "human_confirmation" | "producer";
export type KnowledgeSourceAuthority = "authoritative" | "editorial_confirmed" | "corroborating" | "historical" | "weak";
export type KnowledgeObservationPolarity = "supports" | "contradicts" | "unknown";
export type KnowledgeReferenceKind = "case" | "entity" | "evidence" | "checkpoint" | "decision" | "strategy" | "transaction" | "outcome" | "memory" | "knowledge" | "producer_manifest" | "capability_manifest" | "editorial_context" | "issue" | "relationship";
export type KnowledgeFingerprint = UniversalFingerprint;

export type KnowledgeReference = Readonly<{
  kind: KnowledgeReferenceKind;
  id: string;
  relation: "about" | "derived_from" | "supports" | "contradicts" | "supersedes" | "invalidates" | "requires";
  fingerprint?: KnowledgeFingerprint;
}>;

export type KnowledgeSource = Readonly<{
  sourceId: string;
  kind: KnowledgeSourceKind;
  authority: KnowledgeSourceAuthority;
  sourceVersion: string;
  observedAt: string;
  independenceGroup: string;
  provenanceFingerprint: KnowledgeFingerprint;
}>;

/** A deliberately narrow claim projection: codes and fingerprints, never a source payload. */
export type KnowledgeObservation = Readonly<{
  observationId: string;
  claimCode: string;
  subjectKey: string;
  polarity: KnowledgeObservationPolarity;
  safeSummary: string;
  valueFingerprint?: KnowledgeFingerprint;
  evidenceFingerprints: readonly KnowledgeFingerprint[];
  sourceIds: readonly string[];
  observedAt: string;
  observationFingerprint: KnowledgeFingerprint;
}>;

export type KnowledgeValidity = Readonly<{
  state: KnowledgeValidityState;
  validFrom: string;
  validUntil?: string;
  invalidatedAt?: string;
  invalidationReasonCode?: string;
  supersededAt?: string;
  supersededBy?: string;
  evaluatedAt: string;
}>;

export type KnowledgeConflict = Readonly<{
  conflictId: string;
  subjectKey: string;
  claimCode: string;
  knowledgeItemIds: readonly string[];
  observationFingerprints: readonly KnowledgeFingerprint[];
  severity: "blocking" | "critical";
  reasonCodes: readonly string[];
  conflictFingerprint: KnowledgeFingerprint;
  requiresCurrentEvidence: true;
}>;

export type KnowledgeRecommendation = Readonly<{
  recommendationId: string;
  action: "investigate" | "inspect_current_evidence" | "compare_sources" | "reuse_candidate" | "avoid_duplicate" | "request_human" | "wait";
  safeSummary: string;
  reasonCodes: readonly string[];
  supportingKnowledgeIds: readonly string[];
  recommendationFingerprint: KnowledgeFingerprint;
  advisoryOnly: true;
  requiresCurrentEvidence: true;
}>;

export type KnowledgeProvenance = Readonly<{
  caseId: string;
  caseVersion: number;
  producerId: string;
  engineVersions: Readonly<{checkpoint?: string; inspection?: string; identity?: string; resolution?: string; transaction?: string; decision?: string; sufficiency?: string; autonomy?: string; strategy?: string; loop?: string; outcome?: string; memory?: string}>;
  checkpointFingerprint?: KnowledgeFingerprint;
  inspectionFingerprints: readonly KnowledgeFingerprint[];
  identityFingerprints: readonly KnowledgeFingerprint[];
  resolutionFingerprint?: KnowledgeFingerprint;
  transactionFingerprint?: KnowledgeFingerprint;
  decisionFingerprint?: KnowledgeFingerprint;
  sufficiencyFingerprint?: KnowledgeFingerprint;
  autonomyFingerprint?: KnowledgeFingerprint;
  strategyFingerprint?: KnowledgeFingerprint;
  outcomeFingerprints: readonly KnowledgeFingerprint[];
  memoryFingerprints: readonly string[];
  provenanceFingerprint: KnowledgeFingerprint;
}>;

export type KnowledgeItem = Readonly<{
  schemaVersion: typeof UNIVERSAL_EDITORIAL_KNOWLEDGE_VERSION;
  fingerprintVersion: typeof UNIVERSAL_EDITORIAL_KNOWLEDGE_FINGERPRINT_VERSION;
  id: string;
  revision: number;
  domain: KnowledgeDomain;
  kind: KnowledgeKind;
  subjectKey: string;
  claimCode: string;
  safeSummary: string;
  authority: KnowledgeSourceAuthority;
  observations: readonly KnowledgeObservation[];
  sources: readonly KnowledgeSource[];
  references: readonly KnowledgeReference[];
  conflicts: readonly KnowledgeConflict[];
  recommendations: readonly KnowledgeRecommendation[];
  validity: KnowledgeValidity;
  provenance: KnowledgeProvenance;
  knowledgeFingerprint: KnowledgeFingerprint;
  contentFingerprint: KnowledgeFingerprint;
  createdAt: string;
  updatedAt: string;
  serializable: true;
  advisoryOnly: true;
  replacesCurrentEvidence: false;
}>;

export type CreateKnowledgeObservationInput = Omit<KnowledgeObservation, "observationId" | "observationFingerprint">;
export type CreateKnowledgeSourceInput = Omit<KnowledgeSource, "provenanceFingerprint">;
export type CreateKnowledgeProvenanceInput = Omit<KnowledgeProvenance, "provenanceFingerprint">;
export type CreateKnowledgeItemInput = Omit<KnowledgeItem, "schemaVersion" | "fingerprintVersion" | "id" | "revision" | "observations" | "conflicts" | "recommendations" | "knowledgeFingerprint" | "contentFingerprint" | "createdAt" | "updatedAt" | "serializable" | "advisoryOnly" | "replacesCurrentEvidence"> & Readonly<{observations: readonly (KnowledgeObservation | CreateKnowledgeObservationInput)[]; conflicts?: readonly KnowledgeConflict[]; recommendations?: readonly KnowledgeRecommendation[]; revision?: number; createdAt?: string; updatedAt?: string}>;

export const universalEditorialKnowledgeSecurity = Object.freeze({pure: true, serializable: true, versioned: true, idempotent: true, createsStores: false, launchesPlanners: false, invokesExecutors: false, accessesSanity: false, fetchesExternalData: false, persistsKnowledge: false, writes: false, storesPayloads: false, storesSecrets: false, replacesCurrentEvidence: false} as const);
