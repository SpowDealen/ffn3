import type {EntityOperation, EntityOperationEntityType, EntityOperationKind} from "../entityOperations";
import type {ProducerCheckpointBinding} from "../globalResolution/producers";
import type {RegisteredReviewExecutor, UniversalExecutionPlan} from "../universal";
import type {ReviewCase, ReviewJsonValue} from "../types";

export const UNIVERSAL_TRANSACTION_SCHEMA_VERSION = "1.0.0" as const;

export type TransactionPhase =
  | "planned"
  | "blocked"
  | "ready"
  | "executing"
  | "partially_succeeded"
  | "reconciliation_required"
  | "compensating"
  | "compensated"
  | "partially_compensated"
  | "compensation_failed"
  | "failed"
  | "completed"
  | "cancelled";

export type TransactionStepState =
  | "pending"
  | "blocked"
  | "ready"
  | "executing"
  | "succeeded"
  | "reused"
  | "failed"
  | "reconciliation_required"
  | "compensating"
  | "compensated"
  | "compensation_failed"
  | "skipped"
  | "cancelled";

export type TransactionStepMode = "read_only" | "pure_transform" | "external_effect";
export type TransactionRisk = "low" | "medium" | "high" | "destructive";
export type TransactionAuthorizationPolicy = "none" | "explicit" | "human_required";
export type TransactionRetryPolicy = "never" | "explicit_only" | "safe_idempotent" | "after_reconciliation";
export type TransactionCompensationPolicy = "none" | "logical_only" | "reversible_transform" | "explicit_compensator" | "manual_required";
export type TransactionEffectOwnership = "pre_existing" | "transaction_created" | "transaction_transformed" | "shared" | "unknown";
export type TransactionReconciliationPolicy = "not_required" | "inspect_on_uncertain" | "required_before_retry";

export type TransactionStepFingerprints = Readonly<{
  operationFingerprint: string;
  executorManifestFingerprint?: string;
  creationGuardFingerprint?: string;
}>;

export type TransactionStep = Readonly<{
  stepId: string;
  operationId: string;
  operationKind: EntityOperationKind;
  capability: string;
  entityType: EntityOperationEntityType;
  dependencies: readonly string[];
  mode: TransactionStepMode;
  risk: TransactionRisk;
  authorization: TransactionAuthorizationPolicy;
  idempotencyKey: string;
  compensation: TransactionCompensationPolicy;
  compensatorId?: string;
  retry: TransactionRetryPolicy;
  reconciliation: TransactionReconciliationPolicy;
  preExecutionValidationRequired: boolean;
  executorId?: string;
  executorVersion?: number;
  state: TransactionStepState;
  fingerprints: TransactionStepFingerprints;
}>;

export type TransactionPolicies = Readonly<{
  atomicity: "logical";
  consistency: "domain_enforced";
  isolation: "optimistic_fingerprint";
  durability: "checkpoint_based";
  allowAutomaticExecution: false;
  allowAutomaticRetry: false;
  allowAutomaticCompensation: false;
  maximumRisk: TransactionRisk;
  historyLimit: number;
}>;

export type TransactionBlocker = Readonly<{
  code: "source_plan_invalid" | "unsupported_step" | "execution_binding_missing" | "transaction_policy_missing" | "reconciliation_policy_missing" | "destructive_step_unsupported" | "creation_guard_missing" | "risk_policy_exceeded";
  stepId?: string;
  operationId?: string;
  message: string;
}>;

export type SafeTransactionProducerDescriptor = Readonly<Pick<ProducerCheckpointBinding, "producerId" | "producerVersion" | "manifestVersion" | "manifestFingerprint">>;

export type TransactionContextBinding = Readonly<{
  caseId: string;
  caseVersion: number;
  sourcePlanFingerprint: string;
  sourceCheckpointFingerprint?: string;
  producer?: SafeTransactionProducerDescriptor;
  operationFingerprints: Readonly<Record<string, string>>;
  creationGuardFingerprints: Readonly<Record<string, string>>;
}>;

export type UniversalTransactionPlan = Readonly<{
  schemaVersion: typeof UNIVERSAL_TRANSACTION_SCHEMA_VERSION;
  transactionId: string;
  caseId: string;
  caseVersion: number;
  sourcePlanFingerprint: string;
  transactionFingerprint: string;
  transactionIdempotencyKey: string;
  producer?: SafeTransactionProducerDescriptor;
  phase: TransactionPhase;
  steps: readonly TransactionStep[];
  policies: TransactionPolicies;
  blockers: readonly TransactionBlocker[];
  contextBinding: TransactionContextBinding;
  createdAt: string;
}>;

