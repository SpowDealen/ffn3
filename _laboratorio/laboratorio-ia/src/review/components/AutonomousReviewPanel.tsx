import {useState, type ReactElement} from "react";
import {applyAutonomousReview, previewAutonomousReview} from "../autonomous";
import type {AutonomousReviewRunResult} from "../autonomous";

const STATUS_LABELS = {resolved: "Resuelta", unresolved: "Sin resolver", needs_more_evidence: "Necesita más evidencia", rejected: "Rechazada"} as const;

export default function AutonomousReviewPanel({caseId, editable}: {caseId: string; editable: boolean}): ReactElement {
  const [report, setReport] = useState<AutonomousReviewRunResult | null>(null);
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const safeCount = report?.decisions.filter((item) => item.status === "resolved" && item.validation.valid && item.proposedResolution).length ?? 0;

  function analyze(): void {
    try { setReport(previewAutonomousReview(caseId)); setFeedback("Simulación completada. El store no se ha modificado."); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "No se pudo analizar el caso."); }
  }

  function apply(): void {
    if (!window.confirm(`Se guardarán ${safeCount} resoluciones seguras. El caso no se marcará como resuelto. ¿Continuar?`)) return;
    try {
      const next = applyAutonomousReview(caseId);
      setReport(next);
      setFeedback(`Aplicadas: ${next.application?.applied.length ?? 0}. Omitidas: ${next.application?.skipped.length ?? 0}. Fallidas: ${next.application?.failed.length ?? 0}.`);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "No se pudieron aplicar las resoluciones."); }
  }

  return <section className="review-subsection autonomous-review" aria-labelledby={`autonomous-title-${caseId}`}>
    <div className="review-row review-row-wrap">
      <div><p className="review-kicker">Motor autónomo local</p><h4 className="review-subtitle" id={`autonomous-title-${caseId}`}>Resolución autónoma</h4></div>
      <strong className="review-mode-label">{report?.dryRun === false ? "APLICADO AL STORE" : "SIMULACIÓN"}</strong>
    </div>
    <p className="review-muted">Analiza exclusivamente los datos ya guardados. No ejecuta acciones externas ni cambia el estado del caso.</p>
    <div className="review-actions">
      <button className="review-button" type="button" onClick={analyze}>Analizar automáticamente</button>
      {editable && safeCount > 0 ? <button className="review-button review-button-secondary" type="button" onClick={apply}>Aplicar resoluciones seguras</button> : null}
    </div>
    {feedback ? <p className="review-feedback" role="status">{feedback}</p> : null}
    {report ? <div className="autonomous-summary" role="status" aria-label="Resumen del análisis">
      <span>Resueltas: {report.resolvedCount}</span><span>Sin resolver: {report.unresolvedCount}</span><span>Más evidencia: {report.needsMoreEvidenceCount}</span><span>Rechazadas: {report.rejectedCount}</span>
    </div> : null}
    {report?.decisions.map((decision) => {
      const id = `autonomous-decision-${caseId}-${decision.issueId}`;
      const open = openIssue === decision.issueId;
      return <div className="autonomous-decision" key={decision.issueId}>
        <div><strong>{decision.issueId}</strong><span>{STATUS_LABELS[decision.status]} · {decision.strategy} · {Math.round(decision.confidence * 100)}%</span><p>{decision.reasoningSummary}</p></div>
        <button className="review-disclosure" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpenIssue(open ? null : decision.issueId)}>{open ? "Ocultar detalles" : "Ver evidencia y validación"}</button>
        {open ? <div id={id} className="autonomous-details">
          <p><strong>Validación:</strong> {decision.validation.valid ? "Válida" : decision.validation.errors.join(" ")}</p>
          {decision.warnings.length ? <p><strong>Avisos:</strong> {decision.warnings.join(" ")}</p> : null}
          <details><summary>Evidencia ({decision.evidence.length})</summary><ul>{decision.evidence.map((item) => <li key={item.id}>{item.label} — {item.source}{item.confidence !== undefined ? ` (${Math.round(item.confidence * 100)}%)` : ""}</li>)}</ul></details>
          <details><summary>Alternativas descartadas ({decision.alternativesRejected.length})</summary><ul>{decision.alternativesRejected.map((item, index) => <li key={`${item.id ?? item.label}-${index}`}>{item.label}: {item.reason}</li>)}</ul></details>
        </div> : null}
      </div>;
    })}
  </section>;
}
