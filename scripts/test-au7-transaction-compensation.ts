import assert from "node:assert/strict";
import {buildEntityOperation} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import {finalizeGlobalResolutionPlan, resolveGlobalResolutionPlanningPolicy} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {
  buildUniversalTransactionPlan, createInverseTransformDescriptor, createTransactionCompensationAuthorization,
  createTransactionCompensatorRegistry, createUniversalTransactionCheckpoint, deriveControlledCompensationPlan,
  deriveTransactionPhase, deriveTransactionSagaOutcome, evaluateCompensationDecision, executeTransactionCompensation,
  prepareExplicitCompensationRetry, projectCompensationReconciliation, sagaCompensationSecurity,
  type TransactionCheckpointApplication, type TransactionCheckpointSnapshot, type TransactionCompensationEvidence,
  type TransactionCompensationPolicy, type TransactionCompensationRuntime, type TransactionCompensator,
  type TransactionStepMode, type TransactionStepState, type UniversalTransactionCheckpoint, type UniversalTransactionPlan,
} from "../_laboratorio/laboratorio-ia/src/review/transactions";

const NOW = "2026-08-10T10:00:00.000Z";
let assertions = 0;
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T): void => { assert.equal(actual, expected); assertions += 1; };

function build(policy: TransactionCompensationPolicy, mode: TransactionStepMode = "external_effect", retry: "never" | "explicit_only" | "safe_idempotent" | "after_reconciliation" = "explicit_only"): UniversalTransactionPlan {
  const operation = buildEntityOperation({id: "effect", kind: mode === "pure_transform" ? "replace_reference" : "create_entity", entityType: mode === "pure_transform" ? "noticia" : "luchador", payload: {fixture: true}, source: "global_resolution", evidence: [], confidence: 1, risk: "medium", preconditions: [], postconditions: [], dependencyIds: [], requiredCapability: mode === "pure_transform" ? "replace_reference:noticia:luchador" : "create:luchador", compensatable: policy !== "none", explanation: "fixture"});
  const planned = finalizeGlobalResolutionPlan({caseId: "case:b4", caseVersion: 1, producer: "fixture", originalOperation: "fixture", operations: [operation], policy: resolveGlobalResolutionPlanningPolicy({availableCapabilities: [operation.requiredCapability!, "resolve_identity:fighter"], maximumRisk: "high"}), graphMetadata: {completionMode: "entity_resolution"}, now: () => NOW});
  if (!planned.ok) throw new Error(JSON.stringify(planned));
  const bindings = planned.plan.operations.map((item) => ({operationId: item.id, capability: item.requiredCapability!, mode: item.id === "effect" ? mode : "read_only" as const, risk: "medium" as const, authorization: "none" as const, retry, reconciliation: mode === "external_effect" ? "required_before_retry" as const : "not_required" as const, compensation: item.id === "effect" ? policy : "none" as const, compensatorId: policy === "explicit_compensator" || policy === "reversible_transform" ? "compensator.fixture" : undefined, executorId: mode === "external_effect" ? "executor.fixture" : undefined, executorVersion: mode === "external_effect" ? 1 : undefined, executorManifestFingerprint: mode === "external_effect" ? "sha256-v1:executor" : undefined, preExecutionValidationRequired: mode === "external_effect"}));
  const built = buildUniversalTransactionPlan(planned.plan, {sourceCheckpointFingerprint: "sha256-v1:source", bindings, creationGuardFingerprints: Object.fromEntries(planned.plan.operations.filter((item) => item.kind === "create_entity").map((item) => [item.id, "sha256-v1:guard"])), now: () => NOW});
  if (!built.ok) throw new Error(JSON.stringify(built));
  return built.value;
}
function withState(transaction: UniversalTransactionPlan, state: TransactionStepState): UniversalTransactionPlan {
  const steps = transaction.steps.map((step) => ({...step, state: step.stepId === "effect" ? state : step.state === "ready" ? "succeeded" as const : step.state}));
  return {...transaction, steps, phase: deriveTransactionPhase(steps, transaction.blockers.length > 0)};
}
function evidence(ownership: TransactionCompensationEvidence["ownership"] = "transaction_created", inverse = false): TransactionCompensationEvidence {
  const reference = {type: "luchador", id: "doc:1", fingerprint: "sha256-v1:result"};
  return {stepId: "effect", ownership, references: [reference], inverseTransform: inverse ? createInverseTransformDescriptor({descriptorId: "inverse:1", compensatorId: "compensator.fixture", previousFingerprint: "sha256-v1:previous", resultingFingerprint: reference.fingerprint}) : undefined};
}

