import {isSerializableReviewValue} from "../cases/validateResolution";
import type {ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {deriveTransactionPhase} from "./stateMachine";
import {UNIVERSAL_TRANSACTION_SCHEMA_VERSION, type TransactionCompensationCheckpoint, type TransactionCreationGuardCheckpoint, type TransactionEffectReference, type TransactionHistoryEvent, type TransactionHistoryEventKind, type TransactionStepCheckpoint, type TransactionStepResultSummary, type UniversalTransactionCheckpoint, type UniversalTransactionPlan} from "./types";

const FORBIDDEN_KEY = /^(token|headers?|cookie|password|api[_-]?key|stack|client|groq|payload|document)$/i;
const nowDefault = () => new Date().toISOString();

function forbiddenKeys(value: unknown, path = "root"): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => forbiddenKeys(item, `${path}[${index}]`));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => FORBIDDEN_KEY.test(key) ? [`${path}.${key}`] : forbiddenKeys(child, `${path}.${key}`));
}

function historyIdentity(input: {kind: TransactionHistoryEventKind; status: string; stepId?: string; reasonCodes?: readonly string[]}): string {
  return computeUniversalFingerprint({kind: input.kind, status: input.status, stepId: input.stepId ?? null, reasonCodes: [...(input.reasonCodes ?? [])].sort()} as unknown as ReviewJsonValue);
}

export function createTransactionHistoryEvent(input: {kind: TransactionHistoryEventKind; status: string; stepId?: string; reasonCodes?: readonly string[]; occurredAt?: string}): TransactionHistoryEvent {
  const identity = historyIdentity(input);
  return Object.freeze({id: `transaction-history:${input.kind}:${identity.slice(-16)}`, kind: input.kind, status: input.status, stepId: input.stepId, reasonCodes: input.reasonCodes ? Object.freeze([...new Set(input.reasonCodes)].sort()) : undefined, occurredAt: input.occurredAt ?? nowDefault()});
}

export function appendTransactionHistory(history: readonly TransactionHistoryEvent[], entry: TransactionHistoryEvent, limit = 100): readonly TransactionHistoryEvent[] {
  const byId = new Map(history.map((item) => [item.id, item]));
  if (!byId.has(entry.id)) byId.set(entry.id, entry);
  return Object.freeze([...byId.values()].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id)).slice(-limit));
}

function checkpointSemantic(input: Omit<UniversalTransactionCheckpoint, "checkpointFingerprint" | "createdAt" | "updatedAt">) {
  return {...input, steps: input.steps.map((step) => Object.fromEntries(Object.entries(step).filter(([key]) => key !== "updatedAt"))), history: input.history.map((event) => Object.fromEntries(Object.entries(event).filter(([key]) => key !== "occurredAt")))};
}

function stepCheckpoint(transaction: UniversalTransactionPlan, stepId: string, previous?: TransactionStepCheckpoint, input?: {attempts?: number; references?: readonly TransactionEffectReference[]; reconciliationReasonCodes?: readonly string[]; compensationState?: TransactionStepCheckpoint["compensationState"]; compensation?: TransactionCompensationCheckpoint; lastErrorCode?: string; result?: TransactionStepResultSummary; updatedAt?: string}): TransactionStepCheckpoint {
  const step = transaction.steps.find((candidate) => candidate.stepId === stepId);
  if (!step) throw new Error(`transaction_checkpoint_step_missing:${stepId}`);
  return Object.freeze({stepId, operationId: step.operationId, state: step.state, attempts: input?.attempts ?? previous?.attempts ?? 0, idempotencyKeyFingerprint: computeUniversalFingerprint(step.idempotencyKey as unknown as ReviewJsonValue), references: Object.freeze([...(input?.references ?? previous?.references ?? [])]), reconciliationReasonCodes: Object.freeze([...new Set(input?.reconciliationReasonCodes ?? previous?.reconciliationReasonCodes ?? [])].sort()), compensationState: input?.compensationState ?? previous?.compensationState, compensation: input?.compensation ?? previous?.compensation, lastErrorCode: input?.lastErrorCode ?? previous?.lastErrorCode, result: input?.result ?? previous?.result, updatedAt: input?.updatedAt ?? previous?.updatedAt});
}

