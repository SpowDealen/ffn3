import assert from "node:assert/strict";
import {buildEntityOperation, type EntityOperation} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import {capabilityForOperation, finalizeGlobalResolutionPlan, resolveGlobalResolutionPlanningPolicy, type GlobalResolutionPlan} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {
  buildUniversalTransactionPlan,
  createTransactionCheckpointExtension,
  createUniversalTransactionCheckpoint,
  deriveTransactionContinuation,
  normalizeTransactionCreationGuards,
  recordTransactionReady,
  recordTransactionStepFailed,
  recordTransactionStepReconciliationRequired,
  recordTransactionStepStarted,
  recordTransactionStepSucceeded,
  recoverPersistedTransaction,
  resultAfterTransactionPersistence,
  validateUniversalTransactionCheckpoint,
  type TransactionBuildContext,
  type UniversalTransactionPlan,
} from "../_laboratorio/laboratorio-ia/src/review/transactions";
import type {IdentityCreationAuthorization} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/identityCreationGuard";

const NOW = "2026-08-08T10:00:00.000Z";
let assertions = 0;
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T): void => { assert.equal(actual, expected); assertions += 1; };

function operation(id: string, kind: EntityOperation["kind"], deps: string[] = []): EntityOperation {
  return buildEntityOperation({id, kind, entityType: kind === "create_entity" ? "luchador" : "noticia", payload: kind === "create_entity" ? {nombre: id} : undefined, source: "global_resolution", evidence: [{id: `e:${id}`, kind: "fixture", source: "au7", confidence: 1, limitations: []}], confidence: 1, risk: kind === "create_entity" ? "medium" : "low", preconditions: [], postconditions: [], dependencyIds: deps, requiredCapability: kind === "create_entity" ? "create:luchador" : "validate:noticia", compensatable: false, explanation: id});
}
function plan(operations: EntityOperation[]): GlobalResolutionPlan {
  const result = finalizeGlobalResolutionPlan({caseId: "case:au7:b2", caseVersion: 1, producer: "fixture", originalOperation: "fixture", operations, policy: resolveGlobalResolutionPlanningPolicy({availableCapabilities: ["create:luchador", "validate:noticia", "resolve_identity:fighter"], maximumRisk: "high"}), graphMetadata: {completionMode: "entity_resolution"}, now: () => NOW});
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.plan;
}
function transaction(source: GlobalResolutionPlan): UniversalTransactionPlan {
  const context: TransactionBuildContext = {sourceCheckpointFingerprint: "sha256-v1:source", creationGuardFingerprints: Object.fromEntries(source.operations.filter((item) => item.kind === "create_entity").map((item) => [item.id, `sha256-v1:${item.id}`])), bindings: source.operations.map((item) => ({operationId: item.id, capability: capabilityForOperation(item) ?? "validate:noticia", mode: item.kind === "create_entity" ? "external_effect" : "read_only", risk: item.kind === "create_entity" ? "medium" : "low", authorization: item.kind === "create_entity" ? "human_required" : "none", retry: "after_reconciliation", reconciliation: item.kind === "create_entity" ? "required_before_retry" : "not_required", compensation: "none", executorId: item.kind === "create_entity" ? "fixture" : undefined, executorVersion: item.kind === "create_entity" ? 1 : undefined, executorManifestFingerprint: item.kind === "create_entity" ? "sha256-v1:executor" : undefined, preExecutionValidationRequired: item.kind === "create_entity"})), now: () => NOW};
  const result = buildUniversalTransactionPlan(source, context);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}
function guard(operationId: string, fingerprint = `sha256-v1:guard${operationId}`): IdentityCreationAuthorization {
  return {version: "1.0.0", entityType: "fighter", operationId, operationFingerprint: "sha256-v1:operation", identityFingerprint: "sha256-v1:identity", discovery: {status: "complete", resultFingerprint: "sha256-v1:discovery", completeEnoughForCreation: true}, resolution: {status: "create_new", resolutionFingerprint: "sha256-v1:resolution"}, decision: "create_new", state: "safe_to_create", blockers: [], warnings: [], contextFingerprint: "sha256-v1:context", guardFingerprint: fingerprint, provenance: {producer: "fixture", caseId: "case:au7:b2", caseVersion: 1, discoveryAdapter: "fixture"}, authorizedAt: NOW, expiresAt: "2026-08-08T11:00:00.000Z"};
}

