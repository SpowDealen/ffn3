import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildEntityOperation} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import {createGlobalResolutionCheckpoint, finalizeGlobalResolutionPlan, resolveGlobalResolutionPlanningPolicy} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";
import {
  attachTransactionCheckpointExtension,
  buildReviewCenterTransaction,
  createReviewCenterTransactionRuntime,
  createTransactionCheckpointExtension,
  orchestrateTransaction,
  recoverReviewCenterTransaction,
  setReviewCenterTransactionPaused,
  transactionOperationalCenterSecurity,
  type TransactionCheckpointApplication,
  type UniversalTransactionCheckpoint,
} from "../_laboratorio/laboratorio-ia/src/review/transactions";

const NOW = "2026-08-12T10:00:00.000Z";
let assertions = 0;
const equal = <T>(actual: T, expected: T): void => { assert.equal(actual, expected); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };

function fixture(id: string, count = 2) {
  const reviewCase: ReviewCase = {schemaVersion: 1, id, dedupeKey: id, module: "external.news", title: "Centro transaccional", status: "open", priority: "normal", subject: {type: "noticia"}, issues: [], resolutions: [], context: {producer: "review_center", operation: "transversal_resolution"}, createdAt: NOW, updatedAt: NOW, version: 1, resumeAttempts: 0};
  const operations = Array.from({length: count}, (_, index) => buildEntityOperation({id: `validate:${index + 1}`, kind: "validate_entity", entityType: "noticia", payload: {scope: "validation", index}, source: "global_resolution", evidence: [], confidence: 1, risk: "low", preconditions: [], postconditions: [], dependencyIds: [], requiredCapability: `validate:noticia:${index + 1}`, compensatable: false, explanation: `Validación ${index + 1}`}));
  const planned = finalizeGlobalResolutionPlan({caseId: id, caseVersion: 1, producer: "review_center", originalOperation: "transversal_resolution", operations, policy: resolveGlobalResolutionPlanningPolicy({availableCapabilities: operations.map((operation) => operation.requiredCapability!), maximumRisk: "high"}), graphMetadata: {completionMode: "entity_resolution"}, now: () => NOW});
  if (!planned.ok) throw new Error(JSON.stringify(planned));
  const checkpoint = createGlobalResolutionCheckpoint({reviewCase, plan: planned.plan, capabilities: operations.map((operation) => ({id: operation.requiredCapability!, support: "contract_only", operationKinds: ["validate_entity"], description: "Validación lógica transaccional"})), phase: "planned", now: () => NOW});
  const plannedCase = {...reviewCase, globalResolution: checkpoint};
  const built = buildReviewCenterTransaction(plannedCase, {executors: [], now: () => NOW});
  if (!built.ok) throw new Error(built.reasons.join(","));
  const transactionCheckpoint = createTransactionCheckpointExtension({transaction: built.value.transaction, checkpoint, now: () => NOW});
  const attached = attachTransactionCheckpointExtension({reviewCase: plannedCase, checkpoint, transaction: transactionCheckpoint, now: NOW});
  return {reviewCase: {...plannedCase, globalResolution: attached}, build: built.value, transactionCheckpoint};
}

function application(value: ReturnType<typeof fixture>) {
  let checkpoint: UniversalTransactionCheckpoint = value.transactionCheckpoint;
  let root = value.reviewCase.globalResolution!.checkpointFingerprint;
  let executions = 0;
  const app: TransactionCheckpointApplication = {
    load: () => ({reviewCase: value.reviewCase, checkpoint, globalCheckpointFingerprint: root, currentContext: value.build.transaction.contextBinding}),
    persist(input) {
      if (input.expectedGlobalCheckpointFingerprint !== root) return {persisted: false, conflict: true, reasons: ["checkpoint_conflict"]};
      checkpoint = input.checkpoint;
      root = `sha256-v1:b6-${checkpoint.checkpointFingerprint.slice(-18)}`;
      executions += input.checkpoint.history.filter((event) => event.kind === "step_started").length > checkpoint.history.filter((event) => event.kind === "step_started").length ? 1 : 0;
      return {persisted: true, conflict: false, checkpointFingerprint: root};
    },
  };
  return {app, checkpoint: () => checkpoint, root: () => root, executions: () => executions};
}

