import {validateReviewResolution} from "../cases/validateResolution";
import type {ReviewCase, ReviewIssue, ReviewJsonValue} from "../types";
import type {AutonomousResolutionDecision} from "./types";

const EDITABLE = new Set<ReviewCase["status"]>(["open", "in_review", "stale", "resume_failed"]);

function contradictsExpected(issue: ReviewIssue, value: ReviewJsonValue): boolean {
  if (typeof value === "number") {
    if (typeof issue.expected?.min === "number" && value < issue.expected.min) return true;
    if (typeof issue.expected?.max === "number" && value > issue.expected.max) return true;
  }
  const allowed = issue.expected?.allowedValues;
  return Array.isArray(allowed) && !allowed.some((item) => JSON.stringify(item) === JSON.stringify(value));
}

export function validateAutonomousDecision(caseData: ReviewCase, decision: AutonomousResolutionDecision): AutonomousResolutionDecision {
  const errors: string[] = [];
  const issue = caseData.issues.find((item) => item.id === decision.issueId);
  if (!issue) errors.push("La incidencia no existe en el caso.");
  if (!EDITABLE.has(caseData.status)) errors.push("El caso está en estado de solo lectura.");
  if (decision.proposedResolution) {
    const validation = validateReviewResolution(caseData, decision.proposedResolution);
    if (!validation.valid) errors.push(validation.error);
    if (issue && decision.proposedResolution.type === "set_value" && contradictsExpected(issue, decision.proposedResolution.value)) errors.push("El valor contradice las restricciones esperadas.");
  }
  if (decision.status === "resolved" && !decision.proposedResolution) errors.push("Una decisión resuelta necesita una resolución propuesta.");
  return {...decision, validation: {valid: errors.length === 0, errors}, status: errors.length && decision.status === "resolved" ? "rejected" : decision.status};
}
