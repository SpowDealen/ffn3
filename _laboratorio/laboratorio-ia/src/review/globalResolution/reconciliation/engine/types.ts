import type {GlobalResolutionCheckpoint} from "../../checkpoint";
import type {GlobalResolutionReconciliationCase, GlobalResolutionReconciliationEvidence} from "../types";

export const UNIVERSAL_RECONCILIATION_ASSESSMENT_VERSION = "1.0.0";

export type UniversalReconciliationStatus =
  | "confirmed_succeeded"
  | "confirmed_not_applied"
  | "conflicting_evidence"
  | "insufficient_evidence"
  | "already_reconciled"
  | "technical_failure"
  | "unsupported"
  | "stale_context";

export type UniversalReconciliationAction = "repair_checkpoint" | "enable_retry" | "inspect_again" | "none";

export type UniversalReconciliationReason = {
  code: string;
  message: string;
};

export type UniversalSafeEvidenceSummary = {
  id: string;
  category:
    | "local_checkpoint"
    | "local_operation"
    | "remote_document"
    | "remote_reference"
    | "remote_payload"
    | "remote_absence"
    | "remote_ambiguity"
    | "technical";
  provenance: string;
  summary: string;
  confidence: "confirmed" | "strong" | "insufficient";
  fingerprint?: string;
  documentId?: string;
  identityKey?: string;
  finding?: "effect_confirmed" | "effect_not_found" | "unknown";
};

export type UniversalReconciliationOutcome = {
  outcome: string;
  documentId?: string;
  identityKey?: string;
  payloadFingerprint?: string;
  idempotencyKey?: string;
};

export type UniversalReconciliationAssessment = {
  version: typeof UNIVERSAL_RECONCILIATION_ASSESSMENT_VERSION;
  status: UniversalReconciliationStatus;
  operationId: string;
  capability: string;
  inspectorId?: string;
  summary: string;
  reasons: UniversalReconciliationReason[];
  localEvidence: UniversalSafeEvidenceSummary[];
  remoteEvidence: UniversalSafeEvidenceSummary[];
  allowedActions: UniversalReconciliationAction[];
  blockingReasons: UniversalReconciliationReason[];
  inspectedAt?: string;
  contextFingerprint: string;
  evidenceFingerprint?: string;
  assessmentFingerprint: string;
  outcome?: UniversalReconciliationOutcome;
};

export type UniversalReconciliationContract = {
  version: string;
  capability: string;
  requiredSuccessFields: ReadonlyArray<"documentId" | "identityKey" | "payloadFingerprint">;
  successOutcome: string;
  requiresCompletedCheckpointForAlreadyReconciled?: boolean;
};

export type UniversalReconciliationContextBinding = {
  producerId?: string;
  producerVersion?: string;
  manifestVersion?: string;
  manifestFingerprint?: string;
  caseVersion: number;
  checkpointVersion?: number;
  checkpointFingerprint: string;
  operationId: string;
  operationFingerprint: string;
  payloadFingerprint?: string;
  capabilityId?: string;
  capabilityVersion?: string;
  inspectorId?: string;
  inspectorVersion?: string;
  inspectionGeneration?: number;
};

export type UniversalReconciliationAssessmentInput = {
  reconciliationCase: GlobalResolutionReconciliationCase;
  checkpoint: GlobalResolutionCheckpoint;
  evidence?: readonly GlobalResolutionReconciliationEvidence[];
  inspectorId?: string;
  inspectedAt?: string;
  expectedContext?: UniversalReconciliationContextBinding;
  currentContext: UniversalReconciliationContextBinding;
  technicalFailure?: {code: string};
  unsupported?: {code: string};
};
