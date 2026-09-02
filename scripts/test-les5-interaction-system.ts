import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {adaptProcessInteraction, adaptRefreshInteraction, adaptRetryInteraction, interactionAdaptersSecurity} from "../_laboratorio/laboratorio-ia/src/interactions/adapters";
import {buildInteractionCapability, canInvokeInteraction, interactionSystemSecurity} from "../_laboratorio/laboratorio-ia/src/interactions/model";
import type {ProcessExperiencePresentation} from "../_laboratorio/laboratorio-ia/src/processes/presentation";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");
const occurrences = (text: string, needle: string): number => text.split(needle).length - 1;

function process(overrides: Partial<ProcessExperiencePresentation> = {}): ProcessExperiencePresentation {
  return {
    id: "process:interaction",
    title: "Proceso",
    state: "running",
    stateLabel: "En ejecución",
    feedbackState: "processing",
    temporal: "live",
    isLive: true,
    isHistorical: false,
    source: "Process Store",
    purpose: "Validar autoridad",
    progress: {kind: "indeterminate"},
    steps: [],
    retryAuthorized: true,
    cancelAuthorized: true,
    notificationPolicy: "milestones_only",
    ...overrides,
  };
}

function main(): void {
  const primary = buildInteractionCapability({id: "execute", label: "Ejecutar", kind: "primary", intent: "execute", authority: {allowed: true, source: "AU7"}});
  equal(primary.kind, "primary");
  equal(primary.enabled, true);
  equal(primary.presentedLabel, "Ejecutar");
  equal(primary.authoritySource, "AU7");
  equal(canInvokeInteraction(primary), true);

  const secondary = buildInteractionCapability({id: "refresh", label: "Actualizar", kind: "secondary", intent: "refresh", authority: {allowed: true, source: "Runtime"}});
  equal(secondary.kind, "secondary");
  equal(secondary.destructive, false);

  const destructive = buildInteractionCapability({id: "cancel", label: "Cancelar", kind: "destructive", intent: "cancel", authority: {allowed: true, source: "AU7", confirmation: "domain"}});
  equal(destructive.destructive, true);
  equal(destructive.requiresConfirmation, true);
  equal(destructive.confirmation, "domain");

  const blocked = buildInteractionCapability({id: "blocked", label: "Continuar", kind: "primary", intent: "resume", authority: {allowed: false, source: "AU8", reason: "Requiere evidencia suficiente."}});
  equal(blocked.enabled, false);
  equal(blocked.disabledReason, "Requiere evidencia suficiente.");
  equal(canInvokeInteraction(blocked), false, "disabled no es invocable");

  const blockedDefault = buildInteractionCapability({id: "blocked-default", label: "Continuar", kind: "primary", intent: "resume", authority: {allowed: false, source: "AU8"}});
  check(blockedDefault.disabledReason?.includes("autoridad de origen"), "disabled sin copy específico conserva explicación segura");

  const busy = buildInteractionCapability({id: "busy", label: "Actualizar", busyLabel: "Actualizando…", kind: "secondary", intent: "refresh", authority: {allowed: true, source: "Runtime"}, busy: true});
  equal(busy.busy, true);
  equal(busy.enabled, false);
  equal(busy.presentedLabel, "Actualizando…");
  equal(canInvokeInteraction(busy), false, "busy evita una segunda interacción");
  check(Boolean(busy.disabledReason), "busy expone motivo");

  const refreshReady = adaptRefreshInteraction({id: "status-refresh", label: "Actualizar estado", busyLabel: "Actualizando estado…", busy: false, source: "LES 4"});
  const refreshBusy = adaptRefreshInteraction({id: "status-refresh", label: "Actualizar estado", busyLabel: "Actualizando estado…", busy: true, source: "LES 4"});
  equal(refreshReady.enabled, true);
  equal(refreshReady.intent, "refresh");
  equal(refreshBusy.enabled, false);
  equal(refreshBusy.presentedLabel, "Actualizando estado…");

  const retryDenied = adaptRetryInteraction({id: "retry", authorized: false, source: "Notification Store", reason: "Entrega no fallida."});
  const retryAllowed = adaptRetryInteraction({id: "retry", authorized: true, source: "Notification Store"});
  equal(retryDenied.enabled, false);
  equal(retryDenied.disabledReason, "Entrega no fallida.");
  equal(retryAllowed.enabled, true);
  equal(retryAllowed.intent, "retry");

  const liveProcess = process();
  equal(adaptProcessInteraction(liveProcess, "retry").enabled, true, "proceso activo conserva retry autorizado");
  const cancel = adaptProcessInteraction(liveProcess, "cancel");
  equal(cancel.enabled, true);
  equal(cancel.kind, "destructive");
  equal(cancel.confirmation, "domain");
  const unauthorizedProcess = adaptProcessInteraction(process({retryAuthorized: false}), "retry");
  equal(unauthorizedProcess.enabled, false);
  check(unauthorizedProcess.disabledReason?.includes("no autoriza"), "Process presenta autoridad ausente");
  const completedProcess = process({state: "completed", stateLabel: "Completado", temporal: "historical", isLive: false, isHistorical: true});
  const completedRetry = adaptProcessInteraction(completedProcess, "retry");
  equal(completedRetry.enabled, false, "proceso terminal no mantiene acción viva");
  check(completedRetry.disabledReason?.includes("terminal"), "proceso terminal explica indisponibilidad");

  for (const [key, value] of Object.entries(interactionSystemSecurity)) equal(value, false, `security model ${key}`);
  equal(interactionAdaptersSecurity.pure, true);
  equal(interactionAdaptersSecurity.fetches, false);
  equal(interactionAdaptersSecurity.persists, false);
  equal(interactionAdaptersSecurity.writes, false);
  equal(interactionAdaptersSecurity.createsAuthority, false);

  const directory = readdirSync("_laboratorio/laboratorio-ia/src/interactions");
  equal(directory.some((file) => /store/i.test(file)), false, "LES 5 no crea Interaction Store");
  const modelSource = source("_laboratorio/laboratorio-ia/src/interactions/model.ts");
  const adaptersSource = source("_laboratorio/laboratorio-ia/src/interactions/adapters.ts");
  const primitives = source("_laboratorio/laboratorio-ia/src/interactions/InteractionPrimitives.tsx");
  const interactionSources = `${modelSource}\n${adaptersSource}\n${primitives}`;
  check(!/\b(fetch|localStorage|sessionStorage|indexedDB|POST|PUT|PATCH|DELETE)\b/.test(interactionSources), "interactions no contiene fetch, storage ni writes HTTP");
  check(!/\b(window\.confirm|createNotification|retryNotificationDelivery|executeTransaction|runAutonomous)\b/.test(interactionSources), "primitivas no confirman ni ejecutan dominio");
  check(primitives.includes("disabled={disabled}") && primitives.includes("aria-busy"), "botón expone disabled y busy nativos");
  check(primitives.includes("aria-describedby") && primitives.includes("ActionReason"), "disabled reason queda asociado de forma accesible");
  check(primitives.includes("data-requires-confirmation") && primitives.includes("capability.confirmation"), "confirmation solo se presenta desde capability");
  check(primitives.includes("if (canInvokeInteraction(capability)) onInvoke();"), "handler queda protegido por capability");
  equal(occurrences(primitives, "onInvoke();"), 1, "un evento delega una sola vez al handler");
  equal(occurrences(primitives, "style={style}"), 1, "InteractionButton reenvía un único objeto style sin mezclar bordes internamente");
  check(!primitives.includes("borderColor") && !primitives.includes("...style"), "InteractionButton no compone border shorthand/longhand durante rerender");
  check(primitives.includes("return <a") && primitives.includes('data-interaction-intent="navigate"'), "navegación usa enlace semántico");
  check(primitives.includes('role="link"') && primitives.includes('aria-disabled="true"'), "navegación no disponible mantiene semántica explícita");

  const globalStatus = source("_laboratorio/laboratorio-ia/src/status/GlobalStatusSummary.tsx");
  check(globalStatus.includes("InteractionButton") && globalStatus.includes("adaptRefreshInteraction"), "Global Status integra refresh LES 5");
  equal(occurrences(globalStatus, 'label: "Actualizar estado"'), 1, "Global Status tiene un único refresh");
  check(globalStatus.includes('busy: refreshing') && globalStatus.includes('checks.runtime.state === "checking"'), "refresh deriva busy de la observación viva");
  check(globalStatus.includes("InteractionLink") && globalStatus.includes("adaptNavigationInteraction"), "detalle global se presenta como navegación");

  const activity = source("_laboratorio/laboratorio-ia/src/notifications/ActivityCenter.tsx");
  check(activity.includes("InteractionButton") && activity.includes("telegramCheckCapability"), "Telegram integra refresh LES 5");
  equal(occurrences(activity, 'label: "Actualizar estado"'), 1, "Telegram conserva un único refresh seguro con lenguaje operativo");
  check(activity.includes("getTelegramHealth()") && !activity.includes("testTelegramHealth"), "refresh Telegram usa GET y no presenta el POST de prueba como diagnóstico neutral");
  check(activity.includes("setIsCheckingTelegram(true);") && activity.includes("if (isCheckingTelegram) return;"), "diagnóstico inicial y refresh bloquean doble GET");
  equal(occurrences(activity, "retryTelegramHealth"), 0, "no queda handler de refresh duplicado");
  equal(occurrences(activity, "onAction="), 0, "feedback Telegram no duplica la acción explícita");
  check(activity.includes("Limpiar filtros") && activity.includes('setLevelFilter("all")') && activity.includes('setMetricFilter(null)'), "Activity Center limpia todos sus filtros");
  check(activity.includes('title={hasActiveFilters ? "Sin coincidencias"'), "Activity Center distingue empty filtrado");
  check(activity.includes("aria-expanded={detailExpanded}") && activity.includes("aria-controls={detailId}"), "detalle de actividad conserva disclosure accesible");
  const itemActionStyles = activity.slice(activity.indexOf("itemAction: {"), activity.indexOf("detailPanel: {"));
  check(itemActionStyles.includes("minHeight: 44") && itemActionStyles.includes('padding: "8px 10px"'), "Marcar como leída y Ver/Ocultar detalle tienen target de 44px");
  check(activity.includes("Marcar como leída") && activity.includes('detailExpanded ? "Ocultar detalle" : "Ver detalle"'), "copy y semántica de acciones de actividad permanecen intactos");
  const clearFilterStyles = activity.slice(activity.indexOf("clearFilters: {"), activity.indexOf("contentGrid: {"));
  check(clearFilterStyles.includes("minHeight: 44") && clearFilterStyles.includes('padding: "8px 10px"'), "Limpiar filtros tiene target de 44px");
  const telegramButtonStyles = activity.slice(activity.indexOf("checkTelegramButton: {"), activity.indexOf("liveTelegramGrid: {"));
  check(telegramButtonStyles.includes("minHeight: 44") && telegramButtonStyles.includes('padding: "8px 12px"'), "refresh Telegram tiene target de 44px");
  check(!telegramButtonStyles.includes("borderColor") && occurrences(telegramButtonStyles, "border:") === 2, "Telegram usa solo border shorthand en normal y busy");
  const itemActionsStyles = activity.slice(activity.indexOf("itemActions: {"), activity.indexOf("itemAction: {"));
  check(itemActionsStyles.includes('flexWrap: "wrap"'), "acciones de actividad envuelven en móvil sin overflow");

  const delivery = source("_laboratorio/laboratorio-ia/src/notifications/NotificationDeliveryStatus.tsx");
  equal(occurrences(delivery, 'label: "Reintentar"'), 1, "entrega mantiene un único retry");
  check(delivery.includes('status === "failed"') && delivery.includes("retryNotificationDelivery(notification.id)"), "retry sigue delegado a Notification Store");
  check(delivery.includes("InteractionButton") && !delivery.includes("event.currentTarget.disabled"), "retry usa capability y elimina disabled imperativo");
  const bell = source("_laboratorio/laboratorio-ia/src/notifications/NotificationBell.tsx");
  check(!bell.includes("retryNotificationDelivery"), "Bell no duplica retry");

  const processSummary = source("_laboratorio/laboratorio-ia/src/processes/ProcessExperienceSummary.tsx");
  check(processSummary.includes("<details") && processSummary.includes("<summary>Contexto y siguiente acción</summary>"), "Process usa disclosure nativo estable");
  check(processSummary.includes("solo desde la autoridad de origen"), "Process identifica autoridad externa");

  const review = source("_laboratorio/laboratorio-ia/src/review/components/ReviewCenter.tsx");
  check(review.includes("Limpiar filtros") && review.includes("Sin coincidencias"), "Review conserva clear y empty filtrado");
  const au7 = source("_laboratorio/laboratorio-ia/src/review/components/TransactionOperationalCenter.tsx");
  for (const authority of ["view.canStart", "view.canExecuteNext", "view.canExecuteSafeBatch", "view.canPause", "view.canResume", "view.canOpenReconciliation", "view.canOpenCompensation"]) check(au7.includes(authority), `AU7 conserva ${authority}`);
  check(occurrences(au7, "window.confirm") >= 3, "AU7 conserva confirmación/autorización de dominio");
  check(au7.includes("review-button-danger") && au7.includes("Abrir compensación"), "AU7 mantiene jerarquía destructiva");
  const au8 = source("_laboratorio/laboratorio-ia/src/review/components/AutonomousReviewCenter.tsx");
  check(au8.includes('cta === "authorize"') && au8.includes('cta === "reconcile"') && au8.includes('cta === "compensate"'), "AU8 conserva action authority");
  check(au8.includes("window.confirm") && au8.includes("review-button-danger"), "AU8 conserva confirmación y jerarquía de riesgo");

  const panel = source("_laboratorio/laboratorio-ia/src/components/PanelIA.tsx");
  check(panel.includes("disabled={") && panel.includes("window.confirm"), "PanelIA mantiene busy/disabled y confirmaciones existentes");
  const les1 = source("_laboratorio/laboratorio-ia/src/components/feedback/VisualFeedback.tsx");
  check(les1.includes("GlobalFeedbackRegion") && globalStatus.includes("ProcessingBadge"), "compatibilidad LES 1");
  check(globalStatus.includes("adaptNotificationsStatus") && delivery.includes("adaptRetryInteraction"), "compatibilidad LES 2");
  check(adaptersSource.includes("ProcessExperiencePresentation") && processSummary.includes("ProcessExperiencePresentation"), "compatibilidad LES 3");
  check(globalStatus.includes("buildGlobalStatusModel") && globalStatus.includes("InteractionLink"), "compatibilidad LES 4");

  const css = source("_laboratorio/laboratorio-ia/src/styles.css");
  check(css.includes(".interaction-control") && css.includes("min-height: 44px"), "touch target consistente");
  check(css.includes(".process-experience-details summary { display: flex; align-items: center; min-height: 44px; padding: 7px 0;"), "summary nativo de Process Experience tiene target de 44px");
  check(css.includes("@media (max-width: 560px)") && css.includes(".interaction-control > .review-button { width: 100%; }"), "estructura mobile-safe");
  check(css.includes(".laboratory-app-shell") && css.includes("overflow-x: clip") && css.includes(".interaction-control { display: inline-grid; gap: 4px; min-width: 0; }"), "no se introduce overflow horizontal estructural");
  check(css.includes("button:focus-visible") && css.includes("summary:focus-visible"), "foco visible global");
  check(css.includes(".review-button-danger") && css.includes(".interaction-link"), "destructiva y navegación son visualmente distintas");
  check(css.includes("border-style: dashed") && css.includes("cursor: not-allowed"), "disabled no depende solo de opacity");
  check(!primitives.includes("aria-live") && !primitives.includes("ProcessingBadge") && occurrences(globalStatus, "aria-live=") === 1, "B3 no añade spinner ni live regions duplicadas");
  check(assertions >= 110, `se esperaban al menos 110 assertions y hubo ${assertions}`);
  console.log(`LES 5 Interaction System: OK (${assertions} assertions; hierarchy, disabled reason, busy, retry/refresh uniqueness, disclosures, navigation, filters, terminal process, AU7/AU8 authority, confirmation presentation, accessibility, mobile and zero parallel authority)`);
}

main();