export type TransactionOperationBinding = Readonly<{
  operationId: string;
  capability: string;
  mode?: TransactionStepMode;
  risk?: TransactionRisk;
  authorization?: TransactionAuthorizationPolicy;
  retry?: TransactionRetryPolicy;
  reconciliation?: TransactionReconciliationPolicy;
  compensation?: TransactionCompensationPolicy;
  compensatorId?: string;
  executorId?: string;
  executorVersion?: number;
  executorManifestFingerprint?: string;
  preExecutionValidationRequired?: boolean;
}>;

export type TransactionBuildContext = Readonly<{
  sourceCheckpointFingerprint?: string;
  producer?: ProducerCheckpointBinding;
  bindings: readonly TransactionOperationBinding[];
  creationGuardFingerprints?: Readonly<Record<string, string>>;
  policies?: Partial<TransactionPolicies>;
  now?: () => string;
}>;

export type BuildUniversalTransactionResult =
  | Readonly<{ok: true; value: UniversalTransactionPlan}>
  | Readonly<{ok: false; reasons: readonly string[]}>;

export type TransactionStepTransitionReason =
  | "dependencies_satisfied"
  | "execution_started"
  | "execution_confirmed"
  | "reuse_confirmed"
  | "deterministic_failure"
  | "uncertain_effect"
  | "explicit_retry"
  | "reconciliation_confirmed_absent"
  | "reconciliation_confirmed_succeeded"
  | "compensation_reconciliation_confirmed_succeeded"
  | "compensation_reconciliation_confirmed_not_applied"
  | "compensation_started"
  | "compensation_confirmed"
  | "compensation_failed"
  | "operator_cancelled"
  | "policy_blocked"
  | "explicit_skip";

export type TransactionRuntimeAuthorization = Readonly<{
  stepId: string;
  transactionFingerprint: string;
  authorized: true;
  expiresAt: string;
  approvedByHuman?: boolean;
}>;

export type TransactionExecutableBatch = Readonly<{
  transactionFingerprint: string;
  stepIds: readonly string[];
  blocked: readonly Readonly<{stepId: string; reasons: readonly string[]}>[];
}>;

export type TransactionCompensationAction = Readonly<{
  stepId: string;
  operationId: string;
  policy: TransactionCompensationPolicy;
  compensatorId?: string;
  disposition: "eligible" | "manual" | "not_applicable" | "blocked";
  reason: string;
}>;

export type TransactionCompensationPlan = Readonly<{
  transactionFingerprint: string;
  actions: readonly TransactionCompensationAction[];
  blocked: boolean;
  reasonCodes: readonly string[];
  fingerprint: string;
}>;

export type TransactionEffectReference = Readonly<{type: string; id: string; fingerprint?: string}>;
export type TransactionInverseTransformDescriptor = Readonly<{
  descriptorId: string;
  compensatorId: string;
  previousFingerprint: string;
  resultingFingerprint: string;
  descriptorFingerprint: string;
}>;
export type TransactionCompensationCheckpoint = Readonly<{
  decision: "preserve" | "logical_compensation" | "compensate" | "revert_transform" | "manual_required" | "reconciliation_required";
  policy: TransactionCompensationPolicy;
  ownership: TransactionEffectOwnership;
  compensatorId?: string;
  compensatorVersion?: string;
  attempts: number;
  effectReferenceFingerprint?: string;
  inverseDescriptorFingerprint?: string;
  errorCode?: string;
  evidenceFingerprint?: string;
  compensationFingerprint: string;
}>;
/** Compact, non-secret projection of a Creation Guard. */
export type TransactionCreationGuardCheckpoint = Readonly<{
  operationId: string;
  entityType: string;
  identityFingerprint: string;
  discoveryFingerprint: string;
  resolutionFingerprint: string;
  guardFingerprint: string;
  decision: "safe_to_create" | "safe_to_reuse" | "blocked";
  candidateId?: string;
  blockerCodes: readonly string[];
  fingerprint: string;
}>;

