import type {ReviewCase} from "../types";
import {validateGlobalResolutionCheckpoint} from "../globalResolution/checkpoint/checkpoint";
import {deriveCompensationPlan} from "./compensation";
import {validateUniversalTransactionCheckpoint} from "./checkpoint";
import {normalizeTransactionCreationGuards, transactionSourceCheckpointFingerprint} from "./persistence";
import {deriveTransactionStepReadiness, refreshTransactionReadiness} from "./readiness";
import {detectTransactionStaleness, validateUniversalTransactionPlan} from "./recovery";
import type {PersistedTransactionRecoveryResult, TransactionContinuation, TransactionContextBinding, UniversalTransactionPlan} from "./types";

const terminal = new Set(["succeeded", "reused", "compensated", "skipped", "cancelled"]);
export function deriveTransactionContinuation(transactionInput: UniversalTransactionPlan, checkpoint?: import("./types").UniversalTransactionCheckpoint, options: {stale?: boolean} = {}): TransactionContinuation {
  const transaction = checkpoint ? Object.freeze({...transactionInput, steps: Object.freeze(transactionInput.steps.map((step) => ({...step, state: checkpoint.steps.find((stored) => stored.stepId === step.stepId)?.state ?? step.state})))}) : transactionInput;
  const refreshed = refreshTransactionReadiness(transaction);
  const nextReadySteps = refreshed.steps.filter((step) => deriveTransactionStepReadiness(refreshed, step).ready).map((step) => step.stepId).sort();
  const blockedSteps = refreshed.steps.filter((step) => step.state === "blocked" || step.state === "failed" || step.state === "compensation_failed").map((step) => step.stepId).sort();
  const completedSteps = refreshed.steps.filter((step) => terminal.has(step.state)).map((step) => step.stepId).sort();
  const reconciliationSteps = refreshed.steps.filter((step) => step.state === "reconciliation_required").map((step) => step.stepId).sort();
  const compensationSteps = refreshed.steps.filter((step) => step.state === "compensating" || step.state === "compensated").map((step) => step.stepId).sort();
  const authorizationRequired = refreshed.steps.filter((step) => nextReadySteps.includes(step.stepId) && step.authorization !== "none").map((step) => step.stepId).sort();
  const cannotExecute = options.stale === true || ["completed", "compensated", "cancelled", "reconciliation_required"].includes(refreshed.phase);
  return Object.freeze({canContinue: !cannotExecute && nextReadySteps.some((id) => !authorizationRequired.includes(id)), cannotExecute, nextReadySteps: Object.freeze(nextReadySteps), blockedSteps: Object.freeze(blockedSteps), completedSteps: Object.freeze(completedSteps), reconciliationSteps: Object.freeze(reconciliationSteps), compensationSteps: Object.freeze(compensationSteps), authorizationRequired: Object.freeze(authorizationRequired), regenerationRequired: options.stale === true});
}

export function recoverPersistedTransaction(input: {reviewCase: ReviewCase; transaction: UniversalTransactionPlan; currentContext?: TransactionContextBinding}): PersistedTransactionRecoveryResult {
  const global = input.reviewCase.globalResolution;
  if (!global?.transaction) return {status: "absent"};
  const globalValidation = validateGlobalResolutionCheckpoint(global);
  const transactionValidation = validateUniversalTransactionPlan(input.transaction);
  const checkpointValidation = validateUniversalTransactionCheckpoint(global.transaction, input.transaction);
  if (!globalValidation.ok || !transactionValidation.valid || !checkpointValidation.valid) return {status: "invalid", reasons: Object.freeze([...(!globalValidation.ok ? globalValidation.reasons : []), ...transactionValidation.reasons, ...checkpointValidation.reasons]), continuation: deriveTransactionContinuation(input.transaction, global.transaction)};
  const guards = normalizeTransactionCreationGuards({...global, transaction: input.transaction});
  if (!guards.ok) return {status: "invalid", reasons: guards.reasons, continuation: deriveTransactionContinuation(input.transaction, global.transaction)};
  const currentContext = input.currentContext ?? {...input.transaction.contextBinding, caseId: input.reviewCase.id, caseVersion: input.reviewCase.version, sourcePlanFingerprint: global.planFingerprint, sourceCheckpointFingerprint: transactionSourceCheckpointFingerprint(global), creationGuardFingerprints: Object.fromEntries(guards.guards.map((guard) => [guard.operationId, guard.guardFingerprint]))};
  const staleness = detectTransactionStaleness(input.transaction, currentContext);
  const extensionGuardFingerprint = global.transaction.creationGuards ? JSON.stringify(global.transaction.creationGuards.map((guard) => [guard.operationId, guard.fingerprint])) : "";
  const currentGuardFingerprint = JSON.stringify(guards.guards.map((guard) => [guard.operationId, guard.fingerprint]));
  const reasons = [...staleness.reasons];
  if (global.transaction.sourcePlanFingerprint !== global.planFingerprint) reasons.push("source_plan_fingerprint_changed");
  if (extensionGuardFingerprint && extensionGuardFingerprint !== currentGuardFingerprint) reasons.push("creation_guard_projection_changed");
  if (reasons.length) return {status: "stale", reasons: Object.freeze([...new Set(reasons)].sort()), continuation: deriveTransactionContinuation(input.transaction, global.transaction, {stale: true})};
  const restored = Object.freeze({...input.transaction, steps: Object.freeze(input.transaction.steps.map((step) => Object.freeze({...step, state: global.transaction!.steps.find((stored) => stored.stepId === step.stepId)?.state ?? step.state}))), phase: global.transaction.phase});
  const continuation = deriveTransactionContinuation(restored, global.transaction);
  if (restored.phase === "completed") return {status: "completed", transaction: restored, checkpoint: global.transaction, continuation};
  if (restored.phase === "reconciliation_required") return {status: "reconciliation_required", transaction: restored, checkpoint: global.transaction, continuation};
  const compensation = deriveCompensationPlan(restored);
  if (["failed", "partially_succeeded", "compensating"].includes(restored.phase) && compensation.actions.some((action) => action.disposition === "eligible" || action.disposition === "manual")) return {status: "compensation_required", transaction: restored, checkpoint: global.transaction, continuation};
  return {status: "valid", transaction: restored, checkpoint: global.transaction, continuation};
}

/** UI-safe, payload-free status descriptor for the AU6 review center. */
export function describePersistedTransaction(input: Parameters<typeof recoverPersistedTransaction>[0]): Readonly<{status: PersistedTransactionRecoveryResult["status"]; phase?: string; continuation?: TransactionContinuation}> {
  const result = recoverPersistedTransaction(input);
  return "continuation" in result ? {status: result.status, phase: "transaction" in result ? result.transaction.phase : undefined, continuation: result.continuation} : {status: result.status};
}
