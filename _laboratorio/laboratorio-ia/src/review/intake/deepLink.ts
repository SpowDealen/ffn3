import type {ReviewCase} from "../types";

export type ReviewCaseDeepLink = Readonly<{
  found: boolean;
  caseId?: string;
  section: "dashboard" | "case";
}>;

export function resolveReviewCaseDeepLink(
  reviewCases: readonly ReviewCase[],
  value?: string | URLSearchParams | null,
): ReviewCaseDeepLink {
  const requested = typeof value === "string" ? value : value?.get("case") ?? "";
  const caseId = requested.trim();
  if (!caseId) return {found: false, section: "dashboard"};
  return reviewCases.some((reviewCase) => reviewCase.id === caseId)
    ? {found: true, caseId, section: "case"}
    : {found: false, section: "dashboard"};
}
