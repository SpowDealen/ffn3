import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {
  buildNotificationPresentation,
  compareNotificationAttention,
  notificationExperienceSecurity,
  selectBellNotifications,
} from "../_laboratorio/laboratorio-ia/src/notifications/presentation";
import type {
  LabNotification,
  NotificationLevel,
  NotificationPriority,
} from "../_laboratorio/laboratorio-ia/src/notifications/types";
import {adaptNotificationFeedback, adaptTelegramHealthFeedback} from "../_laboratorio/laboratorio-ia/src/feedback";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");
const occurrences = (value: string, token: string): number => value.split(token).length - 1;

function notification(
  id: string,
  level: NotificationLevel,
  priority: NotificationPriority,
  overrides: Partial<LabNotification> = {},
): LabNotification {
  return {
    id,
    level,
    priority,
    title: `Título ${id}`,
    message: `Detalle ${id}`,
    createdAt: "2026-08-21T10:00:00.000Z",
    read: false,
    source: "Panel IA",
    ...overrides,
  };
}

function main(): void {
  const historical = notification("historical", "error", "normal", {read: false});
  const historicalFeedback = adaptNotificationFeedback(historical);
  const liveFeedback = adaptTelegramHealthFeedback({
    checking: false,
    health: {
      ok: true,
      enabled: true,
      configured: true,
      tokenConfigured: true,
      chatIdConfigured: true,
      deliveryMode: "sandbox",
      externalDispatchesAllowed: false,
      checkedAt: "2026-08-21T10:00:00.000Z",
      skipped: true,
    },
  });
  equal(historicalFeedback.isHistorical, true, "la notificación almacenada es histórica");
  equal(liveFeedback.isHistorical, false, "Telegram Health conserva señal viva");
  equal(buildNotificationPresentation(historical).isHistorical, true);

  const readPresentation = buildNotificationPresentation({...historical, read: true});
  const unreadPresentation = buildNotificationPresentation(historical);
  equal(readPresentation.tone, unreadPresentation.tone, "unread no altera severidad");
  equal(unreadPresentation.unread, true);
  equal(unreadPresentation.isHistorical, true, "unread no implica activo");

  const critical = notification("critical", "success", "critical");
  const error = notification("error", "error", "normal");
  const warning = notification("warning", "review", "high");
  const success = notification("success", "success", "low");
  const ranked = [success, warning, critical, error];
  const before = JSON.stringify(ranked);
  const firstSelection = selectBellNotifications(ranked, 4);
  const secondSelection = selectBellNotifications(ranked, 4);
  assert.deepEqual(firstSelection.map(({id}) => id), ["critical", "error", "warning", "success"]); assertions += 1;
  assert.deepEqual(secondSelection.map(({id}) => id), firstSelection.map(({id}) => id)); assertions += 1;
  equal(JSON.stringify(ranked), before, "el selector no muta la entrada");
  check(compareNotificationAttention(critical, error) < 0, "critical precede a error");
  check(compareNotificationAttention(error, warning) < 0, "error precede a warning");
  check(compareNotificationAttention(warning, success) < 0, "warning precede a success");

  const grouped = buildNotificationPresentation(notification("grouped", "success", "normal", {
    groupKey: "source:ufc",
    updateCount: 3,
    count: 12,
    message: "Doce elementos procesados",
  }));
  equal(grouped.group.key, "source:ufc");
  equal(grouped.group.occurrences, 4, "updateCount conserva el evento inicial");
  equal(grouped.group.itemCount, 12, "el conteo de dominio no se confunde con ocurrencias");
  equal(grouped.group.label, "4 eventos agrupados");
  equal(grouped.message, "Doce elementos procesados", "agrupar no elimina detalle");

  equal(buildNotificationPresentation(notification("failed", "error", "normal", {deliveryStatus: "failed"})).delivery.retryable, true);
  for (const status of ["pending", "sent", "skipped"] as const) {
    equal(buildNotificationPresentation(notification(status, "success", "normal", {deliveryStatus: status})).delivery.retryable, false, `delivery ${status} no autoriza retry`);
  }

  const bell = source("_laboratorio/laboratorio-ia/src/notifications/NotificationBell.tsx");
  const activity = source("_laboratorio/laboratorio-ia/src/notifications/ActivityCenter.tsx");
  const delivery = source("_laboratorio/laboratorio-ia/src/notifications/NotificationDeliveryStatus.tsx");
  check(bell.includes("MAX_VISIBLE_NOTIFICATIONS = 5"), "Bell debe ser un resumen breve");
  check(bell.includes("selectBellNotifications"), "Bell usa orden determinista de atención");
  check(bell.includes('navigateLaboratory("/actividad")'), "Bell enlaza Activity Center");
  check(!bell.includes("NotificationDeliveryStatus"), "Bell no duplica controles operacionales");
  check(!bell.includes("retryNotificationDelivery"), "Bell no tiene autoridad de retry");
  equal(occurrences(activity, "<NotificationDeliveryStatus"), 1, "Activity Center expone una sola superficie de entrega");
  equal(occurrences(delivery, "Reintentar"), 1, "cada entrega tiene un único retry operable");
  check(delivery.includes('status === "failed"'), "retry depende del estado autorizado");
  check(delivery.includes("retryNotificationDelivery(notification.id)"), "retry reutiliza la autoridad existente");

  for (const token of ["levelFilter", "sourceFilter", "priorityFilter", "metricFilter", "normalizeSource"]) {
    check(activity.includes(token), `Activity Center conserva filtro ${token}`);
  }
  check(activity.includes('title={hasActiveFilters ? "Sin coincidencias" : "Sin actividad todavía"}'), "se conservan empty states contextuales");
  check(activity.includes("adaptNotificationFeedback"), "el detalle conserva metadata LES histórica");
  check(activity.includes("announce={false}"), "las tarjetas históricas no crean live regions");
  check(bell.includes("<FeedbackMeta feedback={feedback}"), "Bell identifica el registro histórico sin alarma");
  check(activity.includes("Historial de entregas Telegram"), "historial de delivery está identificado");
  check(activity.includes("Diagnóstico en vivo"), "health en vivo está separado");
  check(activity.includes("Entrega individual"), "resultado individual está separado de health e historial");
  check(activity.includes("Sandbox seguro") && activity.includes("Sin dispatches externos"), "sandbox mantiene copy operacional seguro");
  check(activity.includes("aria-expanded={detailExpanded}") && activity.includes("aria-controls={detailId}"), "detalle es accesible por teclado y lector");

  const notificationFiles = readdirSync("_laboratorio/laboratorio-ia/src/notifications");
  assert.deepEqual(notificationFiles.filter((file) => /store/i.test(file)), ["store.ts"]); assertions += 1;
  equal(notificationExperienceSecurity.createsStore, false);
  equal(notificationExperienceSecurity.retriesDelivery, false);
  equal(notificationExperienceSecurity.persistsState, false);
  const presentationSource = source("_laboratorio/laboratorio-ia/src/notifications/presentation.ts");
  check(!/\b(localStorage|sessionStorage|fetch|retryNotificationDelivery|createNotification)\b/.test(presentationSource), "presentación LES 2 es pura");

  const panel = source("_laboratorio/laboratorio-ia/src/components/PanelIA.tsx");
  check(panel.includes("notifySourceLoaded") && panel.includes("notifyAnalysisCompleted"), "Panel IA sigue produciendo por el canal existente");
  check(activity.includes("GlobalFeedbackRegion") && bell.includes("FeedbackEmptyState"), "LES 2 reutiliza primitivas LES 1");
  check(assertions >= 45, `se esperaban al menos 45 aserciones y hubo ${assertions}`);
  console.log(`LES 2 Notification Experience: OK (${assertions} assertions; history/live, deterministic grouping and priority, brief Bell, one authorized retry, Telegram separation, LES 1 compatibility, no parallel store)`);
}

main();
