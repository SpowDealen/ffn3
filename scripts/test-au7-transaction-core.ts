import assert from "node:assert/strict";
import {buildEntityOperation, type EntityOperation, type EntityOperationKind} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import {capabilityForOperation, finalizeGlobalResolutionPlan, resolveGlobalResolutionPlanningPolicy, type GlobalResolutionPlan} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {
  appendTransactionHistory,
  buildUniversalTransactionPlan,
  canRetryTransactionStep,
  classifyTransactionFailure,
  createTransactionHistoryEvent,
  createUniversalTransactionCheckpoint,
  deriveCompensationPlan,
  deriveExecutableBatch,
  deriveTransactionPhase,
  deriveTransactionStepReadiness,
  detectTransactionStaleness,
  evolveUniversalTransactionCheckpoint,
  recoverUniversalTransaction,
  refreshTransactionReadiness,
  transactionCheckpointSecurity,
  transitionTransactionStep,
  universalTransactionSecurity,
  validateUniversalTransactionCheckpoint,
  validateUniversalTransactionPlan,
  type TransactionBuildContext,
  type TransactionCompensationPolicy,
  type TransactionOperationBinding,
  type TransactionStepState,
  type UniversalTransactionPlan,
} from "../_laboratorio/laboratorio-ia/src/review/transactions";

const NOW = "2026-08-08T10:00:00.000Z";
let assertions = 0;
function check(value: unknown, message?: string): asserts value {
  assert.ok(value, message);
  assertions += 1;
}
function equal<T>(actual: T, expected: T, message?: string): void {
  assert.equal(actual, expected, message);
  assertions += 1;
}
function deepEqual(actual: unknown, expected: unknown, message?: string): void {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}
function throws(action: () => unknown, pattern: RegExp): void {
  assert.throws(action, pattern);
  assertions += 1;
}

const operation = (id: string, kind: EntityOperationKind, entityType: EntityOperation["entityType"], dependencies: string[] = [], capability = `${kind}:${entityType}`, payload?: EntityOperation["payload"]): EntityOperation => buildEntityOperation({
  id,
  kind,
  entityType,
  target: kind === "reuse_entity" ? {entityId: `${entityType}:existing`} : undefined,
  payload,
  source: "global_resolution",
  evidence: [{id: `evidence:${id}`, kind: "fixture", source: "au7", confidence: 1, limitations: []}],
  confidence: 1,
  risk: kind === "create_entity" ? "medium" : "low",
  preconditions: [],
  postconditions: [],
  dependencyIds: dependencies,
  requiredCapability: capability,
  compensatable: kind === "replace_reference",
  explanation: `AU7 fixture ${id}`,
});

function globalPlan(caseId: string, operations: EntityOperation[], options: {caseVersion?: number; completionMode?: "resume_producer" | "entity_resolution"; now?: string} = {}): GlobalResolutionPlan {
  const capabilities = [...new Set(operations.flatMap((item) => item.requiredCapability ? [item.requiredCapability] : []))];
  capabilities.push("resolve_identity:fighter", "resolve_identity:weight_category", "resolve_identity:fight", "resolve_identity:event", "resolve_identity:organization", "resolve_identity:discipline", "resolve_identity:news");
  const result = finalizeGlobalResolutionPlan({caseId, caseVersion: options.caseVersion ?? 1, producer: "fixture_producer", originalOperation: "transaction_fixture", operations, policy: resolveGlobalResolutionPlanningPolicy({availableCapabilities: capabilities, maximumRisk: "high"}), graphMetadata: {completionMode: options.completionMode ?? "entity_resolution"}, now: () => options.now ?? NOW});
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("fixture_plan_invalid");
  return result.plan;
}

