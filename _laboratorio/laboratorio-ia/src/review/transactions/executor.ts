import {getReviewCase} from "../store/reviewStore";
import {fingerprintGlobalResolutionCheckpointSource} from "../globalResolution/checkpoint/fingerprints";
import {computeUniversalFingerprint, getRegisteredReviewExecutor, validateExecutionResult, validatePostExecutionValidation, type ExecutionResult, type PostExecutionValidation, type RegisteredReviewExecutor} from "../universal";
import {detectTransactionStaleness, validateUniversalTransactionPlan} from "./recovery";
import {validateUniversalTransactionCheckpoint, createTransactionHistoryEvent, evolveUniversalTransactionCheckpoint} from "./checkpoint";
import {deriveTransactionContinuation} from "./persistedRecovery";
import {persistTransactionCheckpointExtension} from "./persistence";
import {deriveTransactionStepReadiness, refreshTransactionReadiness} from "./readiness";
import {recordTransactionStepFailed, recordTransactionStepReconciliationRequired, recordTransactionStepStarted, recordTransactionStepSucceeded, type TransactionLifecycleState} from "./lifecycle";
import {transitionTransactionStep} from "./stateMachine";
import type {ReviewJsonValue} from "../types";
import type {TransactionCheckpointApplication, TransactionCheckpointPersistence, TransactionCheckpointSnapshot, TransactionEffectReference, TransactionExecutionAuthorization, TransactionExecutionRuntime, TransactionExecutorClassification, TransactionReconciliationProjection, TransactionStep, TransactionStepExecutionResult, UniversalTransactionCheckpoint, UniversalTransactionPlan} from "./types";

const activeExecutions = new Map<string, Promise<TransactionStepExecutionResult>>();
const nowDefault = () => new Date().toISOString();
const completedStates = new Set(["succeeded", "reused", "compensated", "skipped"]);
const emptyPersistence = (reason: string, conflict = false): TransactionCheckpointPersistence => ({persisted: false, conflict, reasons: [reason]});

function restore(transaction: UniversalTransactionPlan, checkpoint: UniversalTransactionCheckpoint): UniversalTransactionPlan {
  const states = new Map(checkpoint.steps.map((step) => [step.stepId, step.state]));
  return refreshTransactionReadiness(Object.freeze({...transaction, steps: Object.freeze(transaction.steps.map((step) => Object.freeze({...step, state: states.get(step.stepId) ?? step.state})))}));
}

function result(input: Partial<TransactionStepExecutionResult> & Pick<TransactionStepExecutionResult, "status" | "stepId" | "beforeState" | "afterState" | "attempt" | "persistence" | "transactionState">): TransactionStepExecutionResult {
  return Object.freeze({reasonCodes: Object.freeze([]), nextReadySteps: Object.freeze([]), reconciliationRequired: false, doNotRetryEffect: false, executorInvoked: false, ...input});
}

export function createTransactionExecutionAuthorization(input: Omit<TransactionExecutionAuthorization, "authorizationFingerprint" | "intent">): TransactionExecutionAuthorization {
  const value = {...input, intent: "execute_transaction_step" as const};
  return Object.freeze({...value, authorizationFingerprint: computeUniversalFingerprint(value as unknown as ReviewJsonValue)});
}

export function validateTransactionExecutionAuthorization(authorization: TransactionExecutionAuthorization | undefined, input: {transaction: UniversalTransactionPlan; step: TransactionStep; caseVersion: number; checkpointFingerprint: string; now?: () => string}): boolean {
  if (input.step.authorization === "none") return true;
  if (!authorization || authorization.intent !== "execute_transaction_step" || authorization.transactionFingerprint !== input.transaction.transactionFingerprint || authorization.stepId !== input.step.stepId || authorization.operationFingerprint !== input.step.fingerprints.operationFingerprint || authorization.caseVersion !== input.caseVersion || authorization.checkpointFingerprint !== input.checkpointFingerprint) return false;
  if (input.step.authorization === "human_required" && !authorization.approvedByHuman) return false;
  if (Date.parse(authorization.authorizedAt) > Date.parse((input.now ?? nowDefault)()) || Date.parse(authorization.expiresAt) <= Date.parse((input.now ?? nowDefault)())) return false;
  const semantic = Object.fromEntries(Object.entries(authorization).filter(([key]) => key !== "authorizationFingerprint"));
  return computeUniversalFingerprint(semantic as unknown as ReviewJsonValue) === authorization.authorizationFingerprint;
}

