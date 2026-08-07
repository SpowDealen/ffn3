import {computeUniversalFingerprint} from "../universal";
import type {ReviewJsonValue} from "../types";
import {createTransactionHistoryEvent, evolveUniversalTransactionCheckpoint, validateUniversalTransactionCheckpoint} from "./checkpoint";
import {detectTransactionStaleness, validateUniversalTransactionPlan} from "./recovery";
import {deriveTransactionPhase, transitionTransactionStep} from "./stateMachine";
import type {TransactionLifecycleState} from "./lifecycle";
import type {CompensationDecision, ControlledTransactionCompensationPlan, TransactionCheckpointPersistence, TransactionCompensationAuthorization, TransactionCompensationCheckpoint, TransactionCompensationEvidence, TransactionCompensationExecutionResult, TransactionCompensationRuntime, TransactionCompensator, TransactionCompensatorRegistry, TransactionEffectOwnership, TransactionInverseTransformDescriptor, TransactionSagaOutcome, TransactionStep, UniversalTransactionCheckpoint, UniversalTransactionPlan} from "./types";

const activeCompensations = new Map<string, Promise<TransactionCompensationExecutionResult>>();
const nowDefault = () => new Date().toISOString();
const noPersistence = (reason: string, conflict = false): TransactionCheckpointPersistence => ({persisted: false, conflict, reasons: [reason]});

export function createTransactionCompensatorRegistry(initial: readonly TransactionCompensator[] = []): TransactionCompensatorRegistry & {register(compensator: TransactionCompensator): () => void} {
  const values = new Map<string, TransactionCompensator>();
  const registry = {
    get: (id: string) => values.get(id),
    list: () => Object.freeze([...values.values()].sort((left, right) => left.compensatorId.localeCompare(right.compensatorId))),
    register(compensator: TransactionCompensator) {
      if (!compensator.compensatorId || !compensator.version || !compensator.manifestFingerprint || values.has(compensator.compensatorId)) throw new Error(`transaction_compensator_invalid_or_duplicate:${compensator.compensatorId}`);
      values.set(compensator.compensatorId, Object.freeze(compensator));
      return () => { if (values.get(compensator.compensatorId) === compensator) values.delete(compensator.compensatorId); };
    },
  };
  initial.forEach((compensator) => registry.register(compensator));
  return Object.freeze(registry);
}

export function createInverseTransformDescriptor(input: Omit<TransactionInverseTransformDescriptor, "descriptorFingerprint">): TransactionInverseTransformDescriptor {
  return Object.freeze({...input, descriptorFingerprint: computeUniversalFingerprint(input as unknown as ReviewJsonValue)});
}

function orderedSteps(transaction: UniversalTransactionPlan): readonly TransactionStep[] {
  const byId = new Map(transaction.steps.map((step) => [step.stepId, step]));
  const incoming = new Map(transaction.steps.map((step) => [step.stepId, new Set(step.dependencies)]));
  const ready = [...incoming].filter(([, dependencies]) => dependencies.size === 0).map(([id]) => id).sort();
  const order: TransactionStep[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    const step = byId.get(id);
    if (step) order.push(step);
    for (const [candidate, dependencies] of incoming) if (candidate !== id && dependencies.delete(id) && dependencies.size === 0 && !order.some((item) => item.stepId === candidate) && !ready.includes(candidate)) ready.push(candidate);
    ready.sort();
  }
  return Object.freeze(order.reverse());
}

function defaultOwnership(step: TransactionStep): TransactionEffectOwnership {
  if (step.state === "reused") return "pre_existing";
  if (step.mode === "pure_transform") return "transaction_transformed";
  return "unknown";
}

function decisionFingerprint(input: Omit<CompensationDecision, "fingerprint">): string {
  return computeUniversalFingerprint({...input, reasonCodes: [...input.reasonCodes].sort()} as unknown as ReviewJsonValue);
}