function mode(operationValue: EntityOperation): TransactionOperationBinding["mode"] {
  const payload = operationValue.payload && typeof operationValue.payload === "object" && !Array.isArray(operationValue.payload) ? operationValue.payload : undefined;
  if (payload?.scope === "resume") return "external_effect";
  if (["find_entity", "reuse_entity", "validate_entity"].includes(operationValue.kind)) return "read_only";
  if (["replace_reference", "set_metadata"].includes(operationValue.kind)) return "pure_transform";
  return "external_effect";
}

function contextFor(plan: GlobalResolutionPlan, options: {checkpoint?: string; omit?: string; destructive?: string} = {}): TransactionBuildContext {
  const bindings = plan.operations.filter((item) => item.id !== options.omit).map((item): TransactionOperationBinding => {
    const stepMode = mode(item);
    const external = stepMode === "external_effect";
    return {
      operationId: item.id,
      capability: capabilityForOperation(item) ?? item.requiredCapability ?? `capability:${item.kind}`,
      mode: stepMode,
      risk: item.id === options.destructive ? "destructive" : external ? "medium" : "low",
      authorization: external ? "human_required" : "none",
      retry: external ? "after_reconciliation" : "safe_idempotent",
      reconciliation: external ? "required_before_retry" : "not_required",
      compensation: external ? "manual_required" : stepMode === "pure_transform" ? "reversible_transform" : "none",
      executorId: external ? `executor:${item.id}` : undefined,
      executorVersion: external ? 1 : undefined,
      executorManifestFingerprint: external ? `sha256-v1:executor${item.id.replace(/[^a-z0-9]/gi, "")}` : undefined,
      preExecutionValidationRequired: external,
    };
  });
  const creationGuardFingerprints = Object.fromEntries(plan.operations.filter((item) => item.kind === "create_entity").map((item) => [item.id, `sha256-v1:guard${item.id.replace(/[^a-z0-9]/gi, "")}`]));
  return {sourceCheckpointFingerprint: options.checkpoint ?? "sha256-v1:checkpointfixture", producer: {producerId: "fixture_producer", producerVersion: "1.0.0", manifestVersion: "1.0.0", manifestFingerprint: "sha256-v1:producerfixture", capabilityVersions: [], adapterIds: []}, bindings, creationGuardFingerprints, now: () => NOW};
}

function build(plan: GlobalResolutionPlan, context = contextFor(plan)): UniversalTransactionPlan {
  const result = buildUniversalTransactionPlan(plan, context);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("transaction_fixture_invalid");
  return result.value;
}

function withStates(transaction: UniversalTransactionPlan, states: Record<string, TransactionStepState>): UniversalTransactionPlan {
  const steps = transaction.steps.map((step) => Object.freeze({...step, state: states[step.stepId] ?? step.state}));
  return Object.freeze({...transaction, steps: Object.freeze(steps), phase: deriveTransactionPhase(steps, transaction.blockers.length > 0)});
}

function compensationTransaction(transaction: UniversalTransactionPlan, policies: TransactionCompensationPolicy[]): UniversalTransactionPlan {
  const steps = transaction.steps.slice(0, policies.length).map((step, index) => Object.freeze({...step, state: "succeeded" as const, compensation: policies[index], compensatorId: policies[index] === "explicit_compensator" ? `compensator:${index}` : undefined}));
  return Object.freeze({...transaction, blockers: Object.freeze([]), steps: Object.freeze(steps), phase: "completed" as const});
}

