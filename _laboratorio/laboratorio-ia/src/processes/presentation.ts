import type {FeedbackStep, FeedbackState} from "../components/feedback/VisualFeedback";
import type {LabProcess} from "./types";

export type ProcessExperienceState =
  | "pending"
  | "preparing"
  | "running"
  | "completed"
  | "partial"
  | "warning"
  | "error"
  | "blocked"
  | "cancelled";

export type ProcessExperiencePresentation = Readonly<{
  id: string;
  title: string;
  detail?: string;
  state: ProcessExperienceState;
  stateLabel: string;
  feedbackState: FeedbackState;
  temporal: "live" | "current" | "result" | "historical";
  isLive: boolean;
  isHistorical: boolean;
  source: string;
  purpose: string;
  subject?: string;
  startedAt?: string;
  updatedAt?: string;
  elapsedLabel?: string;
  progress: Readonly<
    | {kind: "determinate"; current: number; total: number}
    | {kind: "indeterminate"}
    | {kind: "none"}
  >;
  steps: readonly FeedbackStep[];
  batch?: Readonly<{completed: number; failed: number; total: number}>;
  result?: string;
  blockedReason?: string;
  blockerKind?: "domain" | "infrastructure";
  intervention?: string;
  retryAuthorized: boolean;
  cancelAuthorized: boolean;
  notificationPolicy: "milestones_only";
}>;

export type TransactionProcessSnapshot = Readonly<{
  state: "planned" | "ready" | "executing" | "paused" | "blocked" | "reconciliation_required" | "compensation_required" | "completed" | "failed" | "stale";
  reasons: readonly string[];
  steps: readonly Readonly<{stepId: string; capability: string; state: string}>[];
  operational?: Readonly<{
    progress: Readonly<{completed: number; total: number}>;
    state?: string;
    currentStep?: Readonly<{capability: string}>;
    startedAt?: string;
    updatedAt: string;
  }>;
  canStart: boolean;
  canExecuteNext: boolean;
  canExecuteSafeBatch: boolean;
  canPause: boolean;
  canResume: boolean;
  canRegenerate: boolean;
  canOpenReconciliation: boolean;
  canOpenCompensation: boolean;
}>;

export type AutonomousProcessSnapshot = Readonly<{
  caseId: string;
  state: "not_initialized" | "evaluating" | "investigating" | "planning" | "preparing_transaction" | "executing_supervised" | "observing" | "paused" | "authorization_required" | "reconciliation_required" | "compensation_required" | "human_review" | "blocked" | "completed" | "stale";
  actionRequired: "none" | "continue" | "investigate" | "authorize" | "reconcile" | "compensate" | "human_review" | "regenerate";
  staleReasons: readonly string[];
  transaction: Readonly<{completed: number; total: number}>;
  strategy?: Readonly<{steps: readonly Readonly<{id: string; objective: string}>[]}>;
  loop?: Readonly<{phase: string; stopReason?: string}>;
}>;

const STATE_LABELS: Readonly<Record<ProcessExperienceState, string>> = Object.freeze({
  pending: "Pendiente",
  preparing: "Preparando",
  running: "En ejecución",
  completed: "Completado",
  partial: "Completado parcialmente",
  warning: "Requiere revisión",
  error: "No completado",
  blocked: "Bloqueado",
  cancelled: "Cancelado",
});

const FEEDBACK_STATES: Readonly<Record<ProcessExperienceState, FeedbackState>> = Object.freeze({
  pending: "idle",
  preparing: "loading",
  running: "processing",
  completed: "completed",
  partial: "partial",
  warning: "warning",
  error: "error",
  blocked: "blocked",
  cancelled: "cancelled",
});

const ATTENTION_STATES = new Set<ProcessExperienceState>(["partial", "warning", "error", "blocked"]);

