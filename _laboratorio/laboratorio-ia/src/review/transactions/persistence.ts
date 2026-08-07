import type {ReviewCase} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {fingerprintGlobalResolutionCheckpointSource} from "../globalResolution/checkpoint/fingerprints";
import {retargetGlobalResolutionCheckpoint, validateGlobalResolutionCheckpoint} from "../globalResolution/checkpoint/checkpoint";
import type {GlobalResolutionCheckpoint} from "../globalResolution/checkpoint/types";
import type {IdentityCreationAuthorization} from "../globalResolution/identityCreationGuard";
import {updateGlobalResolutionCheckpoint} from "../store/reviewStore";
import {createUniversalTransactionCheckpoint} from "./checkpoint";
import type {TransactionCheckpointPersistence, TransactionCreationGuardCheckpoint, UniversalTransactionCheckpoint, UniversalTransactionPlan} from "./types";

type GuardNormalization = Readonly<{ok: true; guards: readonly TransactionCreationGuardCheckpoint[]; legacy: boolean}> | Readonly<{ok: false; reasons: readonly string[]}>;
const guardOperationId = (guard: IdentityCreationAuthorization) => "authorizationFingerprint" in guard ? guard.creationOperationId : guard.operationId;

function compactGuard(guard: IdentityCreationAuthorization): TransactionCreationGuardCheckpoint {
  const legacy = "authorizationFingerprint" in guard;
  const operationId = guardOperationId(guard);
  const decision = legacy
    ? guard.decision === "create_new" ? "safe_to_create" : guard.decision === "reuse_existing" ? "safe_to_reuse" : "blocked"
    : guard.state === "safe_to_create" ? "safe_to_create" : guard.state === "safe_to_reuse" ? "safe_to_reuse" : "blocked";
  const base = {
    operationId,
    entityType: legacy ? (guard.entityType ?? "fighter") : guard.entityType,
    identityFingerprint: guard.identityFingerprint,
    discoveryFingerprint: legacy ? guard.discoveryResultFingerprint : guard.discovery.resultFingerprint,
    resolutionFingerprint: legacy ? guard.requestFingerprint : guard.resolution.resolutionFingerprint,
    guardFingerprint: legacy ? guard.authorizationFingerprint : guard.guardFingerprint,
    decision,
    candidateId: legacy ? guard.resolvedEntityId : guard.resolution.candidateId,
    blockerCodes: legacy ? (decision === "blocked" ? [guard.reasonCode] : []) : guard.blockers.map((blocker) => blocker.code).sort(),
  } as const;
  return Object.freeze({...base, fingerprint: computeUniversalFingerprint(base as unknown as import("../types").ReviewJsonValue)});
}

/** Read-only legacy migration. It intentionally never writes the source checkpoint. */
export function normalizeTransactionCreationGuards(input: {identityGuards?: readonly IdentityCreationAuthorization[]; identityGuard?: IdentityCreationAuthorization; transaction?: UniversalTransactionPlan}): GuardNormalization {
  const supplied = [...(input.identityGuards ?? []), ...(input.identityGuard ? [input.identityGuard] : [])];
  const legacy = !input.identityGuards?.length && Boolean(input.identityGuard);
  const byOperation = new Map<string, TransactionCreationGuardCheckpoint>();
  const reasons: string[] = [];
  for (const guard of supplied) {
    const compact = compactGuard(guard);
    const previous = byOperation.get(compact.operationId);
    if (previous && previous.fingerprint !== compact.fingerprint) reasons.push(`creation_guard_duplicate_incompatible:${compact.operationId}`);
    else byOperation.set(compact.operationId, compact);
  }
  if (input.transaction) {
    const creates = input.transaction.steps.filter((step) => step.operationKind === "create_entity");
    for (const create of creates) {
      const guard = byOperation.get(create.operationId);
      if (!guard) reasons.push(`creation_guard_missing:${create.operationId}`);
      else if (guard.decision !== "safe_to_create") reasons.push(`creation_guard_not_creatable:${create.operationId}`);
    }
    if (legacy && creates.length > 1) reasons.push("legacy_single_guard_insufficient_for_multiple_creates");
  }
  return reasons.length ? {ok: false, reasons: Object.freeze([...new Set(reasons)].sort())} : {ok: true, guards: Object.freeze([...byOperation.values()].sort((left, right) => left.operationId.localeCompare(right.operationId))), legacy};
}

