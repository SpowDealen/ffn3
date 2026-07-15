import type {ReactElement} from "react";
import {
  formatConfidence,
  getConfidenceLevel,
  getKnownLabel,
  REVIEW_ISSUE_KIND_LABELS,
  REVIEW_VALUE_KIND_LABELS,
  normalizeConfidenceForDisplay,
} from "../formatters";
import type {ReviewIssue, ReviewResolution} from "../types";

type ReviewIssueDetailsProps = {
  issue: ReviewIssue;
  resolution?: ReviewResolution;
};

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Valor no disponible";
  }
}

export default function ReviewIssueDetails({
  issue,
  resolution,
}: ReviewIssueDetailsProps): ReactElement {
  const candidates = [...(issue.candidates ?? [])].sort(
    (left, right) => normalizeConfidenceForDisplay(right.confidence) - normalizeConfidenceForDisplay(left.confidence),
  );

  return (
    <article className="review-issue-card">
      <div className="review-row review-row-wrap">
        <div>
          <p className="review-kicker">
            {getKnownLabel(REVIEW_ISSUE_KIND_LABELS, issue.kind)}
          </p>
          <h4 className="review-issue-title">{issue.label}</h4>
        </div>
        <div className="review-badges">
          {issue.required ? <span className="review-badge">Obligatoria</span> : null}
          {issue.blocking ? <span className="review-badge review-badge-danger">Bloqueante</span> : null}
          <span className={resolution ? "review-badge review-badge-ok" : "review-badge"}>
            {resolution ? "Con resolución" : "Sin resolución"}
          </span>
        </div>
      </div>

      <p className="review-message">{issue.message}</p>

      <dl className="review-definition-grid">
        {issue.fieldPath ? <><dt>Campo</dt><dd>{issue.fieldPath}</dd></> : null}
        {issue.valueKind ? (
          <><dt>Tipo de valor</dt><dd>{getKnownLabel(REVIEW_VALUE_KIND_LABELS, issue.valueKind)}</dd></>
        ) : null}
        <dt>Candidatos</dt><dd>{candidates.length}</dd>
      </dl>

      {issue.currentValue !== undefined ? (
        <div>
          <h5 className="review-small-title">Valor actual</h5>
          <pre className="review-json review-json-small">{formatValue(issue.currentValue)}</pre>
        </div>
      ) : null}

      {issue.expected ? (
        <div>
          <h5 className="review-small-title">Valor esperado</h5>
          <pre className="review-json review-json-small">{formatValue(issue.expected)}</pre>
        </div>
      ) : null}

      {issue.evidence?.length ? (
        <div>
          <h5 className="review-small-title">Evidencias</h5>
          <ul className="review-plain-list">
            {issue.evidence.map((evidence, index) => <li key={`${evidence}-${index}`}>{evidence}</li>)}
          </ul>
        </div>
      ) : null}

      {candidates.length ? (
        <div>
          <h5 className="review-small-title">Candidatos</h5>
          <div className="review-candidates">
            {candidates.map((candidate) => {
              const confidence = formatConfidence(candidate.confidence);
              return (
                <div className="review-candidate" key={candidate.id}>
                  <div className="review-row review-row-wrap">
                    <strong>{candidate.label}</strong>
                    {confidence ? <span className="review-badge">Confianza {confidence} · {getConfidenceLevel(candidate.confidence!)}</span> : null}
                  </div>
                  <dl className="review-definition-grid review-definition-grid-compact">
                    <dt>ID</dt><dd>{candidate.id}</dd>
                    {candidate.entityType ? <><dt>Entidad</dt><dd>{candidate.entityType}</dd></> : null}
                    {candidate.sanityId ? <><dt>Sanity ID</dt><dd>{candidate.sanityId}</dd></> : null}
                    {candidate.snapshotRevision ?? candidate.sanityRevision ? <><dt>Snapshot</dt><dd>{candidate.snapshotRevision ?? candidate.sanityRevision}</dd></> : null}
                  </dl>
                  {candidate.reasons?.length ? (
                    <ul className="review-plain-list">
                      {candidate.reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </article>
  );
}