function summaries(steps: readonly TransactionStepCheckpoint[]): Pick<UniversalTransactionCheckpoint, "executionSummary" | "reconciliationSummary" | "compensationSummary"> {
  const attemptedStepIds = steps.filter((step) => step.attempts > 0).map((step) => step.stepId).sort();
  const completedStepIds = steps.filter((step) => ["succeeded", "reused", "compensated", "skipped"].includes(step.state)).map((step) => step.stepId).sort();
  const reconciliationStepIds = steps.filter((step) => step.state === "reconciliation_required").map((step) => step.stepId).sort();
  const reasonCodes = [...new Set(steps.flatMap((step) => step.reconciliationReasonCodes))].sort();
  const compensationStepIds = steps.filter((step) => step.compensationState === "required" || step.compensationState === "started").map((step) => step.stepId).sort();
  return {
    executionSummary: Object.freeze({attemptedStepIds, completedStepIds, fingerprint: computeUniversalFingerprint({attemptedStepIds, completedStepIds} as unknown as ReviewJsonValue)}),
    reconciliationSummary: Object.freeze({stepIds: reconciliationStepIds, reasonCodes, fingerprint: computeUniversalFingerprint({stepIds: reconciliationStepIds, reasonCodes} as unknown as ReviewJsonValue)}),
    compensationSummary: Object.freeze({stepIds: compensationStepIds, required: compensationStepIds.length > 0, fingerprint: computeUniversalFingerprint({stepIds: compensationStepIds, required: compensationStepIds.length > 0} as unknown as ReviewJsonValue)}),
  };
}

export function createUniversalTransactionCheckpoint(transaction: UniversalTransactionPlan, options: {now?: () => string; history?: readonly TransactionHistoryEvent[]; creationGuards?: readonly TransactionCreationGuardCheckpoint[]; operatorState?: UniversalTransactionCheckpoint["operatorState"]} = {}): UniversalTransactionCheckpoint {
  const occurredAt = (options.now ?? nowDefault)();
  const history = appendTransactionHistory(options.history ?? [], createTransactionHistoryEvent({kind: "transaction_planned", status: transaction.phase, occurredAt}), transaction.policies.historyLimit);
  const steps = Object.freeze(transaction.steps.map((step) => stepCheckpoint(transaction, step.stepId, undefined, {updatedAt: occurredAt})));
  const guards = options.creationGuards ? Object.freeze([...options.creationGuards].sort((left, right) => left.operationId.localeCompare(right.operationId))) : undefined;
  const base: Omit<UniversalTransactionCheckpoint, "checkpointFingerprint" | "createdAt" | "updatedAt"> = {schemaVersion: UNIVERSAL_TRANSACTION_SCHEMA_VERSION, transactionId: transaction.transactionId, transactionFingerprint: transaction.transactionFingerprint, sourcePlanFingerprint: transaction.sourcePlanFingerprint, sourceCheckpointFingerprint: transaction.contextBinding.sourceCheckpointFingerprint, phase: transaction.phase, operatorState: options.operatorState ?? "active", steps, creationGuards: guards, ...summaries(steps), blockers: Object.freeze([...transaction.blockers]), history};
  const checkpointFingerprint = computeUniversalFingerprint(checkpointSemantic(base) as unknown as ReviewJsonValue);
  const checkpoint = Object.freeze({...base, checkpointFingerprint, createdAt: occurredAt, updatedAt: occurredAt});
  const validation = validateUniversalTransactionCheckpoint(checkpoint, transaction);
  if (!validation.valid) throw new Error(`transaction_checkpoint_invalid:${validation.reasons.join(",")}`);
  return checkpoint;
}

export function evolveUniversalTransactionCheckpoint(input: {checkpoint: UniversalTransactionCheckpoint; transaction: UniversalTransactionPlan; step?: {stepId: string; attempts?: number; references?: readonly TransactionEffectReference[]; reconciliationReasonCodes?: readonly string[]; compensationState?: TransactionStepCheckpoint["compensationState"]; compensation?: TransactionCompensationCheckpoint; lastErrorCode?: string; result?: TransactionStepResultSummary}; event?: TransactionHistoryEvent; operatorState?: UniversalTransactionCheckpoint["operatorState"]; now?: () => string}): UniversalTransactionCheckpoint {
  if (input.checkpoint.transactionFingerprint !== input.transaction.transactionFingerprint) throw new Error("transaction_checkpoint_binding_mismatch");
  const previous = new Map(input.checkpoint.steps.map((step) => [step.stepId, step]));
  const updatedAt = (input.now ?? nowDefault)();
  const steps = input.transaction.steps.map((step) => stepCheckpoint(input.transaction, step.stepId, previous.get(step.stepId), input.step?.stepId === step.stepId ? {...input.step, updatedAt} : undefined));
  const history = input.event ? appendTransactionHistory(input.checkpoint.history, input.event, input.transaction.policies.historyLimit) : input.checkpoint.history;
  const frozenSteps = Object.freeze(steps);
  const base: Omit<UniversalTransactionCheckpoint, "checkpointFingerprint" | "createdAt" | "updatedAt"> = {schemaVersion: UNIVERSAL_TRANSACTION_SCHEMA_VERSION, transactionId: input.transaction.transactionId, transactionFingerprint: input.transaction.transactionFingerprint, sourcePlanFingerprint: input.transaction.sourcePlanFingerprint, sourceCheckpointFingerprint: input.transaction.contextBinding.sourceCheckpointFingerprint, phase: deriveTransactionPhase(input.transaction.steps, input.transaction.blockers.length > 0), operatorState: input.operatorState ?? input.checkpoint.operatorState ?? "active", steps: frozenSteps, creationGuards: input.checkpoint.creationGuards, ...summaries(frozenSteps), blockers: Object.freeze([...input.transaction.blockers]), history};
  const checkpointFingerprint = computeUniversalFingerprint(checkpointSemantic(base) as unknown as ReviewJsonValue);
  const next = Object.freeze({...base, checkpointFingerprint, createdAt: input.checkpoint.createdAt, updatedAt});
  const validation = validateUniversalTransactionCheckpoint(next, input.transaction);
  if (!validation.valid) throw new Error(`transaction_checkpoint_invalid:${validation.reasons.join(",")}`);
  return next;
}

