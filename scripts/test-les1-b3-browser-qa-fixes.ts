import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {adaptNotificationFeedback, adaptTelegramHealthFeedback, createGlobalFeedback} from "../_laboratorio/laboratorio-ia/src/feedback";
import {
  FeedbackBanner,
  FeedbackEmptyState,
  GlobalFeedbackRegion,
  InlineLoader,
  ProcessingBadge,
  ProgressBar,
} from "../_laboratorio/laboratorio-ia/src/components/feedback/VisualFeedback";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");

function describeTree(value: unknown): string {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(describeTree).join(" ");
  if (typeof value !== "object") return "";
  const node = value as {type?: unknown; props?: Record<string, unknown>};
  if (!node.props) return "";
  if (typeof node.type === "function") return describeTree(node.type(node.props));
  return [...Object.entries(node.props).filter(([key]) => key !== "children" && key !== "onClick").map(([key, child]) => `${key}:${String(child)}`), describeTree(node.props.children)].join(" ");
}

function occurrences(value: string, token: string): number {
  return value.split(token).length - 1;
}

function main(): void {
  const historicalFailure = adaptNotificationFeedback({id: "historical-failure", level: "error", title: "Entrega fallida", message: "Fallo conservado", createdAt: "2026-08-16T10:00:00.000Z", read: false, deliveryStatus: "failed"});
  const liveSandbox = adaptTelegramHealthFeedback({checking: false, health: {ok: true, enabled: true, configured: true, tokenConfigured: true, chatIdConfigured: true, deliveryMode: "sandbox", externalDispatchesAllowed: false, checkedAt: "2026-08-21T10:00:00.000Z", skipped: true}});
  equal(historicalFailure.isHistorical, true);
  equal(historicalFailure.state, "error");
  equal(liveSandbox.state, "success", "la señal viva sana debe conservar prioridad semántica");
  equal(liveSandbox.scope, "sandbox");

  const activity = source("_laboratorio/laboratorio-ia/src/notifications/ActivityCenter.tsx");
  check(activity.includes("Errores históricos sin leer"), "los fallos almacenados deben etiquetarse como históricos");
  check(!activity.includes("Errores activos"), "un contador de historial no puede presentarse como error activo");
  check(activity.includes("hasLiveTelegramIncident"), "solo una señal viva debe activar la incidencia actual");
  check(activity.includes("Telegram en vivo"), "el resumen debe presentar la salud viva por separado");
  check(activity.includes("Fallos registrados"), "el fallo histórico debe seguir visible");
  check(activity.includes("Métricas históricas; no representan por sí solas la salud actual"), "las métricas históricas deben explicar su alcance");

  const panel = source("_laboratorio/laboratorio-ia/src/components/PanelIA.tsx");
  const referenceLoading = panel.slice(panel.indexOf('<FeedbackBanner state="loading" title="Actualizando referencias editoriales">'), panel.indexOf('<FeedbackBanner state="loading" title="Actualizando referencias editoriales">') + 320);
  check(referenceLoading.includes("Consultando las referencias disponibles"), "la carga de referencias debe conservar contexto");
  check(!referenceLoading.includes("InlineLoader"), "la misma carga no debe renderizar un segundo spinner");
  check(!panel.includes("GlobalFeedbackRegion, InlineLoader"), "PanelIA no debe conservar el loader duplicado en imports");

  const bannerTree = describeTree(FeedbackBanner({state: "loading", title: "Cargando referencias", children: "Consultando datos"}));
  equal(occurrences(bannerTree, "aria-live:polite"), 1, "banner y badge no deben anunciar por separado");
  const globalLoading = createGlobalFeedback({state: "loading", scope: "telegram", hierarchy: "section", title: "Comprobando Telegram", retryable: false, progress: {kind: "indeterminate"}});
  const globalTree = describeTree(GlobalFeedbackRegion({feedback: globalLoading}));
  equal(occurrences(globalTree, "aria-live:polite"), 1, "región, progreso y badge deben compartir un único anuncio");
  const historicalTree = describeTree(GlobalFeedbackRegion({feedback: historicalFailure}));
  equal(occurrences(historicalTree, "aria-live:polite") + occurrences(historicalTree, "aria-live:assertive"), 0, "el historial no debe generar regiones vivas");
  check(historicalTree.includes("Registro histórico"), "la semántica LES histórica debe permanecer explícita");

  const shell = source("_laboratorio/laboratorio-ia/src/app/LaboratoryShell.tsx");
  check(shell.includes('route.id !== "activity" ? <NotificationBell /> : null'), "/actividad no debe montar el drawer duplicado");
  const activityScreen = source("_laboratorio/laboratorio-ia/src/app/screens/ActivityScreen.tsx");
  check(activityScreen.includes('<ActivityCenter view="activity"'), "/actividad debe conservar la superficie completa");
  const delivery = source("_laboratorio/laboratorio-ia/src/notifications/NotificationDeliveryStatus.tsx");
  equal(occurrences(delivery, "Reintentar"), 1, "cada superficie visible debe exponer un único retry por entrega");
  check(delivery.includes("retryNotificationDelivery(notification.id)"), "retry debe seguir delegado a la autoridad existente");
  check(delivery.includes('status === "failed"'), "retry solo debe mostrarse cuando el estado fuente lo autoriza");

  const bell = source("_laboratorio/laboratorio-ia/src/notifications/NotificationBell.tsx");
  check(bell.includes("adaptNotificationFeedback"), "el drawer debe adaptar el registro histórico con LES");
  check(bell.includes("<FeedbackMeta feedback={feedback}"), "el drawer debe mostrar Registro histórico además de la antigüedad");
  check(bell.includes("formatRelativeDate(notification.createdAt)"), "la antigüedad debe seguir disponible");

  const visual = source("_laboratorio/laboratorio-ia/src/components/feedback/VisualFeedback.tsx");
  check(visual.includes("announce={false}"), "los componentes anidados deben silenciar solo sus anuncios duplicados");
  check(!/\b(fetch|localStorage|sessionStorage|retryNotificationDelivery|createNotification)\b/.test(visual), "VisualFeedback debe seguir sin efectos ni autoridad");
  equal(readdirSync("_laboratorio/laboratorio-ia/src/feedback").some((file) => /store/i.test(file)), false, "B3 no debe crear un store LES");

  const legacyTree = describeTree([
    ProcessingBadge({state: "processing"}),
    InlineLoader({label: "Cargando"}),
    ProgressBar({label: "Progreso", current: 1, total: 2}),
    FeedbackEmptyState({title: "Vacío", detail: "Sin datos"}),
  ]);
  for (const token of ["feedback-badge-processing", "feedback-inline-loader", "aria-valuenow:1", "feedback-empty-state"]) check(legacyTree.includes(token), `la API VisualFeedback debe conservar ${token}`);

  check(assertions >= 30, `se esperaban al menos 30 aserciones y hubo ${assertions}`);
  console.log(`LES1 B3 browser QA fixes: OK (${assertions} assertions; live/history priority, one loader, one live region, one activity retry surface, explicit drawer history, zero stores)`);
}

main();
