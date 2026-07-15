import type {ReactElement} from "react";
import {
  formatRelativeReviewTime,
  REVIEW_MODULE_LABELS,
  REVIEW_PRIORITY_LABELS,
  REVIEW_STATUS_LABELS,
} from "../formatters";
import type {ReviewCase} from "../types";

type ReviewCaseListProps = {
  reviewCases: ReviewCase[];
  selectedId: string | null;
  now: number;
  onSelect(id: string): void;
};

export default function ReviewCaseList({
  reviewCases,
  selectedId,
  now,
  onSelect,
}: ReviewCaseListProps): ReactElement {
  return (
    <div className="review-case-list" aria-label="Casos de revisión">
      {reviewCases.map((reviewCase) => {
        const blocking = reviewCase.issues.filter((issue) => issue.blocking).length;
        const selected = reviewCase.id === selectedId;
        return (
          <article
            className={`review-case-card${selected ? " review-case-card-selected" : ""}`}
            key={reviewCase.id}
            aria-current={selected ? "true" : undefined}
          >
            <div className="review-row review-row-wrap">
              <span className={`review-priority review-priority-${reviewCase.priority}`}>
                {REVIEW_PRIORITY_LABELS[reviewCase.priority]}
              </span>
              <span className="review-badge">{REVIEW_STATUS_LABELS[reviewCase.status]}</span>
            </div>
            <p className="review-kicker">{REVIEW_MODULE_LABELS[reviewCase.module]}</p>
            <h3 className="review-case-title">{reviewCase.title}</h3>
            {reviewCase.source ? <p className="review-muted">Fuente: {reviewCase.source}</p> : null}
            {reviewCase.subject.label ? <p className="review-muted">{reviewCase.subject.label}</p> : null}
            <p className="review-meta">
              {reviewCase.issues.length} incidencias · {blocking} bloqueantes · {reviewCase.resolutions.length} resoluciones
            </p>
            <p className="review-meta">
              Actualizado {formatRelativeReviewTime(reviewCase.updatedAt, now)} · versión {reviewCase.version}
            </p>
            <button className="review-button review-button-secondary" type="button" onClick={() => onSelect(reviewCase.id)}>
              {selected ? "Caso abierto" : "Abrir caso"}
            </button>
          </article>
        );
      })}
    </div>
  );
}
