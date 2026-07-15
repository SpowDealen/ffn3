import type {ReactElement} from "react";
import {validateResolution} from "../cases/validateResolution";
import type {ReviewCase} from "../types";

export default function ReviewCaseResolutionStatus({
  reviewCase,
  onMarkResolved,
}: {
  reviewCase: ReviewCase;
  onMarkResolved?(): void;
}): ReactElement {
  const validation = validateResolution(reviewCase);
  const pendingBlockingOrRequired = validation.pendingIssues.filter(
    (issue) => issue.blocking || issue.required,
  );
  return (
    <section className={validation.valid ? "review-case-resolution-ready" : "review-case-resolution-pending"} aria-labelledby={`resolution-status-${reviewCase.id}`}>
      <strong id={`resolution-status-${reviewCase.id}`}>Estado de resolución</strong>
      <div className="review-resolution-metrics">
        <span>{validation.totalIssues} totales</span>
        <span>{validation.resolvedIssues} resueltas</span>
        <span>{validation.pendingBlockingIssues.length} bloqueantes pendientes</span>
        <span>{validation.pendingRequiredIssues.length} obligatorias pendientes</span>
        <span>{validation.completionPercentage}% completado</span>
      </div>
      {validation.valid ? (
        <>
          <span>El caso está listo para marcarse como resuelto. Esto no ejecutará la acción de reanudación.</span>
          {onMarkResolved ? <button className="review-button" type="button" onClick={onMarkResolved}>Marcar caso como resuelto</button> : null}
        </>
      ) : (
        <div>
          <span>Pendiente:</span>
          <ul className="review-plain-list">
            {pendingBlockingOrRequired.slice(0, 5).map((issue) => <li key={issue.id}>{issue.label}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