export function evaluateCompensationDecision(input: {step: TransactionStep; evidence?: TransactionCompensationEvidence; registry?: TransactionCompensatorRegistry}): CompensationDecision {
  const {step} = input;
  const ownership = input.evidence?.ownership ?? defaultOwnership(step);
  let decision: CompensationDecision["decision"] = "preserve";
  let compensatorId: string | undefined;
  const reasons: string[] = [];
  if (step.state === "reconciliation_required") { decision = "reconciliation_required"; reasons.push("original_effect_uncertain"); }
  else if (step.state === "failed" || step.state === "blocked" || step.state === "pending" || step.state === "ready" || step.state === "executing" || step.state === "cancelled") reasons.push("step_effect_not_confirmed_applied");
  else if (step.state === "compensated") reasons.push("already_compensated");
  else if (step.state === "reused") reasons.push("reused_effect_preserved");
  else if (step.mode === "read_only") reasons.push("read_only_has_no_effect_to_compensate");
  else if (ownership === "pre_existing" || ownership === "shared" || ownership === "unknown") reasons.push(`ownership_${ownership}_preserved`);
  else if (step.risk === "destructive") { decision = "manual_required"; reasons.push("destructive_compensation_never_automatic"); }
  else if (step.compensation === "none") reasons.push("compensation_policy_none");
  else if (step.compensation === "manual_required") { decision = "manual_required"; reasons.push("manual_compensation_policy"); }
  else if (step.compensation === "logical_only") { decision = "logical_compensation"; reasons.push("logical_compensation_no_physical_reversal"); }
  else if (step.compensation === "reversible_transform") {
    const inverse = input.evidence?.inverseTransform;
    if (!inverse || inverse.resultingFingerprint !== input.evidence?.references?.[0]?.fingerprint) { decision = "manual_required"; reasons.push("inverse_transform_evidence_invalid"); }
    else { decision = "revert_transform"; compensatorId = inverse.compensatorId; reasons.push("inverse_transform_verified"); }
  } else if (step.compensation === "explicit_compensator") {
    const compensator = step.compensatorId ? input.registry?.get(step.compensatorId) : undefined;
    const reference = input.evidence?.references?.[0];
    if (!step.compensatorId || !compensator) { decision = "manual_required"; reasons.push("explicit_compensator_missing"); }
    else if (!compensator.supports({step, ownership, reference, inverseTransform: input.evidence?.inverseTransform})) { decision = "manual_required"; reasons.push("explicit_compensator_incompatible"); }
    else { decision = "compensate"; compensatorId = compensator.compensatorId; reasons.push("explicit_compensator_verified"); }
  }
  if ((input.evidence?.sharedByStepIds?.length ?? 0) > 1) { decision = "preserve"; compensatorId = undefined; reasons.push("effect_shared_by_multiple_steps"); }
  const base = {decision, stepId: step.stepId, policy: step.compensation, ownership, compensatorId, reasonCodes: Object.freeze([...new Set(reasons)].sort())};
  return Object.freeze({...base, fingerprint: decisionFingerprint(base)});
}

export function deriveControlledCompensationPlan(transaction: UniversalTransactionPlan, input: {evidence?: readonly TransactionCompensationEvidence[]; registry?: TransactionCompensatorRegistry} = {}): ControlledTransactionCompensationPlan {
  const evidence = new Map((input.evidence ?? []).map((item) => [item.stepId, item]));
  const decisions = orderedSteps(transaction).map((step) => evaluateCompensationDecision({step, evidence: evidence.get(step.stepId), registry: input.registry}));
  const base = {
    transactionFingerprint: transaction.transactionFingerprint,
    failedStepIds: transaction.steps.filter((step) => step.state === "failed" || step.state === "compensation_failed").map((step) => step.stepId).sort(),
    decisions: Object.freeze(decisions),
    executableStepIds: decisions.filter((item) => ["logical_compensation", "compensate", "revert_transform"].includes(item.decision)).map((item) => item.stepId),
    manualStepIds: decisions.filter((item) => item.decision === "manual_required").map((item) => item.stepId),
    reconciliationStepIds: decisions.filter((item) => item.decision === "reconciliation_required").map((item) => item.stepId),
    preservedStepIds: decisions.filter((item) => item.decision === "preserve").map((item) => item.stepId),
  };
  return Object.freeze({...base, fingerprint: computeUniversalFingerprint(base as unknown as ReviewJsonValue)});
}

