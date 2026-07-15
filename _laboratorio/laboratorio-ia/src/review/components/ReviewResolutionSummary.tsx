import type {ReactElement} from "react";
import {formatResolutionDetail, REVIEW_RESOLUTION_LABELS} from "../resolution/resolutionFormatters";
import type {ReviewResolution} from "../types";
import {formatReviewDate} from "../formatters";

export default function ReviewResolutionSummary({resolution, updatedAt}: {resolution: ReviewResolution; updatedAt?: string}): ReactElement {
  return (
    <div className="review-resolution-summary">
      <span className="review-badge review-badge-ok">Resolución guardada</span>
      <strong>{REVIEW_RESOLUTION_LABELS[resolution.type]}</strong>
      <span>{formatResolutionDetail(resolution)}</span>
      {updatedAt ? <small>Caso actualizado: {formatReviewDate(updatedAt)}</small> : null}
    </div>
  );
}
