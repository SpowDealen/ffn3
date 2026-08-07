import type {EntityOperation, OperationSupportLevel} from "../../entityOperations";
import type {GlobalResolutionAssumption, GlobalResolutionBlocker, GlobalResolutionPlanStatus, GlobalResolutionPlanningPolicy, GlobalResolutionWarning} from "../types";
import type {ResolutionDependencyPolicy, ResolutionGraphState, ResolutionNodeState} from "../../resolutionGraph";
import type {ReviewJsonObject} from "../../types";
import type {ProducerCheckpointBinding} from "../producers/types";
import type {IdentityCreationAuthorization} from "../identityCreationGuard";

export type GlobalResolutionCheckpointPhase =
  | "planned"
  | "simulated"
  | "partially_executed"
  | "ready_to_resume"
  | "completed"
  | "blocked"
  | "failed"
  | "reconciliation_required";

export type SerializedCapabilityRequirement = {
  id: string;
  support: OperationSupportLevel;
};

export type SerializedExecutorRequirement = {
  capability: string;
  executorId: string;
  version: number;
  manifestFingerprint: string;
};

export type SerializedGlobalResolutionPlan = {
  schemaVersion: 1;
  planId: string;
  caseId: string;
  caseVersion: number;
  producer: string;
  originalOperation: string;
  operations: EntityOperation[];
  status: GlobalResolutionPlanStatus;
  structurallyValid: boolean;
  executable: boolean;
  blockers: GlobalResolutionBlocker[];
  warnings: GlobalResolutionWarning[];
  assumptions: GlobalResolutionAssumption[];
  policy: GlobalResolutionPlanningPolicy;
  requiredCapabilities: string[];
  capabilityRequirements: SerializedCapabilityRequirement[];
  executorRequirements: SerializedExecutorRequirement[];
  planFingerprint: string;
  idempotencyKey: string;
};

export type SerializedResolutionNodeResult = {
  references: Array<{type: string; id: string}>;
  outcome?: string;
};

export type SerializedResolutionNode = {
  id: string;
  operationId: string;
  dependencyIds: string[];
  state: ResolutionNodeState;
  idempotencyKey: string;
  isResumeNode: boolean;
  requiredForCompletion: boolean;
  dependencyPolicy?: ResolutionDependencyPolicy;
  result?: SerializedResolutionNodeResult;
  error?: {code: string; message: string; retryable: boolean};
};

export type SerializedResolutionGraph = {
  schemaVersion: 1;
  graphId: string;
  planId: string;
  caseId: string;
  caseVersion: number;
  producer: string;
  originalOperation: string;
  nodes: SerializedResolutionNode[];
  state: ResolutionGraphState;
  intentFingerprint: string;
  fingerprint: string;
  idempotencyKey: string;
  metadata: ReviewJsonObject;
};

export type SerializedSimulationSummary = {
  generatedAt: string;
  inputFingerprint: string;
  simulatedOperationIds: string[];
  blockedOperationIds: string[];
  blockerCodes: string[];
  finalReadiness: "ready" | "blocked";
  resultFingerprint: string;
};

export type SerializedExecutionOperationSummary = {
  operationId: string;
  capability: string;
  status: "succeeded" | "blocked" | "failed" | "reconciliation_required";
  attempt: number;
  idempotencyKey: string;
  documentId?: string;
  outcome?: string;
  startedAt: string;
  completedAt: string;
  error?: {code: string; message: string; retryable: boolean};
  reconciliation?: {
    reason?: string;
    identityKey?: string;
    entityId?: string;
    possibleDraftId?: string;
    payloadFingerprint?: string;
  };
};

export type SerializedExecutionSummary = {
  planFingerprint: string;
  simulationFingerprint: string;
  status: "succeeded" | "blocked" | "failed" | "reconciliation_required" | "cancelled";
  operations: SerializedExecutionOperationSummary[];
  startedAt: string;
  completedAt: string;
  resultFingerprint: string;
};