export function createTransactionCompensationAuthorization(input: Omit<TransactionCompensationAuthorization, "authorizationFingerprint" | "intent">): TransactionCompensationAuthorization {
  const semantic = {...input, intent: "compensate_transaction_step" as const};
  return Object.freeze({...semantic, authorizationFingerprint: computeUniversalFingerprint(semantic as unknown as ReviewJsonValue)});
}

export function validateTransactionCompensationAuthorization(value: TransactionCompensationAuthorization | undefined, input: {transactionFingerprint: string; stepId: string; compensationFingerprint: string; checkpointFingerprint: string; now?: () => string}): boolean {
  if (!value || value.intent !== "compensate_transaction_step" || !value.approvedByHuman || value.transactionFingerprint !== input.transactionFingerprint || value.stepId !== input.stepId || value.compensationFingerprint !== input.compensationFingerprint || value.checkpointFingerprint !== input.checkpointFingerprint || Date.parse(value.expiresAt) <= Date.parse((input.now ?? nowDefault)())) return false;
  const semantic = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "authorizationFingerprint"));
  return computeUniversalFingerprint(semantic as unknown as ReviewJsonValue) === value.authorizationFingerprint;
}

function restore(transaction: UniversalTransactionPlan, checkpoint: UniversalTransactionCheckpoint): UniversalTransactionPlan {
  const states = new Map(checkpoint.steps.map((step) => [step.stepId, step.state]));
  const steps = transaction.steps.map((step) => Object.freeze({...step, state: states.get(step.stepId) ?? step.state}));
  return Object.freeze({...transaction, steps: Object.freeze(steps), phase: deriveTransactionPhase(steps, transaction.blockers.length > 0)});
}

function compensationCheckpoint(input: {decision: CompensationDecision; compensator?: TransactionCompensator; previous?: TransactionCompensationCheckpoint; evidence?: TransactionCompensationEvidence; errorCode?: string; evidenceFingerprint?: string; incrementAttempt?: boolean}): TransactionCompensationCheckpoint {
  const attempts = (input.previous?.attempts ?? 0) + (input.incrementAttempt ? 1 : 0);
  const base = {decision: input.decision.decision, policy: input.decision.policy, ownership: input.decision.ownership, compensatorId: input.compensator?.compensatorId ?? input.decision.compensatorId, compensatorVersion: input.compensator?.version, attempts, effectReferenceFingerprint: input.evidence?.references?.[0]?.fingerprint, inverseDescriptorFingerprint: input.evidence?.inverseTransform?.descriptorFingerprint, errorCode: input.errorCode, evidenceFingerprint: input.evidenceFingerprint};
  return Object.freeze({...base, compensationFingerprint: computeUniversalFingerprint(base as unknown as ReviewJsonValue)});
}

function result(input: Omit<TransactionCompensationExecutionResult, "reasonCodes" | "reconciliationRequired" | "doNotRetryCompensation"> & Partial<Pick<TransactionCompensationExecutionResult, "reasonCodes" | "reconciliationRequired" | "doNotRetryCompensation">>): TransactionCompensationExecutionResult {
  return Object.freeze({reasonCodes: Object.freeze([]), reconciliationRequired: false, doNotRetryCompensation: false, ...input});
}

