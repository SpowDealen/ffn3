import type {ReviewJsonValue} from "../../types";

export type GlobalResolutionReconciliationReason =
  | "domain_succeeded_checkpoint_failed"
  | "domain_succeeded_checkpoint_conflict"
  | "executor_timeout"
  | "executor_uncertain"
  | "resume_result_missing"
  | "existing_effect_detected"
  | "idempotency_conflict"
  | "postcondition_unverified";

export type GlobalResolutionReconciliationEvidenceType =
  | "review_case_outcome"
  | "review_case_status"
  | "stored_document_id"
  | "resume_result"
  | "idempotency_key"
  | "operation_history"
  | "resolved_reference"
  | "snapshot_fingerprint"
  | "payload_fingerprint"
  | "preview_fingerprint"
  | "executor_outcome"
  | "external_inspection";

export type GlobalResolutionReconciliationEvidence = {
  id: string;
  type: GlobalResolutionReconciliationEvidenceType;
  source: "review_case" | "checkpoint" | "executor" | "outcome_store" | "external_inspector";
  operationId: string;
  observedAt: string;
  summary: string;
  confidence: "confirmed" | "strong" | "insufficient";
  fingerprint?: string;
  documentId?: string;
  identityKey?: string;
  idempotencyKey?: string;
  outcome?: string;
  finding?: "effect_confirmed" | "effect_not_found" | "unknown";
};

export type GlobalResolutionReconciliationCase = {
  caseId: string;
  caseVersion: number;
  checkpointFingerprint?: string;
  operationId: string;
  capability: string;
  reason: GlobalResolutionReconciliationReason;
  evidence: GlobalResolutionReconciliationEvidence[];
  proposedOutcome?: {outcome: string; documentId?: string; identityKey?: string; payloadFingerprint?: string; idempotencyKey?: string};
  confidence: "confirmed" | "strong" | "insufficient";
  createdAt: string;
};

type AssessmentBase = {
  reconciliationCase: GlobalResolutionReconciliationCase;
  evidence: GlobalResolutionReconciliationEvidence[];
  assessmentFingerprint: string;
  missingEvidence: string[];
  notification: "Reconciliación completada" | "Reconciliación pendiente por falta de evidencia" | "Evidencia contradictoria" | "Operación habilitada para nuevo intento";
};

export type GlobalResolutionReconciliationAssessment =
  | (AssessmentBase & {status: "confirmed_succeeded"; outcome: NonNullable<GlobalResolutionReconciliationCase["proposedOutcome"]>; repairAllowed: true; retryAllowed: false})
  | (AssessmentBase & {status: "confirmed_not_applied"; repairAllowed: false; retryAllowed: true})
  | (AssessmentBase & {status: "conflicting_evidence"; repairAllowed: false; retryAllowed: false})
  | (AssessmentBase & {status: "insufficient_evidence"; repairAllowed: false; retryAllowed: false})
  | (AssessmentBase & {status: "already_reconciled"; outcome?: GlobalResolutionReconciliationCase["proposedOutcome"]; repairAllowed: false; retryAllowed: false});

export type GlobalResolutionEffectInspector = {
  id: string;
  inspect(input: {
    caseId: string;
    operationId: string;
    capability: string;
    idempotencyKey?: string;
    signal?: AbortSignal;
  }): Promise<GlobalResolutionReconciliationEvidence[]>;
};

export type GlobalResolutionReconciliationApplyResult =
  | {status: "applied"; checkpointFingerprint: string; notification: AssessmentBase["notification"]}
  | {status: "already_reconciled"; checkpointFingerprint: string; notification: "Reconciliación completada"}
  | {status: "conflict"; reason: string}
  | {status: "not_allowed"; reason: string};

export const globalResolutionReconciliationSecurity = Object.freeze({
  executesCapabilities: false,
  callsSaveDraft: false,
  persistsAuthorization: false,
  automaticInspector: false,
  secondStore: false,
  externalWrites: false,
  payloadsPersisted: false,
} as const satisfies Record<string, boolean>);

export type ReconciliationSerializableValue = ReviewJsonValue;
