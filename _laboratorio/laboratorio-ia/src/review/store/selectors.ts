import type {ReviewCase, ReviewCaseStatus, ReviewModule} from "../types";

export function selectReviewCaseById(
  reviewCases: readonly ReviewCase[],
  id: string,
): ReviewCase | undefined {
  return reviewCases.find((reviewCase) => reviewCase.id === id);
}

export function selectReviewCasesByStatus(
  reviewCases: readonly ReviewCase[],
  status: ReviewCaseStatus,
): ReviewCase[] {
  return reviewCases.filter((reviewCase) => reviewCase.status === status);
}

export function selectReviewCasesByModule(
  reviewCases: readonly ReviewCase[],
  module: ReviewModule,
): ReviewCase[] {
  return reviewCases.filter((reviewCase) => reviewCase.module === module);
}

export function selectOpenReviewCases(
  reviewCases: readonly ReviewCase[],
): ReviewCase[] {
  return reviewCases.filter((reviewCase) =>
    ["open", "in_review", "resume_failed", "stale"].includes(
      reviewCase.status,
    ),
  );
}
