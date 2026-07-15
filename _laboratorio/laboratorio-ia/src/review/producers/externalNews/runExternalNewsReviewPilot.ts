import {applyAutonomousResolutionResult, AUTONOMOUS_THRESHOLDS, resolveReviewCase} from "../../autonomous";
import {getReviewCase} from "../../store/reviewStore";
import {validateResolution} from "../../cases/validateResolution";
import {createOrUpdateExternalNewsReviewCase} from "./createExternalNewsReviewCase";
import type {ExternalNewsReviewInput, ExternalNewsReviewPilotResult} from "./types";

const SAFE_STRATEGIES = new Set(["exact_match", "current_value", "candidate_ranking", "reference_match", "primitive_validation", "optional_discard", "duplicate_analysis"]);

export function runExternalNewsReviewPilot(input: ExternalNewsReviewInput): ExternalNewsReviewPilotResult {
  try {
    const caseResult = createOrUpdateExternalNewsReviewCase(input);
    if (caseResult.status === "clean" || !caseResult.caseId) return {caseResult, review: {required: false, status: "not_needed", issueCount: 0, resolvedIssueCount: 0, pendingIssueCount: 0, blockingPendingCount: 0, autonomousAppliedCount: 0}, saveBlocked: false};
    const reviewCase = getReviewCase(caseResult.caseId);
    if (!reviewCase) throw new Error("El caso creado no está disponible en el store.");
    const simulation = resolveReviewCase(reviewCase, {minimumConfidence: AUTONOMOUS_THRESHOLDS.minimumConfidence, allowOptionalDiscard: true, allowPreparedEntity: false, now: input.now});
    const safeDecisions = simulation.decisions.filter((decision) => decision.status === "resolved" && decision.validation.valid && decision.proposedResolution && decision.confidence >= AUTONOMOUS_THRESHOLDS.minimumConfidence && SAFE_STRATEGIES.has(decision.strategy) && decision.warnings.length === 0 && decision.proposedResolution.type !== "create_entity" && (decision.strategy !== "duplicate_analysis" || decision.confidence >= AUTONOMOUS_THRESHOLDS.duplicate));
    const application = applyAutonomousResolutionResult(caseResult.caseId, {...simulation, decisions: safeDecisions});
    const updated = getReviewCase(caseResult.caseId);
    if (!updated) throw new Error("El caso desapareció después de aplicar resoluciones.");
    const validation = validateResolution(updated);
    const pendingBlocking = validation.pendingIssues.filter((issue) => issue.blocking || issue.required).length;
    const status = pendingBlocking === 0 ? "ready_for_future_resume" : application.applied.length ? "partially_resolved" : "needs_more_evidence";
    return {caseResult, simulation, application, review: {required: true, caseId: updated.id, status, issueCount: updated.issues.length, resolvedIssueCount: validation.resolvedIssues, pendingIssueCount: validation.pendingIssues.length, blockingPendingCount: pendingBlocking, autonomousAppliedCount: application.applied.length}, saveBlocked: true};
  } catch (error) {
    return {review: {required: true, status: "error", issueCount: 0, resolvedIssueCount: 0, pendingIssueCount: 0, blockingPendingCount: 0, autonomousAppliedCount: 0, error: error instanceof Error ? error.message : "Error no serializable en el Centro de revisión."}, saveBlocked: true};
  }
}
