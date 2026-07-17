import type {DecisionOutcomeRecord} from "../outcomes";

export type MemoryStatus = "provisional" | "confirmed" | "rejected" | "invalidated" | "deprecated" | "obsolete" | "superseded";
export type MemoryEditorialDecision = "confirmed" | "rejected";
export type MemoryReusePolicy = "never" | "manual_only" | "future_candidate";
export type MemoryConfidenceLevel = "insufficient" | "low" | "moderate" | "high";
export type MemoryCompatibilityStatus = "compatible" | "partially_compatible" | "incompatible" | "unknown";
export type MemoryClusterStatus = "emerging" | "supported" | "contested" | "inactive";
export type MemoryEventType = "memory_created" | "memory_confirmed" | "memory_rejected" | "memory_noted" | "memory_invalidated" | "memory_deprecated" | "memory_obsolete" | "memory_superseded" | "memory_restored" | "memory_reconciled";

export type DecisionMemoryEvidence = {kind: "outcome" | "fingerprint" | "reference" | "note"; value: string; sourceEventId?: string};
export type DecisionMemoryRecord = {
  schemaVersion: 1; memorySchemaVersion: 1; engineVersion: string; fingerprintVersion: 1; id: string; outcomeId: string; caseId: string; issueId: string; resolutionId: string;
  producer: string; source?: string; entityType?: string; issueType: string; decisionType: string;
  editorialDecision: MemoryEditorialDecision; status: MemoryStatus; reusePolicy: MemoryReusePolicy;
  decisionFingerprint: string; contextFingerprint: string; inputFingerprint: string; evidenceFingerprint: string; memoryFingerprint: string; clusterFingerprint: string;
  technicalOutcome: string; structuralOutcome: string; editorialOutcome: string; operationalOutcome: string;
  normalizedPattern: {producer: string; entityType: string; issueType: string; decisionType: string; decisionFingerprint: string};
  confidence: {score: number; level: MemoryConfidenceLevel; reasons: string[]};
  compatibility: {status: MemoryCompatibilityStatus; reasons: string[]};
  confidenceScore: number; confidenceLevel: MemoryConfidenceLevel; confidenceReason: string; evidenceCount: number; confirmationCount: number; rejectionCount: number; contradictionCount: number; distinctCaseCount: number; distinctSourceCount: number; distinctProducerCount: number;
  compatibilityStatus: MemoryCompatibilityStatus; compatibleSchemaVersions: number[]; compatibleEngineVersions: string[]; compatibleProducers: string[]; incompatibilityReasons: string[];
  reusable: boolean; reuseBlockedReasons: string[]; clusterId: string; clusterStatus: MemoryClusterStatus;
  provenance: {outcomeSchemaVersion: number; outcomeEngineVersion: string; reviewSchemaVersion: number; outcomeEventIds: string[]};
  createdBy: string; createdFrom: "outcome_observer" | "outcome_import"; imported: boolean; migrated: boolean; sourceOutcomeEventIds: string[];
  evidence: DecisionMemoryEvidence[]; notes: string[]; createdAt: string; updatedAt: string; supersededBy?: string; supersedes?: string[]; invalidatedAt?: string; invalidatedReason?: string; deprecatedAt?: string; deprecatedReason?: string; obsoleteAt?: string; obsoleteReason?: string; eventIds: string[];
};
export type DecisionMemoryEvent = {schemaVersion: 1; engineVersion: string; id: string; memoryId: string; type: MemoryEventType; occurredAt: string; timestamp: string; idempotencyKey: string; actor: {type: "system" | "human" | "reconciliation" | "legacy_import"; id?: string}; provenance: string; module: "review.memory"; operation: string; reason: string; payload?: Record<string, unknown>};
export type DecisionMemoryCluster = {schemaVersion: 1; id: string; fingerprint: string; status: MemoryClusterStatus; memoryIds: string[]; confirmedMemoryIds: string[]; rejectedMemoryIds: string[]; caseIds: string[]; sourceIds: string[]; occurrenceCount: number; confidence: DecisionMemoryRecord["confidence"]; updatedAt: string};
export type DecisionMemoryClusterEvent = {schemaVersion: 1; id: string; clusterId: string; occurredAt: string; type: "cluster_rebuilt"; memoryIds: string[]};
export type DecisionMemoryLedger = {schemaVersion: 1; records: DecisionMemoryRecord[]; events: DecisionMemoryEvent[]; clusters: DecisionMemoryCluster[]; clusterEvents: DecisionMemoryClusterEvent[]};
export type MemoryImportResult = {eligible: number; created: number; updated: number; skipped: number; memoryIds: string[]};
export type MemoryReconciliationResult = {memoryId: string; changed: boolean; findings: string[]};
export type OutcomeMemoryEligibility = {eligible: boolean; reasons: string[]; decision?: MemoryEditorialDecision};
export type MemoryOutcomeInput = Pick<DecisionOutcomeRecord, keyof DecisionOutcomeRecord>;