async function executeOnce(input: {caseId: string; transaction: UniversalTransactionPlan; stepId: string; expectedTransactionFingerprint: string; expectedCheckpointFingerprint: string; runtime: TransactionCompensationRuntime; authorization?: TransactionCompensationAuthorization; signal?: AbortSignal}): Promise<TransactionCompensationExecutionResult> {
  const snapshot = input.runtime.checkpointApplication.load(input.caseId, input.transaction);
  const fallbackStep = input.transaction.steps.find((step) => step.stepId === input.stepId);
  const placeholder = evaluateCompensationDecision({step: fallbackStep ?? input.transaction.steps[0], registry: input.runtime.registry});
  if (!snapshot || !fallbackStep) return result({status: "blocked", stepId: input.stepId, beforeState: fallbackStep?.state ?? "pending", afterState: fallbackStep?.state ?? "pending", decision: placeholder, attempt: 0, compensatorInvoked: false, persistence: noPersistence(!snapshot ? "transaction_missing" : "step_missing"), reasonCodes: [!snapshot ? "transaction_missing" : "step_missing"]});
  const validation = validateUniversalTransactionCheckpoint(snapshot.checkpoint, input.transaction);
  const planValidation = validateUniversalTransactionPlan(input.transaction);
  const stale = detectTransactionStaleness(input.transaction, snapshot.currentContext);
  if (!validation.valid || !planValidation.valid || stale.stale || input.expectedTransactionFingerprint !== input.transaction.transactionFingerprint || input.expectedCheckpointFingerprint !== snapshot.globalCheckpointFingerprint) return result({status: "blocked", stepId: input.stepId, beforeState: fallbackStep.state, afterState: fallbackStep.state, decision: placeholder, attempt: 0, compensatorInvoked: false, persistence: noPersistence("transaction_stale_or_conflict", input.expectedCheckpointFingerprint !== snapshot.globalCheckpointFingerprint), reasonCodes: [...validation.reasons, ...planValidation.reasons, ...stale.reasons, "transaction_stale_or_conflict"]});
  const transaction = restore(input.transaction, snapshot.checkpoint);
  const step = transaction.steps.find((candidate) => candidate.stepId === input.stepId)!;
  const stored = snapshot.checkpoint.steps.find((candidate) => candidate.stepId === input.stepId)!;
  const evidence = input.runtime.evidence.find((item) => item.stepId === step.stepId);
  const decision = evaluateCompensationDecision({step, evidence, registry: input.runtime.registry});
  if (step.state === "compensated") return result({status: "already_compensated", stepId: step.stepId, beforeState: step.state, afterState: step.state, decision, attempt: stored.compensation?.attempts ?? 0, compensatorInvoked: false, persistence: {persisted: true, conflict: false, checkpointFingerprint: snapshot.globalCheckpointFingerprint}, reasonCodes: ["already_compensated"]});
  if (decision.decision === "preserve") return result({status: "preserved", stepId: step.stepId, beforeState: step.state, afterState: step.state, decision, attempt: stored.compensation?.attempts ?? 0, compensatorInvoked: false, persistence: {persisted: true, conflict: false, checkpointFingerprint: snapshot.globalCheckpointFingerprint}, reasonCodes: decision.reasonCodes});
  if (decision.decision === "manual_required") return result({status: "manual_required", stepId: step.stepId, beforeState: step.state, afterState: step.state, decision, attempt: stored.compensation?.attempts ?? 0, compensatorInvoked: false, persistence: noPersistence("manual_intervention_required"), reasonCodes: decision.reasonCodes});
  if (decision.decision === "reconciliation_required") return result({status: "reconciliation_required", stepId: step.stepId, beforeState: step.state, afterState: step.state, decision, attempt: stored.compensation?.attempts ?? 0, compensatorInvoked: false, persistence: noPersistence("original_effect_reconciliation_required"), reasonCodes: decision.reasonCodes, reconciliationRequired: true, doNotRetryCompensation: true});
  const compensator = decision.compensatorId ? input.runtime.registry.get(decision.compensatorId) : undefined;
  const needsExternalAuthorization = decision.decision !== "logical_compensation";
  if (needsExternalAuthorization && !validateTransactionCompensationAuthorization(input.authorization, {transactionFingerprint: transaction.transactionFingerprint, stepId: step.stepId, compensationFingerprint: decision.fingerprint, checkpointFingerprint: snapshot.globalCheckpointFingerprint, now: input.runtime.now})) return result({status: "blocked", stepId: step.stepId, beforeState: step.state, afterState: step.state, decision, attempt: stored.compensation?.attempts ?? 0, compensatorInvoked: false, persistence: noPersistence(input.authorization ? "compensation_authorization_invalid" : "compensation_authorization_required"), reasonCodes: [input.authorization ? "compensation_authorization_invalid" : "compensation_authorization_required"]});
  if (decision.decision !== "logical_compensation" && !compensator) return result({status: "manual_required", stepId: step.stepId, beforeState: step.state, afterState: step.state, decision, attempt: stored.compensation?.attempts ?? 0, compensatorInvoked: false, persistence: noPersistence("compensator_missing"), reasonCodes: ["compensator_missing"]});
  const startedTransaction = transitionTransactionStep({transaction, stepId: step.stepId, nextState: "compensating", reason: "compensation_started"});
  const startedCompensation = compensationCheckpoint({decision, compensator, previous: stored.compensation, evidence, incrementAttempt: decision.decision !== "logical_compensation"});
  const startedCheckpoint = evolveUniversalTransactionCheckpoint({checkpoint: snapshot.checkpoint, transaction: startedTransaction, step: {stepId: step.stepId, compensationState: "started", compensation: startedCompensation}, event: createTransactionHistoryEvent({kind: "compensation_started", status: "compensating", stepId: step.stepId})});
  const startedPersistence = await input.runtime.checkpointApplication.persist({caseId: input.caseId, transaction: startedTransaction, checkpoint: startedCheckpoint, expectedGlobalCheckpointFingerprint: snapshot.globalCheckpointFingerprint});
  if (!startedPersistence.persisted) return result({status: "blocked", stepId: step.stepId, beforeState: step.state, afterState: step.state, decision, attempt: stored.compensation?.attempts ?? 0, compensatorInvoked: false, persistence: startedPersistence, reasonCodes: startedPersistence.reasons ?? ["checkpoint_conflict"]});
  if (decision.decision === "logical_compensation") {
    const completedTransaction = transitionTransactionStep({transaction: startedTransaction, stepId: step.stepId, nextState: "compensated", reason: "compensation_confirmed"});
    const completedCheckpoint = evolveUniversalTransactionCheckpoint({checkpoint: startedCheckpoint, transaction: completedTransaction, step: {stepId: step.stepId, compensationState: "completed", compensation: startedCompensation, result: {status: "compensated"}}, event: createTransactionHistoryEvent({kind: "compensation_succeeded", status: "logically_compensated", stepId: step.stepId})});
    const persistence = await input.runtime.checkpointApplication.persist({caseId: input.caseId, transaction: completedTransaction, checkpoint: completedCheckpoint, expectedGlobalCheckpointFingerprint: startedPersistence.checkpointFingerprint ?? snapshot.globalCheckpointFingerprint});
    return result({status: persistence.persisted ? "logically_compensated" : "reconciliation_required", stepId: step.stepId, beforeState: step.state, afterState: persistence.persisted ? "compensated" : "reconciliation_required", decision, attempt: stored.compensation?.attempts ?? 0, compensatorInvoked: false, persistence, reasonCodes: persistence.persisted ? ["logical_compensation_recorded"] : ["logical_compensation_persistence_failed"], reconciliationRequired: !persistence.persisted, doNotRetryCompensation: !persistence.persisted});
  }
  const signal = input.signal ?? new AbortController().signal;
  let compensationResult: Awaited<ReturnType<TransactionCompensator["compensate"]>>;
  try {
    compensationResult = await compensator!.compensate({transactionFingerprint: transaction.transactionFingerprint, step, reference: evidence?.references?.[0], inverseTransform: evidence?.inverseTransform, idempotencyKey: `transaction-compensation:${decision.fingerprint}`, signal});
  } catch (error) {
    compensationResult = {status: "reconciliation_required", errorCode: signal.aborted ? "compensation_cancelled_uncertain" : "compensator_exception_uncertain", evidenceFingerprint: error instanceof Error ? computeUniversalFingerprint(error.name as unknown as ReviewJsonValue) : undefined};
  }
  const nextState = compensationResult.status === "compensated" ? "compensated" : compensationResult.status === "failed_deterministic" ? "compensation_failed" : "reconciliation_required";
  const reason = compensationResult.status === "compensated" ? "compensation_confirmed" : compensationResult.status === "failed_deterministic" ? "compensation_failed" : "uncertain_effect";
  const completedTransaction = transitionTransactionStep({transaction: startedTransaction, stepId: step.stepId, nextState, reason});
  const completedCompensation = compensationCheckpoint({decision, compensator, previous: startedCompensation, evidence, errorCode: compensationResult.errorCode, evidenceFingerprint: compensationResult.evidenceFingerprint});
  const eventKind = compensationResult.status === "compensated" ? "compensation_succeeded" : compensationResult.status === "failed_deterministic" ? "compensation_failed" : "compensation_reconciliation_required";
  const completedCheckpoint = evolveUniversalTransactionCheckpoint({checkpoint: startedCheckpoint, transaction: completedTransaction, step: {stepId: step.stepId, compensationState: compensationResult.status === "compensated" ? "completed" : compensationResult.status === "failed_deterministic" ? "failed" : "started", compensation: completedCompensation, reconciliationReasonCodes: compensationResult.status === "reconciliation_required" ? [compensationResult.errorCode ?? "compensation_uncertain"] : undefined, result: compensationResult.status === "compensated" ? {status: "compensated", evidenceFingerprint: compensationResult.evidenceFingerprint} : undefined}, event: createTransactionHistoryEvent({kind: eventKind, status: compensationResult.status, stepId: step.stepId, reasonCodes: compensationResult.errorCode ? [compensationResult.errorCode] : undefined})});
  const persistence = await input.runtime.checkpointApplication.persist({caseId: input.caseId, transaction: completedTransaction, checkpoint: completedCheckpoint, expectedGlobalCheckpointFingerprint: startedPersistence.checkpointFingerprint ?? snapshot.globalCheckpointFingerprint});
  if (!persistence.persisted) return result({status: "reconciliation_required", stepId: step.stepId, beforeState: step.state, afterState: "reconciliation_required", decision, attempt: startedCompensation.attempts, compensatorInvoked: true, persistence, reasonCodes: ["post_compensation_persistence_failed"], reconciliationRequired: true, doNotRetryCompensation: true});
  return result({status: compensationResult.status === "compensated" ? "compensated" : compensationResult.status, stepId: step.stepId, beforeState: step.state, afterState: nextState, decision, attempt: startedCompensation.attempts, compensatorInvoked: true, persistence, reasonCodes: [compensationResult.errorCode ?? compensationResult.status], reconciliationRequired: compensationResult.status === "reconciliation_required", doNotRetryCompensation: compensationResult.status === "reconciliation_required"});
}

