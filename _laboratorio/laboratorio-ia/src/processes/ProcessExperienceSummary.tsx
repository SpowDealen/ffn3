import type {ReactElement} from "react";
import {ProcessingBadge, ProgressBar, StepProgress} from "../components/feedback/VisualFeedback";
import type {ProcessExperiencePresentation} from "./presentation";

export default function ProcessExperienceSummary({process, compact = false, announce = false}: {process: ProcessExperiencePresentation; compact?: boolean; announce?: boolean}): ReactElement {
  const showProgress = process.progress.kind === "determinate" || process.progress.kind === "indeterminate" && process.isLive;
  const progressProvidesActivitySignal = process.isLive && process.progress.kind === "indeterminate";
  const badgeState = process.isLive ? process.feedbackState : process.feedbackState === "loading" || process.feedbackState === "processing" ? "idle" : process.feedbackState;
  const shouldAnnounce = announce && process.isLive;
  return (
    <article className={`process-experience process-experience-${process.state}`} data-process-temporal={process.temporal} data-process-live={process.isLive ? "true" : "false"} role={shouldAnnounce ? "status" : undefined} aria-live={shouldAnnounce ? "polite" : undefined} aria-busy={shouldAnnounce ? true : undefined}>
      <header className="process-experience-heading">
        <div>
          <span className="process-experience-source">{process.source}</span>
          <strong>{process.title}</strong>
          {process.detail ? <p>{process.detail}</p> : null}
        </div>
        {!progressProvidesActivitySignal ? <ProcessingBadge state={badgeState} label={process.stateLabel} announce={false} /> : null}
      </header>
      {showProgress ? (
        <ProgressBar
          label={process.progress.kind === "determinate" ? "Progreso medido" : "Actividad sin métrica disponible"}
          current={process.progress.kind === "determinate" ? process.progress.current : undefined}
          total={process.progress.kind === "determinate" ? process.progress.total : undefined}
          state={process.feedbackState}
          detail={process.elapsedLabel ? `Tiempo: ${process.elapsedLabel}` : undefined}
          announce={false}
        />
      ) : null}
      {!compact && process.steps.length ? <StepProgress label="Pasos del proceso" steps={process.steps} /> : null}
      <div className="process-experience-meta">
        <span>{process.temporal === "live" ? "En vivo" : process.temporal === "historical" ? "Registro histórico" : process.temporal === "result" ? "Resultado reciente" : "Estado actual"}</span>
        {process.subject ? <span>{process.subject}</span> : null}
        {process.elapsedLabel && !showProgress ? <span>{process.elapsedLabel}</span> : null}
        {process.batch ? <span>{process.batch.completed}/{process.batch.total} completados · {process.batch.failed} fallidos</span> : null}
      </div>
      {!compact && (process.result || process.blockedReason || process.intervention || process.purpose) ? (
        <details className="process-experience-details">
          <summary>Contexto y siguiente acción</summary>
          <dl>
            <div><dt>Propósito</dt><dd>{process.purpose}</dd></div>
            {process.result ? <div><dt>Resultado</dt><dd>{process.result}</dd></div> : null}
            {process.blockedReason ? <div><dt>Motivo</dt><dd>{process.blockedReason}</dd></div> : null}
            {process.blockerKind ? <div><dt>Tipo de bloqueo</dt><dd>{process.blockerKind === "infrastructure" ? "Infraestructura o checkpoint" : "Dominio o política"}</dd></div> : null}
            {process.intervention ? <div><dt>Intervención</dt><dd>{process.intervention}</dd></div> : null}
            <div><dt>Controles</dt><dd>Reintento: {process.retryAuthorized ? "solo desde la autoridad de origen" : "no autorizado"} · Cancelación: {process.cancelAuthorized ? "solo desde la autoridad de origen" : "no autorizada"}</dd></div>
            <div><dt>Actividad</dt><dd>Las notificaciones registran solo hitos; el detalle operativo permanece aquí.</dd></div>
          </dl>
        </details>
      ) : null}
    </article>
  );
}
