import type {ReactNode} from "react";

export type FeedbackState =
  | "idle"
  | "loading"
  | "processing"
  | "success"
  | "warning"
  | "error"
  | "cancelled";

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
});

function liveRole(state: FeedbackState): "status" | "alert" {
  return state === "error" || state === "warning" ? "alert" : "status";
}

export function ProcessingBadge({
  state,
  label = stateLabels[state],
}: {
  state: FeedbackState;
  label?: string;
}): ReactNode {
  const active = state === "loading" || state === "processing";

  return (
    <span
      className={`feedback-badge feedback-badge-${state}`}
      role={active ? "status" : undefined}
      aria-live={active ? "polite" : undefined}
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
}: {
  state: Exclude<FeedbackState, "idle">;
  title: string;
  children?: ReactNode;
  action?: FeedbackAction;
}): ReactNode {
  const role = liveRole(state);

  return (
    <section
      className={`feedback-banner feedback-banner-${state}`}
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      aria-busy={state === "loading" || state === "processing"}
    >
      <div className="feedback-banner-copy">
        <ProcessingBadge state={state} />
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
}: {
  label: string;
  current?: number;
  total?: number;
  state?: FeedbackState;
  detail?: string;
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
          <ProcessingBadge state={state} />
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
}: {
  title: string;
  detail: string;
  action?: FeedbackAction;
}): ReactNode {
  return (
    <section className="feedback-empty-state" role="status" aria-live="polite">
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
