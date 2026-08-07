import {computeUniversalFingerprint} from "../universal";
import type {ReviewJsonValue} from "../types";
import {deriveControlledCompensationPlan} from "./sagaCompensation";
import {executeTransactionStep} from "./executor";
import {deriveTransactionPhase} from "./stateMachine";
import {deriveTransactionStepReadiness, refreshTransactionReadiness} from "./readiness";
import type {TransactionCompensationRuntime, TransactionExecutionAuthorization, TransactionExecutionRuntime, TransactionStep, TransactionStepExecutionResult, UniversalTransactionCheckpoint, UniversalTransactionPlan} from "./types";

export type TransactionOrchestrationMode = "single_step" | "safe_batch" | "supervised_run";
export type TransactionStopReason = "completed" | "already_completed" | "paused" | "cancelled" | "max_steps_reached" | "authorization_required" | "high_risk_requires_operator" | "destructive_risk_requires_operator" | "transaction_stale" | "checkpoint_conflict" | "unsupported_step" | "step_failed" | "reconciliation_required" | "compensation_required" | "manual_intervention_required" | "invalid_mode" | "invalid_batch" | "unexpected_result";
export type TransactionIncidentKind = "step_failed" | "effect_uncertain" | "checkpoint_conflict" | "transaction_stale" | "authorization_required" | "manual_intervention_required" | "compensation_required" | "compensation_failed" | "unsupported_step" | "postcondition_failed" | "cancelled" | "max_steps_reached";
export type TransactionIncident = Readonly<{incidentId: string; transactionId: string; stepId?: string; severity: "info" | "warning" | "blocking" | "critical"; kind: TransactionIncidentKind; reasonCodes: readonly string[]; safeSummary: string; actionRequired: "none" | "inspect" | "authorize" | "reconcile" | "compensate" | "retry_explicit" | "human_review"; fingerprint: string}>;
export type TransactionIncidentPolicy = "continue" | "pause" | "stop" | "request_reconciliation" | "request_compensation" | "request_authorization" | "manual_review";
export type SafeTransactionStepDescriptor = Readonly<{stepId: string; operationId: string; capability: string; mode: TransactionStep["mode"]; risk: TransactionStep["risk"]; state: TransactionStep["state"]}>;
export type TransactionProgress = Readonly<{total: number; completed: number; executing: number; blocked: number; reconciliation: number; compensation: number; remaining: number}>;
export type TransactionTimelineEntry = Readonly<{id: string; kind: string; stepId?: string; status: string; occurredAt: string; reasonCodes: readonly string[]}>;
export type TransactionOperationalView = Readonly<{transactionId: string; state: UniversalTransactionPlan["phase"]; progress: TransactionProgress; currentStep?: SafeTransactionStepDescriptor; nextReadySteps: readonly SafeTransactionStepDescriptor[]; incidents: readonly TransactionIncident[]; authorizationRequired: readonly string[]; reconciliationRequired: readonly string[]; compensationRequired: readonly string[]; startedAt?: string; updatedAt: string; transactionFingerprint: string; timeline: readonly TransactionTimelineEntry[]}>;
export type TransactionNotificationEvent = Readonly<{kind: "transaction_started" | "transaction_progress" | "transaction_paused" | "transaction_blocked" | "reconciliation_required" | "authorization_required" | "compensation_required" | "transaction_completed" | "transaction_failed"; transactionId: string; fingerprint: string; safeSummary: string}>;
export type TransactionOrchestrationResult = Readonly<{mode: TransactionOrchestrationMode; status: "completed" | "paused" | "blocked" | "already_completed"; stopReason: TransactionStopReason; executions: readonly TransactionStepExecutionResult[]; incidents: readonly TransactionIncident[]; view: TransactionOperationalView; notificationEvents: readonly TransactionNotificationEvent[]}>;
export type TransactionOrchestrationRuntime = Readonly<{execution: TransactionExecutionRuntime; compensation?: TransactionCompensationRuntime; now?: () => string}>;

const terminal = new Set(["succeeded", "reused", "compensated", "skipped", "cancelled"]);
const nowDefault = () => new Date().toISOString();
const descriptor = (step: TransactionStep): SafeTransactionStepDescriptor => Object.freeze({stepId: step.stepId, operationId: step.operationId, capability: step.capability, mode: step.mode, risk: step.risk, state: step.state});