type Fixture = {runtime: TransactionCompensationRuntime; app: TransactionCheckpointApplication; root(): string; checkpoint(): UniversalTransactionCheckpoint; calls: {persist: number; compensate: number; order: string[]}; failAt(call: number): void; mode(value: string): void};
function fixture(transaction: UniversalTransactionPlan, evidenceValue = evidence(), options: {delay?: boolean} = {}): Fixture {
  let checkpoint = createUniversalTransactionCheckpoint(transaction, {now: () => NOW});
  let root = "sha256-v1:global0";
  let fail = 0;
  let mode = "success";
  const calls = {persist: 0, compensate: 0, order: [] as string[]};
  const reviewCase = {id: transaction.caseId, version: 1} as TransactionCheckpointSnapshot["reviewCase"];
  const app: TransactionCheckpointApplication = {load: () => ({reviewCase, checkpoint, globalCheckpointFingerprint: root, currentContext: transaction.contextBinding}), persist: async (input) => { calls.persist += 1; calls.order.push(`persist:${input.checkpoint.steps.find((step) => step.stepId === "effect")?.state}`); if (calls.persist === fail || input.expectedGlobalCheckpointFingerprint !== root) return {persisted: false, conflict: true, reasons: ["checkpoint_conflict"]}; checkpoint = input.checkpoint; root = `sha256-v1:global${calls.persist}`; return {persisted: true, conflict: false, checkpointFingerprint: root}; }};
  const compensator: TransactionCompensator = {compensatorId: "compensator.fixture", version: "1.0.0", manifestFingerprint: "sha256-v1:compensator", risk: "medium", retry: "explicit_only", supports: () => mode !== "incompatible", async compensate() { calls.compensate += 1; calls.order.push("compensator"); if (options.delay) await new Promise((resolve) => setTimeout(resolve, 10)); if (mode === "throw") throw new Error("network"); if (mode === "failure") return {status: "failed_deterministic", errorCode: "inverse_rejected"}; if (mode === "uncertain") return {status: "reconciliation_required", errorCode: "timeout_uncertain"}; return {status: "compensated", evidenceFingerprint: "sha256-v1:compensated"}; }};
  const registry = createTransactionCompensatorRegistry([compensator]);
  return {runtime: {registry, checkpointApplication: app, evidence: [evidenceValue], now: () => NOW}, app, root: () => root, checkpoint: () => checkpoint, calls, failAt: (call) => { fail = call; }, mode: (value) => { mode = value; }};
}
function auth(transaction: UniversalTransactionPlan, runtime: TransactionCompensationRuntime, root: string) { const decision = deriveControlledCompensationPlan(transaction, {evidence: runtime.evidence, registry: runtime.registry}).decisions.find((item) => item.stepId === "effect")!; return createTransactionCompensationAuthorization({transactionFingerprint: transaction.transactionFingerprint, stepId: "effect", compensationFingerprint: decision.fingerprint, checkpointFingerprint: root, authorizedAt: NOW, expiresAt: "2026-08-10T11:00:00.000Z", approvedByHuman: true}); }
function execute(transaction: UniversalTransactionPlan, value: Fixture, authorization = auth(transaction, value.runtime, value.root())) { return executeTransactionCompensation({caseId: transaction.caseId, transaction, stepId: "effect", expectedTransactionFingerprint: transaction.transactionFingerprint, expectedCheckpointFingerprint: value.root(), runtime: value.runtime, authorization}); }

