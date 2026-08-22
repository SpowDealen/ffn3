import assert from "node:assert/strict";
import {existsSync, readdirSync, readFileSync} from "node:fs";
import {buildOperatorExperienceModel, operatorAdaptersSecurity} from "../_laboratorio/laboratorio-ia/src/operator/adapters";
import {operatorModelSecurity, type OperatorExperienceModel} from "../_laboratorio/laboratorio-ia/src/operator/model";
import type {LabNotification} from "../_laboratorio/laboratorio-ia/src/notifications/types";
import type {ProcessExperiencePresentation} from "../_laboratorio/laboratorio-ia/src/processes/presentation";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";
import {buildGlobalStatusModel, type GlobalStatusEffect, type SubsystemStatus, type SubsystemStatusState} from "../_laboratorio/laboratorio-ia/src/status/model";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");

function subsystem(id: SubsystemStatus["id"], state: SubsystemStatusState, effect: GlobalStatusEffect, options: Partial<SubsystemStatus> = {}): SubsystemStatus {
  return {id, label: id, state, effect, summary: `${id}:${state}`, activeCount: 0, currentIncidentCount: 0, historicalCount: 0, isLive: state === "active", ...options};
}

const HEALTHY = buildGlobalStatusModel([
  subsystem("runtime", "operational", "none", {route: "/editorial"}),
  subsystem("references", "operational", "none", {route: "/editorial"}),
  subsystem("telegram", "operational", "none", {route: "/telegram"}),
  subsystem("notifications", "operational", "none", {route: "/actividad"}),
  subsystem("processes", "idle", "none", {route: "/actividad"}),
  subsystem("review", "idle", "none", {route: "/revision"}),
]);

function notification(overrides: Partial<LabNotification> = {}): LabNotification {
  return {id: "notification:one", level: "error", title: "Fallo histórico", message: "Ya registrado", createdAt: "2026-08-20T10:00:00.000Z", read: false, deliveryStatus: "failed", ...overrides};
}

function process(overrides: Partial<ProcessExperiencePresentation> = {}): ProcessExperiencePresentation {
  return {id: "process:one", title: "Proceso editorial", state: "running", stateLabel: "En ejecución", feedbackState: "processing", temporal: "live", isLive: true, isHistorical: false, source: "Panel IA", purpose: "Preparar contenido", progress: {kind: "indeterminate"}, steps: [], retryAuthorized: false, cancelAuthorized: false, notificationPolicy: "milestones_only", ...overrides};
}

function reviewCase(overrides: Record<string, unknown> = {}): ReviewCase {
  return {schemaVersion: 1, id: "case:one", dedupeKey: "case:one", module: "editorial.builder", title: "Resolver referencia", status: "open", priority: "normal", subject: {type: "article"}, issues: [], resolutions: [], context: {}, createdAt: "2026-08-22T10:00:00.000Z", updatedAt: "2026-08-22T10:00:00.000Z", version: 1, resumeAttempts: 0, ...overrides} as ReviewCase;
}

function model(input: Partial<{notifications: LabNotification[]; processes: ProcessExperiencePresentation[]; reviewCases: ReviewCase[]; globalStatus: typeof HEALTHY}> = {}): OperatorExperienceModel {
  return buildOperatorExperienceModel({globalStatus: input.globalStatus ?? HEALTHY, notifications: input.notifications ?? [], processes: input.processes ?? [], reviewCases: input.reviewCases ?? []});
}

