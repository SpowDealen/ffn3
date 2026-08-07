import {deriveTransactionPhase} from "./stateMachine";
import type {TransactionExecutableBatch, TransactionRuntimeAuthorization, TransactionStep, UniversalTransactionPlan} from "./types";

const accepted = (step: TransactionStep) => step.state === "succeeded" || step.state === "reused" || step.state === "skipped";

export function deriveTransactionStepReadiness(transaction: UniversalTransactionPlan, stepOrId: TransactionStep | string): Readonly<{stepId: string; ready: boolean; reasons: readonly string[]}> {
  const step = typeof stepOrId === "string" ? transaction.steps.find((candidate) => candidate.stepId === stepOrId) : stepOrId;
  if (!step) return {stepId: typeof stepOrId === "string" ? stepOrId : "unknown", ready: false, reasons: ["transaction_step_missing"]};
  if (!["pending", "ready"].includes(step.state)) return {stepId: step.stepId, ready: false, reasons: [`step_state_${step.state}`]};
  const globalBlockers = transaction.blockers.filter((item) => !item.stepId);
  const stepBlockers = transaction.blockers.filter((item) => item.stepId === step.stepId);
  const reasons = [...globalBlockers, ...stepBlockers].map((item) => `transaction_blocker_${item.code}`);
  const byId = new Map(transaction.steps.map((candidate) => [candidate.stepId, candidate]));
  for (const dependencyId of step.dependencies) {
    const dependency = byId.get(dependencyId);
    if (!dependency) reasons.push(`dependency_missing_${dependencyId}`);
    else if (dependency.state === "reconciliation_required") reasons.push(`dependency_reconciliation_required_${dependencyId}`);
    else if (dependency.state === "failed" || dependency.state === "compensation_failed") reasons.push(`dependency_failed_${dependencyId}`);
    else if (!accepted(dependency)) reasons.push(`dependency_incomplete_${dependencyId}_${dependency.state}`);
  }
  return {stepId: step.stepId, ready: reasons.length === 0, reasons: [...new Set(reasons)].sort()};
}

export function refreshTransactionReadiness(transaction: UniversalTransactionPlan): UniversalTransactionPlan {
  const steps = transaction.steps.map((step) => {
    if (!['pending', 'ready'].includes(step.state)) return step;
    const readiness = deriveTransactionStepReadiness(transaction, step);
    const state = readiness.ready ? "ready" as const : "pending" as const;
    return state === step.state ? step : Object.freeze({...step, state});
  });
  return Object.freeze({...transaction, steps: Object.freeze(steps), phase: deriveTransactionPhase(steps, transaction.blockers.length > 0)});
}

function runtimeReasons(transaction: UniversalTransactionPlan, step: TransactionStep, options: {authorizations?: readonly TransactionRuntimeAuthorization[]; prevalidatedStepIds?: readonly string[]; now?: () => string}): string[] {
  const reasons: string[] = [];
  if (step.preExecutionValidationRequired && !options.prevalidatedStepIds?.includes(step.stepId)) reasons.push("pre_execution_validation_required");
  if (step.authorization !== "none") {
    const authorization = options.authorizations?.find((candidate) => candidate.stepId === step.stepId && candidate.transactionFingerprint === transaction.transactionFingerprint);
    if (!authorization) reasons.push("runtime_authorization_required");
    else if (Date.parse(authorization.expiresAt) <= Date.parse((options.now ?? (() => new Date().toISOString()))())) reasons.push("runtime_authorization_expired");
    else if (step.authorization === "human_required" && !authorization.approvedByHuman) reasons.push("human_authorization_required");
  }
  return reasons;
}

export function deriveExecutableBatch(transactionInput: UniversalTransactionPlan, options: {authorizations?: readonly TransactionRuntimeAuthorization[]; prevalidatedStepIds?: readonly string[]; now?: () => string} = {}): TransactionExecutableBatch {
  const transaction = refreshTransactionReadiness(transactionInput);
  if (["completed", "compensated", "cancelled", "reconciliation_required"].includes(transaction.phase)) return {transactionFingerprint: transaction.transactionFingerprint, stepIds: [], blocked: transaction.steps.filter((step) => step.state === "reconciliation_required").map((step) => ({stepId: step.stepId, reasons: ["transaction_not_executable"]}))};
  const stepIds: string[] = [];
  const blocked: Array<{stepId: string; reasons: readonly string[]}> = [];
  for (const step of transaction.steps) {
    const readiness = deriveTransactionStepReadiness(transaction, step);
    if (!readiness.ready) continue;
    const reasons = runtimeReasons(transaction, step, options);
    if (reasons.length) blocked.push({stepId: step.stepId, reasons});
    else stepIds.push(step.stepId);
  }
  return {transactionFingerprint: transaction.transactionFingerprint, stepIds: Object.freeze(stepIds), blocked: Object.freeze(blocked)};
}