async function main(): Promise<void> {
  const value = fixture("case:au7:b6:recover");
  const initial = recoverReviewCenterTransaction(value.reviewCase, {executors: [], now: () => NOW});
  equal(initial.recovery, "valid");
  equal(initial.state, "ready");
  equal(initial.operational?.progress.total, 2);
  equal(initial.operational?.progress.completed, 0);
  equal(initial.canExecuteNext, true);
  equal(initial.canExecuteSafeBatch, true);
  equal(initial.canPause, true);
  equal(initial.payloadsExposed, false);
  equal(value.transactionCheckpoint.steps.every((step) => step.attempts === 0), true);

  const safe = JSON.stringify(initial).toLowerCase();
  equal(safe.includes('"payload"'), false);
  equal(safe.includes('"token"'), false);
  equal(safe.includes('"secret"'), false);
  equal(safe.includes('"stack"'), false);

  const pausedValue = fixture("case:au7:b6:pause", 1);
  const pausedApp = application(pausedValue);
  let persisted = await setReviewCenterTransactionPaused({reviewCase: pausedValue.reviewCase, transaction: pausedValue.build.transaction, paused: true, checkpointApplication: pausedApp.app});
  equal(persisted.persisted, true);
  equal(pausedApp.checkpoint().operatorState, "paused");
  equal(pausedApp.checkpoint().history.some((event) => event.kind === "transaction_paused"), true);
  const pausedRuntime = createReviewCenterTransactionRuntime({reviewCase: pausedValue.reviewCase, build: pausedValue.build, checkpointApplication: pausedApp.app, now: () => NOW});
  let run = await orchestrateTransaction({caseId: pausedValue.reviewCase.id, transaction: pausedValue.build.transaction, expectedFingerprint: pausedValue.build.transaction.transactionFingerprint, expectedCheckpointFingerprint: pausedApp.root(), mode: "single_step", stepId: pausedValue.build.transaction.steps[0].stepId, runtime: pausedRuntime});
  equal(run.status, "paused");
  equal(run.stopReason, "paused");
  equal(run.executions.length, 0);
  equal(pausedApp.checkpoint().steps[0].attempts, 0);
  persisted = await setReviewCenterTransactionPaused({reviewCase: pausedValue.reviewCase, transaction: pausedValue.build.transaction, paused: false, checkpointApplication: pausedApp.app});
  equal(persisted.persisted, true);
  equal(pausedApp.checkpoint().operatorState, "active");
  equal(pausedApp.checkpoint().history.some((event) => event.kind === "transaction_resumed"), true);
  run = await orchestrateTransaction({caseId: pausedValue.reviewCase.id, transaction: pausedValue.build.transaction, expectedFingerprint: pausedValue.build.transaction.transactionFingerprint, expectedCheckpointFingerprint: pausedApp.root(), mode: "single_step", stepId: pausedValue.build.transaction.steps[0].stepId, runtime: pausedRuntime});
  equal(run.executions.length, 1);
  equal(run.status, "completed");
  equal(pausedApp.checkpoint().phase, "completed");

  const batchValue = fixture("case:au7:b6:batch");
  const batchApp = application(batchValue);
  const batchRuntime = createReviewCenterTransactionRuntime({reviewCase: batchValue.reviewCase, build: batchValue.build, checkpointApplication: batchApp.app, now: () => NOW});
  const batch = await orchestrateTransaction({caseId: batchValue.reviewCase.id, transaction: batchValue.build.transaction, expectedFingerprint: batchValue.build.transaction.transactionFingerprint, expectedCheckpointFingerprint: batchApp.root(), mode: "safe_batch", stepIds: batchValue.build.transaction.steps.map((step) => step.stepId), maxSteps: 2, runtime: batchRuntime});
  equal(batch.executions.length, 2);
  equal(batchApp.checkpoint().phase, "completed");
  equal(batchApp.checkpoint().steps.every((step) => step.attempts === 1), true);

  const stale = recoverReviewCenterTransaction({...value.reviewCase, title: "Contexto modificado"}, {executors: [], now: () => NOW});
  equal(stale.state, "stale");
  equal(stale.canRegenerate, true);
  equal(stale.canExecuteNext, false);

  const component = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/components/TransactionOperationalCenter.tsx", import.meta.url), "utf8");
  for (const label of ["Iniciar transacción", "Ejecutar siguiente step", "Ejecutar batch seguro", "Pausar", "Reanudar", "Abrir reconciliación", "Abrir compensación", "Regenerar si stale"]) check(component.includes(label), `Falta la acción ${label}`);
  for (const state of ["Planned", "Ready", "Executing", "Paused", "Blocked", "Reconciliation required", "Compensation required", "Completed", "Failed", "Stale"]) check(component.includes(state), `Falta el estado ${state}`);
  check(component.includes("aria-busy"));
  check(component.includes('role="status"'));
  check(component.includes('role="alert"'));
  check(component.includes("errorRef.current?.focus()"));
  check(component.includes("Timeline seguro"));

  equal(transactionOperationalCenterSecurity.autoExecuteOnOpen, false);
  equal(transactionOperationalCenterSecurity.rawPayloads, false);
  equal(transactionOperationalCenterSecurity.persistedAuthorization, false);
  equal(transactionOperationalCenterSecurity.automaticReconciliation, false);
  equal(transactionOperationalCenterSecurity.automaticCompensation, false);
  check(assertions >= 55, `Se esperaban al menos 55 comprobaciones y hubo ${assertions}`);
  console.log(`AU7 B6 transaction operational center tests: OK (${assertions} assertions; recovery, UI actions, pause/resume, safe batch, staleness, accessibility and zero real writes)`);
}

void main();
