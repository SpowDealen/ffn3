import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  BlockingLoader,
  FeedbackBanner,
  FeedbackEmptyState,
  FeedbackSkeleton,
  InlineLoader,
  ProcessingBadge,
  ProgressBar,
  StepProgress,
} from "../_laboratorio/laboratorio-ia/src/components/feedback/VisualFeedback";

let assertions = 0;

function check(value: unknown, message: string): void {
  assert.ok(value, message);
  assertions += 1;
}

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function describeTree(value: unknown): string {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(describeTree).join(" ");
  if (typeof value !== "object") return "";

  const node = value as {props?: Record<string, unknown>};
  if (!node.props) return "";

  return [
    ...Object.entries(node.props)
      .filter(([key]) => key !== "children" && key !== "onClick")
      .map(([key, child]) => `${key}:${String(child)}`),
    describeTree(node.props.children),
  ].join(" ");
}

function main(): void {
  const errorBanner = describeTree(FeedbackBanner({
    state: "error",
    title: "No se pudo recuperar la fuente",
    action: {label: "Reintentar", onClick: () => undefined},
  }));
  check(errorBanner.includes("role:alert"), "el error debe anunciarse como alert");
  check(errorBanner.includes("Reintentar"), "el error debe conservar una acción explícita");
  check(errorBanner.includes("feedback-banner-error"), "el banner debe exponer su estado visual");

  const measuredProgress = describeTree(ProgressBar({
    label: "Resolviendo entidades",
    current: 2,
    total: 4,
    state: "processing",
  }));
  check(measuredProgress.includes("aria-valuenow:2"), "el progreso real debe exponer el valor actual");
  check(measuredProgress.includes("2 de 4"), "el progreso debe mostrar el contador real");

  const indeterminateProgress = describeTree(ProgressBar({
    label: "Descargando noticias",
    state: "loading",
  }));
  check(indeterminateProgress.includes("feedback-progress-indeterminate"), "sin contador no se inventa porcentaje");
  check(indeterminateProgress.includes("Progreso en curso"), "el progreso indeterminado explica su estado");

  const steps = describeTree(StepProgress({
    label: "Flujo editorial",
    steps: [
      {id: "download", label: "Descargar noticias", state: "completed"},
      {id: "resolve", label: "Resolver entidades", state: "active"},
      {id: "draft", label: "Crear borrador", state: "pending"},
    ],
  }));
  check(steps.includes("Descargar noticias") && steps.includes("Resolver entidades"), "los pasos deben conservar su orden y etiquetas");
  check(steps.includes("feedback-step-active"), "el step activo debe tener estado visual");

  const auxiliary = describeTree([
    InlineLoader({label: "Cargando referencias"}),
    BlockingLoader({title: "Preparando workspace"}),
    FeedbackSkeleton({label: "Cargando detalle"}),
    ProcessingBadge({state: "warning"}),
    FeedbackEmptyState({title: "Sin actividad", detail: "No hay eventos todavía."}),
  ]);
  check(auxiliary.includes("Cargando referencias"), "el loader inline debe ser reutilizable");
  check(auxiliary.includes("aria-busy:true"), "el loader bloqueante debe informar busy");
  check(auxiliary.includes("Sin actividad"), "el empty state debe mantener contexto seguro");

  const feedbackSource = source("_laboratorio/laboratorio-ia/src/components/feedback/VisualFeedback.tsx");
  check(!/\b(fetch|localStorage|sessionStorage)\b/.test(feedbackSource), "la capa visual no puede crear efectos ni store");

  const panel = source("_laboratorio/laboratorio-ia/src/components/PanelIA.tsx");
  check(panel.includes('from "./feedback/VisualFeedback"'), "Panel Editorial debe consumir la capa común");
  check(panel.includes("<FeedbackBanner"), "Panel Editorial debe unificar feedback de carga/resultado");

  const processBar = source("_laboratorio/laboratorio-ia/src/processes/ProcessBar.tsx");
  check(processBar.includes("<ProgressBar"), "procesos activos deben usar la barra común");

  const transactionCenter = source("_laboratorio/laboratorio-ia/src/review/components/TransactionOperationalCenter.tsx");
  check(transactionCenter.includes("<StepProgress"), "AU7 debe exponer sus steps con el componente común");
  check(transactionCenter.includes("progress.completed"), "AU7 debe usar progreso real existente");

  const reviewCenter = source("_laboratorio/laboratorio-ia/src/review/components/ReviewCenter.tsx");
  const activityCenter = source("_laboratorio/laboratorio-ia/src/notifications/ActivityCenter.tsx");
  const notificationBell = source("_laboratorio/laboratorio-ia/src/notifications/NotificationBell.tsx");
  check(reviewCenter.includes("<FeedbackEmptyState"), "Centro de Revisión debe reutilizar empty states");
  check(activityCenter.includes("<FeedbackEmptyState"), "Activity Center debe reutilizar empty states");
  check(notificationBell.includes("<FeedbackEmptyState"), "Notificaciones debe reutilizar empty states");

  const styles = source("_laboratorio/laboratorio-ia/src/styles.css");
  check(styles.includes("feedback-banner") && styles.includes("feedback-progress"), "el lenguaje visual debe estar centralizado");
  check(styles.includes("prefers-reduced-motion: reduce"), "la capa visual debe respetar reduced motion");
  check(styles.includes("@media (max-width: 560px)"), "la capa visual debe responder en móvil");

  console.log(`UXP1 visual feedback: OK (${assertions} assertions; reusable presentation only, real progress only, no writes)`);
}

main();
