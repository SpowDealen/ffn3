import type {ReviewJsonObject, ReviewJsonValue} from "../types";

export type OutcomeStatus = "pending" | "technically_succeeded" | "structurally_validated" | "editorially_confirmed" | "operationally_confirmed" | "failed" | "rejected" | "superseded";
export type TechnicalOutcomeStatus = "unknown" | "pending" | "succeeded" | "failed";
export type StructuralOutcomeStatus = "unknown" | "pending" | "valid" | "invalid";
export type EditorialOutcomeStatus = "unknown" | "pending_confirmation" | "confirmed" | "rejected";
export type OperationalOutcomeStatus = "unknown" | "pending" | "completed" | "failed";
export type OutcomeStage = "decision" | "application" | "requirements" | "materialization" | "resume" | "draft" | "editorial" | "operational" | "reconciliation";
export type OutcomeEventType =
  | "outcome_created" | "resolution_recorded" | "resolution_validated" | "resolution_applied"
  | "prepared_entity_created" | "requirements_inspected" | "enrichment_applied"
  | "structural_validation_passed" | "structural_validation_failed"
  | "materialization_started" | "materialization_succeeded" | "materialization_failed"
  | "resume_preview_generated" | "resume_started" | "resume_succeeded" | "resume_failed" | "draft_created"
  | "editorial_confirmation_requested" | "editorial_confirmed" | "editorial_rejected" | "editorial_note_added"
  | "operational_confirmation_recorded" | "outcome_failed" | "outcome_reconciled" | "outcome_superseded";
export type OutcomeEventSource = "review_store" | "autonomous_resolver" | "investigation_engine" | "schema_requirements" | "materialization_executor" | "resume_executor" | "builder_validation" | "human_confirmation" | "reconciliation" | "dev_api" | "legacy_import";

export type OutcomeReference = {type: "application" | "entity" | "resume" | "draft" | "document" | "case" | "issue" | "outcome"; id: string; relation?: string};
export type OutcomeEvidence = {label: string; source: OutcomeEventSource; value?: ReviewJsonValue; observedAt?: string};
export type OutcomeValidation = {valid: boolean; reasons: string[]};
export type OutcomeError = {code: string; message: string; reconciliationRequired?: boolean};

export type DecisionOutcomeEvent = {
  schemaVersion: 1;
  engineVersion: string;
  id: string;
  outcomeId: string;
  caseId: string;
  type: OutcomeEventType;
  stage: OutcomeStage;
  status: string;
  source: OutcomeEventSource;
  occurredAt: string;
  correlationKey: string;
  idempotencyKey: string;
  actor?: {type: "system" | "human" | "executor" | "migration"; id?: string; label?: string};
  operation?: string;
  payload?: ReviewJsonObject;
  evidence: OutcomeEvidence[];
  validation?: OutcomeValidation;
  error?: OutcomeError;
  references: OutcomeReference[];
};

export type DecisionOutcomeRecord = {
  schemaVersion: 1;
  engineVersion: string;
  id: string;
  caseId: string;
  issueId: string;
  resolutionId: string;
  decisionFingerprint: string;
  contextFingerprint: string;
  inputFingerprint: string;
  evidenceFingerprint: string;
  correlationKey: string;
  producer: string;
  source?: string;
  entityType?: string;
  issueType: string;
  decisionType: string;
  reviewSchemaVersion: number;
  currentStatus: OutcomeStatus;
  technicalStatus: TechnicalOutcomeStatus;
  structuralStatus: StructuralOutcomeStatus;
  editorialStatus: EditorialOutcomeStatus;
  operationalStatus: OperationalOutcomeStatus;
  applicationReference?: string;
  materializationReference?: string;
  resumeReference?: string;
  documentReference?: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  failedAt?: string;
  supersededAt?: string;
  supersededBy?: string;
  reconciliationRequired: boolean;
  conflicts: string[];
  eventIds: string[];
};

export type CreateOutcomeRecordInput = Omit<DecisionOutcomeRecord, "schemaVersion" | "engineVersion" | "currentStatus" | "technicalStatus" | "structuralStatus" | "editorialStatus" | "operationalStatus" | "createdAt" | "updatedAt" | "reconciliationRequired" | "conflicts" | "eventIds"> & {createdAt?: string};
export type AppendOutcomeEventInput = Omit<DecisionOutcomeEvent, "schemaVersion" | "engineVersion" | "id" | "occurredAt" | "evidence" | "references"> & {id?: string; occurredAt?: string; evidence?: OutcomeEvidence[]; references?: OutcomeReference[]};
export type OutcomeLedger = {schemaVersion: 1; records: DecisionOutcomeRecord[]; events: DecisionOutcomeEvent[]};
export type OutcomeAppendResult = {record: DecisionOutcomeRecord; event: DecisionOutcomeEvent; duplicate: boolean};
export type OutcomeCorrelation = {status: "exact" | "fingerprint_match" | "explicit_reference" | "unresolved" | "conflict"; outcomeIds: string[]; reasons: string[]};
export type OutcomeAssessment<T> = {status: T; reasons: string[]; evidence: OutcomeEvidence[]};
export type OutcomeReconciliationResult = {record: DecisionOutcomeRecord; event?: DecisionOutcomeEvent; changed: boolean; findings: string[]};
