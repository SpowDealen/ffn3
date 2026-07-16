import type {ReviewCase} from "../types";
import {ensureResolutionOutcome, observeMaterialization, observeResumeForCase} from "./integrations";
export function importLegacyOutcomesForCase(reviewCase: ReviewCase): {outcomeIds: string[]; importedSignals: number} {
  const records = reviewCase.resolutions.map((resolution) => ensureResolutionOutcome(reviewCase, resolution, "legacy_import"));
  let importedSignals = 0;
  for (const item of reviewCase.entityMaterialization?.issueResults ?? []) {
    const succeeded = ["created", "existing"].includes(item.status);
    observeMaterialization(reviewCase, {type: succeeded ? "materialization_succeeded" : "materialization_failed", issueId: item.issueId, idempotencyKey: `legacy:materialization:${reviewCase.id}:${item.issueId}:${item.status}:${item.entityId ?? "none"}`, entityId: item.entityId, entityType: item.entityType, status: item.status, error: item.error ? {code: item.error.code, message: item.error.message, reconciliationRequired: item.status === "reconciliation_required"} : undefined, occurredAt: reviewCase.entityMaterialization?.completedAt ?? reviewCase.entityMaterialization?.failedAt ?? reviewCase.updatedAt});
    importedSignals += 1;
  }
  const resume = reviewCase.resumeExecution;
  if (resume?.status === "succeeded" && (resume.draftId || resume.documentId)) {
    observeResumeForCase(reviewCase, {type: "resume_succeeded", idempotencyKey: `legacy:resume:${reviewCase.id}:${resume.previewFingerprint ?? "none"}:succeeded`, status: "succeeded", previewFingerprint: resume.previewFingerprint, draftId: resume.draftId, documentId: resume.documentId, occurredAt: resume.completedAt ?? reviewCase.updatedAt});
    observeResumeForCase(reviewCase, {type: "draft_created", idempotencyKey: `legacy:resume:${reviewCase.id}:${resume.draftId ?? resume.documentId}:draft`, status: "created", previewFingerprint: resume.previewFingerprint, draftId: resume.draftId, documentId: resume.documentId, occurredAt: resume.completedAt ?? reviewCase.updatedAt});
    importedSignals += 2;
  } else if (resume?.status === "failed") {
    observeResumeForCase(reviewCase, {type: "resume_failed", idempotencyKey: `legacy:resume:${reviewCase.id}:${resume.attemptCount}:failed`, status: "failed", previewFingerprint: resume.previewFingerprint, error: resume.error ? {code: resume.error.code, message: resume.error.message} : {code: "legacy_resume_failed", message: "El caso registra una reanudación fallida."}, occurredAt: resume.failedAt ?? reviewCase.updatedAt});
    importedSignals += 1;
  }
  return {outcomeIds: records.map((record) => record.id), importedSignals};
}