export function createTransactionCheckpointExtension(input: {transaction: UniversalTransactionPlan; checkpoint: Pick<GlobalResolutionCheckpoint, "identityGuard" | "identityGuards" | "planFingerprint">; now?: () => string}): UniversalTransactionCheckpoint {
  if (input.transaction.sourcePlanFingerprint !== input.checkpoint.planFingerprint) throw new Error("transaction_checkpoint_source_plan_mismatch");
  const guards = normalizeTransactionCreationGuards({...input.checkpoint, transaction: input.transaction});
  if (!guards.ok) throw new Error(`transaction_checkpoint_creation_guards_invalid:${guards.reasons.join(",")}`);
  return createUniversalTransactionCheckpoint(input.transaction, {now: input.now, creationGuards: guards.guards});
}

export function persistTransactionCheckpointExtension(input: {reviewCase: ReviewCase; transaction: UniversalTransactionPlan; checkpoint: UniversalTransactionCheckpoint; expectedCheckpointFingerprint: string; expectedCaseVersion?: number; now?: Date}): TransactionCheckpointPersistence {
  if (input.expectedCaseVersion !== undefined && input.expectedCaseVersion !== input.reviewCase.version) return {persisted: false, conflict: true, reasons: ["case_version_mismatch"]};
  if (input.checkpoint.transactionFingerprint !== input.transaction.transactionFingerprint || input.checkpoint.sourcePlanFingerprint !== input.transaction.sourcePlanFingerprint) return {persisted: false, conflict: false, reasons: ["transaction_checkpoint_binding_mismatch"]};
  try {
    const saved = updateGlobalResolutionCheckpoint(input.reviewCase.id, input.reviewCase.version, (current) => {
      if (!current) throw new Error("transaction_global_checkpoint_absent");
      if (current.planFingerprint !== input.transaction.sourcePlanFingerprint) throw new Error("transaction_source_plan_mismatch");
      if (current.checkpointFingerprint !== input.expectedCheckpointFingerprint) throw new Error("transaction_checkpoint_conflict");
      const guards = normalizeTransactionCreationGuards({...current, transaction: input.transaction});
      if (!guards.ok) throw new Error(`transaction_guard_invalid:${guards.reasons.join(",")}`);
      if (input.checkpoint.creationGuards && computeUniversalFingerprint(input.checkpoint.creationGuards as unknown as import("../types").ReviewJsonValue) !== computeUniversalFingerprint(guards.guards as unknown as import("../types").ReviewJsonValue)) throw new Error("transaction_guard_stale");
      return {...current, transaction: input.checkpoint};
    }, input.now, input.expectedCheckpointFingerprint);
    return saved?.globalResolution ? {persisted: true, conflict: false, checkpointFingerprint: saved.globalResolution.checkpointFingerprint} : {persisted: false, conflict: false, reasons: ["transaction_checkpoint_not_saved"]};
  } catch (error) {
    const message = error instanceof Error ? error.message : "transaction_checkpoint_persist_failed";
    const conflict = /cambió|mismatch|conflict|obsoleto/i.test(message);
    return {persisted: false, conflict, reasons: [message]};
  }
}

/** Pure attachment for callers that need to preview the AU3 projection before persistence. */
export function attachTransactionCheckpointExtension(input: {reviewCase: ReviewCase; checkpoint: GlobalResolutionCheckpoint; transaction: UniversalTransactionCheckpoint; now: string}): GlobalResolutionCheckpoint {
  const next = retargetGlobalResolutionCheckpoint({...input.checkpoint, transaction: input.transaction}, input.reviewCase, input.now);
  const validation = validateGlobalResolutionCheckpoint(next);
  if (!validation.ok) throw new Error(`transaction_checkpoint_attachment_invalid:${validation.reasons.join(",")}`);
  return validation.value;
}

export function transactionSourceCheckpointFingerprint(checkpoint: GlobalResolutionCheckpoint): string {
  return fingerprintGlobalResolutionCheckpointSource(checkpoint);
}
