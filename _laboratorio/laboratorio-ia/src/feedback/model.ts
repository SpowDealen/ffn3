export type GlobalFeedbackState =
  | "idle"
  | "loading"
  | "processing"
  | "success"
  | "warning"
  | "error"
  | "cancelled"
  | "empty"
  | "blocked"
  | "partial"
  | "completed";

export type GlobalFeedbackScope =
  | "editorial"
  | "review"
  | "process"
  | "notification"
  | "runtime"
  | "reference_entities"
  | "telegram"
  | "sandbox"
  | "system";

export type GlobalFeedbackHierarchy = "local" | "section" | "global";

export type GlobalFeedbackAction = Readonly<{
  id: string;
  label: string;
  kind: "retry" | "safe";
  disabled?: boolean;
}>;

export type GlobalFeedbackProgress =
  | Readonly<{kind: "indeterminate"}>
  | Readonly<{kind: "determinate"; current: number; total: number}>;

export type GlobalFeedbackStep = Readonly<{
  id: string;
  label: string;
  state: "completed" | "active" | "pending" | "warning" | "error" | "cancelled";
  detail?: string;
}>;

export type GlobalFeedback = Readonly<{
  state: GlobalFeedbackState;
  scope: GlobalFeedbackScope;
  hierarchy: GlobalFeedbackHierarchy;
  title: string;
  detail?: string;
  source?: string;
  operation?: string;
  retryable: boolean;
  action?: GlobalFeedbackAction;
  progress?: GlobalFeedbackProgress;
  steps?: readonly GlobalFeedbackStep[];
  timestamp?: string;
  isHistorical: boolean;
}>;

export type CreateGlobalFeedbackInput = Omit<GlobalFeedback, "title" | "retryable" | "isHistorical"> & Readonly<{
  title?: string;
  retryable?: boolean;
  isHistorical?: boolean;
}>;

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned && cleaned !== "undefined" ? cleaned : undefined;
}

function normalizeProgress(progress: GlobalFeedbackProgress | undefined): GlobalFeedbackProgress | undefined {
  if (!progress) return undefined;
  if (progress.kind === "indeterminate") return Object.freeze({kind: "indeterminate"});
  if (!Number.isFinite(progress.current) || !Number.isFinite(progress.total) || progress.total <= 0) {
    return Object.freeze({kind: "indeterminate"});
  }
  return Object.freeze({
    kind: "determinate",
    current: Math.min(progress.total, Math.max(0, progress.current)),
    total: progress.total,
  });
}

/**
 * Canonical LES presentation contract. It only normalizes immutable UI data:
 * callbacks, stores, transport and domain decisions deliberately stay outside.
 */
export function createGlobalFeedback(input: CreateGlobalFeedbackInput): GlobalFeedback {
  const retryable = Boolean(input.retryable);
  const action = input.action && (input.action.kind !== "retry" || retryable)
    ? Object.freeze({
        id: cleanText(input.action.id) ?? "feedback-action",
        label: cleanText(input.action.label) ?? "Continuar",
        kind: input.action.kind,
        ...(input.action.disabled === undefined ? {} : {disabled: input.action.disabled}),
      })
    : undefined;
  const steps = input.steps?.map((step) => Object.freeze({
    id: cleanText(step.id) ?? "feedback-step",
    label: cleanText(step.label) ?? "Paso sin etiqueta",
    state: step.state,
    ...(cleanText(step.detail) ? {detail: cleanText(step.detail)} : {}),
  }));

  return Object.freeze({
    state: input.state,
    scope: input.scope,
    hierarchy: input.hierarchy,
    title: cleanText(input.title) ?? "Estado del laboratorio",
    ...(cleanText(input.detail) ? {detail: cleanText(input.detail)} : {}),
    ...(cleanText(input.source) ? {source: cleanText(input.source)} : {}),
    ...(cleanText(input.operation) ? {operation: cleanText(input.operation)} : {}),
    retryable,
    ...(action ? {action} : {}),
    ...(input.progress ? {progress: normalizeProgress(input.progress)} : {}),
    ...(steps ? {steps: Object.freeze(steps)} : {}),
    ...(cleanText(input.timestamp) ? {timestamp: cleanText(input.timestamp)} : {}),
    isHistorical: Boolean(input.isHistorical),
  });
}

export const globalFeedbackSecurity = Object.freeze({
  presentationOnly: true,
  createsStore: false,
  accessesNetwork: false,
  accessesStorage: false,
  writesDomain: false,
  invokesExecutors: false,
} as const);
