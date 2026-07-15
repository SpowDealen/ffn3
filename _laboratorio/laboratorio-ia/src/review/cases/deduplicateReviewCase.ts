import type {ReviewCase} from "../types";

const ACTIVE_STATUSES = new Set<ReviewCase["status"]>([
  "open",
  "in_review",
  "resolved",
  "resuming",
  "resume_failed",
  "stale",
]);

export function findActiveReviewCaseByDedupeKey(
  reviewCases: readonly ReviewCase[],
  dedupeKey: string,
): ReviewCase | undefined {
  const normalizedKey = dedupeKey.trim();
  if (!normalizedKey) return undefined;

  return reviewCases.find(
    (reviewCase) =>
      reviewCase.dedupeKey === normalizedKey &&
      ACTIVE_STATUSES.has(reviewCase.status),
  );
}

export function deduplicateReviewCase(
  reviewCases: readonly ReviewCase[],
  candidate: ReviewCase,
): ReviewCase {
  return findActiveReviewCaseByDedupeKey(reviewCases, candidate.dedupeKey) ?? candidate;
}
