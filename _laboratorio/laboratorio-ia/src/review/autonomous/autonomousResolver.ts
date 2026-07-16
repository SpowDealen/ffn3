import {addReviewResolution, getReviewCase} from "../store/reviewStore";
import {resolveReviewCase} from "./resolveReviewCase";
import type {AutonomousApplyResult, AutonomousCaseResolutionResult, AutonomousReviewRunResult, RunAutonomousReviewOptions} from "./types";
import {observeResolutionApplied} from "../outcomes";

export function applyAutonomousResolutionResult(caseId: string, result: AutonomousCaseResolutionResult): AutonomousApplyResult {
  const report: AutonomousApplyResult = {caseId, applied: [], skipped: [], failed: []};
  for (const decision of result.decisions) {
    if (decision.status !== "resolved" || !decision.proposedResolution || !decision.validation.valid) { report.skipped.push({issueId: decision.issueId, reason: decision.validation.errors.join(" ") || "No existe una resolución segura y válida."}); continue; }
    try {
      const before = getReviewCase(caseId);
      if (!before) { report.failed.push({issueId: decision.issueId, error: "El caso no existe."}); continue; }
      const existing = before.resolutions.find((item) => item.issueId === decision.issueId);
      if (existing && JSON.stringify(existing) === JSON.stringify(decision.proposedResolution)) { report.skipped.push({issueId: decision.issueId, reason: "La resolución idéntica ya está guardada."}); continue; }
      const updated = addReviewResolution(caseId, decision.proposedResolution);
      if (updated) observeResolutionApplied(updated, decision.proposedResolution);
      report.applied.push(decision.issueId);
    } catch (error) { report.failed.push({issueId: decision.issueId, error: error instanceof Error ? error.message : "Error no serializable al guardar."}); }
  }
  return report;
}

export function runAutonomousReview(caseId: string, options: RunAutonomousReviewOptions = {}): AutonomousReviewRunResult {
  const reviewCase = getReviewCase(caseId);
  if (!reviewCase) throw new Error(`No existe el caso de revisión ${caseId}.`);
  const dryRun = options.dryRun ?? true;
  const result = resolveReviewCase(reviewCase, {minimumConfidence: options.minimumConfidence, allowOptionalDiscard: options.allowOptionalDiscard ?? false, allowPreparedEntity: options.allowPreparedEntity ?? false, now: options.now});
  return {...result, dryRun, ...(dryRun ? {} : {application: applyAutonomousResolutionResult(caseId, result)})};
}

export const previewAutonomousReview = (caseId: string): AutonomousReviewRunResult => runAutonomousReview(caseId, {dryRun: true});
export const applyAutonomousReview = (caseId: string): AutonomousReviewRunResult => runAutonomousReview(caseId, {dryRun: false});
