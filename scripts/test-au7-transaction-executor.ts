import assert from "node:assert/strict";
import {buildEntityOperation} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import {finalizeGlobalResolutionPlan, resolveGlobalResolutionPlanningPolicy} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {computeUniversalFingerprint, type ExecutionResult, type PostExecutionValidation, type RegisteredReviewExecutor, type UniversalExecutionPlan} from "../_laboratorio/laboratorio-ia/src/review/universal";
import {
  buildUniversalTransactionPlan, classifyTransactionExecutorResult, createTransactionExecutionAuthorization,
  createTransactionExecutionRuntime, createUniversalTransactionCheckpoint, executeTransactionBatch,
  executeTransactionStep, prepareExplicitTransactionRetry, projectTransactionReconciliation,
  transactionExecutorSecurity, validateTransactionExecutionAuthorization,
  type TransactionCheckpointApplication, type TransactionCheckpointSnapshot,
  type TransactionExecutionRuntime, type UniversalTransactionCheckpoint, type UniversalTransactionPlan,
} from "../_laboratorio/laboratorio-ia/src/review/transactions";

const NOW = "2026-08-09T10:00:00.000Z";
let assertions = 0;
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T): void => { assert.equal(actual, expected); assertions += 1; };
const rejects = async (action: () => Promise<unknown>, pattern: RegExp): Promise<void> => { await assert.rejects(action, pattern); assertions += 1; };

function buildTransaction(options: {authorization?: "none" | "human_required"; retry?: "never" | "explicit_only" | "after_reconciliation"; twoSteps?: boolean; dependent?: boolean} = {}): UniversalTransactionPlan {
  const operations = [buildEntityOperation({id: "step-a", kind: "validate_entity", entityType: "noticia", payload: {fixture: "a"}, source: "global_resolution", evidence: [], confidence: 1, risk: "low", preconditions: [], postconditions: [], dependencyIds: [], requiredCapability: "validate:noticia", compensatable: false, explanation: "fixture"})];
  if (options.twoSteps) operations.push(buildEntityOperation({id: "step-b", kind: "validate_entity", entityType: "noticia", payload: {fixture: "b"}, source: "global_resolution", evidence: [], confidence: 1, risk: "low", preconditions: [], postconditions: [], dependencyIds: options.dependent ? ["step-a"] : [], requiredCapability: "validate:noticia", compensatable: false, explanation: "fixture"}));
  const planned = finalizeGlobalResolutionPlan({caseId: "case:b3", caseVersion: 1, producer: "fixture", originalOperation: "fixture", operations, policy: resolveGlobalResolutionPlanningPolicy({availableCapabilities: ["validate:noticia"], maximumRisk: "high"}), graphMetadata: {completionMode: "entity_resolution"}, now: () => NOW});
  if (!planned.ok) throw new Error(JSON.stringify(planned));
  const built = buildUniversalTransactionPlan(planned.plan, {sourceCheckpointFingerprint: "sha256-v1:source", bindings: planned.plan.operations.map((operation) => ({operationId: operation.id, capability: "validate:noticia", mode: "external_effect", risk: "low", authorization: options.authorization ?? "human_required", retry: options.retry ?? "after_reconciliation", reconciliation: "required_before_retry", compensation: "manual_required", executorId: "fixture.executor", executorVersion: 1, executorManifestFingerprint: "sha256-v1:manifest", preExecutionValidationRequired: true})), now: () => NOW});
  if (!built.ok) throw new Error(JSON.stringify(built));
  return built.value;
}

const executionPlan: UniversalExecutionPlan = {schemaVersion: 1, id: "universal:b3", caseId: "case:b3", caseVersion: 1, producerId: "fixture", operationId: "fixture", operationType: "validate", entityType: "noticia", resume: {schemaVersion: 1, producerId: "fixture", operationId: "fixture", operationType: "validate", checkpoint: "review_case", snapshotVersion: 1, snapshotFingerprint: "sha256-v1:snapshot", requiredCapabilities: [], idempotencyKey: "resume:b3"}, preconditions: [], effects: [{id: "effect", type: "block_operation", reason: "fixture"}], requiredCapabilities: ["validate:noticia"], rollback: [], postconditions: [{id: "post", kind: "validated", description: "validated", required: true, effectIndexes: [0]}], snapshotFingerprint: "sha256-v1:snapshot", planFingerprint: "sha256-v1:plan", idempotencyKey: "universal:key", generatedAt: NOW};