function restore(transaction: UniversalTransactionPlan, checkpoint: UniversalTransactionCheckpoint): UniversalTransactionPlan {
  const states = new Map(checkpoint.steps.map((step) => [step.stepId, step.state]));
  const steps = transaction.steps.map((step) => Object.freeze({...step, state: states.get(step.stepId) ?? step.state}));
  return refreshTransactionReadiness(Object.freeze({...transaction, steps: Object.freeze(steps), phase: deriveTransactionPhase(steps, transaction.blockers.length > 0)}));
}
function incident(input: Omit<TransactionIncident, "incidentId" | "fingerprint">): TransactionIncident {
  const fingerprint = computeUniversalFingerprint({...input, reasonCodes: [...input.reasonCodes].sort()} as unknown as ReviewJsonValue);
  return Object.freeze({...input, reasonCodes: Object.freeze([...new Set(input.reasonCodes)].sort()), fingerprint, incidentId: `transaction-incident:${input.transactionId}:${fingerprint.slice(-16)}`});
}
function uniqueIncidents(items: readonly TransactionIncident[]): readonly TransactionIncident[] { return Object.freeze([...new Map(items.map((item) => [item.incidentId, item])).values()].sort((left, right) => left.incidentId.localeCompare(right.incidentId))); }

export function policyForTransactionIncident(item: TransactionIncident): TransactionIncidentPolicy {
  if (item.kind === "authorization_required") return "request_authorization";
  if (item.kind === "effect_uncertain") return "request_reconciliation";
  if (item.kind === "compensation_required") return "request_compensation";
  if (item.kind === "manual_intervention_required") return "manual_review";
  if (item.kind === "max_steps_reached") return "pause";
  return item.severity === "info" || item.severity === "warning" ? "continue" : "stop";
}
function incidentForResult(transaction: UniversalTransactionPlan, execution: TransactionStepExecutionResult): TransactionIncident | undefined {
  const base = {transactionId: transaction.transactionId, stepId: execution.stepId, reasonCodes: execution.reasonCodes};
  if (execution.status === "succeeded" || execution.status === "reused_existing" || execution.status === "already_completed") return undefined;
  if (execution.errorCode === "authorization_required" || execution.errorCode === "authorization_invalid") return incident({...base, severity: "blocking", kind: "authorization_required", safeSummary: "El siguiente step requiere autorización vigente.", actionRequired: "authorize"});
  if (execution.errorCode === "transaction_stale") return incident({...base, severity: "blocking", kind: "transaction_stale", safeSummary: "El contexto de la transacción cambió y requiere regeneración.", actionRequired: "human_review"});
  if (execution.errorCode === "checkpoint_conflict") return incident({...base, severity: "blocking", kind: "checkpoint_conflict", safeSummary: "El checkpoint cambió antes de continuar.", actionRequired: "retry_explicit"});
  if (execution.status === "reconciliation_required") return incident({...base, severity: execution.persistence.persisted ? "blocking" : "critical", kind: "effect_uncertain", safeSummary: "El efecto requiere reconciliación antes de continuar.", actionRequired: "reconcile"});
  if (execution.status === "cancelled_before_effect") return incident({...base, severity: "warning", kind: "cancelled", safeSummary: "La operación se canceló en un límite seguro.", actionRequired: "none"});
  if (execution.errorCode === "executor_missing" || execution.errorCode === "executor_incompatible") return incident({...base, severity: "blocking", kind: "unsupported_step", safeSummary: "No existe un executor compatible para este step.", actionRequired: "human_review"});
  const postcondition = execution.reasonCodes.some((code) => code.includes("postcondition"));
  return incident({...base, severity: "blocking", kind: postcondition ? "postcondition_failed" : "step_failed", safeSummary: "El step no pudo completarse de forma segura.", actionRequired: "human_review"});
}