export function executeTransactionCompensation(input: {caseId: string; transaction: UniversalTransactionPlan; stepId: string; expectedTransactionFingerprint: string; expectedCheckpointFingerprint: string; runtime: TransactionCompensationRuntime; authorization?: TransactionCompensationAuthorization; signal?: AbortSignal}): Promise<TransactionCompensationExecutionResult> {
  const key = `${input.transaction.transactionFingerprint}:${input.stepId}:compensation`;
  const active = activeCompensations.get(key);
  if (active) return active;
  const task = executeOnce(input).finally(() => activeCompensations.delete(key));
  activeCompensations.set(key, task);
  return task;
}

export function prepareExplicitCompensationRetry(state: TransactionLifecycleState, stepId: string, registry: TransactionCompensatorRegistry): TransactionLifecycleState {
  const step = state.transaction.steps.find((candidate) => candidate.stepId === stepId);
  const stored = state.checkpoint.steps.find((candidate) => candidate.stepId === stepId);
  if (!step || !stored?.compensation?.compensatorId) throw new Error("compensation_retry_context_missing");
  const compensator = registry.get(stored.compensation.compensatorId);
  if (!compensator || compensator.retry === "never" || step.state !== "compensation_failed") throw new Error("compensation_retry_not_allowed");
  const transaction = transitionTransactionStep({transaction: state.transaction, stepId, nextState: "succeeded", reason: "explicit_retry"});
  const checkpoint = evolveUniversalTransactionCheckpoint({checkpoint: state.checkpoint, transaction, step: {stepId, compensationState: "required", compensation: stored.compensation}, event: createTransactionHistoryEvent({kind: "step_retry_prepared", status: transaction.phase, stepId, reasonCodes: ["explicit_compensation_retry"]})});
  return {transaction, checkpoint};
}

