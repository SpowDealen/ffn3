import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {
  buildAutonomousProcessPresentation,
  buildBatchProcessPresentation,
  buildLabProcessPresentation,
  buildTransactionProcessPresentation,
  compareProcessAttention,
  processExperienceSecurity,
  selectProcessPresentations,
} from "../_laboratorio/laboratorio-ia/src/processes/presentation";
import {getActiveProcess, getProcesses, startProcess, updateProcess} from "../_laboratorio/laboratorio-ia/src/processes/store";
import type {LabProcess} from "../_laboratorio/laboratorio-ia/src/processes/types";
import ProcessExperienceSummary from "../_laboratorio/laboratorio-ia/src/processes/ProcessExperienceSummary";
import {adaptEditorialStatusFeedback, createGlobalFeedback} from "../_laboratorio/laboratorio-ia/src/feedback";
import {GlobalFeedbackRegion} from "../_laboratorio/laboratorio-ia/src/components/feedback/VisualFeedback";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");
const occurrences = (value: string, token: string): number => value.split(token).length - 1;

function describeTree(value: unknown): string {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(describeTree).join(" ");
  if (typeof value !== "object") return "";
  const node = value as {type?: unknown; props?: Record<string, unknown>};
  if (!node.props) return "";
  if (typeof node.type === "function") return describeTree(node.type(node.props));
  return [...Object.entries(node.props).filter(([key, child]) => key !== "children" && key !== "onClick" && child !== undefined).map(([key, child]) => `${key}:${String(child)}`), describeTree(node.props.children)].join(" ");
}

const NOW = "2026-08-22T10:05:00.000Z";
const lab = (overrides: Partial<LabProcess> = {}): LabProcess => ({
  id: "panel:one", label: "Preparando noticias", status: "running", current: 2, total: 5,
  startedAt: "2026-08-22T10:00:00.000Z", updatedAt: "2026-08-22T10:04:00.000Z",
  origin: "Panel IA · UFC", purpose: "Preparar lote editorial", subject: "Noticias UFC", kind: "batch", ...overrides,
});

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    state: "executing" as const, reasons: [], canStart: false, canExecuteNext: false, canExecuteSafeBatch: false,
    canPause: true, canResume: false, canRegenerate: false, canOpenReconciliation: false, canOpenCompensation: false,
    operational: {state: "executing", progress: {completed: 1, total: 3}, currentStep: {capability: "resolve:fighter"}, startedAt: "2026-08-22T10:00:00.000Z", updatedAt: NOW},
    steps: [{stepId: "one", capability: "inspect", state: "succeeded"}, {stepId: "two", capability: "resolve:fighter", state: "executing"}, {stepId: "three", capability: "resume", state: "pending"}],
    ...overrides,
  };
}

function autonomous(overrides: Record<string, unknown> = {}) {
  return {
    caseId: "case:one", state: "executing_supervised" as const, actionRequired: "continue" as const, staleReasons: [],
    transaction: {completed: 1, total: 3}, strategy: {steps: [{id: "one", objective: "Inspeccionar"}, {id: "two", objective: "Resolver"}, {id: "three", objective: "Reanudar"}]},
    loop: {phase: "executing"}, ...overrides,
  };
}