export function createReviewStoreTransactionCheckpointApplication(): TransactionCheckpointApplication {
  return Object.freeze({
    load(caseId, transaction): TransactionCheckpointSnapshot | undefined {
      const reviewCase = getReviewCase(caseId);
      const global = reviewCase?.globalResolution;
      if (!reviewCase || !global?.transaction) return undefined;
      const guardFingerprints = Object.fromEntries((global.transaction.creationGuards ?? []).map((guard) => [guard.operationId, guard.guardFingerprint]));
      return {reviewCase, checkpoint: global.transaction, globalCheckpointFingerprint: global.checkpointFingerprint, currentContext: {...transaction.contextBinding, caseId: reviewCase.id, caseVersion: reviewCase.version, sourcePlanFingerprint: global.planFingerprint, sourceCheckpointFingerprint: fingerprintGlobalResolutionCheckpointSource(global), creationGuardFingerprints: guardFingerprints}};
    },
    persist(input) {
      const reviewCase = getReviewCase(input.caseId);
      if (!reviewCase) return emptyPersistence("transaction_case_missing");
      return persistTransactionCheckpointExtension({reviewCase, transaction: input.transaction, checkpoint: input.checkpoint, expectedCheckpointFingerprint: input.expectedGlobalCheckpointFingerprint, expectedCaseVersion: reviewCase.version});
    },
  });
}

export function createTransactionExecutionRuntime(input: Omit<TransactionExecutionRuntime, "executorRegistry" | "checkpointApplication"> & {executorRegistry?: TransactionExecutionRuntime["executorRegistry"]; checkpointApplication?: TransactionCheckpointApplication}): TransactionExecutionRuntime {
  return Object.freeze({...input, executorRegistry: input.executorRegistry ?? {get: getRegisteredReviewExecutor}, checkpointApplication: input.checkpointApplication ?? createReviewStoreTransactionCheckpointApplication()});
}

function validBinding(step: TransactionStep, binding: RegisteredReviewExecutor | undefined): binding is RegisteredReviewExecutor {
  return Boolean(binding && binding.manifest.executorId === step.executorId && binding.manifest.version === step.executorVersion && binding.manifest.capability === step.capability && binding.manifestFingerprint === step.fingerprints.executorManifestFingerprint);
}

function compactReferences(resultValue: ExecutionResult): readonly TransactionEffectReference[] {
  return Object.freeze(resultValue.references.filter((reference) => reference.id && !reference.id.startsWith("projected:")).map((reference) => Object.freeze({type: reference.type, id: reference.id})));
}