export type TransactionStepResultSummary = Readonly<{
  status: "succeeded" | "reused_existing" | "failed_deterministic" | "reconciliation_required" | "compensated";
  effectReference?: TransactionEffectReference;
  errorCode?: string;
  evidenceFingerprint?: string;
}>;
export type TransactionStepCheckpoint = Readonly<{
  stepId: string;
  operationId?: string;
  state: TransactionStepState;
  attempts: number;
  idempotencyKeyFingerprint?: string;
  references: readonly TransactionEffectReference[];
  reconciliationReasonCodes: readonly string[];
  compensationState?: "required" | "started" | "completed" | "failed";
  compensation?: TransactionCompensationCheckpoint;
  lastErrorCode?: string;
  result?: TransactionStepResultSummary;
  updatedAt?: string;
}>;

export type TransactionExecutionSummary = Readonly<{
  attemptedStepIds: readonly string[];
  completedStepIds: readonly string[];
  fingerprint: string;
}>;
export type TransactionReconciliationSummary = Readonly<{
  stepIds: readonly string[];
  reasonCodes: readonly string[];
  fingerprint: string;
}>;
export type TransactionCompensationSummary = Readonly<{
  stepIds: readonly string[];
  required: boolean;
  fingerprint: string;
}>;

export type TransactionHistoryEventKind =
  | "transaction_planned"
  | "transaction_ready"
  | "transaction_paused"
  | "transaction_resumed"
  | "step_started"
  | "step_succeeded"
  | "step_failed"
  | "step_reconciliation_required"
  | "compensation_started"
  | "step_compensated"
  | "transaction_completed"
  | "transaction_failed"
  | "step_cancelled"
  | "step_retry_prepared"
  | "step_reconciliation_applied"
  | "compensation_planned"
  | "compensation_succeeded"
  | "compensation_failed"
  | "compensation_reconciliation_required"
  | "compensation_skipped"
  | "manual_compensation_required";
export type CompensationHistoryEventKind =
  | "compensation_planned" | "compensation_started" | "compensation_succeeded"
  | "compensation_failed" | "compensation_reconciliation_required"
  | "compensation_skipped" | "manual_compensation_required";

export type TransactionHistoryEvent = Readonly<{
  id: string;
  kind: TransactionHistoryEventKind;
  status: string;
  stepId?: string;
  reasonCodes?: readonly string[];
  occurredAt: string;
}>;

export type UniversalTransactionCheckpoint = Readonly<{
  schemaVersion: typeof UNIVERSAL_TRANSACTION_SCHEMA_VERSION;
  transactionId: string;
  transactionFingerprint: string;
  sourcePlanFingerprint: string;
  sourceCheckpointFingerprint?: string;
  phase: TransactionPhase;
  /** Operator control is orthogonal to the phase derived from step states. */
  operatorState?: "active" | "paused";
  steps: readonly TransactionStepCheckpoint[];
  /** Optional in B1 checkpoints; populated by the AU7 B2 persistence projection. */
  creationGuards?: readonly TransactionCreationGuardCheckpoint[];
  executionSummary?: TransactionExecutionSummary;
  reconciliationSummary?: TransactionReconciliationSummary;
  compensationSummary?: TransactionCompensationSummary;
  blockers: readonly TransactionBlocker[];
  history: readonly TransactionHistoryEvent[];
  checkpointFingerprint: string;
  createdAt: string;
  updatedAt: string;
}>; 

export type TransactionContinuation = Readonly<{
  canContinue: boolean;
  cannotExecute: boolean;
  nextReadySteps: readonly string[];
  blockedSteps: readonly string[];
  completedSteps: readonly string[];
  reconciliationSteps: readonly string[];
  compensationSteps: readonly string[];
  authorizationRequired: readonly string[];
  regenerationRequired: boolean;
}>;

export type PersistedTransactionRecoveryResult =
  | Readonly<{status: "absent"}>
  | Readonly<{status: "invalid" | "stale"; reasons: readonly string[]; continuation: TransactionContinuation}>
  | Readonly<{status: "valid" | "completed" | "reconciliation_required" | "compensation_required"; transaction: UniversalTransactionPlan; checkpoint: UniversalTransactionCheckpoint; continuation: TransactionContinuation}>;

export type TransactionCheckpointPersistence = Readonly<{
  persisted: boolean;
  conflict: boolean;
  reasons?: readonly string[];
  checkpointFingerprint?: string;
}>;

