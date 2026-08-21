import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {
  adaptBatchFeedback,
  adaptEditorialReadErrorFeedback,
  adaptEditorialStatusFeedback,
  adaptLabProcessFeedback,
  adaptNotificationFeedback,
  adaptReviewOperationFeedback,
  adaptTelegramHealthFeedback,
  createGlobalFeedback,
  globalFeedbackAdaptersSecurity,
  globalFeedbackSecurity,
} from "../_laboratorio/laboratorio-ia/src/feedback";
import {
  BlockingLoader,
  FeedbackBanner,
  FeedbackEmptyState,
  FeedbackSkeleton,
  GlobalFeedbackRegion,
  InlineLoader,
  ProcessingBadge,
  ProgressBar,
  StepProgress,
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

function main(): void {
  const input = {state: "processing", scope: "process", hierarchy: "section", title: "  Lote editorial  ", detail: "  Preparando  ", retryable: false, progress: {kind: "determinate", current: 7, total: 5}, isHistorical: false} as const;
  const before = JSON.stringify(input);
  const first = createGlobalFeedback(input);
  const second = createGlobalFeedback(input);
  assert.deepEqual(first, second); assertions += 1;
  equal(JSON.stringify(input), before, "la normalización no debe mutar la entrada");
  equal(first.title, "Lote editorial");
  equal(first.progress?.kind === "determinate" ? first.progress.current : -1, 5, "el progreso medido se limita al total real");
  check(Object.isFrozen(first), "el contrato normalizado debe ser readonly en runtime");

  const running = adaptLabProcessFeedback({id: "p1", label: "Resolver entidades", status: "running", startedAt: "2026-08-21T10:00:00.000Z"});
  equal(running.state, "processing");
  equal(running.hierarchy, "global");
  equal(running.progress?.kind, "indeterminate");
  equal(adaptLabProcessFeedback({id: "p2", label: "Guardar", status: "success", startedAt: "2026-08-21T10:00:00.000Z"}).state, "completed");
  equal(adaptLabProcessFeedback({id: "p3", label: "Guardar", status: "error", startedAt: "2026-08-21T10:00:00.000Z"}).state, "error");

  const retryable = adaptEditorialReadErrorFeedback({kind: "network", message: "No se pudo conectar.", retryable: true}, {title: "Fuentes no disponibles", scope: "editorial", source: "Panel", operation: "load"});
  const forbidden = adaptEditorialReadErrorFeedback({kind: "permission", message: "Sin permiso.", retryable: false}, {title: "Lectura bloqueada", scope: "editorial", source: "Panel", operation: "load"});
  equal(retryable.retryable, true);
  equal(retryable.action?.kind, "retry");
  equal(forbidden.retryable, false);
  equal(forbidden.action, undefined, "LES no debe ofrecer retry si el origen no lo autoriza");
  equal(adaptEditorialStatusFeedback({type: "success", message: "Fuente cargada"}, {source: "Panel", operation: "load"}).state, "success");

  const historical = adaptNotificationFeedback({id: "n1", level: "error", title: "Fallo anterior", message: "Ya registrado", createdAt: "2026-08-20T10:00:00.000Z", read: true});
  equal(historical.isHistorical, true);
  const historicalTree = describeTree(GlobalFeedbackRegion({feedback: historical}));
  check(historicalTree.includes("data-feedback-historical:true"), "el historial debe identificarse explícitamente");
  check(!historicalTree.includes("aria-live:assertive"), "un fallo histórico no debe anunciarse como incidencia viva");

  const partial = adaptBatchFeedback({title: "Importación", completed: 3, failed: 1, total: 4});
  equal(partial.state, "partial");
  equal(partial.progress?.kind, "determinate");
  equal(adaptBatchFeedback({title: "Cancelado", completed: 1, failed: 0, total: 4, cancelled: true}).state, "cancelled");
  equal(createGlobalFeedback({state: "blocked", scope: "runtime", hierarchy: "global", title: "Runtime bloqueado", retryable: false}).state, "blocked");
  const empty = createGlobalFeedback({state: "empty", scope: "notification", hierarchy: "section", title: "Sin actividad", detail: "No hay registros.", retryable: false});
  check(describeTree(GlobalFeedbackRegion({feedback: empty})).includes("feedback-empty-state"), "empty debe usar el componente vacío común");

  const telegramBlocked = adaptTelegramHealthFeedback({checking: false, health: {ok: false, enabled: true, configured: false, tokenConfigured: false, chatIdConfigured: false, deliveryMode: "production", externalDispatchesAllowed: false, checkedAt: "2026-08-21T10:00:00.000Z"}});
  equal(telegramBlocked.state, "blocked");
  equal(telegramBlocked.retryable, false);
  const telegramError = adaptTelegramHealthFeedback({checking: false, health: null, error: "No se pudo conectar"});
  equal(telegramError.state, "error");
  equal(telegramError.retryable, true);
  equal(adaptReviewOperationFeedback({kind: "processing", message: "En curso"}).state, "processing");

  const feedbackSources = [source("_laboratorio/laboratorio-ia/src/feedback/model.ts"), source("_laboratorio/laboratorio-ia/src/feedback/adapters.ts")].join("\n");
  check(!/\bfetch\s*\(/.test(feedbackSources), "los adaptadores LES no pueden acceder a red");
  check(!/\b(localStorage|sessionStorage|indexedDB)\b/.test(feedbackSources), "LES no puede persistir estado");
  check(!/\b(startProcess|createNotification|saveDraft|executeEditorial|writeClient)\s*\(/.test(feedbackSources), "LES no puede ejecutar mutaciones de dominio");
  equal(globalFeedbackSecurity.createsStore, false);
  equal(globalFeedbackAdaptersSecurity.invokesExecutors, false);
  equal(readdirSync("_laboratorio/laboratorio-ia/src/feedback").some((file) => /store/i.test(file)), false, "no debe existir un store LES paralelo");

  const visualSource = source("_laboratorio/laboratorio-ia/src/components/feedback/VisualFeedback.tsx");
  check(!/\b(fetch|localStorage|sessionStorage|createNotification|startProcess)\b/.test(visualSource), "la capa visual debe seguir libre de autoridad y efectos");
  for (const [path, token] of [
    ["_laboratorio/laboratorio-ia/src/components/PanelIA.tsx", "adaptEditorialStatusFeedback"],
    ["_laboratorio/laboratorio-ia/src/processes/ProcessBar.tsx", "adaptLabProcessFeedback"],
    ["_laboratorio/laboratorio-ia/src/review/components/TransactionOperationalCenter.tsx", "adaptReviewOperationFeedback"],
    ["_laboratorio/laboratorio-ia/src/notifications/ActivityCenter.tsx", "adaptNotificationFeedback"],
    ["_laboratorio/laboratorio-ia/src/notifications/ActivityCenter.tsx", "adaptTelegramHealthFeedback"],
  ] as const) check(source(path).includes(token), `${path} debe consumir LES`);

  const legacy = describeTree([
    FeedbackBanner({state: "error", title: "Error", action: {label: "Reintentar", onClick: () => undefined}}),
    ProcessingBadge({state: "processing"}),
    InlineLoader({}), BlockingLoader({}), FeedbackSkeleton({}),
    ProgressBar({label: "Progreso", current: 1, total: 2}),
    StepProgress({label: "Pasos", steps: [{id: "one", label: "Uno", state: "active"}]}),
    FeedbackEmptyState({title: "Vacío", detail: "Sin datos"}),
  ]);
  for (const token of ["feedback-banner-error", "feedback-spinner", "feedback-blocking-loader", "feedback-skeleton", "aria-valuenow:1", "feedback-step-active", "feedback-empty-state"]) check(legacy.includes(token), `la API pública previa debe conservar ${token}`);

  check(assertions >= 45, `se esperaban al menos 45 aserciones y hubo ${assertions}`);
  console.log(`LES1 global feedback: OK (${assertions} assertions; pure adapters, historical/live split, authorized retry, five integrations, no store or domain writes)`);
}

main();
