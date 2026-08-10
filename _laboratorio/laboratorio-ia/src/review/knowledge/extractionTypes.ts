import type {EntityResolutionResult} from "../entityIdentity";
import type {GlobalResolutionCheckpoint, AutonomousSupervisedLoopCheckpoint} from "../globalResolution/checkpoint";
import type {GlobalResolutionInspectionEvidence} from "../globalResolution/inspection";
import type {GlobalResolutionReconciliationAssessment} from "../globalResolution/reconciliation";
import type {TransversalResolutionPlan} from "../globalResolution/transversalPlanning";
import type {DecisionOutcomeRecord} from "../outcomes";
import type {UniversalTransactionPlan} from "../transactions";
import type {AutonomousEditorialDecision, EditorialEvidenceSufficiencyEvaluation, AutonomyPolicyResult, AutonomousResolutionStrategy} from "../editorialDecision";
import type {KnowledgeDomain, KnowledgeFingerprint, KnowledgeItem, KnowledgeKind, KnowledgeObservation, KnowledgeProvenance, KnowledgeSource} from "./types";

export const KNOWLEDGE_EXTRACTION_VERSION = "1.0.0" as const;
export const KNOWLEDGE_CONSOLIDATION_VERSION = "1.0.0" as const;

export type KnowledgeExtractionInput = Readonly<{
  caseVersion: number;
  outcome: DecisionOutcomeRecord;
  checkpoint?: GlobalResolutionCheckpoint;
  inspections?: readonly GlobalResolutionInspectionEvidence[];
  identities?: readonly EntityResolutionResult[];
  resolution?: TransversalResolutionPlan;
  transaction?: UniversalTransactionPlan;
  decision?: AutonomousEditorialDecision;
  sufficiency?: EditorialEvidenceSufficiencyEvaluation;
  autonomy?: AutonomyPolicyResult;
  strategy?: AutonomousResolutionStrategy;
  loop?: AutonomousSupervisedLoopCheckpoint;
  reconciliation?: readonly GlobalResolutionReconciliationAssessment[];
  temporal?: Readonly<{validFrom: string; validUntil?: string}>;
}>;

export type ExtractedKnowledgeObservation = Readonly<{
  observation: KnowledgeObservation;
  domain: KnowledgeDomain;
  entityType?: string;
  kind: KnowledgeKind;
  confidence: number;
  temporal: Readonly<{state: "current" | "temporal"; validFrom: string; validUntil?: string}>;
  provenance: KnowledgeProvenance;
  outcomeFingerprint: KnowledgeFingerprint;
  extractionFingerprint: KnowledgeFingerprint;
}>;

export type KnowledgeExtractionResult = Readonly<{
  schemaVersion: typeof KNOWLEDGE_EXTRACTION_VERSION;
  caseId: string;
  outcomeId: string;
  observations: readonly ExtractedKnowledgeObservation[];
  sources: readonly KnowledgeSource[];
  provenance: KnowledgeProvenance;
  outcomeFingerprint: KnowledgeFingerprint;
  extractionFingerprint: KnowledgeFingerprint;
  eligible: boolean;
  reasonCodes: readonly string[];
  readsOnly: true;
  writes: false;
}>;

export type KnowledgeRelationKind = "exact_duplicate" | "reinforcement" | "contradiction" | "superseded" | "invalidated" | "temporal_overlap";
export type KnowledgeRelation = Readonly<{kind: KnowledgeRelationKind; fromId: string; toId: string; reasonCodes: readonly string[]; relationFingerprint: KnowledgeFingerprint}>;
export type KnowledgeOccurrence = Readonly<{occurrenceId: string; knowledgeFingerprint: KnowledgeFingerprint; observationFingerprint: KnowledgeFingerprint; provenanceFingerprint: KnowledgeFingerprint; outcomeFingerprint: KnowledgeFingerprint; caseId: string; caseVersion: number; producerId: string; sourceIds: readonly string[]; observedAt: string}>;
export type KnowledgeRecurrence = Readonly<{knowledgeId: string; observationCount: number; independentSourceCount: number; producerCount: number; caseCount: number; firstObservedAt: string; lastObservedAt: string; occurrenceIds: readonly string[]; recurrenceFingerprint: KnowledgeFingerprint; replacesCurrentEvidence: false}>;
export type KnowledgeConsolidationResult = Readonly<{schemaVersion: typeof KNOWLEDGE_CONSOLIDATION_VERSION; items: readonly KnowledgeItem[]; relations: readonly KnowledgeRelation[]; conflicts: readonly import("./types").KnowledgeConflict[]; occurrences: readonly KnowledgeOccurrence[]; recurrence: readonly KnowledgeRecurrence[]; exactDuplicates: number; reinforcements: number; consolidationFingerprint: KnowledgeFingerprint; advisoryOnly: true; retrievesKnowledge: false; modifiesDecisions: false; appliesLearning: false; writes: false}>;

export const knowledgeExtractionSecurity = Object.freeze({pure: true, readsOnly: true, writes: false, persists: false, retrievesForDecision: false, modifiesDecisions: false, appliesLearning: false, createsStores: false, invokesExecutors: false, accessesSanity: false, storesPayloads: false, storesPrompts: false, storesSecrets: false} as const);