function main(): void {
  const caseAOperations = [
    operation("reuse-org", "reuse_entity", "organizacion", [], "reuse:organizacion"),
    operation("create-category", "create_entity", "categoriaPeso", ["reuse-org"], "create:categoriaPeso", {nombre: "Ligero"}),
    operation("create-fighter", "create_entity", "luchador", ["create-category"], "create:luchador", {nombre: "Ada"}),
    operation("repair-reference", "replace_reference", "noticia", ["create-fighter"], "repair_reference:noticia"),
    operation("validate-news", "validate_entity", "noticia", ["repair-reference"], "validate:noticia"),
    operation("resume-news", "validate_entity", "noticia", ["validate-news"], "resume:fixture_producer", {scope: "resume", producer: "fixture_producer"}),
  ];
  const planA = globalPlan("case:au7:a", caseAOperations, {completionMode: "resume_producer"});
  const transactionA = build(planA);

  // Construction 1-10
  equal(validateUniversalTransactionPlan(transactionA).valid, true);
  const sameA = buildUniversalTransactionPlan(planA, {...contextFor(planA), now: () => "2030-01-01T00:00:00.000Z"});
  check(sameA.ok && sameA.value.transactionFingerprint === transactionA.transactionFingerprint);
  check(sameA.ok && sameA.value.createdAt !== transactionA.createdAt);
  equal(transactionA.sourcePlanFingerprint, planA.fingerprint);
  equal(transactionA.caseVersion, planA.caseVersion);
  const duplicatePlan = {...planA, operations: [...planA.operations, planA.operations[0]]};
  equal(buildUniversalTransactionPlan(duplicatePlan, contextFor(planA)).ok, false);
  const missingDependencyPlan = structuredClone(planA); missingDependencyPlan.operations[0].dependencyIds = ["missing"];
  equal(buildUniversalTransactionPlan(missingDependencyPlan, contextFor(planA)).ok, false);
  const cyclePlan = structuredClone(planA); cyclePlan.graph.nodes[0].dependencyIds = [cyclePlan.graph.nodes.at(-1)!.id];
  equal(buildUniversalTransactionPlan(cyclePlan, contextFor(planA)).ok, false);
  const unsupported = buildUniversalTransactionPlan(planA, contextFor(planA, {omit: "resume-news"}));
  check(unsupported.ok && unsupported.value.blockers.some((item) => item.code === "unsupported_step"));
  check(unsupported.ok && unsupported.value.blockers.some((item) => item.code === "unsupported_step" && item.operationId === "resume-news"));

  // State machine 11-18
  const first = transactionA.steps.find((step) => step.stepId === "reuse-org")!;
  let stateTx = withStates(transactionA, {[first.stepId]: "pending"});
  stateTx = transitionTransactionStep({transaction: stateTx, stepId: first.stepId, nextState: "ready", reason: "dependencies_satisfied"});
  equal(stateTx.steps.find((step) => step.stepId === first.stepId)?.state, "ready");
  stateTx = transitionTransactionStep({transaction: stateTx, stepId: first.stepId, nextState: "executing", reason: "execution_started"});
  equal(stateTx.steps.find((step) => step.stepId === first.stepId)?.state, "executing");
  const succeeded = transitionTransactionStep({transaction: stateTx, stepId: first.stepId, nextState: "succeeded", reason: "execution_confirmed"});
  equal(succeeded.steps.find((step) => step.stepId === first.stepId)?.state, "succeeded");
  const failed = transitionTransactionStep({transaction: stateTx, stepId: first.stepId, nextState: "failed", reason: "deterministic_failure"});
  equal(failed.steps.find((step) => step.stepId === first.stepId)?.state, "failed");
  const uncertain = transitionTransactionStep({transaction: stateTx, stepId: first.stepId, nextState: "reconciliation_required", reason: "uncertain_effect"});
  equal(uncertain.phase, "reconciliation_required");
  throws(() => transitionTransactionStep({transaction: failed, stepId: first.stepId, nextState: "succeeded", reason: "execution_confirmed"}), /transition_invalid/);
  const transformPlan = globalPlan("case:au7:transform", [operation("transform", "replace_reference", "noticia", [], "repair_reference:noticia")]);
  let transform = build(transformPlan); transform = transitionTransactionStep({transaction: transform, stepId: "transform", nextState: "executing", reason: "execution_started"}); transform = transitionTransactionStep({transaction: transform, stepId: "transform", nextState: "succeeded", reason: "execution_confirmed"}); transform = transitionTransactionStep({transaction: transform, stepId: "transform", nextState: "compensating", reason: "compensation_started"}); transform = transitionTransactionStep({transaction: transform, stepId: "transform", nextState: "compensated", reason: "compensation_confirmed"});
  equal(transform.steps[0].state, "compensated");
  const cancelled = transitionTransactionStep({transaction: build(transformPlan), stepId: "transform", nextState: "cancelled", reason: "operator_cancelled"});
  equal(cancelled.phase, "cancelled");

  // Readiness 19-23
  equal(deriveTransactionStepReadiness(transactionA, "create-category").ready, false);
  const reuseDone = refreshTransactionReadiness(withStates(transactionA, {"reuse-org": "reused"}));
  equal(deriveTransactionStepReadiness(reuseDone, "create-category").ready, false); // identity guard remains required
  const category = reuseDone.steps.find((step) => step.stepId === "create-category")!;
  const depsDone = withStates(reuseDone, Object.fromEntries(category.dependencies.map((id) => [id, "succeeded"])));
  equal(deriveTransactionStepReadiness(depsDone, "create-category").ready, true);
  const reconciliationDependency = withStates(depsDone, {[category.dependencies[0]]: "reconciliation_required"});
  check(deriveTransactionStepReadiness(reconciliationDependency, "create-category").reasons.some((reason) => reason.includes("reconciliation_required")));
  const failedDependency = withStates(depsDone, {[category.dependencies[0]]: "failed"});
  check(deriveTransactionStepReadiness(failedDependency, "create-category").reasons.some((reason) => reason.includes("dependency_failed")));

  // Global state 24-30
  const simplePlan = globalPlan("case:au7:simple", [operation("a", "validate_entity", "noticia"), operation("b", "validate_entity", "noticia", ["a"])]);
  const simple = build(simplePlan);
  equal(deriveTransactionPhase(simple.steps.map((step) => ({...step, state: "pending"}))), "planned");
  equal(deriveTransactionPhase(simple.steps), "ready");
  equal(deriveTransactionPhase(simple.steps.map((step, index) => ({...step, state: index ? "pending" : "executing"}))), "executing");
  equal(deriveTransactionPhase(simple.steps.map((step, index) => ({...step, state: index ? "pending" : "succeeded"}))), "partially_succeeded");
  equal(deriveTransactionPhase(simple.steps.map((step, index) => ({...step, state: index ? "pending" : "reconciliation_required"}))), "reconciliation_required");
  equal(deriveTransactionPhase(simple.steps.map((step) => ({...step, state: "failed"}))), "failed");
  equal(deriveTransactionPhase(simple.steps.map((step) => ({...step, state: "succeeded"}))), "completed");

  // Idempotency 31-35
  equal(build(planA).transactionFingerprint, transactionA.transactionFingerprint);
  const reorderedPlan = globalPlan("case:au7:a", [...caseAOperations].reverse(), {completionMode: "resume_producer"});
  equal(build(reorderedPlan).transactionFingerprint, transactionA.transactionFingerprint);
  const changedPlan = globalPlan("case:au7:a", caseAOperations, {caseVersion: 2, completionMode: "resume_producer"});
  check(build(changedPlan).transactionFingerprint !== transactionA.transactionFingerprint);
  equal(build(planA).steps.find((step) => step.stepId === "create-fighter")?.idempotencyKey, transactionA.steps.find((step) => step.stepId === "create-fighter")?.idempotencyKey);
  const beforeRetry = JSON.stringify(failed); canRetryTransactionStep(failed.steps.find((step) => step.stepId === first.stepId)!, {explicit: true}); equal(JSON.stringify(failed), beforeRetry);

  // Risk and authorization 36-42
  equal(simple.steps[0].mode, "read_only"); equal(simple.steps[0].risk, "low");
  equal(transform.steps[0].mode, "pure_transform"); equal(transform.steps[0].risk, "low");
  check(transactionA.steps.filter((step) => step.mode === "external_effect").every((step) => step.executorId && step.reconciliation !== "not_required"));
  const destructive = buildUniversalTransactionPlan(planA, contextFor(planA, {destructive: "resume-news"}));
  check(destructive.ok && destructive.value.blockers.some((item) => item.code === "destructive_step_unsupported"));
  const resumeStep = transactionA.steps.find((step) => step.stepId === "resume-news")!;
  equal(resumeStep.authorization, "human_required");
  check(!JSON.stringify(transactionA).toLocaleLowerCase().includes('"token"'));
  const noAuthorization = deriveExecutableBatch(withStates(transactionA, Object.fromEntries(resumeStep.dependencies.map((id) => [id, "succeeded"]))), {prevalidatedStepIds: [resumeStep.stepId], now: () => NOW});
  check(noAuthorization.blocked.some((item) => item.stepId === resumeStep.stepId && item.reasons.includes("runtime_authorization_required")));

  // Retry 43-46
  equal(classifyTransactionFailure(resumeStep, {kind: "timeout", effectMayHaveOccurred: true}).state, "reconciliation_required");
  equal(classifyTransactionFailure(resumeStep, {kind: "deterministic", effectMayHaveOccurred: false}).state, "failed");
  const safeRetry = {...simple.steps[0], state: "failed" as const, retry: "safe_idempotent" as const};
  equal(canRetryTransactionStep(safeRetry, {explicit: false}), true);
  equal(canRetryTransactionStep({...safeRetry, retry: "explicit_only"}, {explicit: true}), true);

  // Compensation 47-53
  const comp = compensationTransaction(transactionA, ["none", "logical_only", "reversible_transform", "explicit_compensator", "manual_required"]);
  const compensation = deriveCompensationPlan(comp);
  equal(compensation.actions.find((item) => item.policy === "none")?.disposition, "not_applicable");
  equal(compensation.actions.find((item) => item.policy === "logical_only")?.disposition, "eligible");
  equal(compensation.actions.find((item) => item.policy === "reversible_transform")?.disposition, "eligible");
  equal(compensation.actions.find((item) => item.policy === "explicit_compensator")?.disposition, "eligible");
  equal(compensation.actions.find((item) => item.policy === "manual_required")?.disposition, "manual");
  deepEqual(compensation.actions.map((item) => item.stepId), [...comp.steps].reverse().map((step) => step.stepId));
  const uncertainComp = deriveCompensationPlan(withStates(comp, {[comp.steps[0].stepId]: "reconciliation_required"}));
  equal(uncertainComp.blocked, true);

  // Parallelism 54-56
  const parallelPlan = globalPlan("case:au7:parallel", [operation("parallel-a", "validate_entity", "noticia"), operation("parallel-b", "validate_entity", "noticia"), operation("dependent", "validate_entity", "noticia", ["parallel-a", "parallel-b"])]);
  const parallel = build(parallelPlan);
  deepEqual(deriveExecutableBatch(parallel).stepIds, ["parallel-a", "parallel-b"]);
  check(!deriveExecutableBatch(parallel).stepIds.includes("dependent"));
  deepEqual(deriveExecutableBatch(parallel).stepIds, [...deriveExecutableBatch(parallel).stepIds].sort());

  // Staleness 57-62
  const current = transactionA.contextBinding;
  check(detectTransactionStaleness(transactionA, {...current, caseVersion: 2}).reasons.includes("case_version_changed"));
  check(detectTransactionStaleness(transactionA, {...current, sourceCheckpointFingerprint: "sha256-v1:changed"}).reasons.includes("source_checkpoint_fingerprint_changed"));
  check(detectTransactionStaleness(transactionA, {...current, sourcePlanFingerprint: "sha256-v1:changed"}).reasons.includes("source_plan_fingerprint_changed"));
  const changedOps = {...current.operationFingerprints, [transactionA.steps[0].operationId]: "sha256-v1:changed"};
  check(detectTransactionStaleness(transactionA, {...current, operationFingerprints: changedOps}).reasons.some((reason) => reason.startsWith("operation_fingerprint_changed")));
  check(detectTransactionStaleness(transactionA, {...current, producer: {...current.producer!, producerVersion: "2.0.0"}}).reasons.includes("producer_manifest_changed"));
  const guardId = Object.keys(current.creationGuardFingerprints)[0];
  check(detectTransactionStaleness(transactionA, {...current, creationGuardFingerprints: {...current.creationGuardFingerprints, [guardId]: "sha256-v1:changed"}}).reasons.some((reason) => reason.startsWith("creation_guard_fingerprint_changed")));

  // Recovery 63-66
  const recoveryTransaction = withStates(simple, {a: "succeeded", b: "pending"});
  let checkpoint = createUniversalTransactionCheckpoint(recoveryTransaction, {now: () => NOW});
  equal(checkpoint.steps.find((step) => step.stepId === "a")?.state, "succeeded");
  equal(checkpoint.steps.find((step) => step.stepId === "b")?.state, "pending");
  const recovered = recoverUniversalTransaction({transaction: simple, checkpoint, currentContext: simple.contextBinding, now: () => NOW});
  check(recovered.status === "valid" && recovered.transaction.steps.find((step) => step.stepId === "a")?.state === "succeeded");
  const uncertainRecovery = withStates(simple, {a: "reconciliation_required"});
  checkpoint = createUniversalTransactionCheckpoint(uncertainRecovery, {now: () => NOW});
  const uncertainRecovered = recoverUniversalTransaction({transaction: simple, checkpoint, currentContext: simple.contextBinding});
  check(uncertainRecovered.status === "valid" && uncertainRecovered.transaction.phase === "reconciliation_required" && uncertainRecovered.next.stepIds.length === 0);
  const completedRecovery = withStates(simple, {a: "succeeded", b: "succeeded"});
  const completedCheckpoint = createUniversalTransactionCheckpoint(completedRecovery, {now: () => NOW});
  equal(recoverUniversalTransaction({transaction: simple, checkpoint: completedCheckpoint, currentContext: simple.contextBinding}).status, "completed");

  // Security 67-72 and checkpoint/history integration
  equal(validateUniversalTransactionCheckpoint(completedCheckpoint, simple).valid, true);
  check(JSON.stringify(completedCheckpoint).length > 0);
  const serialized = JSON.stringify(completedCheckpoint).toLocaleLowerCase();
  check(!serialized.includes('"payload"'));
  check(!serialized.includes('"token"'));
  check(!serialized.includes('"stack"'));
  check(!serialized.includes('"client"'));
  check(!serialized.includes('"groq"'));
  deepEqual(universalTransactionSecurity, {writes: false, executes: false, invokesExecutors: false, persistsAuthorization: false, persistsPayloads: false, automaticRetry: false, automaticCompensation: false});
  deepEqual(transactionCheckpointSecurity, {payloads: false, documents: false, tokens: false, headers: false, clients: false, groq: false, stacks: false, writes: false});
  const event = createTransactionHistoryEvent({kind: "step_succeeded", status: "succeeded", stepId: "a", occurredAt: NOW});
  equal(appendTransactionHistory([event], {...event, occurredAt: "2030-01-01T00:00:00.000Z"}).length, 1);
  const evolved = evolveUniversalTransactionCheckpoint({checkpoint: completedCheckpoint, transaction: completedRecovery, step: {stepId: "a", attempts: 1, references: [{type: "noticia", id: "draft:1"}]}, event, now: () => NOW});
  equal(evolved.steps.find((step) => step.stepId === "a")?.attempts, 1);
  equal(evolved.steps.find((step) => step.stepId === "a")?.references[0]?.id, "draft:1");

  check(assertions >= 79, `Se esperaban al menos 79 comprobaciones y hubo ${assertions}.`);
  console.log(`AU7 B1 transaction core tests: OK (${assertions} assertions; construction, state, readiness, idempotency, retry, reconciliation, compensation, recovery and security; zero writes)`);
}

main();
