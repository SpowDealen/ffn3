import type {UniversalTransactionPlan, TransactionPhase, TransactionStep, TransactionStepState, TransactionStepTransitionReason} from "./types";

const success = (state: TransactionStepState) => state === "succeeded" || state === "reused" || state === "skipped";

export function deriveTransactionPhase(steps: readonly TransactionStep[], hasBlockers = false): TransactionPhase {
  if (steps.length > 0 && steps.every((step) => step.state === "cancelled")) return "cancelled";
  if (steps.some((step) => step.state === "reconciliation_required")) return "reconciliation_required";
  if (steps.some((step) => step.state === "compensation_failed")) return "compensation_failed";
  if (steps.some((step) => step.state === "compensating")) return "compensating";
  if (steps.length > 0 && steps.every((step) => step.state === "compensated" || step.state === "cancelled" || step.state === "skipped")) return "compensated";
  if (steps.some((step) => step.state === "compensated") && steps.some((step) => step.state === "succeeded" || step.state === "reused" || step.state === "failed")) return "partially_compensated";
  if (steps.length > 0 && steps.every((step) => success(step.state))) return "completed";
  if (steps.some((step) => step.state === "executing")) return "executing";
  const progressed = steps.some((step) => success(step.state) || step.state === "compensated");
  if (steps.some((step) => step.state === "failed")) return progressed ? "partially_succeeded" : "failed";
  if (hasBlockers || steps.some((step) => step.state === "blocked")) return "blocked";
  if (progressed) return "partially_succeeded";
  if (steps.some((step) => step.state === "ready")) return "ready";
  return "planned";
}

function transitionAllowed(step: TransactionStep, next: TransactionStepState, reason: TransactionStepTransitionReason): boolean {
  if (step.state === "pending") return next === "ready" && reason === "dependencies_satisfied" || next === "blocked" && reason === "policy_blocked" || next === "skipped" && reason === "explicit_skip" || next === "cancelled" && reason === "operator_cancelled";
  if (step.state === "blocked") return next === "pending" && reason === "explicit_retry" || next === "cancelled" && reason === "operator_cancelled";
  if (step.state === "ready") return next === "executing" && reason === "execution_started" || next === "cancelled" && reason === "operator_cancelled" || next === "skipped" && reason === "explicit_skip";
  if (step.state === "executing") return next === "succeeded" && reason === "execution_confirmed" || next === "reused" && reason === "reuse_confirmed" || next === "failed" && reason === "deterministic_failure" || next === "reconciliation_required" && reason === "uncertain_effect" || next === "cancelled" && reason === "operator_cancelled";
  if (step.state === "failed") return next === "pending" && reason === "explicit_retry" && step.retry !== "never" || next === "cancelled" && reason === "operator_cancelled";
  if (step.state === "reconciliation_required") return next === "pending" && reason === "reconciliation_confirmed_absent" && step.retry === "after_reconciliation" || (next === "succeeded" || next === "reused") && reason === "reconciliation_confirmed_succeeded" || next === "compensated" && reason === "compensation_reconciliation_confirmed_succeeded" || next === "succeeded" && reason === "compensation_reconciliation_confirmed_not_applied";
  if (step.state === "succeeded" || step.state === "reused") return next === "compensating" && reason === "compensation_started" && step.compensation !== "none";
  if (step.state === "compensating") return next === "compensated" && reason === "compensation_confirmed" || next === "compensation_failed" && reason === "compensation_failed" || next === "reconciliation_required" && reason === "uncertain_effect";
  if (step.state === "compensation_failed") return next === "succeeded" && reason === "explicit_retry";
  return false;
}

export function transitionTransactionStep(input: {transaction: UniversalTransactionPlan; stepId: string; nextState: TransactionStepState; reason: TransactionStepTransitionReason}): UniversalTransactionPlan {
  const current = input.transaction.steps.find((step) => step.stepId === input.stepId);
  if (!current) throw new Error(`transaction_step_missing:${input.stepId}`);
  if (!transitionAllowed(current, input.nextState, input.reason)) throw new Error(`transaction_step_transition_invalid:${current.state}:${input.nextState}:${input.reason}`);
  const steps = input.transaction.steps.map((step) => step.stepId === input.stepId ? Object.freeze({...step, state: input.nextState}) : step);
  return Object.freeze({...input.transaction, steps: Object.freeze(steps), phase: deriveTransactionPhase(steps, input.transaction.blockers.length > 0)});
}

export function classifyTransactionFailure(step: TransactionStep, input: {kind: "timeout" | "network" | "deterministic" | "conflict"; effectMayHaveOccurred: boolean}): import("./types").TransactionFailureClassification {
  if (step.mode === "external_effect" && (input.effectMayHaveOccurred || input.kind === "timeout" || input.kind === "network")) return {state: "reconciliation_required", retryAllowed: false, reasonCode: "uncertain_external_effect"};
  return {state: "failed", retryAllowed: step.retry === "safe_idempotent" || step.retry === "explicit_only", reasonCode: input.kind === "deterministic" ? "deterministic_failure" : "confirmed_no_effect"};
}

export function canRetryTransactionStep(step: TransactionStep, input: {explicit: boolean; reconciliationConfirmedAbsent?: boolean}): boolean {
  if (step.state === "reconciliation_required") return step.retry === "after_reconciliation" && Boolean(input.reconciliationConfirmedAbsent) && input.explicit;
  if (step.state !== "failed") return false;
  if (step.retry === "never") return false;
  if (step.retry === "safe_idempotent") return true;
  return input.explicit;
}
