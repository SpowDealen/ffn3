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

function isExplicitlyNonActionable(reviewCase: ReviewCase): boolean {
  const intake = reviewCase.context.unifiedReviewIntake;
  const intakeAction = intake && typeof intake === "object" && !Array.isArray(intake)
    ? intake.actionRequired
    : undefined;
  return (
    reviewCase.context.historical === true ||
    reviewCase.context.temporal === "historical" ||
    reviewCase.context.readonlyDiagnostic === true ||
    reviewCase.context.readOnlyDiagnostic === true ||
    reviewCase.context.humanActionRequired === false ||
    reviewCase.context.actionRequired === false ||
    intakeAction === false ||
    intakeAction === "none"
  );
}

export function selectNeedsAttentionReviewCases(
  reviewCases: readonly ReviewCase[],
): ReviewCase[] {
  return reviewCases.filter((reviewCase) =>
    ["open", "in_review", "resume_failed", "stale"].includes(reviewCase.status) &&
    reviewCase.issues.length > 0 &&
    !isExplicitlyNonActionable(reviewCase),
  );
}