export type TransactionEffectPersistenceResult<T> = Readonly<{
  domainResult: T;
  checkpoint: TransactionCheckpointPersistence;
  reconciliationRequired: boolean;
  doNotRetryEffect: boolean;
}>;

export type TransactionExecutionErrorCode =
  | "transaction_missing" | "transaction_stale" | "step_missing" | "step_not_ready"
  | "dependency_incomplete" | "authorization_required" | "authorization_invalid"
  | "executor_missing" | "executor_incompatible" | "checkpoint_conflict"
  | "precondition_failed" | "deterministic_failure" | "reconciliation_required"
  | "already_completed" | "cancelled";

/** Ephemeral, in-memory only. It is deliberately absent from all checkpoint types. */
export type TransactionExecutionAuthorization = Readonly<{
  authorizationFingerprint: string;
  intent: "execute_transaction_step";
  transactionFingerprint: string;
  stepId: string;
  operationFingerprint: string;
  caseVersion: number;
  checkpointFingerprint: string;
  authorizedAt: string;
  expiresAt: string;
  approvedByHuman?: boolean;
}>;

export type PreparedTransactionStepExecution = Readonly<{
  valid: boolean;
  reasonCodes: readonly string[];
  plan?: UniversalExecutionPlan;
  state?: ReviewJsonValue;
  effectIndexes?: readonly number[];
  evidenceFingerprint?: string;
  requiresEffectReference?: boolean;
}>;

export type TransactionCheckpointSnapshot = Readonly<{
  reviewCase: ReviewCase;
  checkpoint: UniversalTransactionCheckpoint;
  globalCheckpointFingerprint: string;
  currentContext: TransactionContextBinding;
}>;

export type TransactionCheckpointApplication = Readonly<{
  load(caseId: string, transaction: UniversalTransactionPlan): TransactionCheckpointSnapshot | undefined;
  persist(input: {caseId: string; transaction: UniversalTransactionPlan; checkpoint: UniversalTransactionCheckpoint; expectedGlobalCheckpointFingerprint: string}): Promise<TransactionCheckpointPersistence> | TransactionCheckpointPersistence;
}>;

export type TransactionExecutionRuntime = Readonly<{
  executorRegistry: Readonly<{get(executorId: string): RegisteredReviewExecutor | undefined}>;
  checkpointApplication: TransactionCheckpointApplication;
  prepareStep(input: {reviewCase: ReviewCase; transaction: UniversalTransactionPlan; step: TransactionStep; checkpoint: UniversalTransactionCheckpoint; signal: AbortSignal}): Promise<PreparedTransactionStepExecution> | PreparedTransactionStepExecution;
  producerRegistry?: Readonly<{supports(producerId: string, capability: string): boolean}>;
  capabilityCatalog?: Readonly<{supports(capability: string): boolean}>;
  now?: () => string;
}>;

export type TransactionStepExecutionResult = Readonly<{
  status: "succeeded" | "reused_existing" | "failed_deterministic" | "reconciliation_required" | "cancelled_before_effect" | "already_completed" | "blocked";
  domainResult?: "succeeded" | "reused_existing" | "failed_deterministic" | "reconciliation_required" | "cancelled_before_effect";
  errorCode?: TransactionExecutionErrorCode;
  reasonCodes: readonly string[];
  stepId: string;
  beforeState: TransactionStepState;
  afterState: TransactionStepState;
  attempt: number;
  executorId?: string;
  resultSummary?: TransactionStepResultSummary;
  persistence: TransactionCheckpointPersistence;
  nextReadySteps: readonly string[];
  transactionState: TransactionPhase;
  reconciliationRequired: boolean;
  doNotRetryEffect: boolean;
  executorInvoked: boolean;
}>;

export type TransactionExecutorClassification = Readonly<{
  kind: "succeeded" | "reused_existing" | "failed_deterministic" | "reconciliation_required";
  reasonCode: string;
  references: readonly TransactionEffectReference[];
  evidenceFingerprint?: string;
}>;

export type TransactionReconciliationProjection = Readonly<{
  status: "projected_success" | "retry_ready" | "blocked";
  state: Readonly<{transaction: UniversalTransactionPlan; checkpoint: UniversalTransactionCheckpoint}>;
  executorInvoked: false;
  reasonCodes: readonly string[];
}>;

export type CompensationDecision = Readonly<{
  decision: "preserve" | "logical_compensation" | "compensate" | "revert_transform" | "manual_required" | "reconciliation_required";
  stepId: string;
  policy: TransactionCompensationPolicy;
  ownership: TransactionEffectOwnership;
  compensatorId?: string;
  reasonCodes: readonly string[];
  fingerprint: string;
}>;

