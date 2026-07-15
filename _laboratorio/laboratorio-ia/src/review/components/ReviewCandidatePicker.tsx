import type {ReactElement} from "react";
import {formatConfidence, getConfidenceLevel, normalizeConfidenceForDisplay} from "../formatters";
import type {ReviewCandidate} from "../types";

export default function ReviewCandidatePicker({
  candidates,
  value,
  onChange,
  groupName,
  onUseReference,
  errorId,
}: {
  candidates: ReviewCandidate[];
  value: string;
  onChange(value: string): void;
  groupName: string;
  onUseReference(sanityId: string): void;
  errorId: string;
}): ReactElement {
  const sorted = [...candidates].sort(
    (left, right) => normalizeConfidenceForDisplay(right.confidence) - normalizeConfidenceForDisplay(left.confidence),
  );
  return (
    <fieldset className="review-editor-fieldset" aria-describedby={errorId}>
      <legend>Selecciona un candidato</legend>
      {sorted.map((candidate) => (
        <div className="review-candidate-option" key={candidate.id}>
          <label className="review-candidate-selection">
            <input type="radio" name={`candidate-${groupName}`} checked={value === candidate.id} onChange={() => onChange(candidate.id)} />
            <span className="review-candidate-picker-copy">
              <strong>{candidate.label}</strong>
              <small>ID: {candidate.id}</small>
              {candidate.entityType ? <small>Entidad: {candidate.entityType}</small> : null}
              {candidate.sanityId ? <small>Sanity ID: {candidate.sanityId}</small> : null}
              {candidate.snapshotRevision ?? candidate.sanityRevision ? <small>Snapshot: {candidate.snapshotRevision ?? candidate.sanityRevision}</small> : null}
              {candidate.confidence !== undefined ? (
                <small>Confianza: {formatConfidence(candidate.confidence)} · {getConfidenceLevel(candidate.confidence)}</small>
              ) : null}
              {candidate.reasons?.length ? <small>{candidate.reasons.join(" · ")}</small> : null}
            </span>
          </label>
          {candidate.sanityId ? <button className="review-inline-button" type="button" onClick={() => onUseReference(candidate.sanityId!)}>Usar referencia Sanity</button> : null}
        </div>
      ))}
    </fieldset>
  );
}
