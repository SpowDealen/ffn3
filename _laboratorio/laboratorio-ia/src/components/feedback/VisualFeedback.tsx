import type {ReactNode} from "react";
import type {GlobalFeedback, GlobalFeedbackScope} from "../../feedback/model";

export type FeedbackState =
  | "idle"
  | "loading"
  | "processing"
  | "success"
  | "warning"
  | "error"
  | "cancelled"
  | "blocked"
  | "partial"
  | "completed";

type FeedbackAction = Readonly<{
  label: string;
  onClick(): void;
  disabled?: boolean;
}>;

const stateLabels: Readonly<Record<FeedbackState, string>> = Object.freeze({
  idle: "En espera",
  loading: "Cargando",
  processing: "Procesando",
  success: "Completado",
  warning: "Requiere revisión",
  error: "No completado",
  cancelled: "Cancelado",
  blocked: "Bloqueado",
  partial: "Parcial",
  completed: "Completado",
});

function liveRole(state: FeedbackState): "status" | "alert" {
  return state === "error" || state === "warning" || state === "blocked" ? "alert" : "status";
}

export function toVisualFeedbackState(state: GlobalFeedback["state"]): FeedbackState {
  return state === "empty" ? "idle" : state;
}

export function ProcessingBadge({
  state,
  label = stateLabels[state],
  announce = true,
}: {
  state: FeedbackState;
  label?: string;
  announce?: boolean;
}): ReactNode {
  const active = state === "loading" || state === "processing";

  return (
    <span
      className={`feedback-badge feedback-badge-${state}`}
      role={active && announce ? "status" : undefined}
      aria-live={active && announce ? "polite" : undefined}
    >
      {active ? <span className="feedback-spinner" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

export function FeedbackBanner({
  state,
  title,
  children,
  action,
  isHistorical = false,
  announce = true,
}: {
  state: FeedbackState;
  title: string;
  children?: ReactNode;
  action?: FeedbackAction;
  isHistorical?: boolean;
  announce?: boolean;
}): ReactNode {
  const role = liveRole(state);
  const shouldAnnounce = announce && !isHistorical;

  return (
    <section
      className={`feedback-banner feedback-banner-${state}${isHistorical ? " feedback-banner-historical" : ""}`}
      role={shouldAnnounce ? role : undefined}
      aria-live={shouldAnnounce ? role === "alert" ? "assertive" : "polite" : undefined}
      aria-busy={state === "loading" || state === "processing"}
    >
      <div className="feedback-banner-copy">
        <ProcessingBadge state={state} announce={false} />
        <strong>{title}</strong>
        {children ? <span>{children}</span> : null}
      </div>
      {action ? (
        <button
          type="button"
          className="feedback-banner-action"
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.disabled ? "Procesando…" : action.label}
        </button>
      ) : null}
    </section>
  );
}

export function InlineLoader({
  label = "Cargando información…",
}: {
  label?: string;
}): ReactNode {
  return (
    <span className="feedback-inline-loader" role="status" aria-live="polite">
      <span className="feedback-spinner" aria-hidden="true" />
      {label}
    </span>
  );
}

export function BlockingLoader({
  title = "Preparando la información",
  detail,
}: {
  title?: string;
  detail?: string;
}): ReactNode {
  return (
    <section
      className="feedback-blocking-loader"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="feedback-spinner feedback-spinner-large" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {detail ? <p>{detail}</p> : null}
      </div>
    </section>
  );
}

export function FeedbackSkeleton({
  label = "Cargando contenido",
  lines = 3,
}: {
  label?: string;
  lines?: number;
}): ReactNode {
  const safeLines = Math.max(1, Math.min(6, Math.floor(lines)));

  return (
    <div className="feedback-skeleton" role="status" aria-live="polite" aria-label={label}>
      {Array.from({length: safeLines}, (_, index) => (
        <span key={index} aria-hidden="true" />
      ))}
      <strong className="sr-only">{label}</strong>
    </div>
  );
}

export function ProgressBar({
  label,
  current,
  total,
  state = "processing",
  detail,
  announce = true,
}: {
  label: string;
  current?: number;
  total?: number;
  state?: FeedbackState;
  detail?: string;
  announce?: boolean;
}): ReactNode {
  const hasMeasuredProgress =
    typeof current === "number" &&
    typeof total === "number" &&
    Number.isFinite(current) &&
    Number.isFinite(total) &&
    total > 0;
  const completed = hasMeasuredProgress
    ? Math.min(total!, Math.max(0, current!))
    : undefined;
  const percent = hasMeasuredProgress
    ? Math.round((completed! / total!) * 100)
    : undefined;

  return (
    <section
      className={`feedback-progress feedback-progress-${state}`}
      aria-busy={state === "loading" || state === "processing"}
    >
      <div className="feedback-progress-heading">
        <div>
          <strong>{label}</strong>
          {detail ? <span>{detail}</span> : null}
        </div>
        {hasMeasuredProgress ? (
          <span>{completed} de {total}</span>
        ) : (
          <ProcessingBadge state={state} announce={announce} />
        )}
      </div>
      <div
        className="feedback-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={hasMeasuredProgress ? 0 : undefined}
        aria-valuemax={hasMeasuredProgress ? total : undefined}
        aria-valuenow={hasMeasuredProgress ? completed : undefined}
        aria-valuetext={hasMeasuredProgress ? `${completed} de ${total}` : "Progreso en curso"}
      >
        <span
          className={`feedback-progress-fill${hasMeasuredProgress ? "" : " feedback-progress-indeterminate"}`}
          style={hasMeasuredProgress ? {width: `${percent}%`} : undefined}
        />
      </div>
    </section>
  );
}

export type FeedbackStep = Readonly<{
  id: string;
  label: string;
  state: "completed" | "active" | "pending" | "warning" | "error" | "cancelled";
  detail?: string;
}>;

const stepSymbols: Readonly<Record<FeedbackStep["state"], string>> = Object.freeze({
  completed: "✓",
  active: "⏳",
  pending: "○",
  warning: "!",
  error: "×",
  cancelled: "–",
});

export function StepProgress({
  label,
  steps,
}: {
  label: string;
  steps: readonly FeedbackStep[];
}): ReactNode {
  return (
    <section className="feedback-step-progress" aria-label={label}>
      <strong>{label}</strong>
      <ol>
        {steps.map((step) => (
          <li key={step.id} className={`feedback-step feedback-step-${step.state}`}>
            <span aria-hidden="true">{stepSymbols[step.state]}</span>
            <div>
              <strong>{step.label}</strong>
              {step.detail ? <small>{step.detail}</small> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function FeedbackEmptyState({
  title,
  detail,
  action,
  announce = true,
}: {
  title: string;
  detail: string;
  action?: FeedbackAction;
  announce?: boolean;
}): ReactNode {
  return (
    <section className="feedback-empty-state" role={announce ? "status" : undefined} aria-live={announce ? "polite" : undefined}>
      <span aria-hidden="true">○</span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
        {action ? (
          <button type="button" className="feedback-banner-action" onClick={action.onClick} disabled={action.disabled}>
            {action.label}
          </button>
        ) : null}
      </div>
    </section>
  );
}

const scopeLabels: Readonly<Record<GlobalFeedbackScope, string>> = Object.freeze({
  editorial: "Editorial",
  review: "Revisión",
  process: "Procesos",
  notification: "Actividad",
  runtime: "Runtime",
  reference_entities: "Referencias",
  telegram: "Telegram",
  sandbox: "Sandbox",
  system: "Sistema",
});

function feedbackTemporalLabel(feedback: GlobalFeedback): string {
  if (feedback.isHistorical) return "Registro histórico";
  if (feedback.state === "loading" || feedback.state === "processing") return "Actividad en curso";
  if (feedback.state === "error" || feedback.state === "warning" || feedback.state === "blocked") return "Estado actual";
  return "Resultado reciente";
}

export function FeedbackMeta({feedback}: {feedback: GlobalFeedback}): ReactNode {
  const meta = [
    feedbackTemporalLabel(feedback),
    scopeLabels[feedback.scope],
    feedback.source,
    feedback.timestamp && !Number.isNaN(Date.parse(feedback.timestamp))
      ? new Date(feedback.timestamp).toLocaleString("es-ES")
      : undefined,
  ].filter(Boolean);
  return <small className="feedback-meta">{meta.join(" · ")}</small>;
}

export function FeedbackStack({children}: {children: ReactNode}): ReactNode {
  return <div className="feedback-stack">{children}</div>;
}

export function GlobalFeedbackRegion({
  feedback,
  onAction,
  announce = true,
}: {
  feedback: GlobalFeedback;
  onAction?: (actionId: string) => void;
  announce?: boolean;
}): ReactNode {
  if (feedback.state === "idle") return null;
  const isActive = feedback.state === "loading" || feedback.state === "processing";
  const role = feedback.state === "error" || feedback.state === "warning" || feedback.state === "blocked" ? "alert" : "status";
  const shouldAnnounce = announce && !feedback.isHistorical;
  const action = feedback.action && onAction
    ? {label: feedback.action.label, disabled: feedback.action.disabled, onClick: () => onAction(feedback.action!.id)}
    : undefined;

  return (
    <div
      className={`global-feedback-region global-feedback-${feedback.hierarchy}${feedback.isHistorical ? " global-feedback-historical" : ""}`}
      data-feedback-scope={feedback.scope}
      data-feedback-state={feedback.state}
      data-feedback-historical={feedback.isHistorical ? "true" : "false"}
      role={shouldAnnounce ? role : undefined}
      aria-live={shouldAnnounce ? role === "alert" ? "assertive" : "polite" : undefined}
      aria-busy={isActive}
    >
      <FeedbackStack>
        {feedback.state === "empty" ? (
          <>
            <FeedbackEmptyState title={feedback.title} detail={feedback.detail ?? "No hay información disponible."} action={action} announce={false} />
            <FeedbackMeta feedback={feedback} />
          </>
        ) : feedback.progress && !action ? (
          <>
            <ProgressBar
              label={feedback.title}
              detail={feedback.detail}
              state={toVisualFeedbackState(feedback.state)}
              current={feedback.progress.kind === "determinate" ? feedback.progress.current : undefined}
              total={feedback.progress.kind === "determinate" ? feedback.progress.total : undefined}
              announce={false}
            />
            <FeedbackMeta feedback={feedback} />
          </>
        ) : (
          <FeedbackBanner state={toVisualFeedbackState(feedback.state)} title={feedback.title} action={action} isHistorical={feedback.isHistorical} announce={false}>
            {feedback.detail ? <span>{feedback.detail}</span> : null}
            <FeedbackMeta feedback={feedback} />
          </FeedbackBanner>
        )}
        {feedback.progress && action ? (
          <ProgressBar
            label={feedback.operation ?? "Progreso"}
            state={toVisualFeedbackState(feedback.state)}
            current={feedback.progress.kind === "determinate" ? feedback.progress.current : undefined}
            total={feedback.progress.kind === "determinate" ? feedback.progress.total : undefined}
            announce={false}
          />
        ) : null}
        {feedback.steps?.length ? <StepProgress label={feedback.operation ?? "Pasos"} steps={feedback.steps} /> : null}
      </FeedbackStack>
    </div>
  );
}