export function classifyTransactionExecutorResult(input: {step: TransactionStep; result?: ExecutionResult; validation?: PostExecutionValidation; thrown?: unknown; signalAborted?: boolean; requiresEffectReference?: boolean; evidenceFingerprint?: string}): TransactionExecutorClassification {
  if (input.thrown !== undefined) {
    const uncertain = input.step.mode === "external_effect";
    return {kind: uncertain ? "reconciliation_required" : "failed_deterministic", reasonCode: input.signalAborted ? (uncertain ? "cancelled_effect_uncertain" : "cancelled") : uncertain ? "executor_exception_uncertain" : "executor_exception", references: []};
  }
  const execution = input.result;
  if (!execution) return {kind: "failed_deterministic", reasonCode: "execution_result_missing", references: []};
  const references = compactReferences(execution);
  if (execution.status === "reconciliation_required") return {kind: "reconciliation_required", reasonCode: execution.error?.code ?? "executor_reconciliation_required", references, evidenceFingerprint: input.evidenceFingerprint};
  if (execution.status === "failed" && (execution.error?.retryable || /timeout|network|uncertain|unknown/i.test(execution.error?.code ?? ""))) return {kind: "reconciliation_required", reasonCode: execution.error?.code ?? "executor_failure_uncertain", references, evidenceFingerprint: input.evidenceFingerprint};
  if (execution.status !== "succeeded") return {kind: "failed_deterministic", reasonCode: execution.error?.code ?? "executor_blocked", references, evidenceFingerprint: input.evidenceFingerprint};
  if (!input.validation?.valid) return {kind: input.step.mode === "external_effect" ? "reconciliation_required" : "failed_deterministic", reasonCode: "postcondition_failed", references, evidenceFingerprint: input.evidenceFingerprint};
  if (input.requiresEffectReference && references.length === 0) return {kind: "reconciliation_required", reasonCode: "effect_reference_missing", references, evidenceFingerprint: input.evidenceFingerprint};
  const output = execution.output && typeof execution.output === "object" && !Array.isArray(execution.output) ? execution.output as Record<string, unknown> : undefined;
  const reused = output?.outcome === "reused_existing" || output?.alreadyExisted === true;
  return {kind: reused ? "reused_existing" : "succeeded", reasonCode: reused ? "reuse_confirmed" : "execution_confirmed", references, evidenceFingerprint: input.evidenceFingerprint ?? (input.validation.evidence ? computeUniversalFingerprint(input.validation.evidence as unknown as ReviewJsonValue) : undefined)};
}