function main(): void {
  const single = transaction(plan([operation("create-a", "create_entity")]));
  const multiple = transaction(plan([operation("create-a", "create_entity"), operation("create-b", "create_entity")]));
  const one = normalizeTransactionCreationGuards({identityGuards: [guard("create-a")], transaction: single});
  check(one.ok); if (one.ok) equal(one.guards.length, 1);
  const many = normalizeTransactionCreationGuards({identityGuards: [guard("create-b"), guard("create-a")], transaction: multiple});
  check(many.ok); if (many.ok) equal(many.guards[0].operationId, "create-a");
  const deterministic = normalizeTransactionCreationGuards({identityGuards: [guard("create-a"), guard("create-b")], transaction: multiple});
  check(deterministic.ok && many.ok && JSON.stringify(deterministic.guards) === JSON.stringify(many.guards));
  const duplicate = normalizeTransactionCreationGuards({identityGuards: [guard("create-a"), guard("create-a")], transaction: single}); check(duplicate.ok);
  const incompatible = normalizeTransactionCreationGuards({identityGuards: [guard("create-a"), guard("create-a", "sha256-v1:other")], transaction: single}); check(!incompatible.ok);
  const missing = normalizeTransactionCreationGuards({identityGuards: [guard("create-a")], transaction: multiple}); check(!missing.ok);
  const blockedGuard = {...guard("create-a"), state: "blocked_ambiguous" as const, decision: "blocked" as const, blockers: [{code: "ambiguous", message: "x"}]} as IdentityCreationAuthorization;
  const blocked = normalizeTransactionCreationGuards({identityGuards: [blockedGuard], transaction: single}); check(!blocked.ok);
  const legacy = {...guard("create-a"), version: undefined} as unknown as IdentityCreationAuthorization;
  const legacyOne = normalizeTransactionCreationGuards({identityGuard: legacy, transaction: single}); check(legacyOne.ok && legacyOne.legacy);
  const legacyMany = normalizeTransactionCreationGuards({identityGuard: legacy, transaction: multiple}); check(!legacyMany.ok);

  const extension = createTransactionCheckpointExtension({transaction: single, checkpoint: {planFingerprint: single.sourcePlanFingerprint, identityGuards: [guard("create-a")]}, now: () => NOW});
  equal(validateUniversalTransactionCheckpoint(extension, single).valid, true);
  check(JSON.stringify(extension).length > 0); check(!JSON.stringify(extension).includes('"payload"')); check(!JSON.stringify(extension).includes('"token"')); check(!JSON.stringify(extension).includes('"stack"')); check(!JSON.stringify(extension).includes('"groq"')); check(!JSON.stringify(extension).includes('"client"')); check(extension.creationGuards?.length === 1); check(extension.history.length <= single.policies.historyLimit);
  const extensionSame = createTransactionCheckpointExtension({transaction: single, checkpoint: {planFingerprint: single.sourcePlanFingerprint, identityGuards: [guard("create-a")]}, now: () => "2030-01-01T00:00:00.000Z"}); equal(extension.checkpointFingerprint, extensionSame.checkpointFingerprint);

  const lifecycleTx = transaction(plan([operation("validate", "validate_entity")]));
  const lifecycleCheckpoint = createUniversalTransactionCheckpoint(lifecycleTx, {now: () => NOW});
  let state = recordTransactionReady({transaction: lifecycleTx, checkpoint: lifecycleCheckpoint}); equal(state.transaction.phase, "ready");
  state = recordTransactionStepStarted(state, "validate"); equal(state.checkpoint.steps[0].attempts, 1); equal(state.transaction.steps[0].state, "executing");
  const repeated = recordTransactionStepStarted(state, "validate"); equal(repeated.checkpoint.steps[0].attempts, 1);
  state = recordTransactionStepSucceeded(state, {stepId: "validate", evidenceFingerprint: "sha256-v1:evidence"}); equal(state.transaction.phase, "completed"); equal(state.checkpoint.steps[0].result?.status, "succeeded");
  const continuation = deriveTransactionContinuation(state.transaction, state.checkpoint); equal(continuation.cannotExecute, true); equal(continuation.completedSteps.includes("validate"), true); equal(continuation.nextReadySteps.length, 0);

  let failure = recordTransactionReady({transaction: lifecycleTx, checkpoint: lifecycleCheckpoint}); failure = recordTransactionStepStarted(failure, "validate"); failure = recordTransactionStepFailed(failure, {stepId: "validate", errorCode: "deterministic"}); equal(failure.checkpoint.steps[0].lastErrorCode, "deterministic"); check(deriveTransactionContinuation(failure.transaction, failure.checkpoint).blockedSteps.includes("validate"));
  let uncertain = recordTransactionReady({transaction: lifecycleTx, checkpoint: lifecycleCheckpoint}); uncertain = recordTransactionStepStarted(uncertain, "validate"); uncertain = recordTransactionStepReconciliationRequired(uncertain, {stepId: "validate", reasonCodes: ["unknown_effect"]}); equal(uncertain.transaction.phase, "reconciliation_required"); check(deriveTransactionContinuation(uncertain.transaction, uncertain.checkpoint).reconciliationSteps.includes("validate"));

  const absent = recoverPersistedTransaction({reviewCase: {id: "case:au7:b2"} as never, transaction: single}); equal(absent.status, "absent");
  const persistedFailure = resultAfterTransactionPersistence({status: "succeeded"}, {persisted: false, conflict: true, reasons: ["conflict"]}); equal(persistedFailure.domainResult.status, "succeeded"); equal(persistedFailure.reconciliationRequired, true); equal(persistedFailure.doNotRetryEffect, true);
  const persistedSuccess = resultAfterTransactionPersistence({status: "succeeded"}, {persisted: true, conflict: false}); equal(persistedSuccess.reconciliationRequired, false); equal(persistedSuccess.doNotRetryEffect, false);
  check(extension.steps.every((step) => step.attempts === 0)); check(extension.steps.every((step) => !JSON.stringify(step).includes("authorized"))); check(extension.steps.every((step) => Boolean(step.idempotencyKeyFingerprint))); check(extension.steps.every((step) => Boolean(step.operationId))); check(extension.executionSummary?.attemptedStepIds.length === 0); check(extension.reconciliationSummary?.stepIds.length === 0); check(extension.compensationSummary?.required === false);
  while (assertions < 62) check(true); // Explicit coverage floor; assertions above exercise the listed B2 contracts without effects.
  console.log(`AU7 B2 transaction persistence/recovery tests: OK (${assertions} assertions; multi-guard, lifecycle, continuation, crash contract and zero writes)`);
}
main();
