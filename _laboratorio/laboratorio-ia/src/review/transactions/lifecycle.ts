import {createTransactionHistoryEvent, evolveUniversalTransactionCheckpoint} from "./checkpoint";
import {refreshTransactionReadiness} from "./readiness";
import {transitionTransactionStep} from "./stateMachine";
import type {TransactionEffectReference, TransactionEffectPersistenceResult, TransactionStepResultSummary, UniversalTransactionCheckpoint, UniversalTransactionPlan} from "./types";

export type TransactionLifecycleState = Readonly<{transaction: UniversalTransactionPlan; checkpoint: UniversalTransactionCheckpoint}>;
const evolve = (state: TransactionLifecycleState, event: Parameters<typeof createTransactionHistoryEvent>[0], step?: Parameters<typeof evolveUniversalTransactionCheckpoint>[0]["step"]): TransactionLifecycleState => {
  const checkpoint = evolveUniversalTransactionCheckpoint({checkpoint: state.checkpoint, transaction: state.transaction, event: createTransactionHistoryEvent(event), step});
  return Object.freeze({transaction: state.transaction, checkpoint});
};
const already = (state: TransactionLifecycleState, stepId: string, stateName: string) => state.checkpoint.steps.find((step) => step.stepId === stepId)?.state === stateName;

export function recordTransactionPlanned(state: TransactionLifecycleState): TransactionLifecycleState {
  return state.checkpoint.history.some((event) => event.kind === "transaction_planned") ? state : evolve(state, {kind: "transaction_planned", status: state.transaction.phase});
}
export function recordTransactionReady(state: TransactionLifecycleState): TransactionLifecycleState {
  const transaction = refreshTransactionReadiness(state.transaction);
  const next = Object.freeze({transaction, checkpoint: state.checkpoint});
  return evolve(next, {kind: "transaction_ready", status: transaction.phase});
}
export function recordTransactionPaused(state: TransactionLifecycleState): TransactionLifecycleState {
  if (state.checkpoint.operatorState === "paused") return state;
  const checkpoint = evolveUniversalTransactionCheckpoint({checkpoint: state.checkpoint, transaction: state.transaction, operatorState: "paused", event: createTransactionHistoryEvent({kind: "transaction_paused", status: state.transaction.phase})});
  return Object.freeze({transaction: state.transaction, checkpoint});
}
export function recordTransactionResumed(state: TransactionLifecycleState): TransactionLifecycleState {
  if (state.checkpoint.operatorState !== "paused") return state;
  const checkpoint = evolveUniversalTransactionCheckpoint({checkpoint: state.checkpoint, transaction: state.transaction, operatorState: "active", event: createTransactionHistoryEvent({kind: "transaction_resumed", status: state.transaction.phase})});
  return Object.freeze({transaction: state.transaction, checkpoint});
}
export function recordTransactionStepStarted(state: TransactionLifecycleState, stepId: string): TransactionLifecycleState {
  if (already(state, stepId, "executing")) return state;
  const transaction = transitionTransactionStep({transaction: state.transaction, stepId, nextState: "executing", reason: "execution_started"});
  const previous = state.checkpoint.steps.find((step) => step.stepId === stepId);
  return evolve({transaction, checkpoint: state.checkpoint}, {kind: "step_started", status: "executing", stepId}, {stepId, attempts: (previous?.attempts ?? 0) + 1});
}
export function recordTransactionStepSucceeded(state: TransactionLifecycleState, input: {stepId: string; reused?: boolean; references?: readonly TransactionEffectReference[]; evidenceFingerprint?: string}): TransactionLifecycleState {
  const target = input.reused ? "reused" : "succeeded";
  if (already(state, input.stepId, target)) return state;
  const transaction = transitionTransactionStep({transaction: state.transaction, stepId: input.stepId, nextState: target, reason: input.reused ? "reuse_confirmed" : "execution_confirmed"});
  const result: TransactionStepResultSummary = {status: input.reused ? "reused_existing" : "succeeded", effectReference: input.references?.[0], evidenceFingerprint: input.evidenceFingerprint};
  return evolve({transaction, checkpoint: state.checkpoint}, {kind: "step_succeeded", status: target, stepId: input.stepId}, {stepId: input.stepId, references: input.references, result});
}
export function recordTransactionStepFailed(state: TransactionLifecycleState, input: {stepId: string; errorCode: string}): TransactionLifecycleState {
  if (already(state, input.stepId, "failed")) return state;
  const transaction = transitionTransactionStep({transaction: state.transaction, stepId: input.stepId, nextState: "failed", reason: "deterministic_failure"});
  return evolve({transaction, checkpoint: state.checkpoint}, {kind: "step_failed", status: "failed", stepId: input.stepId, reasonCodes: [input.errorCode]}, {stepId: input.stepId, lastErrorCode: input.errorCode, result: {status: "failed_deterministic", errorCode: input.errorCode}});
}
export function recordTransactionStepReconciliationRequired(state: TransactionLifecycleState, input: {stepId: string; reasonCodes: readonly string[]}): TransactionLifecycleState {
  if (already(state, input.stepId, "reconciliation_required")) return state;
  const transaction = transitionTransactionStep({transaction: state.transaction, stepId: input.stepId, nextState: "reconciliation_required", reason: "uncertain_effect"});
  return evolve({transaction, checkpoint: state.checkpoint}, {kind: "step_reconciliation_required", status: "reconciliation_required", stepId: input.stepId, reasonCodes: input.reasonCodes}, {stepId: input.stepId, reconciliationReasonCodes: input.reasonCodes, result: {status: "reconciliation_required", errorCode: input.reasonCodes[0]}});
}
export function recordTransactionCompensationStarted(state: TransactionLifecycleState, stepId: string): TransactionLifecycleState {
  if (already(state, stepId, "compensating")) return state;
  const transaction = transitionTransactionStep({transaction: state.transaction, stepId, nextState: "compensating", reason: "compensation_started"});
  return evolve({transaction, checkpoint: state.checkpoint}, {kind: "compensation_started", status: "compensating", stepId}, {stepId, compensationState: "started"});
}
export function recordTransactionStepCompensated(state: TransactionLifecycleState, stepId: string): TransactionLifecycleState {
  if (already(state, stepId, "compensated")) return state;
  const transaction = transitionTransactionStep({transaction: state.transaction, stepId, nextState: "compensated", reason: "compensation_confirmed"});
  return evolve({transaction, checkpoint: state.checkpoint}, {kind: "step_compensated", status: "compensated", stepId}, {stepId, compensationState: "completed", result: {status: "compensated"}});
}
export function recordTransactionCompleted(state: TransactionLifecycleState): TransactionLifecycleState {
  if (state.transaction.phase !== "completed") throw new Error("transaction_completion_requires_all_steps_completed");
  return state.checkpoint.history.some((event) => event.kind === "transaction_completed") ? state : evolve(state, {kind: "transaction_completed", status: "completed"});
}

/** Preserves a successful domain effect even when its checkpoint update loses the race. */
export function resultAfterTransactionPersistence<T>(domainResult: T, checkpoint: import("./types").TransactionCheckpointPersistence): TransactionEffectPersistenceResult<T> {
  const uncertain = !checkpoint.persisted;
  return Object.freeze({domainResult, checkpoint, reconciliationRequired: uncertain, doNotRetryEffect: uncertain});
}