type Scenario = {runtime: TransactionExecutionRuntime; app: TransactionCheckpointApplication; checkpoint: () => UniversalTransactionCheckpoint; root: () => string; calls: {execute: number; persist: number; order: string[]}; setMode(mode: string): void; failPersistenceAt(call: number): void};
function scenario(transaction: UniversalTransactionPlan, options: {mode?: string; delay?: boolean; checkpoint?: UniversalTransactionCheckpoint} = {}): Scenario {
  let checkpoint = options.checkpoint ?? createUniversalTransactionCheckpoint(transaction, {now: () => NOW});
  let root = "sha256-v1:global0";
  let mode = options.mode ?? "success";
  let failAt = 0;
  const calls = {execute: 0, persist: 0, order: [] as string[]};
  const reviewCase = {id: "case:b3", version: 1} as TransactionCheckpointSnapshot["reviewCase"];
  const app: TransactionCheckpointApplication = {
    load: () => ({reviewCase, checkpoint, globalCheckpointFingerprint: root, currentContext: transaction.contextBinding}),
    persist: async (input) => {
      calls.persist += 1; calls.order.push(`persist:${input.checkpoint.steps[0].state}`);
      if (failAt === calls.persist || input.expectedGlobalCheckpointFingerprint !== root) return {persisted: false, conflict: true, reasons: ["checkpoint_conflict"]};
      checkpoint = input.checkpoint; root = `sha256-v1:global${calls.persist}`;
      return {persisted: true, conflict: false, checkpointFingerprint: root};
    },
  };
  const registration: RegisteredReviewExecutor["registration"] = {
    executorId: "fixture.executor", version: 1, capability: "validate:noticia", supportedEffects: ["block_operation"], supportedEntityTypes: ["noticia"], risk: "low", canExecute: () => mode !== "precondition",
    async simulate() { throw new Error("simulation_not_used"); },
    async execute(_plan, _state, indexes, input) {
      calls.execute += 1; calls.order.push("executor");
      if (options.delay) await new Promise((resolve) => setTimeout(resolve, 10));
      if (mode === "throw" || mode === "timeout") throw new Error(mode);
      const status: ExecutionResult["status"] = mode === "failure" ? "failed" : mode === "uncertain" ? "reconciliation_required" : "succeeded";
      return {executorId: "fixture.executor", executorVersion: 1, executorManifestFingerprint: "sha256-v1:manifest", capability: "validate:noticia", status, effectIndexes: indexes, idempotencyKey: input.idempotencyKey, references: mode === "missing_ref" ? [] : [{type: "noticia", id: "doc:1"}], output: mode === "reused" ? {outcome: "reused_existing"} : {outcome: "validated"}, error: status === "failed" ? {code: "validation_failed", message: "safe", retryable: false} : status === "reconciliation_required" ? {code: "network_uncertain", message: "safe", retryable: false} : undefined};
    },
    async validateExecution(plan, result): Promise<PostExecutionValidation> { const valid = mode !== "postfail"; return {valid, planFingerprint: plan.planFingerprint, executorId: "fixture.executor", executionIdempotencyKey: result.idempotencyKey, checkedPostconditionIds: ["post"], checkedEffectIndexes: [0], errors: valid ? [] : [{code: "post_failed", message: "safe"}], warnings: [], evidence: {fingerprint: "sha256-v1:evidence"}, validatedAt: NOW}; },
  };
  const binding: RegisteredReviewExecutor = {registration, manifest: {executorId: "fixture.executor", version: 1, capability: "validate:noticia", supportedEffects: ["block_operation"], supportedEntityTypes: ["noticia"], risk: "low"}, manifestFingerprint: "sha256-v1:manifest"};
  const runtime = createTransactionExecutionRuntime({executorRegistry: {get: () => mode === "missing_executor" ? undefined : mode === "bad_manifest" ? {...binding, manifestFingerprint: "sha256-v1:changed"} : binding}, checkpointApplication: app, prepareStep: () => ({valid: mode !== "precondition", reasonCodes: mode === "precondition" ? ["precondition_failed"] : [], plan: executionPlan, state: {fixture: true}, effectIndexes: [0], requiresEffectReference: mode === "missing_ref"}), now: () => NOW});
  return {runtime, app, checkpoint: () => checkpoint, root: () => root, calls, setMode: (value) => { mode = value; }, failPersistenceAt: (call) => { failAt = call; }};
}
function authorization(transaction: UniversalTransactionPlan, root: string, stepId = "step-a") { const step = transaction.steps.find((item) => item.stepId === stepId)!; return createTransactionExecutionAuthorization({transactionFingerprint: transaction.transactionFingerprint, stepId, operationFingerprint: step.fingerprints.operationFingerprint, caseVersion: 1, checkpointFingerprint: root, authorizedAt: NOW, expiresAt: "2026-08-09T11:00:00.000Z", approvedByHuman: true}); }
async function run(transaction: UniversalTransactionPlan, fixture: Scenario, extra: Partial<Parameters<typeof executeTransactionStep>[0]> = {}) { return executeTransactionStep({caseId: transaction.caseId, transaction, stepId: "step-a", expectedTransactionFingerprint: transaction.transactionFingerprint, expectedCheckpointFingerprint: fixture.root(), runtime: fixture.runtime, runtimeAuthorization: authorization(transaction, fixture.root()), ...extra}); }

