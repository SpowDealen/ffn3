import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {
  adaptNotificationsStatus,
  adaptProcessesStatus,
  adaptReferenceEntitiesStatus,
  adaptReviewStatus,
  adaptRuntimeStatus,
  adaptTelegramStatus,
  globalStatusAdaptersSecurity,
} from "../_laboratorio/laboratorio-ia/src/status/adapters";
import {
  buildGlobalStatusModel,
  GLOBAL_STATUS_PRECEDENCE,
  globalStatusSecurity,
  type GlobalStatusEffect,
  type SubsystemStatus,
  type SubsystemStatusState,
} from "../_laboratorio/laboratorio-ia/src/status/model";
import {buildLabProcessPresentation, type ProcessExperiencePresentation} from "../_laboratorio/laboratorio-ia/src/processes/presentation";
import type {LabNotification} from "../_laboratorio/laboratorio-ia/src/notifications/types";
import type {TelegramHealthResponse} from "../_laboratorio/laboratorio-ia/src/notifications/telegramHealth";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");

const IDS: SubsystemStatus["id"][] = ["runtime", "references", "telegram", "processes", "review", "notifications"];
function subsystem(id: SubsystemStatus["id"], state: SubsystemStatusState, effect: GlobalStatusEffect, options: Partial<SubsystemStatus> = {}): SubsystemStatus {
  return {id, label: id, state, effect, summary: `${id}:${state}`, activeCount: 0, currentIncidentCount: 0, historicalCount: 0, isLive: state !== "idle", ...options};
}

function notification(overrides: Partial<LabNotification> = {}): LabNotification {
  return {id: "notification:one", level: "error", title: "Fallo anterior", message: "Registro histórico", createdAt: "2026-08-20T10:00:00.000Z", read: false, deliveryStatus: "failed", ...overrides};
}

function health(overrides: Partial<TelegramHealthResponse> = {}): TelegramHealthResponse {
  return {ok: true, enabled: true, configured: true, tokenConfigured: true, chatIdConfigured: true, deliveryMode: "production", externalDispatchesAllowed: true, checkedAt: "2026-08-22T10:00:00.000Z", ...overrides};
}

function reviewCase(overrides: Record<string, unknown> = {}): ReviewCase {
  return {id: "case:one", status: "open", issues: [], resolutions: [], ...overrides} as unknown as ReviewCase;
}