export function projectCompensationReconciliation(state: TransactionLifecycleState, input: {stepId: string; outcome: "confirmed_succeeded" | "confirmed_not_applied" | "conflicting" | "insufficient"; evidenceFingerprint?: string}): Readonly<{status: "compensated" | "retry_available" | "blocked"; state: TransactionLifecycleState; compensatorInvoked: false}> {
  if (input.outcome === "conflicting" || input.outcome === "insufficient") return {status: "blocked", state, compensatorInvoked: false};
  const nextState = input.outcome === "confirmed_succeeded" ? "compensated" : "succeeded";
  const reason = input.outcome === "confirmed_succeeded" ? "compensation_reconciliation_confirmed_succeeded" : "compensation_reconciliation_confirmed_not_applied";
  const transaction = transitionTransactionStep({transaction: state.transaction, stepId: input.stepId, nextState, reason});
  const stored = state.checkpoint.steps.find((step) => step.stepId === input.stepId);
  const compensation = stored?.compensation ? {...stored.compensation, evidenceFingerprint: input.evidenceFingerprint ?? stored.compensation.evidenceFingerprint} : undefined;
  const checkpoint = evolveUniversalTransactionCheckpoint({checkpoint: state.checkpoint, transaction, step: {stepId: input.stepId, compensationState: input.outcome === "confirmed_succeeded" ? "completed" : "required", compensation, result: input.outcome === "confirmed_succeeded" ? {status: "compensated", evidenceFingerprint: input.evidenceFingerprint} : undefined}, event: createTransactionHistoryEvent({kind: "step_reconciliation_applied", status: transaction.phase, stepId: input.stepId, reasonCodes: [input.outcome]})});
  return {status: input.outcome === "confirmed_succeeded" ? "compensated" : "retry_available", state: {transaction, checkpoint}, compensatorInvoked: false};
}