export function buildTransactionProgress(transaction: UniversalTransactionPlan): TransactionProgress {
  const completed = transaction.steps.filter((step) => terminal.has(step.state)).length;
  const executing = transaction.steps.filter((step) => step.state === "executing").length;
  const blocked = transaction.steps.filter((step) => step.state === "blocked" || step.state === "failed" || step.state === "compensation_failed").length;
  const reconciliation = transaction.steps.filter((step) => step.state === "reconciliation_required").length;
  const compensation = transaction.steps.filter((step) => step.state === "compensating" || step.state === "compensated").length;
  return Object.freeze({total: transaction.steps.length, completed, executing, blocked, reconciliation, compensation, remaining: Math.max(0, transaction.steps.length - completed)});
}
export function buildTransactionTimeline(checkpoint: UniversalTransactionCheckpoint): readonly TransactionTimelineEntry[] {
  return Object.freeze(checkpoint.history.map((entry) => Object.freeze({id: entry.id, kind: entry.kind, stepId: entry.stepId, status: entry.status, occurredAt: entry.occurredAt, reasonCodes: Object.freeze([...(entry.reasonCodes ?? [])])})).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id)));
}
export function buildTransactionOperationalView(input: {transaction: UniversalTransactionPlan; checkpoint: UniversalTransactionCheckpoint; incidents?: readonly TransactionIncident[]; now?: () => string}): TransactionOperationalView {
  const transaction = restore(input.transaction, input.checkpoint);
  const ready = transaction.steps.filter((step) => deriveTransactionStepReadiness(transaction, step).ready).sort((left, right) => left.stepId.localeCompare(right.stepId));
  const saga = deriveControlledCompensationPlan(transaction);
  const incidents = uniqueIncidents(input.incidents ?? []);
  return Object.freeze({transactionId: transaction.transactionId, state: transaction.phase, progress: buildTransactionProgress(transaction), currentStep: transaction.steps.find((step) => step.state === "executing") ? descriptor(transaction.steps.find((step) => step.state === "executing")!) : undefined, nextReadySteps: Object.freeze(ready.map(descriptor)), incidents, authorizationRequired: Object.freeze(ready.filter((step) => step.authorization !== "none").map((step) => step.stepId)), reconciliationRequired: Object.freeze(transaction.steps.filter((step) => step.state === "reconciliation_required").map((step) => step.stepId)), compensationRequired: Object.freeze([...saga.executableStepIds, ...saga.manualStepIds].sort()), startedAt: input.checkpoint.createdAt, updatedAt: (input.now ?? nowDefault)(), transactionFingerprint: transaction.transactionFingerprint, timeline: buildTransactionTimeline(input.checkpoint)});
}
export function buildTransactionIncidentSummary(incidents: readonly TransactionIncident[]): Readonly<{blocking: number; critical: number; actionRequired: readonly TransactionIncident["actionRequired"][]}> {
  return Object.freeze({blocking: incidents.filter((item) => item.severity === "blocking").length, critical: incidents.filter((item) => item.severity === "critical").length, actionRequired: Object.freeze([...new Set(incidents.map((item) => item.actionRequired).filter((item) => item !== "none"))].sort())});
}
function notificationEvents(result: Omit<TransactionOrchestrationResult, "notificationEvents">): readonly TransactionNotificationEvent[] {
  const kind: TransactionNotificationEvent["kind"] = result.status === "completed" ? "transaction_completed" : result.stopReason === "authorization_required" ? "authorization_required" : result.stopReason === "reconciliation_required" ? "reconciliation_required" : result.stopReason === "compensation_required" ? "compensation_required" : result.status === "paused" ? "transaction_paused" : "transaction_blocked";
  const safeSummary = result.status === "completed" ? "La transacción completó todos los steps conocidos." : `La transacción se detuvo: ${result.stopReason}.`;
  const base = {kind, transactionId: result.view.transactionId, safeSummary};
  return Object.freeze([{...base, fingerprint: computeUniversalFingerprint(base as unknown as ReviewJsonValue)}]);
}
function stopFromIncident(item: TransactionIncident): TransactionStopReason {
  if (item.kind === "authorization_required") return "authorization_required";
  if (item.kind === "effect_uncertain") return "reconciliation_required";
  if (item.kind === "checkpoint_conflict") return "checkpoint_conflict";
  if (item.kind === "transaction_stale") return "transaction_stale";
  if (item.kind === "unsupported_step") return "unsupported_step";
  if (item.kind === "cancelled") return "cancelled";
  return "step_failed";
}

