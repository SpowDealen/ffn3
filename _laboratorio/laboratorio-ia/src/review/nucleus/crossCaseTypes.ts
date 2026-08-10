import type {ReviewCase} from "../types";

export const CROSS_CASE_INTELLIGENCE_VERSION = "1.0.0" as const;

export type CrossCaseRelationKind =
  | "shared_entity"
  | "possible_duplicate_case"
  | "shared_event"
  | "shared_organization"
  | "shared_fighter"
  | "shared_news"
  | "shared_resolution"
  | "shared_transaction"
  | "shared_knowledge"
  | "shared_conflict"
  | "dependency_chain"
  | "merge_candidate"
  | "blocked_by_other_case";

export type CrossCaseEvidenceKind = "entity" | "event" | "organization" | "fighter" | "news" | "result" | "fight" | "category" | "discipline" | "capability" | "producer" | "fingerprint" | "resolution" | "transaction" | "knowledge" | "conflict" | "dependency" | "dedupe";

export type CrossCaseEvidence = Readonly<{
  kind: CrossCaseEvidenceKind;
  authority: "case" | "checkpoint" | "resolution" | "transaction" | "knowledge";
  safeSummary: string;
  sourceCaseIds: readonly string[];
  evidenceFingerprint: string;
  current: true;
}>;

export type CrossCaseRank = Readonly<{
  impact: number;
  evidence: number;
  recurrence: number;
  independence: number;
  temporalProximity: number;
  risk: number;
  total: number;
}>;

export type CrossCaseRelation = Readonly<{
  relationId: string;
  kind: CrossCaseRelationKind;
  caseIds: readonly string[];
  safeReason: string;
  evidence: readonly CrossCaseEvidence[];
  rank: CrossCaseRank;
  recommendation: string;
  limitations: readonly string[];
  relationFingerprint: string;
  advisoryOnly: true;
  requiresCurrentEvidence: true;
  replacesCurrentEvidence: false;
}>;

export type CrossCaseNode = Readonly<{
  caseId: string;
  caseVersion: number;
  title: string;
  status: ReviewCase["status"];
  priority: ReviewCase["priority"];
  subjectType: string;
  current: boolean;
  nodeFingerprint: string;
}>;

export type CrossCaseEdge = Readonly<{
  edgeId: string;
  fromCaseId: string;
  toCaseId: string;
  relationId: string;
  relationFingerprint: string;
}>;

export type CrossCaseGroup = Readonly<{
  groupId: string;
  caseIds: readonly string[];
  relationIds: readonly string[];
  safeSummary: string;
  recommendation: "review_together" | "compare_before_resolution" | "coordinate_dependency";
  limitations: readonly string[];
  groupFingerprint: string;
  neverAutoMerged: true;
  advisoryOnly: true;
  requiresCurrentEvidence: true;
  replacesCurrentEvidence: false;
}>;

export type CrossCaseGraph = Readonly<{
  version: typeof CROSS_CASE_INTELLIGENCE_VERSION;
  snapshotFingerprint: string;
  graphFingerprint: string;
  nodes: readonly CrossCaseNode[];
  edges: readonly CrossCaseEdge[];
  relations: readonly CrossCaseRelation[];
  groups: readonly CrossCaseGroup[];
  unsupportedCaseIds: readonly string[];
  staleCaseIds: readonly string[];
  advisoryOnly: true;
  requiresCurrentEvidence: true;
  replacesCurrentEvidence: false;
  persistsGraph: false;
  writes: false;
}>;

export type BuildCrossCaseGraphInput = Readonly<{cases: readonly ReviewCase[]; evaluatedAt: string; maxRelations?: number}>;

export const crossCaseIntelligenceSecurity = Object.freeze({pure: true, derivesFromSnapshotOnly: true, createsStores: false, createsPlanners: false, createsExecutors: false, createsSchedulers: false, createsRuntimes: false, createsAuthority: false, persistsGraph: false, accessesSanity: false, accessesNetwork: false, executesOperations: false, autoMerges: false, speculativeRelations: false, exposesPayloads: false, advisoryOnly: true, requiresCurrentEvidence: true, replacesCurrentEvidence: false, writes: false} as const);
