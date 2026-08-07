import type {EntityResolutionResult, UniversalEntityType} from "../entityIdentity";
import type {GlobalResolutionInspectionEvidence} from "../globalResolution/inspection/types";
import type {TransversalResolutionPlan} from "../globalResolution/transversalPlanning";
import type {TransactionOperationalView} from "../transactions/orchestrator";

export const AUTONOMOUS_EDITORIAL_DECISION_ENGINE_VERSION = "1.1.0" as const;

export type EditorialEvidenceSufficiencyClassification = "sufficient" | "insufficient" | "contradictory" | "stale" | "unavailable" | "partial";

export type AutonomousEditorialDecisionKind =
  | "investigate"
  | "reuse_existing"
  | "create_entity"
  | "repair_reference"
  | "validate"
  | "resume"
  | "wait_for_evidence"
  | "request_authorization"
  | "request_reconciliation"
  | "request_compensation"
  | "block"
  | "escalate_to_human";

export type AutonomousEditorialRisk = "low" | "medium" | "high" | "critical";
export type AutonomousEditorialEvidenceSource = "inspection" | "identity" | "resolution" | "transaction";

export type AutonomousEditorialEvidence = Readonly<{
  id: string;
  source: AutonomousEditorialEvidenceSource;
  kind: string;
  summary: string;
  fingerprint: string;
  confidence?: number;
}>;

export type AutonomousEditorialFoundation = Readonly<{
  code: string;
  summary: string;
  evidenceIds: readonly string[];
}>;

export type AutonomousEditorialPrecondition = Readonly<{
  code: string;
  description: string;
  satisfied: boolean;
  evidenceIds: readonly string[];
}>;

export type AutonomousEditorialBlocker = Readonly<{
  code: string;
  severity: "blocking" | "critical";
  summary: string;
  evidenceIds: readonly string[];
}>;

export type AutonomousEditorialCaseContext = Readonly<{
  caseId: string;
  caseVersion: number;
  status?: string;
  priority?: string;
}>;

/**
 * Snapshot read-only de las autoridades AU4-AU7. Ningún adapter, executor,
 * repositorio o cliente externo forma parte del contrato del motor.
 */
export type AutonomousEditorialDecisionInput = Readonly<{
  case: AutonomousEditorialCaseContext;
  evaluatedAt: string;
  inspection?: readonly GlobalResolutionInspectionEvidence[];
  identities?: readonly EntityResolutionResult[];
  resolution?: TransversalResolutionPlan;
  transaction?: TransactionOperationalView;
}>;

export type AutonomousEditorialDecision = Readonly<{
  version: typeof AUTONOMOUS_EDITORIAL_DECISION_ENGINE_VERSION;
  caseId: string;
  caseVersion: number;
  decision: AutonomousEditorialDecisionKind;
  subjectEntityType?: UniversalEntityType;
  foundations: readonly AutonomousEditorialFoundation[];
  evidence: readonly AutonomousEditorialEvidence[];
  confidence: number;
  risk: AutonomousEditorialRisk;
  preconditions: readonly AutonomousEditorialPrecondition[];
  blockingReasons: readonly AutonomousEditorialBlocker[];
  operatorExplanation: string;
  evidenceSufficiency: EditorialEvidenceSufficiencyClassification;
  evidenceSufficiencyFingerprint: string;
  canDecideNow: boolean;
  inputFingerprint: string;
  decisionFingerprint: string;
  executionAllowed: false;
  writes: false;
}>;

export const autonomousEditorialDecisionSecurity = Object.freeze({
  pure: true,
  failClosed: true,
  executesOperations: false,
  accessesExecutors: false,
  accessesSanity: false,
  persistsDecisions: false,
  writes: false,
  rawPayloads: false,
  rawSecrets: false,
  confidenceWithoutEvidence: false,
} as const);