async function main(): Promise<void> {
  const transaction = buildTransaction();
  const absentRuntime = createTransactionExecutionRuntime({checkpointApplication: {load: () => undefined, persist: () => ({persisted: false, conflict: false})}, executorRegistry: {get: () => undefined}, prepareStep: () => ({valid: false, reasonCodes: []})});
  let outcome = await executeTransactionStep({caseId: transaction.caseId, transaction, stepId: "step-a", expectedTransactionFingerprint: transaction.transactionFingerprint, expectedCheckpointFingerprint: "sha256-v1:absent", runtime: absentRuntime}); equal(outcome.errorCode, "transaction_missing"); equal(outcome.executorInvoked, false);
  let fixture = scenario(transaction); const originalLoad = fixture.app.load; const staleRuntime = createTransactionExecutionRuntime({...fixture.runtime, checkpointApplication: {...fixture.app, load: (caseId, value) => { const loaded = originalLoad(caseId, value)!; return {...loaded, currentContext: {...loaded.currentContext, caseVersion: 2}}; }}}); outcome = await executeTransactionStep({caseId: transaction.caseId, transaction, stepId: "step-a", expectedTransactionFingerprint: transaction.transactionFingerprint, expectedCheckpointFingerprint: fixture.root(), runtime: staleRuntime}); equal(outcome.errorCode, "transaction_stale"); equal(fixture.calls.execute, 0);
  const dependentTx = buildTransaction({twoSteps: true, dependent: true}); fixture = scenario(dependentTx); outcome = await executeTransactionStep({caseId: dependentTx.caseId, transaction: dependentTx, stepId: "step-b", expectedTransactionFingerprint: dependentTx.transactionFingerprint, expectedCheckpointFingerprint: fixture.root(), runtime: fixture.runtime}); equal(outcome.errorCode, "dependency_incomplete"); equal(fixture.calls.execute, 0);
  fixture = scenario(transaction); const invalidAuth = authorization(transaction, "sha256-v1:wrong"); outcome = await run(transaction, fixture, {runtimeAuthorization: invalidAuth}); equal(outcome.errorCode, "authorization_invalid"); equal(fixture.calls.execute, 0);
  fixture = scenario(transaction); fixture.setMode("missing_executor"); outcome = await run(transaction, fixture); equal(outcome.errorCode, "executor_missing"); equal(fixture.calls.execute, 0);
  fixture = scenario(transaction); fixture.setMode("bad_manifest"); outcome = await run(transaction, fixture); equal(outcome.errorCode, "executor_incompatible"); equal(fixture.calls.execute, 0);
  fixture = scenario(transaction); outcome = await executeTransactionStep({caseId: transaction.caseId, transaction, stepId: "missing", expectedTransactionFingerprint: transaction.transactionFingerprint, expectedCheckpointFingerprint: fixture.root(), runtime: fixture.runtime}); equal(outcome.errorCode, "step_missing");
  fixture = scenario(transaction); outcome = await executeTransactionStep({caseId: transaction.caseId, transaction, stepId: "step-a", expectedTransactionFingerprint: transaction.transactionFingerprint, expectedCheckpointFingerprint: fixture.root(), runtime: fixture.runtime}); equal(outcome.errorCode, "authorization_required"); equal(fixture.calls.execute, 0);
  const auth = authorization(transaction, "sha256-v1:global0"); check(validateTransactionExecutionAuthorization(auth, {transaction, step: transaction.steps[0], caseVersion: 1, checkpointFingerprint: "sha256-v1:global0", now: () => NOW})); check(!JSON.stringify(createUniversalTransactionCheckpoint(transaction, {now: () => NOW})).includes(auth.authorizationFingerprint));
  fixture = scenario(transaction); fixture.failPersistenceAt(1); outcome = await run(transaction, fixture); equal(outcome.errorCode, "checkpoint_conflict"); equal(fixture.calls.execute, 0); equal(fixture.calls.persist, 1);
  fixture = scenario(transaction); outcome = await run(transaction, fixture); equal(outcome.status, "succeeded"); equal(outcome.afterState, "succeeded"); equal(outcome.attempt, 1); equal(fixture.calls.execute, 1); equal(fixture.calls.persist, 2); check(fixture.calls.order.indexOf("persist:executing") < fixture.calls.order.indexOf("executor")); equal(outcome.resultSummary?.effectReference?.id, "doc:1");
  outcome = await run(transaction, fixture, {expectedCheckpointFingerprint: fixture.root(), runtimeAuthorization: authorization(transaction, fixture.root())}); equal(outcome.status, "already_completed"); equal(fixture.calls.execute, 1);
  fixture = scenario(transaction); fixture.setMode("reused"); outcome = await run(transaction, fixture); equal(outcome.status, "reused_existing"); equal(outcome.afterState, "reused");
  fixture = scenario(transaction); fixture.setMode("failure"); outcome = await run(transaction, fixture); equal(outcome.status, "failed_deterministic"); equal(outcome.afterState, "failed"); equal(outcome.doNotRetryEffect, false);
  fixture = scenario(transaction); fixture.setMode("uncertain"); outcome = await run(transaction, fixture); equal(outcome.status, "reconciliation_required"); equal(outcome.afterState, "reconciliation_required"); equal(outcome.doNotRetryEffect, true);
  fixture = scenario(transaction); fixture.setMode("throw"); outcome = await run(transaction, fixture); equal(outcome.status, "reconciliation_required"); equal(outcome.executorInvoked, true);
  fixture = scenario(transaction); fixture.setMode("missing_ref"); outcome = await run(transaction, fixture); equal(outcome.status, "reconciliation_required"); equal(outcome.reasonCodes[0], "effect_reference_missing");
  fixture = scenario(transaction); fixture.setMode("postfail"); outcome = await run(transaction, fixture); equal(outcome.status, "reconciliation_required"); equal(outcome.reasonCodes[0], "postcondition_failed");
  fixture = scenario(transaction); fixture.setMode("precondition"); outcome = await run(transaction, fixture); equal(outcome.errorCode, "precondition_failed"); equal(fixture.calls.persist, 0); equal(fixture.calls.execute, 0);
  fixture = scenario(transaction); fixture.failPersistenceAt(2); outcome = await run(transaction, fixture); equal(outcome.status, "reconciliation_required"); equal(outcome.domainResult, "succeeded"); equal(outcome.persistence.persisted, false); equal(outcome.reconciliationRequired, true); equal(outcome.doNotRetryEffect, true); equal(fixture.calls.execute, 1);
  fixture = scenario(transaction, {delay: true}); const concurrentAuth = authorization(transaction, fixture.root()); const [left, right] = await Promise.all([run(transaction, fixture, {runtimeAuthorization: concurrentAuth}), run(transaction, fixture, {runtimeAuthorization: concurrentAuth})]); equal(fixture.calls.execute, 1); equal(left.status, right.status);
  const controller = new AbortController(); controller.abort(); fixture = scenario(transaction); outcome = await run(transaction, fixture, {signal: controller.signal}); equal(outcome.status, "cancelled_before_effect"); equal(fixture.calls.execute, 0); equal(fixture.calls.persist, 1); equal(outcome.attempt, 0);
  const failureTx = buildTransaction({authorization: "none", retry: "explicit_only"}); fixture = scenario(failureTx); fixture.setMode("failure"); outcome = await run(failureTx, fixture, {runtimeAuthorization: undefined}); const failedState = {transaction: {...failureTx, steps: failureTx.steps.map((step) => ({...step, state: fixture.checkpoint().steps.find((stored) => stored.stepId === step.stepId)!.state})), phase: fixture.checkpoint().phase} as UniversalTransactionPlan, checkpoint: fixture.checkpoint()}; const retry = prepareExplicitTransactionRetry(failedState, "step-a"); equal(retry.transaction.steps[0].state, "ready"); equal(retry.checkpoint.steps[0].attempts, 1);
  const reconciliationTx = buildTransaction({authorization: "none", retry: "after_reconciliation"}); fixture = scenario(reconciliationTx); fixture.setMode("uncertain"); await run(reconciliationTx, fixture, {runtimeAuthorization: undefined}); const reconState = {transaction: {...reconciliationTx, steps: reconciliationTx.steps.map((step) => ({...step, state: fixture.checkpoint().steps.find((stored) => stored.stepId === step.stepId)!.state})), phase: fixture.checkpoint().phase} as UniversalTransactionPlan, checkpoint: fixture.checkpoint()}; const projected = projectTransactionReconciliation(reconState, {stepId: "step-a", outcome: "confirmed_succeeded", references: [{type: "noticia", id: "doc:1"}]}); equal(projected.status, "projected_success"); equal(projected.executorInvoked, false); const projectedReuse = projectTransactionReconciliation(reconState, {stepId: "step-a", outcome: "confirmed_reused", references: [{type: "noticia", id: "doc:1"}]}); equal(projectedReuse.state.transaction.steps[0].state, "reused"); const retryReady = projectTransactionReconciliation(reconState, {stepId: "step-a", outcome: "confirmed_not_applied"}); equal(retryReady.status, "retry_ready"); equal(retryReady.state.transaction.steps[0].state, "ready"); const blocked = projectTransactionReconciliation(reconState, {stepId: "step-a", outcome: "insufficient"}); equal(blocked.status, "blocked"); equal(blocked.executorInvoked, false);
  const batchTx = buildTransaction({authorization: "none", twoSteps: true}); fixture = scenario(batchTx); const batch = await executeTransactionBatch({caseId: batchTx.caseId, transaction: batchTx, stepIds: ["step-b", "step-a"], expectedTransactionFingerprint: batchTx.transactionFingerprint, expectedCheckpointFingerprint: fixture.root(), runtime: fixture.runtime}); equal(batch.length, 2); equal(batch[0].stepId, "step-a"); equal(fixture.calls.execute, 2);
  await rejects(() => executeTransactionBatch({caseId: batchTx.caseId, transaction: batchTx, stepIds: ["step-a", "step-a"], expectedTransactionFingerprint: batchTx.transactionFingerprint, expectedCheckpointFingerprint: fixture.root(), runtime: fixture.runtime}), /step_ids_invalid/);
  const classified = classifyTransactionExecutorResult({step: transaction.steps[0], thrown: new Error("timeout")}); equal(classified.kind, "reconciliation_required");
  const pureClassified = classifyTransactionExecutorResult({step: {...transaction.steps[0], mode: "pure_transform"}, thrown: new Error("validation")}); equal(pureClassified.kind, "failed_deterministic");
  check(transactionExecutorSecurity.automaticExecution === false); check(transactionExecutorSecurity.automaticRetry === false); check(transactionExecutorSecurity.containsSanityLogic === false); check(transactionExecutorSecurity.containsProducerBranches === false); check(transactionExecutorSecurity.persistsRawResult === false);
  const serialized = JSON.stringify(fixture.checkpoint()).toLowerCase(); check(!serialized.includes('"token"')); check(!serialized.includes('"payload"')); check(!serialized.includes('"stack"')); check(!serialized.includes('"groq"')); check(!serialized.includes('"rawresponse"'));
  check(assertions >= 66, `Se esperaban al menos 66 comprobaciones y hubo ${assertions}`);
  console.log(`AU7 B3 transaction executor tests: OK (${assertions} assertions; gating, pre-persist, execution, idempotency, reconciliation, batch and zero real writes)`);
}
main();
