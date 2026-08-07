import {useEffect, useState, type ReactElement} from "react";
import {
  generateTransversalPlanForReviewCase,
  recoverTransversalPlanView,
  type TransversalPlanView,
} from "../globalResolution";
import {getReviewCase, setGlobalResolutionCheckpoint, updateGlobalResolutionCheckpoint} from "../store/reviewStore";
import type {ReviewCase} from "../types";

const ACTION_LABELS = Object.freeze({
  reuse: "Reutilizar",
  create: "Crear",
  investigate: "Investigar",
  repair_reference: "Reparar referencia",
  validate: "Validar",
  resume: "Reanudar",
  blocked: "Bloqueado",
});

function fingerprint(value: string | undefined): string {
  return value ? `${value.slice(0, 18)}…${value.slice(-10)}` : "—";
}

function statusLabel(status: TransversalPlanView["status"]): string {
  return {fresh: "Vigente", stale: "Contexto obsoleto", invalid: "Checkpoint inválido", absent: "Sin plan"}[status];
}

export default function TransversalResolutionPlanPanel({reviewCase}: {reviewCase: ReviewCase}): ReactElement {
  const [view, setView] = useState<TransversalPlanView>(() => recoverTransversalPlanView(reviewCase));
  const [feedback, setFeedback] = useState<string>();
  const hasCheckpoint = Boolean(reviewCase.globalResolution);

  useEffect(() => {
    setView(recoverTransversalPlanView(reviewCase));
    setFeedback(undefined);
  }, [reviewCase]);

  function generate(regenerate: boolean): void {
    try {
      const current = getReviewCase(reviewCase.id);
      if (!current) throw new Error("El caso ya no está disponible.");
      const generated = generateTransversalPlanForReviewCase(current);
      if (current.globalResolution) {
        updateGlobalResolutionCheckpoint(current.id, current.version, () => generated.checkpoint, new Date(), current.globalResolution.checkpointFingerprint);
      } else {
        setGlobalResolutionCheckpoint(current.id, current.version, generated.checkpoint);
      }
      setView(generated.view);
      setFeedback(regenerate ? "Plan regenerado y checkpoint actualizado. Ninguna operación se ejecutó." : "Plan generado y checkpoint guardado. Ninguna operación se ejecutó.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo generar el plan transversal.");
    }
  }

  function recover(): void {
    const current = getReviewCase(reviewCase.id) ?? reviewCase;
    setView(recoverTransversalPlanView(current));
    setFeedback("Estado recuperado desde el checkpoint local; no se ejecutó ninguna operación.");
  }

  return (
    <section className="review-subsection" aria-label="Planificador resolutivo transversal">
      <div className="review-row review-row-wrap">
        <div>
          <p className="review-kicker">AU6 · Planificación resolutiva</p>
          <h4 className="review-subtitle">Plan transversal</h4>
          <p className="review-muted">Autoridad única de planificación. Este panel genera, recupera y valida el plan; no ejecuta operaciones ni expone payloads.</p>
        </div>
        <div className="review-actions">
          {!hasCheckpoint ? <button className="review-button" type="button" onClick={() => generate(false)}>Generar plan</button> : null}
          {hasCheckpoint ? <button className="review-button review-button-secondary" type="button" onClick={recover}>Recuperar plan</button> : null}
          {hasCheckpoint ? <button className="review-button review-button-secondary" type="button" onClick={() => generate(true)}>Regenerar plan</button> : null}
        </div>
      </div>

      <dl className="review-definition-grid">
        <dt>Estado</dt><dd>{statusLabel(view.status)}</dd>
        <dt>Operaciones</dt><dd>{view.operations.length}</dd>
        <dt>Listas ahora</dt><dd>{view.readyOperationIds.length}</dd>
        <dt>Blockers</dt><dd>{view.blockers.length}</dd>
        <dt>Escrituras</dt><dd>No permitidas</dd>
        <dt>Ejecución</dt><dd>No permitida</dd>
        {view.checkpoint ? <><dt>Fase checkpoint</dt><dd>{view.checkpoint.phase}</dd><dt>Checkpoint</dt><dd>{fingerprint(view.checkpoint.fingerprint)}</dd></> : null}
        {view.planFingerprint ? <><dt>Plan</dt><dd>{fingerprint(view.planFingerprint)}</dd><dt>Grafo</dt><dd>{fingerprint(view.graphFingerprint)}</dd></> : null}
        {view.decisionFingerprint ? <><dt>Decisiones</dt><dd>{fingerprint(view.decisionFingerprint)}</dd><dt>Entrada</dt><dd>{fingerprint(view.inputFingerprint)}</dd></> : null}
      </dl>

      {feedback ? <p className="review-feedback" role="status">{feedback}</p> : null}
      {view.recoveryReasons.length ? <div className="review-readonly-message" role="alert"><strong>Regeneración requerida.</strong> {view.recoveryReasons.join(" · ")}</div> : null}
      {view.blockers.length ? <div className="review-issues" aria-label="Blockers del plan">{view.blockers.map((blocker) => <div className="review-issue-wrapper" key={`${blocker.code}:${blocker.message}`}><strong>{blocker.code}</strong><span>{blocker.message}</span><span className="review-muted">Siguiente paso: {blocker.requiredAction}</span></div>)}</div> : null}

      {view.operations.length ? <div className="review-resolution-list" aria-label="Operaciones ordenadas por dependencia">
        {view.operations.map((operation, index) => <div className="review-resolution" key={operation.id}>
          <strong>{index + 1}. {ACTION_LABELS[operation.action]} · {operation.entityType}</strong>
          <span>{operation.explanation}</span>
          <span>Dependencias: {operation.dependencyIds.length ? operation.dependencyIds.join(", ") : "ninguna"} · Evidencia: {operation.evidenceCount} · Readiness: {operation.ready ? "lista para revisión" : "pendiente"}</span>
          {operation.reasonCodes.length ? <span className="review-muted">Motivo: {operation.reasonCodes.join(", ")}</span> : null}
          {!operation.ready && operation.readinessReasons.length ? <span className="review-muted">Pendiente por: {operation.readinessReasons.join(", ")}</span> : null}
        </div>)}
      </div> : <p className="review-muted">Genera un plan para ver operaciones, dependencias, evidencia y readiness.</p>}
    </section>
  );
}