export async function orchestrateTransaction(input: {caseId: string; transaction: UniversalTransactionPlan; expectedFingerprint: string; expectedCheckpointFingerprint: string; mode: TransactionOrchestrationMode; stepId?: string; stepIds?: readonly string[]; runtime: TransactionOrchestrationRuntime; runtimeAuthorizations?: readonly TransactionExecutionAuthorization[]; maxSteps?: number; pauseRequested?: () => boolean; signal?: AbortSignal}): Promise<TransactionOrchestrationResult> {
  const now = input.runtime.now ?? nowDefault;
  const incidents: TransactionIncident[] = [];
  const executions: TransactionStepExecutionResult[] = [];
  if (!["single_step", "safe_batch", "supervised_run"].includes(input.mode)) return finish("blocked", "invalid_mode");
  let expectedCheckpointFingerprint = input.expectedCheckpointFingerprint;
  let loops = 0;
  const seen = new Set<string>();
  const limit = Math.max(1, Math.min(input.maxSteps ?? (input.mode === "single_step" ? 1 : 50), 100));
  function snapshot() { return input.runtime.execution.checkpointApplication.load(input.caseId, input.transaction); }
  function view() { const current = snapshot(); return buildTransactionOperationalView({transaction: input.transaction, checkpoint: current?.checkpoint ?? {transactionId: input.transaction.transactionId, steps: [], history: [], createdAt: now(), updatedAt: now()} as unknown as UniversalTransactionCheckpoint, incidents, now}); }
  function finish(status: TransactionOrchestrationResult["status"], stopReason: TransactionStopReason): TransactionOrchestrationResult {
    const partial = {mode: input.mode, status, stopReason, executions: Object.freeze([...executions]), incidents: uniqueIncidents(incidents), view: view()};
    return Object.freeze({...partial, notificationEvents: notificationEvents(partial)});
  }
  const initial = snapshot();
  if (!initial) { incidents.push(incident({transactionId: input.transaction.transactionId, severity: "blocking", kind: "transaction_stale", reasonCodes: ["transaction_checkpoint_absent"], safeSummary: "No existe un checkpoint transaccional recuperable.", actionRequired: "human_review"})); return finish("blocked", "transaction_stale"); }
  if (initial.checkpoint.operatorState === "paused") return finish("paused", "paused");
  if (input.expectedFingerprint !== input.transaction.transactionFingerprint) { incidents.push(incident({transactionId: input.transaction.transactionId, severity: "blocking", kind: "transaction_stale", reasonCodes: ["transaction_fingerprint_mismatch"], safeSummary: "La transacción no coincide con el fingerprint esperado.", actionRequired: "human_review"})); return finish("blocked", "transaction_stale"); }
  if (initial.globalCheckpointFingerprint !== expectedCheckpointFingerprint) { incidents.push(incident({transactionId: input.transaction.transactionId, severity: "blocking", kind: "checkpoint_conflict", reasonCodes: ["checkpoint_fingerprint_mismatch"], safeSummary: "El checkpoint cambió antes de iniciar.", actionRequired: "retry_explicit"})); return finish("blocked", "checkpoint_conflict"); }
  if (initial.checkpoint.phase === "completed") return finish("already_completed", "already_completed");

  const explicit = input.mode === "single_step" ? input.stepId ? [input.stepId] : [] : input.mode === "safe_batch" ? [...(input.stepIds ?? [])] : undefined;
  if ((input.mode === "single_step" && explicit!.length !== 1) || (input.mode === "safe_batch" && (!explicit!.length || new Set(explicit!).size !== explicit!.length))) return finish("blocked", "invalid_batch");
  while (loops < limit) {
    if (input.signal?.aborted) { incidents.push(incident({transactionId: input.transaction.transactionId, severity: "warning", kind: "cancelled", reasonCodes: ["orchestration_cancelled"], safeSummary: "La operación supervisada fue cancelada en un límite seguro.", actionRequired: "none"})); return finish("paused", "cancelled"); }
    if (input.pauseRequested?.()) return finish("paused", "paused");
    const current = snapshot();
    if (!current) return finish("blocked", "transaction_stale");
    const restored = restore(input.transaction, current.checkpoint);
    const saga = deriveControlledCompensationPlan(restored, input.runtime.compensation ? {evidence: input.runtime.compensation.evidence, registry: input.runtime.compensation.registry} : {});
    if (restored.steps.some((step) => step.state === "reconciliation_required")) { incidents.push(incident({transactionId: restored.transactionId, severity: "blocking", kind: "effect_uncertain", reasonCodes: ["reconciliation_required"], safeSummary: "Hay un effect incierto pendiente de reconciliación.", actionRequired: "reconcile"})); return finish("blocked", "reconciliation_required"); }
    if (restored.phase === "completed") return finish("completed", "completed");
    const failedOrPartial = ["failed", "partially_succeeded", "compensation_failed", "partially_compensated"].includes(restored.phase);
    if (failedOrPartial && saga.manualStepIds.length) { incidents.push(incident({transactionId: restored.transactionId, severity: "blocking", kind: "manual_intervention_required", reasonCodes: ["manual_compensation_required"], safeSummary: "La transacción requiere decisión humana antes de compensar.", actionRequired: "human_review"})); return finish("blocked", "manual_intervention_required"); }
    if (failedOrPartial && saga.executableStepIds.length) { incidents.push(incident({transactionId: restored.transactionId, severity: "blocking", kind: "compensation_required", reasonCodes: ["compensation_required"], safeSummary: "Hay compensación disponible que requiere una acción explícita.", actionRequired: "compensate"})); return finish("blocked", "compensation_required"); }
    let candidates = restored.steps.filter((step) => deriveTransactionStepReadiness(restored, step).ready).sort((left, right) => left.stepId.localeCompare(right.stepId));
    if (explicit) candidates = candidates.filter((step) => explicit.includes(step.stepId));
    if (!candidates.length) return finish("blocked", "unexpected_result");
    const step = candidates[0];
    if (step.risk === "destructive") return finish("paused", "destructive_risk_requires_operator");
    if (step.risk === "high") return finish("paused", "high_risk_requires_operator");
    const authorization = input.runtimeAuthorizations?.find((item) => item.stepId === step.stepId && item.checkpointFingerprint === current.globalCheckpointFingerprint);
    if (step.authorization !== "none" && !authorization) { incidents.push(incident({transactionId: restored.transactionId, stepId: step.stepId, severity: "blocking", kind: "authorization_required", reasonCodes: ["authorization_required"], safeSummary: "El step listo requiere autorización efímera vigente.", actionRequired: "authorize"})); return finish("paused", "authorization_required"); }
    if (seen.has(step.stepId)) return finish("blocked", "unexpected_result");
    seen.add(step.stepId); loops += 1;
    const execution = await executeTransactionStep({caseId: input.caseId, transaction: input.transaction, stepId: step.stepId, expectedTransactionFingerprint: input.expectedFingerprint, expectedCheckpointFingerprint: current.globalCheckpointFingerprint, runtime: input.runtime.execution, runtimeAuthorization: authorization, signal: input.signal});
    executions.push(execution);
    if (execution.persistence.checkpointFingerprint) expectedCheckpointFingerprint = execution.persistence.checkpointFingerprint;
    const produced = incidentForResult(input.transaction, execution);
    if (produced) { incidents.push(produced); const policy = policyForTransactionIncident(produced); if (policy !== "continue") return finish(produced.kind === "cancelled" ? "paused" : "blocked", stopFromIncident(produced)); }
    if (explicit && executions.length >= explicit.length) {
      if (snapshot()?.checkpoint.phase === "completed") return finish("completed", "completed");
      return finish("paused", "max_steps_reached");
    }
  }
  incidents.push(incident({transactionId: input.transaction.transactionId, severity: "info", kind: "max_steps_reached", reasonCodes: ["max_steps_reached"], safeSummary: "Se alcanzó el límite explícito de steps supervisados.", actionRequired: "none"}));
  return finish("paused", "max_steps_reached");
}

export const transactionOrchestratorSecurity = Object.freeze({fullyAutonomous: false, autoCompensation: false, autoReconciliation: false, persistsOperationalView: false, persistsAuthorization: false, rawPayloads: false, rawErrors: false, notificationsSent: false});
