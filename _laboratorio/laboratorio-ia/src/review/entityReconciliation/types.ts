import type {ReviewJsonObject} from "../types";

export const ENTITY_RECONCILIATION_VERSION = 1 as const;
export const ENTITY_RECONCILIATION_RULES_VERSION = "1.0.0" as const;
export type EntityKind = "fighter" | "event" | "organization" | "weight_category";
export type CorpusReadStatus = "complete" | "partial" | "truncated" | "unavailable" | "cancelled";
export type ReconciliationState = "candidate" | "needs_review" | "inconclusive" | "blocked" | "confirmed_duplicate" | "not_duplicate" | "deferred" | "stale";
export type ReconciliationDecisionKind = "confirm_duplicate" | "mark_not_duplicate" | "defer" | "request_rescan";
export type ReferenceImpactStatus = "known" | "estimated" | "unavailable" | "truncated";

export type ExternalId = {namespace: string; value: string};
export type EntityVariant = {documentId: string; revision?: string; variant: "draft" | "published"; contentFingerprint: string};
export type ReferenceImpact = {status: ReferenceImpactStatus; count?: number; sampleDocumentIds: string[]; relationKinds?: string[]; warning?: string};
export type EntityProjection = {
  kind: EntityKind; logicalId: string; label: string; normalizedLabel: string; aliases: string[]; slug?: string;
  externalIds: ExternalId[]; contexts: ReviewJsonObject; variants: EntityVariant[];
  identityFingerprint: string; snapshotFingerprint: string; provenance: {adapterId: string; schemaType: string; observedFields: string[]};
  referenceImpact: ReferenceImpact;
};
export type MatchEvidence = {code: string; strategy: string; field: string; explanation: string; weight: number};
export type MatchConflict = {code: string; field: string; explanation: string; blocking: boolean};
export type DuplicatePair = {pairId: string; memberIds: [string, string]; evidence: MatchEvidence[]; conflicts: MatchConflict[]; missingFields: string[]; score: number; state: "candidate" | "needs_review" | "inconclusive" | "blocked"};
export type CanonicalProposal = {logicalId: string; reasons: string[]; alternatives: string[]};
export type DuplicateGroup = {
  groupId: string; kind: EntityKind; members: EntityProjection[]; pairs: DuplicatePair[]; state: "candidate" | "needs_review" | "inconclusive" | "blocked";
  canonical: CanonicalProposal; referenceImpact: ReferenceImpact; groupFingerprint: string;
};
export type CorpusScanRequest = {version: 1; kind: EntityKind; scope: "all" | "recent"; limit: number; cursor?: string; maxGroups: number; maxBlockSize: number};
export type CorpusReadResult = {status: CorpusReadStatus; records: unknown[]; cursor?: string; warnings: string[]; provenance: {adapterId: string; capability: "entity_reconciliation_scan"}};
export type ReconciliationScanResult = {version: 1; rulesVersion: string; kind: EntityKind; scope: CorpusScanRequest["scope"]; status: CorpusReadStatus; groups: DuplicateGroup[]; scanFingerprint: string; scannedAt: string; cursor?: string; warnings: string[]};
export type ReconciliationCheckpoint = {version: 1; rulesVersion: string; scope: CorpusScanRequest["scope"]; scanFingerprint: string; groupFingerprint: string; group: DuplicateGroup; scanStatus: CorpusReadStatus; state: ReconciliationState; decision?: ReconciliationDecision; proposedPlan?: ProposedReconciliationPlan};
export type ReconciliationDecision = {kind: ReconciliationDecisionKind; actor: string; decidedAt: string; expectedGroupFingerprint: string; canonicalLogicalId?: string; reason?: string};
export type ProposedReconciliationPlan = {status: "proposed" | "blocked"; canonicalLogicalId: string; memberLogicalIds: string[]; conflicts: MatchConflict[]; referenceImpact: ReferenceImpact; requiredFutureApprovals: string[]; steps: string[]};
export type ReconciliationDecisionRequest = {version: 1; caseId: string; entityKind: EntityKind; expectedCaseVersion: number; expectedRulesVersion: string; expectedGroupFingerprint: string; decision: ReconciliationDecisionKind; actor: string; canonicalLogicalId?: string; reason?: string};

export type EntityIdentityProfile = {
  kind: EntityKind; schemaType: string; requiredProjectionFields: readonly string[]; allowedStrategies: readonly string[];
  project(record: unknown, adapterId: string): EntityProjection;
  blockKeys(entity: EntityProjection): string[];
  compare(left: EntityProjection, right: EntityProjection): Omit<DuplicatePair, "pairId" | "memberIds">;
};
export type EntityCorpusReadAdapter = {adapterId: string; supports(kind: EntityKind): boolean; read(request: CorpusScanRequest, signal?: AbortSignal): Promise<CorpusReadResult>};
