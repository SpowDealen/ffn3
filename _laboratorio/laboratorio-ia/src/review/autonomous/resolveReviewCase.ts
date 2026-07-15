import type {ReviewCase} from "../types";
import {resolveReviewIssue} from "./resolveReviewIssue";
import type {AutonomousCaseResolutionResult, AutonomousResolverOptions} from "./types";

export function resolveReviewCase(caseData: ReviewCase, options: AutonomousResolverOptions = {}): AutonomousCaseResolutionResult {
  const generatedAt = options.now?.() ?? new Date().toISOString();
  const decisions = caseData.issues.map((issue) => resolveReviewIssue(caseData, issue, {...options, now: () => generatedAt}));
  const count = (status: string): number => decisions.filter((item) => item.status === status).length;
  return {caseId: caseData.id, decisions, resolvedCount: count("resolved"), unresolvedCount: count("unresolved"), needsMoreEvidenceCount: count("needs_more_evidence"), rejectedCount: count("rejected"), canResolveAfterApplying: decisions.every((item) => item.status === "resolved" || (!caseData.issues.find((issue) => issue.id === item.issueId)?.required && !caseData.issues.find((issue) => issue.id === item.issueId)?.blocking)), generatedAt};
}