function main(): void {
  const running = buildLabProcessPresentation(lab(), Date.parse(NOW));
  equal(running.temporal, "live");
  equal(running.isLive, true);
  equal(running.isHistorical, false);
  equal(running.progress.kind, "determinate");
  if (running.progress.kind === "determinate") { equal(running.progress.current, 2); equal(running.progress.total, 5); }
  equal(running.elapsedLabel, "5 min");
  equal(running.source, "Panel IA · UFC");
  equal(running.purpose, "Preparar lote editorial");
  equal(running.subject, "Noticias UFC");

  const indeterminate = buildLabProcessPresentation(lab({current: undefined, total: undefined}));
  equal(indeterminate.progress.kind, "indeterminate");
  const indeterminateMarkup = describeTree(ProcessExperienceSummary({process: indeterminate}));
  equal(occurrences(indeterminateMarkup, "feedback-spinner"), 1, "un proceso indeterminado presenta una sola señal primaria de actividad");
  check(indeterminateMarkup.includes("aria-busy:true"), "el progreso indeterminado conserva aria-busy");
  check(indeterminateMarkup.includes("role:progressbar"), "el progreso indeterminado conserva progressbar");
  check(indeterminateMarkup.includes("aria-valuetext:Progreso en curso"), "el progreso indeterminado conserva texto accesible");
  check(!indeterminateMarkup.includes("aria-valuenow") && !indeterminateMarkup.includes("aria-valuemax"), "el progreso indeterminado no inventa métricas");

  const determinateMarkup = describeTree(ProcessExperienceSummary({process: running}));
  equal(occurrences(determinateMarkup, "feedback-spinner"), 1, "un proceso determinado mantiene una sola señal primaria de actividad");
  check(determinateMarkup.includes("aria-valuenow:2") && determinateMarkup.includes("aria-valuemax:5"), "el progreso determinado conserva sus métricas reales");

  const completed = buildLabProcessPresentation(lab({status: "success", finishedAt: NOW, detail: "Consultando la fuente oficial"}), Date.parse(NOW));
  equal(completed.state, "completed");
  equal(completed.temporal, "result");
  equal(completed.isLive, false);
  equal(completed.progress.kind, "determinate");
  equal(completed.detail, undefined, "completed no conserva detalle de fase viva");
  equal(completed.result, "Proceso completado.", "completed usa un resultado neutro derivado del estado real");
  const completedMarkup = describeTree(ProcessExperienceSummary({process: completed}));
  equal(occurrences(completedMarkup, "feedback-spinner"), 0, "completed no conserva spinner");
  check(!completedMarkup.includes("aria-busy:true"), "completed no se presenta como ocupado");
  check(!completedMarkup.includes("Consultando la fuente oficial"), "completed no presenta copy intermedio como resultado");
  check(completedMarkup.includes("Proceso completado."), "completed presenta resultado terminal verdadero");
  const completedRequestedAnnouncement = describeTree(ProcessExperienceSummary({process: completed, announce: true}));
  check(!completedRequestedAnnouncement.includes("aria-live"), "un terminal nunca convierte ProcessBar en live region aunque se solicite announce");
  check(!completedRequestedAnnouncement.includes("role:status"), "un terminal de ProcessBar queda visual pero silencioso");

  const localCompletedFeedback = adaptEditorialStatusFeedback({type: "success", message: "Fuente oficial actualizada"}, {source: "Panel Editorial", operation: "official_source_load"});
  const localCompletedMarkup = describeTree(GlobalFeedbackRegion({feedback: localCompletedFeedback}));
  equal(occurrences(localCompletedMarkup, "aria-live:polite"), 1, "el feedback local es la región viva terminal canónica");
  equal(occurrences(`${completedRequestedAnnouncement} ${localCompletedMarkup}`, "aria-live:polite"), 1, "ProcessBar terminal y feedback local no anuncian simultáneamente");

  const announcedRunningMarkup = describeTree(ProcessExperienceSummary({process: indeterminate, announce: true}));
  equal(occurrences(announcedRunningMarkup, "aria-live:polite"), 1, "running conserva una única región viva");
  check(announcedRunningMarkup.includes("role:status") && announcedRunningMarkup.includes("aria-busy:true"), "running conserva semántica accesible activa");

  const historicalFeedback = createGlobalFeedback({state: "completed", scope: "process", hierarchy: "global", title: "Proceso anterior", isHistorical: true});
  const historicalMarkup = describeTree(GlobalFeedbackRegion({feedback: historicalFeedback}));
  check(!historicalMarkup.includes("aria-live") && !historicalMarkup.includes("role:status"), "el histórico no se anuncia como vivo");
  const warningMarkup = describeTree(GlobalFeedbackRegion({feedback: createGlobalFeedback({state: "warning", scope: "process", hierarchy: "local", title: "Revisión requerida"})}));
  const errorMarkup = describeTree(GlobalFeedbackRegion({feedback: createGlobalFeedback({state: "error", scope: "process", hierarchy: "local", title: "Proceso fallido"})}));
  check(warningMarkup.includes("role:alert") && warningMarkup.includes("aria-live:assertive"), "warning conserva anuncio accesible");
  check(errorMarkup.includes("role:alert") && errorMarkup.includes("aria-live:assertive"), "error conserva anuncio accesible");
  const failed = buildLabProcessPresentation(lab({status: "error", finishedAt: NOW, detail: "Servicio no disponible"}));
  equal(failed.state, "error");
  equal(failed.retryAuthorized, false);
  equal(failed.cancelAuthorized, false);
  const failedMarkup = describeTree(ProcessExperienceSummary({process: failed}));
  equal(occurrences(failedMarkup, "feedback-spinner"), 0, "error terminal no conserva spinner");
  check(!failedMarkup.includes("aria-busy:true"), "error terminal no parece activo");

  const partial = buildBatchProcessPresentation({id: "batch", title: "Lote", source: "Panel IA", completed: 4, failed: 1, total: 5});
  equal(partial.state, "partial");
  equal(partial.temporal, "historical");
  equal(partial.batch?.failed, 1);
  equal(partial.progress.kind, "determinate");
  const partialMarkup = describeTree(ProcessExperienceSummary({process: partial}));
  check(partialMarkup.includes("Completado parcialmente") && !partialMarkup.includes("Proceso completado."), "partial conserva su semántica propia");
  const cancelledBatch = buildBatchProcessPresentation({id: "cancelled", title: "Lote", source: "Panel IA", completed: 1, failed: 0, total: 5, cancelled: true});
  equal(cancelledBatch.state, "cancelled");
  equal(cancelledBatch.isLive, false);
  const cancelledMarkup = describeTree(ProcessExperienceSummary({process: cancelledBatch}));
  check(cancelledMarkup.includes("Cancelado") && !cancelledMarkup.includes("No completado"), "cancelled no se presenta como error");

  const tx = buildTransactionProcessPresentation(transaction(), "case:one", {now: Date.parse(NOW), cancelAuthorized: true});
  equal(tx.state, "running");
  equal(tx.isLive, true);
  equal(tx.steps.length, 3);
  equal(tx.steps[0].state, "completed");
  equal(tx.steps[1].state, "active");
  equal(tx.steps[2].state, "pending");
  equal(tx.cancelAuthorized, true, "AU7 expone cancelación solo cuando la ejecución viva la autoriza");
  equal(tx.retryAuthorized, false);
  const blocked = buildTransactionProcessPresentation(transaction({state: "blocked", reasons: ["checkpoint_conflict"], canPause: false, operational: undefined}), "case:block");
  equal(blocked.state, "blocked");
  equal(blocked.blockerKind, "infrastructure");
  equal(blocked.blockedReason, "checkpoint_conflict");
  const domainBlocked = buildTransactionProcessPresentation(transaction({state: "blocked", reasons: ["authorization_required"], canPause: false, operational: undefined}), "case:domain");
  equal(domainBlocked.blockerKind, "domain");
  const partialTx = buildTransactionProcessPresentation(transaction({state: "failed", operational: {...transaction().operational, state: "partially_succeeded"}}), "case:partial");
  equal(partialTx.state, "partial");
  const historicTx = buildTransactionProcessPresentation(transaction({state: "completed", operational: {...transaction().operational, state: "completed"}, canPause: false}), "case:done");
  equal(historicTx.temporal, "historical");
  equal(historicTx.isLive, false);

  const supervised = buildAutonomousProcessPresentation(autonomous(), true);
  equal(supervised.state, "running");
  equal(supervised.isLive, true);
  equal(supervised.steps[0].state, "completed");
  equal(supervised.steps[1].state, "active");
  equal(supervised.retryAuthorized, false);
  equal(supervised.cancelAuthorized, false);
  const cancelled = buildAutonomousProcessPresentation(autonomous({state: "paused", loop: {phase: "cancelled", stopReason: "cancellation"}, actionRequired: "continue"}), false);
  equal(cancelled.state, "cancelled");
  equal(cancelled.isLive, false);
  const stale = buildAutonomousProcessPresentation(autonomous({state: "stale", staleReasons: ["checkpoint_changed"], actionRequired: "regenerate", loop: {phase: "paused"}}), false);
  equal(stale.state, "blocked");
  equal(stale.blockerKind, "infrastructure");
  equal(stale.intervention, "Regeneración explícita requerida");

  const ordered = selectProcessPresentations([historicTx, completed, blocked, running, tx]);
  assert.deepEqual(ordered.slice(0, 2).map((item) => item.id), ["au7:case:one", "panel:one"]); assertions += 1;
  equal(compareProcessAttention(running, blocked) < 0, true);
  equal(JSON.stringify(selectProcessPresentations([historicTx, completed, blocked, running, tx])), JSON.stringify(ordered), "orden concurrente determinista");

  startProcess({id: "les3:one", label: "Uno", origin: "Test", current: 0, total: 2});
  startProcess({id: "les3:two", label: "Dos", origin: "Test"});
  check(getProcesses().length >= 2, "el Process Store existente conserva procesos concurrentes");
  check(getProcesses().some((item) => item.id === "les3:one") && getProcesses().some((item) => item.id === "les3:two"), "start no reemplaza procesos con ids distintos");
  updateProcess("les3:one", {current: 1});
  equal(getProcesses().find((item) => item.id === "les3:one")?.current, 1);
  check(Boolean(getActiveProcess()), "getActiveProcess mantiene compatibilidad con consumidores legacy");

  const processFiles = readdirSync("_laboratorio/laboratorio-ia/src/processes");
  assert.deepEqual(processFiles.filter((file) => /store/i.test(file)), ["store.ts"]); assertions += 1;
  const presentationSource = source("_laboratorio/laboratorio-ia/src/processes/presentation.ts");
  check(!/\b(fetch|localStorage|sessionStorage|startProcess|updateProcess|completeProcess|failProcess)\b/.test(presentationSource), "presentation no ejecuta, persiste ni muta procesos");
  equal(processExperienceSecurity.createsStore, false);
  equal(processExperienceSecurity.schedulesWork, false);
  equal(processExperienceSecurity.executesWork, false);
  equal(processExperienceSecurity.retriesWork, false);
  equal(processExperienceSecurity.cancelsWork, false);
  equal(processExperienceSecurity.fetches, false);
  equal(processExperienceSecurity.persists, false);
  equal(processExperienceSecurity.mutatesDomain, false);
  equal(processExperienceSecurity.notificationPolicy, "milestones_only");

  const processBar = source("_laboratorio/laboratorio-ia/src/processes/ProcessBar.tsx");
  const summary = source("_laboratorio/laboratorio-ia/src/processes/ProcessExperienceSummary.tsx");
  const panel = source("_laboratorio/laboratorio-ia/src/components/PanelIA.tsx");
  const au7 = source("_laboratorio/laboratorio-ia/src/review/components/TransactionOperationalCenter.tsx");
  const au8 = source("_laboratorio/laboratorio-ia/src/review/components/AutonomousReviewCenter.tsx");
  const notifications = source("_laboratorio/laboratorio-ia/src/notifications/NotificationBell.tsx");
  check(processBar.includes("getProcesses") && processBar.includes("selectProcessPresentations"), "ProcessBar usa store y selector común");
  check(processBar.includes("aria-busy={hasLive ? true : undefined}"), "ProcessBar comunica ejecución viva y omite busy al terminar");
  check(processBar.includes("announce={process.isLive}") && !processBar.includes("aria-live="), "ProcessBar delega announcement por proceso vivo y su contenedor no es una live region");
  check(summary.includes("ProgressBar") && summary.includes("StepProgress") && summary.includes("ProcessingBadge"), "LES 3 reutiliza primitivas LES 1");
  check(summary.includes("data-process-temporal") && summary.includes("Registro histórico"), "la UI separa vivo e histórico");
  check(summary.includes("solo desde la autoridad de origen"), "la UI no inventa retry/cancel");
  check(panel.includes('origin: "Panel IA · UFC"') && panel.includes('kind: "batch"'), "Panel IA aporta metadata batch real");
  check(au7.includes("buildTransactionProcessPresentation") && au7.includes("ProcessExperienceSummary"), "AU7 usa capa LES 3");
  check(au8.includes("buildAutonomousProcessPresentation") && au8.includes("ProcessExperienceSummary"), "ejecución supervisada usa capa LES 3");
  check(!notifications.includes("ProcessExperienceSummary"), "Bell no duplica Process Experience");
  check(summary.includes("Las notificaciones registran solo hitos"), "LES 2 enlaza por hitos sin duplicar detalle");
  check(assertions >= 105, `se esperaban al menos 105 aserciones y hubo ${assertions}`);
  console.log(`LES 3 Process Experience: OK (${assertions} assertions; canonical terminal live region, one primary activity signal, live/history, determinate/indeterminate, terminal copy, complete/partial/error/blocked/cancelled, steps/batch, concurrent deterministic order, source metadata, authorized controls, ProcessBar/PanelIA/AU7/AU8, LES 1/LES 2 compatibility, one store, no authority or persistence)`);
}

main();