function validProgress(current?: number, total?: number): {current: number; total: number} | undefined {
  if (typeof current !== "number" || typeof total !== "number" || !Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return undefined;
  return {current: Math.min(total, Math.max(0, current)), total};
}

function elapsedLabel(startedAt?: string, endedAt?: string, now = Date.now()): string | undefined {
  if (!startedAt) return undefined;
  const start = Date.parse(startedAt);
  const end = endedAt ? Date.parse(endedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  const seconds = Math.max(0, Math.floor((end - start) / 1_000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

function createPresentation(input: Omit<ProcessExperiencePresentation, "stateLabel" | "feedbackState" | "isLive" | "isHistorical" | "notificationPolicy">): ProcessExperiencePresentation {
  return Object.freeze({
    ...input,
    stateLabel: STATE_LABELS[input.state],
    feedbackState: FEEDBACK_STATES[input.state],
    isLive: input.temporal === "live",
    isHistorical: input.temporal === "historical",
    notificationPolicy: "milestones_only",
  });
}

export function buildLabProcessPresentation(process: LabProcess, now = Date.now()): ProcessExperiencePresentation {
  const state: ProcessExperienceState = process.status === "running" ? "running" : process.status === "success" ? "completed" : "error";
  const measured = validProgress(process.current, process.total);
  return createPresentation({
    id: process.id,
    title: process.label,
    detail: process.status === "success" ? undefined : process.detail,
    state,
    temporal: process.status === "running" ? "live" : "result",
    source: process.origin ?? "Panel IA · Process Store",
    purpose: process.purpose ?? process.label,
    subject: process.subject,
    startedAt: process.startedAt,
    updatedAt: process.updatedAt ?? process.startedAt,
    elapsedLabel: elapsedLabel(process.startedAt, process.finishedAt, now),
    progress: measured ? {kind: "determinate", ...measured} : process.status === "running" ? {kind: "indeterminate"} : {kind: "none"},
    steps: Object.freeze([]),
    result: process.status === "success" ? "Proceso completado." : process.status === "error" ? process.detail : undefined,
    intervention: process.status === "error" ? "Revisa el contexto de origen; este panel no autoriza reintentos." : undefined,
    retryAuthorized: false,
    cancelAuthorized: false,
  });
}

function stepState(state: string): FeedbackStep["state"] {
  if (["succeeded", "reused", "compensated", "skipped"].includes(state)) return "completed";
  if (["executing", "compensating"].includes(state)) return "active";
  if (["reconciliation_required", "blocked"].includes(state)) return "warning";
  if (["failed", "compensation_failed"].includes(state)) return "error";
  if (state === "cancelled") return "cancelled";
  return "pending";
}

export function buildTransactionProcessPresentation(view: TransactionProcessSnapshot, caseId: string, options: Readonly<{now?: number; cancelAuthorized?: boolean}> = {}): ProcessExperiencePresentation {
  const states: Readonly<Record<TransactionProcessSnapshot["state"], ProcessExperienceState>> = Object.freeze({
    planned: "pending", ready: "preparing", executing: "running", paused: "warning", blocked: "blocked",
    reconciliation_required: "blocked", compensation_required: "blocked", completed: "completed", failed: "error", stale: "blocked",
  });
  const state = view.operational?.state === "partially_succeeded" || view.operational?.state === "partially_compensated" ? "partial" : states[view.state];
  const progress = view.operational?.progress;
  const measured = validProgress(progress?.completed, progress?.total);
  const intervention = view.canOpenReconciliation ? "Abrir reconciliación" : view.canOpenCompensation ? "Abrir compensación" : view.canRegenerate ? "Regenerar desde la autoridad AU7" : view.canResume ? "Reanudar explícitamente" : view.canExecuteSafeBatch ? "Batch seguro disponible" : view.canExecuteNext ? "Siguiente step autorizado" : view.canStart ? "Inicio explícito disponible" : undefined;
  const blockedReason = view.reasons[0];
  const infrastructureBlocker = blockedReason && /(checkpoint|persist|runtime|stale|network|executor)/i.test(blockedReason);
  return createPresentation({
    id: `au7:${caseId}`,
    title: "Transacción editorial supervisada",
    detail: view.operational?.currentStep ? `Step actual: ${view.operational.currentStep.capability}` : undefined,
    state,
    temporal: state === "running" ? "live" : state === "completed" || state === "error" ? "historical" : "current",
    source: "Centro de Revisión · AU7",
    purpose: "Ejecutar el plan transaccional respetando dependencias, checkpoints y autorizaciones.",
    subject: caseId,
    startedAt: view.operational?.startedAt,
    updatedAt: view.operational?.updatedAt,
    elapsedLabel: elapsedLabel(view.operational?.startedAt, state === "running" ? undefined : view.operational?.updatedAt, options.now),
    progress: measured ? {kind: "determinate", ...measured} : state === "running" ? {kind: "indeterminate"} : {kind: "none"},
    steps: Object.freeze(view.steps.map((step) => Object.freeze({id: step.stepId, label: step.capability, state: stepState(step.state), detail: step.state}))),
    blockedReason,
    blockerKind: blockedReason ? infrastructureBlocker ? "infrastructure" : "domain" : view.state === "stale" ? "infrastructure" : view.state === "blocked" || view.state === "reconciliation_required" || view.state === "compensation_required" ? "domain" : undefined,
    result: state === "completed" ? "Todos los steps obligatorios quedaron completados." : state === "error" ? "La transacción terminó con fallo." : undefined,
    intervention,
    retryAuthorized: false,
    cancelAuthorized: Boolean(options.cancelAuthorized),
  });
}

export function buildAutonomousProcessPresentation(model: AutonomousProcessSnapshot, busy: boolean): ProcessExperiencePresentation {
  const blocked = ["authorization_required", "reconciliation_required", "compensation_required", "human_review", "blocked", "stale"].includes(model.state);
  const state: ProcessExperienceState = busy ? "running" : model.loop?.phase === "cancelled" ? "cancelled" : model.state === "completed" ? "completed" : blocked ? "blocked" : model.state === "paused" ? "warning" : model.state === "not_initialized" ? "pending" : "preparing";
  const measured = validProgress(model.transaction.completed, model.transaction.total);
  const actionLabels: Readonly<Record<AutonomousProcessSnapshot["actionRequired"], string | undefined>> = Object.freeze({none: undefined, continue: "Continuación explícita disponible", investigate: "Investigación supervisada requerida", authorize: "Autorización efímera requerida", reconcile: "Reconciliación requerida", compensate: "Compensación requerida", human_review: "Revisión humana requerida", regenerate: "Regeneración explícita requerida"});
  return createPresentation({
    id: `au8:${model.caseId}`,
    title: "Ciclo editorial supervisado",
    detail: model.loop?.stopReason ? `Límite seguro: ${model.loop.stopReason}` : undefined,
    state,
    temporal: busy ? "live" : state === "completed" ? "historical" : "current",
    source: "Centro de Revisión · AU8",
    purpose: "Evaluar, planificar y entregar la ejecución a las autoridades existentes.",
    subject: model.caseId,
    progress: measured ? {kind: "determinate", ...measured} : busy ? {kind: "indeterminate"} : {kind: "none"},
    steps: Object.freeze((model.strategy?.steps ?? []).map((step, index) => Object.freeze({id: step.id, label: step.objective, state: index < model.transaction.completed ? "completed" : busy && index === model.transaction.completed ? "active" : "pending"}))),
    blockedReason: model.staleReasons[0] ?? model.loop?.stopReason,
    blockerKind: blocked ? model.state === "stale" ? "infrastructure" : "domain" : undefined,
    result: state === "completed" ? "El ciclo supervisado quedó completado." : undefined,
    intervention: actionLabels[model.actionRequired],
    retryAuthorized: false,
    cancelAuthorized: false,
  });
}

export function buildBatchProcessPresentation(input: Readonly<{id: string; title: string; source: string; completed: number; failed: number; total: number; cancelled?: boolean; live?: boolean}>): ProcessExperiencePresentation {
  const state: ProcessExperienceState = input.cancelled ? "cancelled" : input.live ? "running" : input.failed > 0 && input.completed > 0 ? "partial" : input.failed > 0 ? "error" : "completed";
  const measured = validProgress(input.completed + input.failed, input.total);
  return createPresentation({
    id: input.id, title: input.title, state, temporal: input.live ? "live" : "historical", source: input.source,
    purpose: "Procesar una operación por lote sin ocultar resultados parciales.",
    progress: measured ? {kind: "determinate", ...measured} : input.live ? {kind: "indeterminate"} : {kind: "none"},
    steps: Object.freeze([]), batch: Object.freeze({completed: input.completed, failed: input.failed, total: input.total}),
    result: `${input.completed} completados · ${input.failed} fallidos`,
    intervention: input.failed > 0 ? "Revisa los elementos fallidos en la superficie de origen." : undefined,
    retryAuthorized: false, cancelAuthorized: false,
  });
}

export function compareProcessAttention(left: ProcessExperiencePresentation, right: ProcessExperiencePresentation): number {
  const rank = (process: ProcessExperiencePresentation): number => process.isLive ? 300 : ATTENTION_STATES.has(process.state) ? 200 : process.temporal === "current" || process.temporal === "result" ? 100 : 0;
  return rank(right) - rank(left) || (right.updatedAt ?? right.startedAt ?? "").localeCompare(left.updatedAt ?? left.startedAt ?? "") || left.id.localeCompare(right.id, "es-ES");
}

export function selectProcessPresentations(processes: readonly ProcessExperiencePresentation[]): readonly ProcessExperiencePresentation[] {
  return Object.freeze([...processes].sort(compareProcessAttention));
}

export const processExperienceSecurity = Object.freeze({createsStore: false, schedulesWork: false, executesWork: false, retriesWork: false, cancelsWork: false, fetches: false, persists: false, mutatesDomain: false, notificationPolicy: "milestones_only"} as const);
