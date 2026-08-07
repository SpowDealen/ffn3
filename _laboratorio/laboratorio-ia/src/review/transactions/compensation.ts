import type {ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import type {TransactionCompensationAction, TransactionCompensationPlan, UniversalTransactionPlan} from "./types";

export function deriveCompensationPlan(transaction: UniversalTransactionPlan): TransactionCompensationPlan {
  const unresolved = transaction.steps.filter((step) => step.state === "reconciliation_required").map((step) => step.stepId);
  const successful = [...transaction.steps].reverse().filter((step) => step.state === "succeeded" || step.state === "reused");
  const actions: TransactionCompensationAction[] = successful.map((step) => {
    if (step.compensation === "none") return {stepId: step.stepId, operationId: step.operationId, policy: step.compensation, disposition: "not_applicable", reason: "compensation_not_declared"};
    if (unresolved.length) return {stepId: step.stepId, operationId: step.operationId, policy: step.compensation, compensatorId: step.compensatorId, disposition: "blocked", reason: "unresolved_effect_requires_reconciliation"};
    if (step.compensation === "manual_required") return {stepId: step.stepId, operationId: step.operationId, policy: step.compensation, disposition: "manual", reason: "manual_compensation_required"};
    if (step.compensation === "explicit_compensator" && !step.compensatorId) return {stepId: step.stepId, operationId: step.operationId, policy: step.compensation, disposition: "blocked", reason: "explicit_compensator_missing"};
    return {stepId: step.stepId, operationId: step.operationId, policy: step.compensation, compensatorId: step.compensatorId, disposition: "eligible", reason: step.compensation === "logical_only" ? "logical_compensation_only" : step.compensation === "reversible_transform" ? "pure_transform_reversible" : "explicit_compensator_registered"};
  });
  const reasonCodes = [...new Set([...unresolved.map((stepId) => `reconciliation_required:${stepId}`), ...actions.filter((action) => action.disposition === "blocked").map((action) => action.reason)])].sort();
  const semantic = {transactionFingerprint: transaction.transactionFingerprint, actions};
  return Object.freeze({transactionFingerprint: transaction.transactionFingerprint, actions: Object.freeze(actions), blocked: reasonCodes.length > 0, reasonCodes: Object.freeze(reasonCodes), fingerprint: computeUniversalFingerprint(semantic as unknown as ReviewJsonValue)});
}