async function main(): Promise<void> {
  const none = withState(build("none"), "succeeded"); equal(evaluateCompensationDecision({step: none.steps.find((step) => step.stepId === "effect")!, evidence: evidence()}).decision, "preserve");
  const logical = withState(build("logical_only"), "succeeded"); equal(evaluateCompensationDecision({step: logical.steps.find((step) => step.stepId === "effect")!, evidence: evidence()}).decision, "logical_compensation");
  const reversible = withState(build("reversible_transform", "pure_transform"), "succeeded"); equal(evaluateCompensationDecision({step: reversible.steps.find((step) => step.stepId === "effect")!, evidence: evidence("transaction_transformed", true)}).decision, "revert_transform");
  const explicit = withState(build("explicit_compensator"), "succeeded"); let value = fixture(explicit); equal(evaluateCompensationDecision({step: explicit.steps.find((step) => step.stepId === "effect")!, evidence: evidence(), registry: value.runtime.registry}).decision, "compensate");
  const manual = withState(build("manual_required"), "succeeded"); equal(evaluateCompensationDecision({step: manual.steps.find((step) => step.stepId === "effect")!, evidence: evidence()}).decision, "manual_required");
  equal(evaluateCompensationDecision({step: {...explicit.steps.find((step) => step.stepId === "effect")!, state: "reused"}, evidence: evidence("pre_existing"), registry: value.runtime.registry}).decision, "preserve");
  equal(evaluateCompensationDecision({step: explicit.steps.find((step) => step.stepId === "effect")!, evidence: evidence("unknown"), registry: value.runtime.registry}).decision, "preserve");
  equal(evaluateCompensationDecision({step: explicit.steps.find((step) => step.stepId === "effect")!, evidence: {...evidence(), ownership: "shared", sharedByStepIds: ["a", "b"]}, registry: value.runtime.registry}).decision, "preserve");
  equal(evaluateCompensationDecision({step: {...explicit.steps.find((step) => step.stepId === "effect")!, state: "reconciliation_required"}, evidence: evidence(), registry: value.runtime.registry}).decision, "reconciliation_required");
  equal(evaluateCompensationDecision({step: {...explicit.steps.find((step) => step.stepId === "effect")!, state: "failed"}, evidence: evidence(), registry: value.runtime.registry}).decision, "preserve");
  equal(evaluateCompensationDecision({step: {...explicit.steps.find((step) => step.stepId === "effect")!, mode: "read_only"}, evidence: evidence(), registry: value.runtime.registry}).decision, "preserve");
  equal(evaluateCompensationDecision({step: {...explicit.steps.find((step) => step.stepId === "effect")!, risk: "destructive"}, evidence: evidence(), registry: value.runtime.registry}).decision, "manual_required");
  const invalidInverse = evaluateCompensationDecision({step: reversible.steps.find((step) => step.stepId === "effect")!, evidence: evidence("transaction_transformed")}); equal(invalidInverse.decision, "manual_required");
  const missingRegistry = evaluateCompensationDecision({step: explicit.steps.find((step) => step.stepId === "effect")!, evidence: evidence(), registry: createTransactionCompensatorRegistry()}); equal(missingRegistry.decision, "manual_required");
  const plan = deriveControlledCompensationPlan(explicit, {evidence: [evidence()], registry: value.runtime.registry}); equal(plan.executableStepIds.includes("effect"), true); equal(plan.failedStepIds.length, 0); equal(plan.fingerprint, deriveControlledCompensationPlan(explicit, {evidence: [evidence()], registry: value.runtime.registry}).fingerprint);
  const sharedPlan = deriveControlledCompensationPlan(explicit, {evidence: [{...evidence(), ownership: "shared", sharedByStepIds: ["a", "b"]}], registry: value.runtime.registry}); equal(sharedPlan.preservedStepIds.includes("effect"), true);

  let result = await execute(explicit, value); equal(result.status, "compensated"); equal(result.afterState, "compensated"); equal(result.attempt, 1); equal(result.compensatorInvoked, true); equal(value.calls.persist, 2); equal(value.calls.compensate, 1); check(value.calls.order.indexOf("persist:compensating") < value.calls.order.indexOf("compensator")); equal(value.checkpoint().steps.find((step) => step.stepId === "effect")?.compensation?.compensatorVersion, "1.0.0");
  result = await execute(explicit, value, auth(explicit, value.runtime, value.root())); equal(result.status, "already_compensated"); equal(value.calls.compensate, 1);
  value = fixture(explicit); value.failAt(1); result = await execute(explicit, value); equal(result.status, "blocked"); equal(value.calls.compensate, 0);
  value = fixture(explicit); value.mode("failure"); result = await execute(explicit, value); equal(result.status, "failed_deterministic"); equal(result.afterState, "compensation_failed"); equal(result.doNotRetryCompensation, false);
  const failureState = {transaction: {...explicit, steps: explicit.steps.map((step) => ({...step, state: value.checkpoint().steps.find((stored) => stored.stepId === step.stepId)!.state})), phase: value.checkpoint().phase} as UniversalTransactionPlan, checkpoint: value.checkpoint()}; const retry = prepareExplicitCompensationRetry(failureState, "effect", value.runtime.registry); equal(retry.transaction.steps.find((step) => step.stepId === "effect")?.state, "succeeded"); equal(retry.checkpoint.steps.find((step) => step.stepId === "effect")?.compensationState, "required");
  value = fixture(explicit); value.mode("uncertain"); result = await execute(explicit, value); equal(result.status, "reconciliation_required"); equal(result.afterState, "reconciliation_required"); equal(result.doNotRetryCompensation, true);
  const uncertainState = {transaction: {...explicit, steps: explicit.steps.map((step) => ({...step, state: value.checkpoint().steps.find((stored) => stored.stepId === step.stepId)!.state})), phase: value.checkpoint().phase} as UniversalTransactionPlan, checkpoint: value.checkpoint()}; const confirmed = projectCompensationReconciliation(uncertainState, {stepId: "effect", outcome: "confirmed_succeeded", evidenceFingerprint: "sha256-v1:confirmed"}); equal(confirmed.status, "compensated"); equal(confirmed.compensatorInvoked, false); const notApplied = projectCompensationReconciliation(uncertainState, {stepId: "effect", outcome: "confirmed_not_applied"}); equal(notApplied.status, "retry_available"); equal(notApplied.state.transaction.steps.find((step) => step.stepId === "effect")?.state, "succeeded"); equal(projectCompensationReconciliation(uncertainState, {stepId: "effect", outcome: "conflicting"}).status, "blocked"); equal(projectCompensationReconciliation(uncertainState, {stepId: "effect", outcome: "insufficient"}).status, "blocked");
  value = fixture(explicit); value.mode("throw"); result = await execute(explicit, value); equal(result.status, "reconciliation_required"); equal(value.calls.compensate, 1);
  value = fixture(explicit); value.failAt(2); result = await execute(explicit, value); equal(result.status, "reconciliation_required"); equal(result.persistence.persisted, false); equal(result.doNotRetryCompensation, true); equal(value.calls.compensate, 1);
  value = fixture(explicit, evidence(), {delay: true}); const authorization = auth(explicit, value.runtime, value.root()); const [first, second] = await Promise.all([execute(explicit, value, authorization), execute(explicit, value, authorization)]); equal(first.status, second.status); equal(value.calls.compensate, 1);
  value = fixture(logical); result = await execute(logical, value, undefined); equal(result.status, "logically_compensated"); equal(result.compensatorInvoked, false); equal(value.calls.compensate, 0); equal(result.attempt, 0);
  value = fixture(reversible, evidence("transaction_transformed", true)); result = await execute(reversible, value); equal(result.status, "compensated"); equal(result.compensatorInvoked, true);
  const outcomeCompleted = deriveTransactionSagaOutcome(withState(build("none"), "succeeded")); equal(outcomeCompleted.status, "completed");
  const outcomeCompensated = deriveTransactionSagaOutcome(withState(build("none"), "compensated")); equal(outcomeCompensated.status, "compensated");
  const outcomeRecon = deriveTransactionSagaOutcome(withState(build("none"), "reconciliation_required")); equal(outcomeRecon.status, "reconciliation_required");
  const outcomeManual = deriveTransactionSagaOutcome(manual, deriveControlledCompensationPlan(manual, {evidence: [evidence()]})); equal(outcomeManual.status, "manual_intervention_required");
  check(sagaCompensationSecurity.preserveByDefault); check(!sagaCompensationSecurity.automaticDelete); check(!sagaCompensationSecurity.automaticRollback); check(!sagaCompensationSecurity.automaticRetry); check(!sagaCompensationSecurity.persistsAuthorization); check(!sagaCompensationSecurity.persistsPayload);
  const serialized = JSON.stringify(value.checkpoint()).toLowerCase(); check(!serialized.includes('"token"')); check(!serialized.includes('"payload"')); check(!serialized.includes('"stack"')); check(!serialized.includes('"groq"')); check(!serialized.includes('"delete"'));
  check(assertions >= 64, `Se esperaban al menos 64 comprobaciones y hubo ${assertions}`);
  console.log(`AU7 B4 transaction compensation tests: OK (${assertions} assertions; Saga policy, ownership, pre-persist, idempotency, reconciliation and zero real writes)`);
}
main();