async function executeOnce(input: {caseId: string; transaction: UniversalTransactionPlan; stepId: string; expectedTransactionFingerprint: string; expectedCheckpointFingerprint: string; runtime: TransactionExecutionRuntime; runtimeAuthorization?: TransactionExecutionAuthorization; signal?: AbortSignal}): Promise<TransactionStepExecutionResult> {
  const signal = input.signal ?? new AbortController().signal;
  const snapshot = input.runtime.checkpointApplication.load(input.caseId, input.transaction);
  const absentState = input.transaction.steps.find((step) => step.stepId === input.stepId)?.state ?? "pending";
  if (!snapshot) return result({status: "blocked", errorCode: "transaction_missing", reasonCodes: ["transaction_missing"], stepId: input.stepId, beforeState: absentState, afterState: absentState, attempt: 0, persistence: emptyPersistence("transaction_missing"), transactionState: input.transaction.phase});
  const checkpointValidation = validateUniversalTransactionCheckpoint(snapshot.checkpoint, input.transaction);
  const transactionValidation = validateUniversalTransactionPlan(input.transaction);
  if (!checkpointValidation.valid || !transactionValidation.valid || input.expectedTransactionFingerprint !== input.transaction.transactionFingerprint) return result({status: "blocked", errorCode: "transaction_stale", reasonCodes: [...checkpointValidation.reasons, ...transactionValidation.reasons, "transaction_fingerprint_mismatch"], stepId: input.stepId, beforeState: absentState, afterState: absentState, attempt: 0, persistence: emptyPersistence("transaction_stale"), transactionState: input.transaction.phase});
  if (snapshot.globalCheckpointFingerprint !== input.expectedCheckpointFingerprint) return result({status: "blocked", errorCode: "checkpoint_conflict", reasonCodes: ["checkpoint_fingerprint_mismatch"], stepId: input.stepId, beforeState: absentState, afterState: absentState, attempt: 0, persistence: emptyPersistence("checkpoint_conflict", true), transactionState: input.transaction.phase});
  const staleness = detectTransactionStaleness(input.transaction, snapshot.currentContext);
  if (staleness.stale) return result({status: "blocked", errorCode: "transaction_stale", reasonCodes: staleness.reasons, stepId: input.stepId, beforeState: absentState, afterState: absentState, attempt: 0, persistence: emptyPersistence("transaction_stale"), transactionState: input.transaction.phase});
  const transaction = restore(input.transaction, snapshot.checkpoint);
  const step = transaction.steps.find((candidate) => candidate.stepId === input.stepId);
  if (!step) return result({status: "blocked", errorCode: "step_missing", reasonCodes: ["step_missing"], stepId: input.stepId, beforeState: "pending", afterState: "pending", attempt: 0, persistence: emptyPersistence("step_missing"), transactionState: transaction.phase});
  const storedStep = snapshot.checkpoint.steps.find((candidate) => candidate.stepId === step.stepId)!;
  if (completedStates.has(step.state)) return result({status: "already_completed", errorCode: "already_completed", reasonCodes: ["already_completed"], stepId: step.stepId, beforeState: step.state, afterState: step.state, attempt: storedStep.attempts, persistence: {persisted: true, conflict: false, checkpointFingerprint: snapshot.globalCheckpointFingerprint}, transactionState: transaction.phase});
  const readiness = deriveTransactionStepReadiness(transaction, step);
  if (!readiness.ready || step.state !== "ready") return result({status: "blocked", errorCode: readiness.reasons.some((reason) => reason.startsWith("dependency_")) ? "dependency_incomplete" : "step_not_ready", reasonCodes: readiness.reasons.length ? readiness.reasons : [`step_state_${step.state}`], stepId: step.stepId, beforeState: step.state, afterState: step.state, attempt: storedStep.attempts, persistence: emptyPersistence("step_not_ready"), transactionState: transaction.phase});
  if (input.runtime.capabilityCatalog && !input.runtime.capabilityCatalog.supports(step.capability) || input.runtime.producerRegistry && !input.runtime.producerRegistry.supports(transaction.producer?.producerId ?? "", step.capability)) return result({status: "blocked", errorCode: "executor_missing", reasonCodes: ["capability_or_producer_unsupported"], stepId: step.stepId, beforeState: step.state, afterState: step.state, attempt: storedStep.attempts, persistence: emptyPersistence("executor_missing"), transactionState: transaction.phase});
  if (step.operationKind === "create_entity") {
    const guard = snapshot.checkpoint.creationGuards?.find((candidate) => candidate.operationId === step.operationId);
    if (!guard || guard.decision !== "safe_to_create" || guard.guardFingerprint !== step.fingerprints.creationGuardFingerprint) return result({status: "blocked", errorCode: "precondition_failed", reasonCodes: [!guard ? "creation_guard_missing" : "creation_guard_stale_or_blocked"], stepId: step.stepId, beforeState: step.state, afterState: step.state, attempt: storedStep.attempts, persistence: emptyPersistence("precondition_failed"), transactionState: transaction.phase});
  }
  if (!validateTransactionExecutionAuthorization(input.runtimeAuthorization, {transaction, step, caseVersion: snapshot.reviewCase.version, checkpointFingerprint: snapshot.globalCheckpointFingerprint, now: input.runtime.now})) return result({status: "blocked", errorCode: input.runtimeAuthorization ? "authorization_invalid" : "authorization_required", reasonCodes: [input.runtimeAuthorization ? "authorization_invalid" : "authorization_required"], stepId: step.stepId, beforeState: step.state, afterState: step.state, attempt: storedStep.attempts, persistence: emptyPersistence("authorization_required"), transactionState: transaction.phase});
  const binding = step.executorId ? input.runtime.executorRegistry.get(step.executorId) : undefined;
  if (!binding) return result({status: "blocked", errorCode: "executor_missing", reasonCodes: ["executor_missing"], stepId: step.stepId, beforeState: step.state, afterState: step.state, attempt: storedStep.attempts, persistence: emptyPersistence("executor_missing"), transactionState: transaction.phase});
  if (!validBinding(step, binding)) return result({status: "blocked", errorCode: "executor_incompatible", reasonCodes: ["executor_manifest_incompatible"], stepId: step.stepId, beforeState: step.state, afterState: step.state, attempt: storedStep.attempts, persistence: emptyPersistence("executor_incompatible"), transactionState: transaction.phase});
  if (signal.aborted) {
    const cancelledTransaction = transitionTransactionStep({transaction, stepId: step.stepId, nextState: "cancelled", reason: "operator_cancelled"});
    const cancelledCheckpoint = evolveUniversalTransactionCheckpoint({checkpoint: snapshot.checkpoint, transaction: cancelledTransaction, event: createTransactionHistoryEvent({kind: "step_cancelled", status: cancelledTransaction.phase, stepId: step.stepId, reasonCodes: ["cancelled_before_effect"]})});
    const persistence = await input.runtime.checkpointApplication.persist({caseId: input.caseId, transaction: cancelledTransaction, checkpoint: cancelledCheckpoint, expectedGlobalCheckpointFingerprint: snapshot.globalCheckpointFingerprint});
    return result({status: persistence.persisted ? "cancelled_before_effect" : "blocked", domainResult: "cancelled_before_effect", errorCode: persistence.persisted ? "cancelled" : "checkpoint_conflict", reasonCodes: persistence.persisted ? ["cancelled_before_effect"] : persistence.reasons ?? ["checkpoint_conflict"], stepId: step.stepId, beforeState: step.state, afterState: persistence.persisted ? "cancelled" : step.state, attempt: storedStep.attempts, persistence, transactionState: persistence.persisted ? cancelledTransaction.phase : transaction.phase});
  }
  const prepared = await input.runtime.prepareStep({reviewCase: snapshot.reviewCase, transaction, step, checkpoint: snapshot.checkpoint, signal});
  if (!prepared.valid || !prepared.plan || prepared.state === undefined || !prepared.effectIndexes?.length || !binding.registration.canExecute(prepared.plan, [...prepared.effectIndexes])) return result({status: "blocked", errorCode: "precondition_failed", reasonCodes: prepared.reasonCodes.length ? prepared.reasonCodes : ["preexecution_validation_failed"], stepId: step.stepId, beforeState: step.state, afterState: step.state, attempt: storedStep.attempts, persistence: emptyPersistence("precondition_failed"), transactionState: transaction.phase});

  const started = recordTransactionStepStarted({transaction, checkpoint: snapshot.checkpoint}, step.stepId);
  const startPersistence = await input.runtime.checkpointApplication.persist({caseId: input.caseId, transaction: started.transaction, checkpoint: started.checkpoint, expectedGlobalCheckpointFingerprint: snapshot.globalCheckpointFingerprint});
  if (!startPersistence.persisted) return result({status: "blocked", errorCode: "checkpoint_conflict", reasonCodes: startPersistence.reasons ?? ["checkpoint_conflict"], stepId: step.stepId, beforeState: step.state, afterState: step.state, attempt: storedStep.attempts, persistence: startPersistence, transactionState: transaction.phase});

  let execution: ExecutionResult | undefined;
  let validation: PostExecutionValidation | undefined;
  let thrown: unknown;
  try {
    signal.throwIfAborted();
    execution = await binding.registration.execute(prepared.plan, prepared.state, [...prepared.effectIndexes], {idempotencyKey: step.idempotencyKey, signal});
    const checked = validateExecutionResult(execution);
    if (!checked.valid || execution.executorId !== binding.manifest.executorId || execution.executorVersion !== binding.manifest.version || execution.executorManifestFingerprint !== binding.manifestFingerprint || execution.capability !== step.capability || execution.idempotencyKey !== step.idempotencyKey || JSON.stringify(execution.effectIndexes) !== JSON.stringify(prepared.effectIndexes)) throw new Error("invalid_execution_result");
    if (execution.status === "succeeded") {
      validation = await binding.registration.validateExecution(prepared.plan, execution, signal);
      const post = validatePostExecutionValidation(validation, prepared.plan, execution);
      if (!post.valid) validation = {...validation, valid: false};
    }
  } catch (error) { thrown = error; }
  const classified = classifyTransactionExecutorResult({step, result: execution, validation, thrown, signalAborted: signal.aborted, requiresEffectReference: prepared.requiresEffectReference, evidenceFingerprint: prepared.evidenceFingerprint});
  let after: TransactionLifecycleState;
  if (classified.kind === "succeeded" || classified.kind === "reused_existing") after = recordTransactionStepSucceeded(started, {stepId: step.stepId, reused: classified.kind === "reused_existing", references: classified.references, evidenceFingerprint: classified.evidenceFingerprint});
  else if (classified.kind === "failed_deterministic") after = recordTransactionStepFailed(started, {stepId: step.stepId, errorCode: classified.reasonCode});
  else after = recordTransactionStepReconciliationRequired(started, {stepId: step.stepId, reasonCodes: [classified.reasonCode]});
  const postPersistence = await input.runtime.checkpointApplication.persist({caseId: input.caseId, transaction: after.transaction, checkpoint: after.checkpoint, expectedGlobalCheckpointFingerprint: startPersistence.checkpointFingerprint ?? snapshot.globalCheckpointFingerprint});
  const continuation = deriveTransactionContinuation(after.transaction, after.checkpoint);
  const summary = after.checkpoint.steps.find((candidate) => candidate.stepId === step.stepId)?.result;
  if (!postPersistence.persisted) return result({status: "reconciliation_required", domainResult: classified.kind, errorCode: "reconciliation_required", reasonCodes: ["post_effect_checkpoint_persistence_failed", ...(postPersistence.reasons ?? [])], stepId: step.stepId, beforeState: step.state, afterState: "reconciliation_required", attempt: storedStep.attempts + 1, executorId: binding.manifest.executorId, resultSummary: summary, persistence: postPersistence, nextReadySteps: [], transactionState: "reconciliation_required", reconciliationRequired: true, doNotRetryEffect: true, executorInvoked: true});
  return result({status: classified.kind, domainResult: classified.kind, errorCode: classified.kind === "failed_deterministic" ? "deterministic_failure" : classified.kind === "reconciliation_required" ? "reconciliation_required" : undefined, reasonCodes: [classified.reasonCode], stepId: step.stepId, beforeState: step.state, afterState: after.transaction.steps.find((candidate) => candidate.stepId === step.stepId)!.state, attempt: storedStep.attempts + 1, executorId: binding.manifest.executorId, resultSummary: summary, persistence: postPersistence, nextReadySteps: continuation.nextReadySteps, transactionState: after.transaction.phase, reconciliationRequired: classified.kind === "reconciliation_required", doNotRetryEffect: classified.kind === "reconciliation_required", executorInvoked: true});
}