export type SerializedReferenceResolutionSummary = {
  operationId: string;
  replacementOperationId?: string;
  entityType: string;
  documentId: string;
  identityKey: string;
  outcome: "created" | "reused_existing";
  payloadFingerprint: string;
  snapshotFingerprint?: string;
  resolvedAt: string;
};

export type SerializedResumeSummary = {
  operationId: string;
  planId: string;
  planFingerprint: string;
  previewFingerprint: string;
  payloadFingerprint: string;
  snapshotFingerprint: string;
  referenceIds: string[];
  validation: {
    valid: boolean;
    blockerCodes: string[];
  };
  preparedAt: string;
  outcome?: "resumed" | "already_resumed" | "blocked" | "failed" | "reconciliation_required";
  draftId?: string;
  documentId?: string;
  postValidationPassed?: boolean;
  completedAt?: string;
};

export type GlobalResolutionCheckpointHistoryKind =
  | "planned"
  | "simulated"
  | "execution_started"
  | "execution_succeeded"
  | "execution_failed"
  | "reference_resolved"
  | "resume_prepared"
  | "resume_started"
  | "resume_completed"
  | "reconciliation_required"
  | "checkpoint_conflict"
  | "checkpoint_recovered"
  | "checkpoint_stale"
  | "checkpoint_updated"
  | "reconciliation_started"
  | "reconciliation_evidence_collected"
  | "reconciliation_confirmed_succeeded"
  | "reconciliation_confirmed_not_applied"
  | "reconciliation_conflicting"
  | "reconciliation_insufficient"
  | "reconciliation_applied"
  | "reconciliation_already_applied";

export type GlobalResolutionCheckpointHistoryEntry = {
  id: string;
  kind: GlobalResolutionCheckpointHistoryKind;
  operationId?: string;
  status: string;
  occurredAt: string;
  inspectorId?: string;
  capability?: string;
  evidenceFingerprint?: string;
  assessmentFingerprint?: string;
  appliedAction?: "repair_checkpoint" | "enable_retry";
  reasonCodes?: string[];
};

export type GlobalResolutionCheckpoint = {
  schemaVersion: 1;
  id: string;
  caseId: string;
  caseVersion: number;
  storedAtCaseVersion: number;
  producer: string;
  producerManifest?: ProducerCheckpointBinding;
  plan: SerializedGlobalResolutionPlan;
  graph: SerializedResolutionGraph;
  planFingerprint: string;
  graphFingerprint: string;
  caseFingerprint: string;
  snapshotFingerprint?: string;
  checkpointFingerprint: string;
  phase: GlobalResolutionCheckpointPhase;
  simulation?: SerializedSimulationSummary;
  execution?: SerializedExecutionSummary;
  referenceResolution?: SerializedReferenceResolutionSummary;
  /** Fighter uses the AU5 authorization; all supported types may persist the compact AU6 preflight. */
  identityGuard?: IdentityCreationAuthorization;
  resume?: SerializedResumeSummary;
  history: GlobalResolutionCheckpointHistoryEntry[];
  createdAt: string;
  updatedAt: string;
};

export type GlobalResolutionRecoveryEnvironment = {
  capabilities: SerializedCapabilityRequirement[];
  executors: SerializedExecutorRequirement[];
  producers?: ProducerCheckpointBinding[];
};

export type GlobalResolutionContinuation = {
  nextReadyOperationIds: string[];
  blockedOperationIds: string[];
  completedOperationIds: string[];
  reconciliationOperationIds: string[];
  canSimulate: boolean;
  canExecute: boolean;
  canResumeProducer: boolean;
  requiresAuthorization: boolean;
};

export type GlobalResolutionRecoveryResult =
  | {
      status: "valid";
      checkpoint: GlobalResolutionCheckpoint;
      plan: import("../types").GlobalResolutionPlan;
      graph: import("../../resolutionGraph").ResolutionGraph;
      continuation: GlobalResolutionContinuation;
    }
  | {status: "stale"; checkpoint: GlobalResolutionCheckpoint; reasons: string[]}
  | {status: "invalid"; reasons: string[]}
  | {status: "absent"};