export type TransactionCompensationEvidence = Readonly<{
  stepId: string;
  ownership: TransactionEffectOwnership;
  references?: readonly TransactionEffectReference[];
  inverseTransform?: TransactionInverseTransformDescriptor;
  sharedByStepIds?: readonly string[];
}>;

export type ControlledTransactionCompensationPlan = Readonly<{
  transactionFingerprint: string;
  failedStepIds: readonly string[];
  decisions: readonly CompensationDecision[];
  executableStepIds: readonly string[];
  manualStepIds: readonly string[];
  reconciliationStepIds: readonly string[];
  preservedStepIds: readonly string[];
  fingerprint: string;
}>;

export type TransactionCompensatorResult = Readonly<{
  status: "compensated" | "failed_deterministic" | "reconciliation_required";
  errorCode?: string;
  evidenceFingerprint?: string;
}>;
export type TransactionCompensator = Readonly<{
  compensatorId: string;
  version: string;
  manifestFingerprint: string;
  risk: TransactionRisk;
  retry: TransactionRetryPolicy;
  supports(input: {step: TransactionStep; ownership: TransactionEffectOwnership; reference?: TransactionEffectReference; inverseTransform?: TransactionInverseTransformDescriptor}): boolean;
  compensate(input: {transactionFingerprint: string; step: TransactionStep; reference?: TransactionEffectReference; inverseTransform?: TransactionInverseTransformDescriptor; idempotencyKey: string; signal: AbortSignal}): Promise<TransactionCompensatorResult>;
}>;
export type TransactionCompensatorRegistry = Readonly<{
  get(compensatorId: string): TransactionCompensator | undefined;
  list(): readonly TransactionCompensator[];
}>;
export type TransactionCompensationAuthorization = Readonly<{
  authorizationFingerprint: string;
  intent: "compensate_transaction_step";
  transactionFingerprint: string;
  stepId: string;
  compensationFingerprint: string;
  checkpointFingerprint: string;
  authorizedAt: string;
  expiresAt: string;
  approvedByHuman: true;
}>;
export type TransactionCompensationRuntime = Readonly<{
  registry: TransactionCompensatorRegistry;
  checkpointApplication: TransactionCheckpointApplication;
  evidence: readonly TransactionCompensationEvidence[];
  now?: () => string;
}>;
export type TransactionCompensationExecutionResult = Readonly<{
  status: "compensated" | "logically_compensated" | "failed_deterministic" | "reconciliation_required" | "manual_required" | "preserved" | "already_compensated" | "blocked";
  stepId: string;
  beforeState: TransactionStepState;
  afterState: TransactionStepState;
  decision: CompensationDecision;
  attempt: number;
  compensatorInvoked: boolean;
  persistence: TransactionCheckpointPersistence;
  reconciliationRequired: boolean;
  doNotRetryCompensation: boolean;
  reasonCodes: readonly string[];
}>;
export type TransactionSagaOutcome = Readonly<{
  status: "completed" | "failed_preserving_effects" | "compensated" | "partially_compensated" | "reconciliation_required" | "manual_intervention_required";
  appliedStepIds: readonly string[];
  compensatedStepIds: readonly string[];
  uncertainStepIds: readonly string[];
  manualStepIds: readonly string[];
  reasonCodes: readonly string[];
  fingerprint: string;
}>;

export type TransactionStalenessResult = Readonly<{stale: boolean; reasons: readonly string[]}>;
export type TransactionRecoveryResult =
  | Readonly<{status: "valid"; transaction: UniversalTransactionPlan; checkpoint: UniversalTransactionCheckpoint; next: TransactionExecutableBatch}>
  | Readonly<{status: "stale" | "invalid"; reasons: readonly string[]}>
  | Readonly<{status: "completed"; transaction: UniversalTransactionPlan; checkpoint: UniversalTransactionCheckpoint}>;

export type TransactionFailureClassification = Readonly<{
  state: "failed" | "reconciliation_required";
  retryAllowed: boolean;
  reasonCode: string;
}>;

export type TransactionSourceOperation = Pick<EntityOperation, "id" | "kind" | "entityType" | "dependencyIds" | "idempotencyKey" | "requiredCapability" | "risk" | "payload">;