export function executeTransactionStep(input: {caseId: string; transaction: UniversalTransactionPlan; stepId: string; expectedTransactionFingerprint: string; expectedCheckpointFingerprint: string; runtime: TransactionExecutionRuntime; runtimeAuthorization?: TransactionExecutionAuthorization; signal?: AbortSignal}): Promise<TransactionStepExecutionResult> {
  const key = `${input.transaction.transactionFingerprint}:${input.stepId}`;
  const current = activeExecutions.get(key);
  if (current) return current;
  const execution = executeOnce(input).finally(() => activeExecutions.delete(key));
  activeExecutions.set(key, execution);
  return execution;
}

export async function executeTransactionBatch(input: Omit<Parameters<typeof executeTransactionStep>[0], "stepId" | "runtimeAuthorization"> & {stepIds: readonly string[]; authorizations?: readonly TransactionExecutionAuthorization[]}): Promise<readonly TransactionStepExecutionResult[]> {
  if (!input.stepIds.length || new Set(input.stepIds).size !== input.stepIds.length) throw new Error("transaction_batch_step_ids_invalid");
  const selected = input.stepIds.map((stepId) => input.transaction.steps.find((step) => step.stepId === stepId));
  if (selected.some((step) => !step)) throw new Error("transaction_batch_step_missing");
  const selectedIds = new Set(input.stepIds);
  if (selected.some((step) => step!.dependencies.some((dependency) => selectedIds.has(dependency)))) throw new Error("transaction_batch_steps_not_independent");
  if (selected.filter((step) => step!.risk === "high" || step!.risk === "destructive").length && selected.length > 1) throw new Error("transaction_batch_risk_mix_invalid");
  const results: TransactionStepExecutionResult[] = [];
  let expectedCheckpointFingerprint = input.expectedCheckpointFingerprint;
  for (const stepId of [...input.stepIds].sort()) {
    const execution = await executeTransactionStep({...input, stepId, expectedCheckpointFingerprint, runtimeAuthorization: input.authorizations?.find((item) => item.stepId === stepId)});
    results.push(execution);
    if (execution.persistence.checkpointFingerprint) expectedCheckpointFingerprint = execution.persistence.checkpointFingerprint;
    if (execution.status === "reconciliation_required" || execution.status === "blocked") break;
  }
  return Object.freeze(results);
}

