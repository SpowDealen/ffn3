import type {ReactElement} from "react";
import type {ReviewIssue, ReviewJsonValue} from "../types";
import {REVIEW_LONG_TEXT_LIMIT, REVIEW_SIMPLE_TEXT_LIMIT, REVIEW_URL_LIMIT} from "../resolution/valueValidation";

function displayCurrentValue(value: ReviewJsonValue | undefined): string {
  if (value === undefined) return "Sin valor actual";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export default function ReviewValueEditor({
  issue,
  value,
  booleanValue,
  onValueChange,
  onBooleanChange,
  errorId,
}: {
  issue: ReviewIssue;
  value: string;
  booleanValue: boolean;
  onValueChange(value: string): void;
  onBooleanChange(value: boolean): void;
  errorId: string;
}): ReactElement {
  const fieldId = `review-value-${issue.id}`;
  const longText = issue.valueKind === "text" && (
    issue.kind === "insufficient_content" ||
    String(issue.currentValue ?? "").length > 180
  );
  const expectedMin = typeof issue.expected?.min === "number" ? issue.expected.min : undefined;
  const expectedMax = typeof issue.expected?.max === "number" ? issue.expected.max : undefined;
  const originalDate = typeof issue.currentValue === "string" ? issue.currentValue : "";
  const dateType = /^\d{4}-\d{2}-\d{2}$/.test(originalDate) ? "date" : "datetime-local";

  return (
    <div className="review-value-editor">
      <p className="review-current-value"><strong>Valor actual:</strong> {displayCurrentValue(issue.currentValue)}</p>
      {issue.valueKind === "boolean" ? (
        <label className="review-editor-label" htmlFor={fieldId}>Valor
          <select id={fieldId} value={booleanValue ? "true" : "false"} onChange={(event) => onBooleanChange(event.target.value === "true")} aria-describedby={errorId}>
            <option value="true">Sí</option><option value="false">No</option>
          </select>
        </label>
      ) : longText ? (
        <label className="review-editor-label" htmlFor={fieldId}>Valor
          <textarea id={fieldId} rows={6} maxLength={REVIEW_LONG_TEXT_LIMIT} value={value} onChange={(event) => onValueChange(event.target.value)} aria-describedby={errorId} />
          <span className="review-character-count">{value.length.toLocaleString("es-ES")} / {REVIEW_LONG_TEXT_LIMIT.toLocaleString("es-ES")}</span>
        </label>
      ) : (
        <label className="review-editor-label" htmlFor={fieldId}>Valor
          <input
            id={fieldId}
            type={issue.valueKind === "number" ? "number" : issue.valueKind === "date" ? dateType : issue.valueKind === "url" ? "url" : "text"}
            min={issue.valueKind === "number" ? expectedMin : undefined}
            max={issue.valueKind === "number" ? expectedMax : undefined}
            maxLength={issue.valueKind === "url" ? REVIEW_URL_LIMIT : REVIEW_SIMPLE_TEXT_LIMIT}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            aria-describedby={errorId}
          />
        </label>
      )}
      {issue.valueKind === "url" && /^https?:\/\//i.test(value) ? (
        <a className="review-safe-preview-link" href={value} target="_blank" rel="noreferrer noopener">Previsualizar URL en una pestaña nueva</a>
      ) : null}
    </div>
  );
}
