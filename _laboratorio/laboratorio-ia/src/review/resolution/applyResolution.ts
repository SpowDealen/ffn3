import type {ReviewCase, ReviewResolution} from "../types";
import {addReviewResolution} from "../store/reviewStore";

export function saveReviewResolution(
  reviewCase: ReviewCase,
  resolution: ReviewResolution,
): ReviewCase {
  const updated = addReviewResolution(reviewCase.id, resolution);
  if (!updated) throw new Error("El caso ya no existe.");
  return updated;
}