function main(): void {
  assert.deepEqual(GLOBAL_STATUS_PRECEDENCE, ["unavailable", "blocked", "degraded", "recovering", "active", "attention", "operational", "idle"]); assertions += 1;
  equal(buildGlobalStatusModel([]).state, "idle");
  equal(buildGlobalStatusModel([subsystem("runtime", "operational", "none")]).state, "operational");
  equal(buildGlobalStatusModel([subsystem("runtime", "operational", "none"), subsystem("processes", "active", "active")]).state, "active");
  equal(buildGlobalStatusModel([subsystem("review", "attention", "attention")]).state, "attention");
  equal(buildGlobalStatusModel([subsystem("telegram", "degraded", "degraded")]).state, "degraded");
  equal(buildGlobalStatusModel([subsystem("references", "blocked", "blocked")]).state, "blocked");
  equal(buildGlobalStatusModel([subsystem("runtime", "unavailable", "unavailable")]).state, "unavailable");
  equal(buildGlobalStatusModel([subsystem("runtime", "recovering", "recovering")]).state, "recovering");

  const allEffects = [
    subsystem("review", "attention", "attention"), subsystem("processes", "active", "active"), subsystem("telegram", "degraded", "degraded"),
    subsystem("references", "blocked", "blocked"), subsystem("runtime", "unavailable", "unavailable"), subsystem("notifications", "recovering", "recovering"),
  ];
  equal(buildGlobalStatusModel(allEffects).state, "unavailable", "runtime unavailable domina");
  equal(buildGlobalStatusModel([...allEffects].reverse()).state, "unavailable", "la precedencia no depende del orden de entrada");
  assert.deepEqual(buildGlobalStatusModel([...allEffects].reverse()).subsystems.map((item) => item.id), IDS); assertions += 1;

  const runtimeChecking = adaptRuntimeStatus({state: "checking"});
  equal(runtimeChecking.state, "recovering");
  equal(runtimeChecking.effect, "recovering");
  const runtimeAvailable = adaptRuntimeStatus({state: "available", checkedAt: "2026-08-22T10:00:00.000Z"});
  equal(runtimeAvailable.state, "operational");
  equal(runtimeAvailable.effect, "none");
  const runtimeUnavailable = adaptRuntimeStatus({state: "unavailable", reason: "network"});
  equal(runtimeUnavailable.state, "unavailable");
  equal(runtimeUnavailable.effect, "unavailable");
  equal(runtimeUnavailable.currentIncidentCount, 1);

  const refsAvailable = adaptReferenceEntitiesStatus({state: "available", entityCount: 47});
  equal(refsAvailable.state, "operational");
  check(refsAvailable.summary.includes("47"), "Reference Entities presenta conteo real");
  const refsUnavailable = adaptReferenceEntitiesStatus({state: "unavailable", reason: "configuration_missing"});
  equal(refsUnavailable.state, "blocked");
  equal(refsUnavailable.effect, "blocked");
  equal(buildGlobalStatusModel([runtimeAvailable, refsUnavailable]).state, "blocked", "Reference Entities bloquea la operación transversal sin marcar Runtime caído");

  const telegramHealthy = adaptTelegramStatus({checking: false, health: health()});
  equal(telegramHealthy.state, "operational");
  equal(telegramHealthy.effect, "none");
  const telegramSandbox = adaptTelegramStatus({checking: false, health: health({deliveryMode: "sandbox", externalDispatchesAllowed: false})});
  equal(telegramSandbox.state, "operational");
  check(telegramSandbox.summary.includes("Sandbox seguro"), "Sandbox se presenta como estado vivo seguro");
  const telegramDisabled = adaptTelegramStatus({checking: false, health: health({ok: false, enabled: false, configured: false, externalDispatchesAllowed: false})});
  equal(telegramDisabled.state, "idle");
  equal(telegramDisabled.effect, "none", "deshabilitado por configuración no tumba el laboratorio");
  const telegramBlocked = adaptTelegramStatus({checking: false, health: health({ok: false, configured: false, externalDispatchesAllowed: false})});
  equal(telegramBlocked.state, "blocked");
  equal(telegramBlocked.effect, "degraded");
  const telegramUnavailable = adaptTelegramStatus({checking: false, health: null, error: "unavailable"});
  equal(telegramUnavailable.state, "unavailable");
  equal(telegramUnavailable.effect, "degraded", "Telegram es capacidad degradada, no caída global");

  const historicalFailure = adaptNotificationsStatus([notification()]);
  equal(historicalFailure.state, "operational");
  equal(historicalFailure.effect, "none");
  equal(historicalFailure.currentIncidentCount, 0, "error histórico no es incidencia viva");
  equal(historicalFailure.historicalCount, 1);
  check(historicalFailure.detail?.includes("1 sin leer"), "unread se conserva como métrica histórica");
  equal(buildGlobalStatusModel([runtimeAvailable, telegramHealthy, historicalFailure]).state, "operational", "fallo histórico Telegram no degrada health vivo sano");
  const unreadSuccess = adaptNotificationsStatus([notification({level: "success", deliveryStatus: "sent", read: false})]);
  equal(unreadSuccess.effect, "none", "unread no implica actividad ni incidencia");
  const pending = adaptNotificationsStatus([notification({level: "success", deliveryStatus: "pending", read: true})]);
  equal(pending.state, "active");
  equal(pending.activeCount, 1);

  const runningProcess = buildLabProcessPresentation({id: "process:one", label: "Procesando", status: "running", startedAt: "2026-08-22T10:00:00.000Z"});
  const activeProcesses = adaptProcessesStatus([runningProcess]);
  equal(activeProcesses.state, "active");
  equal(activeProcesses.activeCount, 1);
  equal(buildGlobalStatusModel([runtimeAvailable, activeProcesses]).state, "active");
  check(!activeProcesses.summary.includes("Procesando"), "estado global resume sin duplicar detalle del proceso");
  const historicalProcess = {...runningProcess, state: "error", temporal: "historical", isLive: false, isHistorical: true} as ProcessExperiencePresentation;
  const historicalProcesses = adaptProcessesStatus([historicalProcess]);
  equal(historicalProcesses.effect, "none", "proceso histórico no degrada el presente");
  const domainBlocked = {...runningProcess, state: "blocked", temporal: "current", isLive: false, isHistorical: false, blockerKind: "domain"} as ProcessExperiencePresentation;
  equal(adaptProcessesStatus([domainBlocked]).effect, "attention", "bloqueo local de dominio requiere atención sin caída global");
  const infrastructureBlocked = {...domainBlocked, blockerKind: "infrastructure"} as ProcessExperiencePresentation;
  equal(adaptProcessesStatus([infrastructureBlocked]).effect, "degraded", "bloqueo de infraestructura degrada");

  const reviewIdle = adaptReviewStatus([]);
  equal(reviewIdle.state, "idle");
  const reviewAttention = adaptReviewStatus([reviewCase()]);
  equal(reviewAttention.state, "attention");
  equal(reviewAttention.effect, "attention");
  const reviewActive = adaptReviewStatus([reviewCase({globalResolution: {transaction: {phase: "executing"}}})]);
  equal(reviewActive.state, "active");
  equal(reviewActive.activeCount, 1);
  const reviewBlocked = adaptReviewStatus([reviewCase({globalResolution: {transaction: {phase: "reconciliation_required"}}})]);
  equal(reviewBlocked.state, "blocked");
  equal(reviewBlocked.effect, "degraded", "AU7 bloquea su capacidad sin declarar Runtime unavailable");
  const au8Active = adaptReviewStatus([reviewCase({globalResolution: {autonomousLoop: {phase: "running"}}})]);
  equal(au8Active.state, "active");

  const degradedBefore = buildGlobalStatusModel([runtimeAvailable, telegramUnavailable]);
  const healthyAfter = buildGlobalStatusModel([runtimeAvailable, telegramHealthy, historicalFailure]);
  equal(degradedBefore.state, "degraded");
  equal(healthyAfter.state, "operational", "recuperación viva elimina degradación aunque quede histórico");
  const multipleDegraded = buildGlobalStatusModel([
    {...telegramUnavailable, reason: "telegram_down"},
    {...reviewBlocked, reason: "review_blocked"},
  ]);
  equal(multipleDegraded.state, "degraded");
  equal(multipleDegraded.reasons.length, 2);
  assert.deepEqual(multipleDegraded.reasons.map((item) => item.subsystemId), ["telegram", "review"]); assertions += 1;

  const statusFiles = readdirSync("_laboratorio/laboratorio-ia/src/status");
  equal(statusFiles.some((file) => /store/i.test(file)), false, "LES 4 no crea Global Status Store");
  const pureSources = [source("_laboratorio/laboratorio-ia/src/status/model.ts"), source("_laboratorio/laboratorio-ia/src/status/adapters.ts")].join("\n");
  check(!/\b(fetch|localStorage|sessionStorage|indexedDB|startProcess|createNotification|executeTransaction|runAutonomous)\b/.test(pureSources), "modelo y adapters no leen red/storage ni ejecutan dominio");
  for (const [key, value] of Object.entries(globalStatusSecurity)) equal(value, false, `security model ${key}`);
  equal(globalStatusAdaptersSecurity.pure, true);
  equal(globalStatusAdaptersSecurity.fetches, false);
  equal(globalStatusAdaptersSecurity.createsStore, false);

  const component = source("_laboratorio/laboratorio-ia/src/status/GlobalStatusSummary.tsx");
  const liveChecks = source("_laboratorio/laboratorio-ia/src/status/liveChecks.ts");
  const screen = source("_laboratorio/laboratorio-ia/src/app/screens/LaboratoryStatusScreen.tsx");
  check(component.includes("ProcessingBadge"), "LES 4 reutiliza primitiva LES 1");
  check(component.includes("buildNotificationPresentation") || pureSources.includes("buildNotificationPresentation"), "LES 4 reutiliza presentación LES 2");
  check(component.includes("buildLabProcessPresentation"), "LES 4 reutiliza presentación LES 3");
  equal(component.split("aria-live=").length - 1, 1, "existe una sola live region global");
  check(component.includes('className="global-status-announcement"') && !component.includes('<section className={`global-status global-status-${model.state}`} aria-labelledby="global-status-title" role='), "solo el encabezado actual anuncia; métricas históricas y tarjetas quedan fuera");
  check(!/\b(fetch|localStorage|sessionStorage|indexedDB)\b/.test(component), "presentation no contiene fetch ni storage");
  check(liveChecks.includes("getTelegramHealth") && liveChecks.includes('apiUrl("/api/reference-entities")'), "observación usa únicamente GETs vivos existentes");
  check(component.includes("Actualizar estado") && component.includes("setCheckVersion"), "la recuperación puede volver a comprobarse sin polling ni scheduler");
  check(component.includes("useReviewCases") && pureSources.includes("AU7 / AU8"), "Review/AU7/AU8 quedan integrados como lectura");
  check(screen.includes("GlobalStatusSummary") && !screen.includes("ActivityCenter"), "la pantalla raíz conserva una sola síntesis y evita duplicar el GET de Telegram de Activity Center");
  check(component.includes('route: "/actividad"') || pureSources.includes('route: "/actividad"'), "Activity Center sigue accesible como detalle autoritativo");
  check(!/\b(POST|PUT|PATCH|DELETE)\b/.test(component + liveChecks), "Global Status no invoca mutaciones HTTP");
  check(assertions >= 80, `se esperaban al menos 80 aserciones y hubo ${assertions}`);
  console.log(`LES 4 Global Status: OK (${assertions} assertions; operational/active/degraded/blocked/unavailable/recovering/attention/idle, deterministic precedence, live/history split, Runtime/References/Telegram/Notifications/Processes/Review, recovery, one live region, no parallel store or authority)`);
}

main();