function main(): void {
  const historical = notification();
  const currentBlock = process({state: "blocked", stateLabel: "Bloqueado", feedbackState: "blocked", temporal: "current", isLive: false, blockerKind: "infrastructure", blockedReason: "runtime_unavailable"});
  const prioritized = model({notifications: [historical], processes: [currentBlock]});
  equal(prioritized.attention[0]?.id, "process:process:one", "1 current attention domina histórico");
  equal(prioritized.historicalCount, 0, "1 conteo histórico pertenece al modelo global autoritativo, no se reinventa");
  equal(model({notifications: [historical]}).currentAttentionCount, 0, "2 unread/fallo histórico no implica atención");
  equal(model({notifications: [notification({level: "success", deliveryStatus: "sent"})]}).state, "clear", "2 unread success tampoco altera salud");

  const activeWithoutAction = model({processes: [process()]});
  equal(activeWithoutAction.activeCount, 1, "3 proceso vivo aparece en curso");
  equal(activeWithoutAction.authorizedActionCount, 0, "3 activo no implica acción autorizada");
  equal(activeWithoutAction.active[0]?.actionable, false, "3 selector conserva ausencia de autoridad");
  equal(prioritized.state, "attention", "4 bloqueo actual escala");
  equal(prioritized.attention[0]?.priority, "immediate", "4 infraestructura escala primero");

  const pendingReview = model({reviewCases: [reviewCase()]});
  equal(pendingReview.reviewPendingCount, 1, "5 review pendiente se contabiliza");
  equal(pendingReview.attention[0]?.destination, "/revision", "5 review lleva a su autoridad");
  equal(model().state, "clear", "6 global operational no genera falsa atención");
  equal(model().currentAttentionCount, 0, "6 healthy queue vacía");

  const degradedGlobal = buildGlobalStatusModel([
    ...HEALTHY.subsystems.filter((entry) => entry.id !== "telegram"),
    subsystem("telegram", "degraded", "degraded", {label: "Telegram", route: "/telegram", currentIncidentCount: 1, reason: "health_failed"}),
  ]);
  const degraded = model({globalStatus: degradedGlobal});
  equal(degraded.attention[0]?.source, "health", "7 health degradado entra como señal actual");
  equal(degraded.attention[0]?.destination, "/telegram", "7 health degradado ofrece destino diagnóstico");
  equal(model({processes: [process({state: "error", stateLabel: "No completado", feedbackState: "error", temporal: "historical", isLive: false, isHistorical: true})]}).currentAttentionCount, 0, "8 error histórico no entra en attention");

  const operatorAdapter = source("_laboratorio/laboratorio-ia/src/operator/adapters.ts");
  const operatorSummary = source("_laboratorio/laboratorio-ia/src/operator/OperatorSummary.tsx");
  const deliveryStatus = source("_laboratorio/laboratorio-ia/src/notifications/NotificationDeliveryStatus.tsx");
  check(deliveryStatus.includes("retryNotificationDelivery") && !operatorAdapter.includes("retryNotificationDelivery") && !operatorSummary.includes("retryNotificationDelivery"), "9 retry authority sigue única en Notification Delivery");
  check(operatorSummary.includes("Abrir un destino no ejecuta acciones") && operatorSummary.includes("createsAuthority: false"), "10 action authority intacta");
  check(operatorSummary.includes("InteractionLink") && operatorSummary.includes("href: entry.destination"), "11 navegación usa link semántico LES 5");
  check(operatorSummary.includes("data-operator-origin") && operatorSummary.includes("authoritySource"), "12 origen/contexto preservado");

  const pendingChecks = buildGlobalStatusModel([subsystem("runtime", "recovering", "recovering", {route: "/editorial"})]);
  equal(model({globalStatus: pendingChecks}).state, "unknown", "13 sin confirmar se distingue de healthy");
  check(operatorSummary.includes("Todo comprobado, sin atención pendiente") && operatorSummary.includes("Todavía sin confirmar"), "13 empty healthy y unknown tienen copy distinto");
  const reviewCenter = source("_laboratorio/laboratorio-ia/src/review/components/ReviewCenter.tsx");
  check(reviewCenter.includes('title="No hay casos prioritarios"') && reviewCenter.includes('title="Sin coincidencias"'), "14 empty filtrado permanece distinto de ausencia total");

  equal(readdirSync("_laboratorio/laboratorio-ia/src/operator").some((name) => /store/i.test(name)), false, "15 no Operator Store");
  check(!/localStorage|sessionStorage|indexedDB/.test(operatorAdapter + operatorSummary), "16 sin persistencia");
  check(!/\bfetch\s*\(/.test(operatorAdapter + operatorSummary), "17 sin fetch en presentación/adapters");
  check(!/\b(POST|PUT|PATCH|DELETE)\b|createNotification|startProcess/.test(operatorAdapter + operatorSummary), "18 sin writes");
  for (const [key, value] of Object.entries(operatorModelSecurity)) equal(value, false, `security model ${key}`);
  equal(operatorAdaptersSecurity.pure, true, "adapter puro");
  for (const key of ["createsStore", "fetches", "persists", "writes", "executes", "retries", "createsAuthority"] as const) equal(operatorAdaptersSecurity[key], false, `security adapters ${key}`);

  const feedback = source("_laboratorio/laboratorio-ia/src/components/feedback/VisualFeedback.tsx");
  const activity = source("_laboratorio/laboratorio-ia/src/notifications/ActivityCenter.tsx");
  const processSummary = source("_laboratorio/laboratorio-ia/src/processes/ProcessExperienceSummary.tsx");
  const globalSummary = source("_laboratorio/laboratorio-ia/src/status/GlobalStatusSummary.tsx");
  const interactions = source("_laboratorio/laboratorio-ia/src/interactions/InteractionPrimitives.tsx");
  const css = source("_laboratorio/laboratorio-ia/src/styles.css");
  check(feedback.includes("GlobalFeedbackRegion"), "19 LES 1 compatible");
  check(activity.includes("buildNotificationPresentation") && operatorAdapter.includes("buildNotificationPresentation"), "20 LES 2 compatible");
  check(processSummary.includes("ProcessExperiencePresentation") && operatorAdapter.includes("ProcessExperiencePresentation"), "21 LES 3 compatible");
  check(globalSummary.includes("buildGlobalStatusModel") && globalSummary.includes("buildOperatorExperienceModel"), "22 LES 4 integrado sin sustituirlo");
  check(interactions.includes("canInvokeInteraction") && operatorSummary.includes("adaptNavigationInteraction"), "23 LES 5 compatible");
  check(css.includes("var(--motion-duration-standard)") && !/transition\s*:\s*all\b/i.test(css), "24 LES 6 compatible");

  const au7 = source("_laboratorio/laboratorio-ia/src/review/components/TransactionOperationalCenter.tsx");
  const au8 = source("_laboratorio/laboratorio-ia/src/review/components/AutonomousReviewCenter.tsx");
  check(au7.includes("view.canExecuteNext") && au7.includes("view.canOpenReconciliation"), "25 AU7 authority intacta");
  check(au8.includes('cta === "authorize"') && au8.includes("runAutonomousSupervisedLoop"), "26 AU8 authority intacta");
  check(existsSync("scripts/test-au10-final-certification.ts") && existsSync("_laboratorio/laboratorio-ia/src/review/components/OperatorExperienceNavigation.tsx"), "27 AU10 intacto");

  check(css.includes("@media (max-width: 390px)") && css.includes(".les7-operator-summary") && css.includes("grid-template-columns: 1fr"), "28 estructura mobile 390 segura");
  check(operatorSummary.includes('aria-labelledby="les7-operator-title"') && operatorSummary.includes("<h3") && operatorSummary.includes("<h4") && operatorSummary.includes("<ol>"), "29 headings, landmark y prioridad semántica");
  equal((operatorSummary.match(/aria-live=/g) ?? []).length, 0, "30 summary no duplica live region");
  equal((globalSummary.match(/aria-live=/g) ?? []).length, 1, "30 Global Status conserva única live region");
  check(operatorSummary.includes("data-operator-temporal") && operatorSummary.includes("registros históricos fuera de la prioridad actual"), "current e histórico se distinguen semánticamente");
  check(operatorSummary.includes("model.attention.slice(0, 4)") && operatorSummary.includes("model.active.slice(0, 3)"), "summary prioriza y limita densidad; no es inventario");
  check(operatorSummary.includes("Consultar histórico") && operatorSummary.includes('href: "/actividad"'), "histórico mantiene destino autoritativo");
  equal((globalSummary.match(/<OperatorSummary\b/g) ?? []).length, 1, "B3 Operator Summary no se duplica");
  const mobileLes7Rule = css.slice(css.indexOf("@media (max-width: 560px) { .global-status > .global-status-heading"), css.indexOf("@media (max-width: 390px) { .les7-operator-summary"));
  check(mobileLes7Rule.includes(".global-status > .global-status-heading { order: 1; }") && mobileLes7Rule.includes(".global-status > .les7-operator-summary { order: 2; }") && mobileLes7Rule.includes(".global-status > .global-status-metrics { order: 3; }") && mobileLes7Rule.includes(".global-status > .global-status-grid { order: 5; }"), "B3 mobile prioriza Operator Summary tras el encabezado y antes de métricas/cards");
  equal(css.slice(0, css.indexOf("@media (max-width: 560px) { .global-status > .global-status-heading")).includes(".global-status > .les7-operator-summary { order:"), false, "B3 desktop conserva el orden DOM original");
  equal((operatorSummary.match(/id=\"les7-operator-title\"/g) ?? []).length, 1, "B3 heading principal sigue único");
  equal((operatorSummary.match(/<section\b/g) ?? []).length, 3, "B3 landmarks de summary, attention y active permanecen únicos");
  equal((operatorSummary.match(/aria-live=/g) ?? []).length, 0, "B3 no añade live regions");
  check(globalSummary.includes('className="global-status-metrics"') && globalSummary.includes('className="global-status-grid"'), "B3 conserva métricas y cards de subsistemas");
  check(mobileLes7Rule.includes("grid-template-columns: 1fr") && css.includes("overflow-x: clip"), "B3 mobile permanece sin overflow horizontal");
  check(css.includes("@media (prefers-reduced-motion: reduce)") && css.includes("transition-duration: .001ms !important"), "B3 reduced motion intacto");
  check(!/retryNotificationDelivery|executeTransaction|runAutonomousSupervisedLoop/.test(operatorSummary), "B3 no crea autoridad ni ejecución");
  check(assertions >= 65, `se esperaban al menos 65 assertions y hubo ${assertions}`);
  console.log(`LES 7 Operator Experience: OK (${assertions} assertions; relevance/prioritization, current/history, health/process/review/notification integration, semantic navigation, mobile, no store/persistence/fetch/write/authority/live-region duplication)`);
}

main();