export function deriveTransactionSagaOutcome(transaction: UniversalTransactionPlan, plan = deriveControlledCompensationPlan(transaction)): TransactionSagaOutcome {
  const appliedStepIds = transaction.steps.filter((step) => step.mode !== "read_only" && (step.state === "succeeded" || step.state === "reused")).map((step) => step.stepId).sort();
  const compensatedStepIds = transaction.steps.filter((step) => step.state === "compensated").map((step) => step.stepId).sort();
  const uncertainStepIds = transaction.steps.filter((step) => step.state === "reconciliation_required").map((step) => step.stepId).sort();
  const manualStepIds = [...plan.manualStepIds].sort();
  let status: TransactionSagaOutcome["status"] = transaction.phase === "completed" ? "completed" : "failed_preserving_effects";
  if (uncertainStepIds.length) status = "reconciliation_required";
  else if (manualStepIds.length) status = "manual_intervention_required";
  else if (compensatedStepIds.length && appliedStepIds.length) status = "partially_compensated";
  else if (compensatedStepIds.length) status = "compensated";
  const reasonCodes = [...new Set([...plan.decisions.flatMap((decision) => decision.reasonCodes), ...uncertainStepIds.map((id) => `uncertain:${id}`)])].sort();
  const base = {status, appliedStepIds, compensatedStepIds, uncertainStepIds, manualStepIds, reasonCodes};
  return Object.freeze({...base, fingerprint: computeUniversalFingerprint(base as unknown as ReviewJsonValue)});
}

export const sagaCompensationSecurity = Object.freeze({preserveByDefault: true, automaticRollback: false, automaticDelete: false, automaticRetry: false, persistsAuthorization: false, persistsPayload: false, requiresReconciliationForUncertainty: true});
