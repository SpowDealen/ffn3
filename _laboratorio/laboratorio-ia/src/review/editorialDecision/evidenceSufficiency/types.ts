import type {AutonomousEditorialDecisionInput, AutonomousEditorialDecisionKind, AutonomousEditorialEvidence, AutonomousEditorialRisk, EditorialEvidenceSufficiencyClassification} from "../types";

export const EDITORIAL_EVIDENCE_SUFFICIENCY_VERSION = "1.0.0" as const;

export type EditorialInvestigationRecommendationKind =
  | "inspect_sanity"
  | "inspect_source"
  | "search_candidates"
  | "compare_entities"
  | "wait_for_evidence"
  | "request_human"
  | "ready_to_decide";

export type EditorialEvidenceDimension = "inspection" | "identity" | "resolution" | "transaction";
export type EditorialSourceAuthority = "authoritative" | "corroborating" | "weak";
export type EditorialEvidenceFreshness = "fresh" | "stale" | "unknown";

export type EditorialEvidenceSufficiencyInput = AutonomousEditorialDecisionInput & Readonly<{
  decisionIntent?: AutonomousEditorialDecisionKind;
  decisionRisk?: AutonomousEditorialRisk;
  maximumAgeMs?: number;
}>;

export type EditorialEvidenceSourceAssessment = Readonly<{
  sourceId: string;
  dimension: EditorialEvidenceDimension;
  authority: EditorialSourceAuthority;
  independent: boolean;
  independenceGroup: string;
  evidenceIds: readonly string[];
}>;

export type EditorialMissingEvidence = Readonly<{
  dimension: EditorialEvidenceDimension;
  reasonCode: string;
  description: string;
  requiredFor: AutonomousEditorialDecisionKind | "generic_decision";
}>;

export type EditorialEvidenceContradiction = Readonly<{
  code: string;
  severity: "blocking" | "critical";
  summary: string;
  evidenceIds: readonly string[];
}>;

export type EditorialInvestigationRecommendation = Readonly<{
  kind: EditorialInvestigationRecommendationKind;
  priority: number;
  blocking: boolean;
  reasonCodes: readonly string[];
  explanation: string;
}>;

export type EditorialEvidenceCoverage = Readonly<{
  requiredDimensions: readonly EditorialEvidenceDimension[];
  observedDimensions: readonly EditorialEvidenceDimension[];
  missingDimensions: readonly EditorialEvidenceDimension[];
  ratio: number;
}>;

export type EditorialEvidenceAuthorityAssessment = Readonly<{
  authoritative: number;
  corroborating: number;
  weak: number;
  adequate: boolean;
}>;

export type EditorialEvidenceIndependenceAssessment = Readonly<{
  independentSourceCount: number;
  requiredIndependentSources: number;
  groups: readonly string[];
  adequate: boolean;
}>;

export type EditorialEvidenceFreshnessAssessment = Readonly<{
  evaluatedAt: string;
  maximumAgeMs: number;
  freshEvidenceIds: readonly string[];
  staleEvidenceIds: readonly string[];
  unknownEvidenceIds: readonly string[];
  current: boolean;
}>;

export type EditorialEvidenceSufficiencyEvaluation = Readonly<{
  version: typeof EDITORIAL_EVIDENCE_SUFFICIENCY_VERSION;
  caseId: string;
  caseVersion: number;
  classification: EditorialEvidenceSufficiencyClassification;
  canDecideNow: boolean;
  riskGate: "open" | "blocked";
  evidenceUsed: readonly AutonomousEditorialEvidence[];
  missingEvidence: readonly EditorialMissingEvidence[];
  sources: readonly EditorialEvidenceSourceAssessment[];
  independence: EditorialEvidenceIndependenceAssessment;
  authority: EditorialEvidenceAuthorityAssessment;
  freshness: EditorialEvidenceFreshnessAssessment;
  contradictions: readonly EditorialEvidenceContradiction[];
  coverage: EditorialEvidenceCoverage;
  recommendations: readonly EditorialInvestigationRecommendation[];
  safeExplanation: string;
  inputFingerprint: string;
  evaluationFingerprint: string;
  executesInvestigation: false;
  executionAllowed: false;
  writes: false;
}>;

export const editorialEvidenceSufficiencySecurity = Object.freeze({
  pure: true,
  failClosed: true,
  executesInvestigation: false,
  executesOperations: false,
  createsEntities: false,
  launchesTransactions: false,
  accessesExecutors: false,
  accessesSanityDirectly: false,
  persistsEvaluation: false,
  writes: false,
  rawPayloads: false,
  confidenceCanReplaceEvidence: false,
} as const);
