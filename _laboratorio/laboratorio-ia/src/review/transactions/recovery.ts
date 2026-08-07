import {isSerializableReviewValue} from "../cases/validateResolution";
import type {ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {validateUniversalTransactionCheckpoint} from "./checkpoint";
import {deriveExecutableBatch, refreshTransactionReadiness} from "./readiness";
import {deriveTransactionPhase} from "./stateMachine";
import {UNIVERSAL_TRANSACTION_SCHEMA_VERSION, type TransactionContextBinding, type TransactionRecoveryResult, type TransactionStalenessResult, type UniversalTransactionCheckpoint, type UniversalTransactionPlan} from "./types";

function sameProducer(left: UniversalTransactionPlan["producer"], right: TransactionContextBinding["producer"]): boolean {
  if (!left && !right) return true;
  return Boolean(left && right && left.producerId === right.producerId && left.producerVersion === right.producerVersion && left.manifestVersion === right.manifestVersion && left.manifestFingerprint === right.manifestFingerprint);
}

export function detectTransactionStaleness(transaction: UniversalTransactionPlan, current: TransactionContextBinding): TransactionStalenessResult {
  const reasons: string[] = [];
  if (transaction.caseId !== current.caseId) reasons.push("case_id_changed");
  if (transaction.caseVersion !== current.caseVersion) reasons.push("case_version_changed");
  if (transaction.sourcePlanFingerprint !== current.sourcePlanFingerprint) reasons.push("source_plan_fingerprint_changed");
  if (transaction.contextBinding.sourceCheckpointFingerprint !== current.sourceCheckpointFingerprint) reasons.push("source_checkpoint_fingerprint_changed");
  if (!sameProducer(transaction.producer, current.producer)) reasons.push("producer_manifest_changed");
  const expectedOperations = transaction.contextBinding.operationFingerprints;
  const currentOperations = current.operationFingerprints;
  for (const operationId of [...new Set([...Object.keys(expectedOperations), ...Object.keys(currentOperations)])].sort()) if (expectedOperations[operationId] !== currentOperations[operationId]) reasons.push(`operation_fingerprint_changed:${operationId}`);
  const expectedGuards = transaction.contextBinding.creationGuardFingerprints;
  const currentGuards = current.creationGuardFingerprints;
  for (const operationId of [...new Set([...Object.keys(expectedGuards), ...Object.keys(currentGuards)])].sort()) if (expectedGuards[operationId] !== currentGuards[operationId]) reasons.push(`creation_guard_fingerprint_changed:${operationId}`);
  return {stale: reasons.length > 0, reasons: Object.freeze(reasons)};
}

function semantic(transaction: UniversalTransactionPlan) {
  return {
    caseId: transaction.caseId,
    caseVersion: transaction.caseVersion,
    sourcePlanFingerprint: transaction.sourcePlanFingerprint,
    producer: transaction.producer,
    steps: transaction.steps.map((step) => Object.fromEntries(Object.entries(step).filter(([key]) => key !== "state"))),
    policies: transaction.policies,
    blockers: [...transaction.blockers].sort((left, right) => `${left.code}:${left.operationId ?? ""}`.localeCompare(`${right.code}:${right.operationId ?? ""}`)),
    contextBinding: transaction.contextBinding,
  };
}

export function validateUniversalTransactionPlan(value: unknown): Readonly<{valid: boolean; reasons: readonly string[]}> {
  const reasons: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return {valid: false, reasons: ["transaction_object_required"]};
  const transaction = value as UniversalTransactionPlan;
  if (transaction.schemaVersion !== UNIVERSAL_TRANSACTION_SCHEMA_VERSION || !transaction.transactionId || !transaction.transactionFingerprint || !transaction.transactionIdempotencyKey || !transaction.caseId || !Number.isInteger(transaction.caseVersion) || !transaction.sourcePlanFingerprint || !transaction.createdAt || !Array.isArray(transaction.steps) || !Array.isArray(transaction.blockers)) reasons.push("transaction_shape_invalid");
  if (!isSerializableReviewValue(value)) reasons.push("transaction_not_serializable");
  const ids = new Set(transaction.steps?.map((step) => step.stepId));
  if (ids.size !== transaction.steps?.length) reasons.push("transaction_step_duplicate");
  for (const step of transaction.steps ?? []) {
    if (step.operationId !== step.stepId || !step.operationKind || !step.capability || !step.idempotencyKey || !step.fingerprints?.operationFingerprint) reasons.push("transaction_step_invalid");
    for (const dependency of step.dependencies ?? []) if (!ids.has(dependency)) reasons.push("transaction_dependency_missing");
    const bindingBlocked = transaction.blockers?.some((blocker) => blocker.stepId === step.stepId && ["unsupported_step", "execution_binding_missing"].includes(blocker.code));
    if (step.mode === "external_effect" && !bindingBlocked && (!step.executorId || !step.executorVersion || !step.fingerprints.executorManifestFingerprint)) reasons.push("transaction_external_binding_invalid");
  }
  const incoming = new Map((transaction.steps ?? []).map((step) => [step.stepId, new Set(step.dependencies)]));
  const ready = [...incoming].filter(([, dependencies]) => dependencies.size === 0).map(([id]) => id).sort();
  let visited = 0;
  while (ready.length) {
    const current = ready.shift()!;
    visited += 1;
    for (const [id, dependencies] of incoming) if (id !== current && dependencies.delete(current) && dependencies.size === 0 && !ready.includes(id)) ready.push(id);
    ready.sort();
  }
  if (visited !== incoming.size) reasons.push("transaction_dependency_cycle");
  if (transaction.phase !== deriveTransactionPhase(transaction.steps ?? [], (transaction.blockers?.length ?? 0) > 0)) reasons.push("transaction_phase_inconsistent");
  if (computeUniversalFingerprint(semantic(transaction) as unknown as ReviewJsonValue) !== transaction.transactionFingerprint) reasons.push("transaction_fingerprint_mismatch");
  if (transaction.transactionIdempotencyKey !== `logical-transaction:${transaction.transactionFingerprint}`) reasons.push("transaction_idempotency_mismatch");
  return {valid: reasons.length === 0, reasons: Object.freeze([...new Set(reasons)].sort())};
}

export function recoverUniversalTransaction(input: {transaction: UniversalTransactionPlan; checkpoint: UniversalTransactionCheckpoint; currentContext: TransactionContextBinding; authorizations?: readonly import("./types").TransactionRuntimeAuthorization[]; prevalidatedStepIds?: readonly string[]; now?: () => string}): TransactionRecoveryResult {
  const transactionValidation = validateUniversalTransactionPlan(input.transaction);
  const checkpointValidation = validateUniversalTransactionCheckpoint(input.checkpoint, input.transaction);
  if (!transactionValidation.valid || !checkpointValidation.valid) return {status: "invalid", reasons: Object.freeze([...transactionValidation.reasons, ...checkpointValidation.reasons])};
  const staleness = detectTransactionStaleness(input.transaction, input.currentContext);
  if (staleness.stale) return {status: "stale", reasons: staleness.reasons};
  const states = new Map(input.checkpoint.steps.map((step) => [step.stepId, step.state]));
  const steps = input.transaction.steps.map((step) => Object.freeze({...step, state: states.get(step.stepId) ?? step.state}));
  const restoredBase = Object.freeze({...input.transaction, steps: Object.freeze(steps), phase: deriveTransactionPhase(steps, input.transaction.blockers.length > 0)});
  const restored = refreshTransactionReadiness(restoredBase);
  if (restored.phase === "completed") return {status: "completed", transaction: restored, checkpoint: input.checkpoint};
  return {status: "valid", transaction: restored, checkpoint: input.checkpoint, next: deriveExecutableBatch(restored, {authorizations: input.authorizations, prevalidatedStepIds: input.prevalidatedStepIds, now: input.now})};
}