export function validateUniversalTransactionCheckpoint(value: unknown, transaction?: UniversalTransactionPlan): Readonly<{valid: boolean; reasons: readonly string[]}> {
  const reasons: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return {valid: false, reasons: ["transaction_checkpoint_object_required"]};
  const checkpoint = value as UniversalTransactionCheckpoint;
  if (checkpoint.schemaVersion !== UNIVERSAL_TRANSACTION_SCHEMA_VERSION || !checkpoint.transactionId || !checkpoint.transactionFingerprint || !checkpoint.sourcePlanFingerprint || !checkpoint.checkpointFingerprint || !checkpoint.createdAt || !checkpoint.updatedAt || !Array.isArray(checkpoint.steps) || !Array.isArray(checkpoint.blockers) || !Array.isArray(checkpoint.history)) reasons.push("transaction_checkpoint_shape_invalid");
  if (checkpoint.operatorState !== undefined && !["active", "paused"].includes(checkpoint.operatorState)) reasons.push("transaction_checkpoint_operator_state_invalid");
  if (!isSerializableReviewValue(value)) reasons.push("transaction_checkpoint_not_serializable");
  if (forbiddenKeys(value).length) reasons.push("transaction_checkpoint_sensitive_key");
  if (new Set(checkpoint.steps?.map((step) => step.stepId)).size !== checkpoint.steps?.length) reasons.push("transaction_checkpoint_step_duplicate");
  for (const step of checkpoint.steps ?? []) if (!Number.isInteger(step.attempts) || step.attempts < 0 || !Array.isArray(step.references) || !Array.isArray(step.reconciliationReasonCodes) || step.operationId !== undefined && !step.operationId || step.idempotencyKeyFingerprint !== undefined && !String(step.idempotencyKeyFingerprint).startsWith("sha256-v1:")) reasons.push("transaction_checkpoint_step_invalid");
  if (checkpoint.creationGuards !== undefined) {
    if (!Array.isArray(checkpoint.creationGuards) || new Set(checkpoint.creationGuards.map((guard) => guard.operationId)).size !== checkpoint.creationGuards.length) reasons.push("transaction_checkpoint_creation_guards_invalid");
    for (const guard of checkpoint.creationGuards ?? []) if (!guard.operationId || !guard.entityType || !guard.identityFingerprint || !guard.discoveryFingerprint || !guard.resolutionFingerprint || !guard.guardFingerprint || !guard.fingerprint || !["safe_to_create", "safe_to_reuse", "blocked"].includes(guard.decision) || !Array.isArray(guard.blockerCodes)) reasons.push("transaction_checkpoint_creation_guard_invalid");
  }
  if (checkpoint.phase !== deriveTransactionPhase((checkpoint.steps ?? []) as unknown as import("./types").TransactionStep[], (checkpoint.blockers?.length ?? 0) > 0)) reasons.push("transaction_checkpoint_phase_inconsistent");
  if (transaction) {
    if (checkpoint.transactionId !== transaction.transactionId || checkpoint.transactionFingerprint !== transaction.transactionFingerprint || checkpoint.sourcePlanFingerprint !== transaction.sourcePlanFingerprint) reasons.push("transaction_checkpoint_transaction_mismatch");
    const expected = new Set(transaction.steps.map((step) => step.stepId));
    if (checkpoint.steps.some((step) => !expected.has(step.stepId)) || checkpoint.steps.length !== expected.size) reasons.push("transaction_checkpoint_inventory_mismatch");
  }
  const base = Object.fromEntries(Object.entries(checkpoint).filter(([key]) => !["checkpointFingerprint", "createdAt", "updatedAt"].includes(key))) as Omit<UniversalTransactionCheckpoint, "checkpointFingerprint" | "createdAt" | "updatedAt">;
  if (computeUniversalFingerprint(checkpointSemantic(base) as unknown as ReviewJsonValue) !== checkpoint.checkpointFingerprint) reasons.push("transaction_checkpoint_fingerprint_mismatch");
  return {valid: reasons.length === 0, reasons: Object.freeze([...new Set(reasons)].sort())};
}

export const transactionCheckpointSecurity = Object.freeze({payloads: false, documents: false, tokens: false, headers: false, clients: false, groq: false, stacks: false, writes: false});