export function prepareExplicitTransactionRetry(state: TransactionLifecycleState, stepId: string): TransactionLifecycleState {
  const transaction = transitionTransactionStep({transaction: state.transaction, stepId, nextState: "pending", reason: "explicit_retry"});
  const ready = refreshTransactionReadiness(transaction);
  return {transaction: ready, checkpoint: evolveUniversalTransactionCheckpoint({checkpoint: state.checkpoint, transaction: ready, event: createTransactionHistoryEvent({kind: "step_retry_prepared", status: ready.phase, stepId})})};
}

export function projectTransactionReconciliation(state: TransactionLifecycleState, input: {stepId: string; outcome: "confirmed_succeeded" | "confirmed_reused" | "confirmed_not_applied" | "conflicting" | "insufficient"; references?: readonly TransactionEffectReference[]; evidenceFingerprint?: string}): TransactionReconciliationProjection {
  if (input.outcome === "conflicting" || input.outcome === "insufficient") return {status: "blocked", state, executorInvoked: false, reasonCodes: [input.outcome]};
  if (input.outcome === "confirmed_succeeded" || input.outcome === "confirmed_reused") {
    const reused = input.outcome === "confirmed_reused";
    const transaction = transitionTransactionStep({transaction: state.transaction, stepId: input.stepId, nextState: reused ? "reused" : "succeeded", reason: "reconciliation_confirmed_succeeded"});
    const checkpoint = evolveUniversalTransactionCheckpoint({checkpoint: state.checkpoint, transaction, step: {stepId: input.stepId, references: input.references, result: {status: reused ? "reused_existing" : "succeeded", effectReference: input.references?.[0], evidenceFingerprint: input.evidenceFingerprint}}, event: createTransactionHistoryEvent({kind: "step_reconciliation_applied", status: transaction.phase, stepId: input.stepId, reasonCodes: [input.outcome]})});
    return {status: "projected_success", state: {transaction, checkpoint}, executorInvoked: false, reasonCodes: [input.outcome]};
  }
  const transaction = transitionTransactionStep({transaction: state.transaction, stepId: input.stepId, nextState: "pending", reason: "reconciliation_confirmed_absent"});
  const ready = refreshTransactionReadiness(transaction);
  const checkpoint = evolveUniversalTransactionCheckpoint({checkpoint: state.checkpoint, transaction: ready, event: createTransactionHistoryEvent({kind: "step_reconciliation_applied", status: ready.phase, stepId: input.stepId, reasonCodes: [input.outcome]})});
  return {status: "retry_ready", state: {transaction: ready, checkpoint}, executorInvoked: false, reasonCodes: [input.outcome]};
}

export const transactionExecutorSecurity = Object.freeze({automaticExecution: false, automaticRetry: false, automaticCompensation: false, persistsAuthorization: false, persistsRawResult: false, containsSanityLogic: false, containsProducerBranches: false});
