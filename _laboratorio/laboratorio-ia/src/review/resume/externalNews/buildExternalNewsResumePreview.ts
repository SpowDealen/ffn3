import {getReviewCase} from "../../store/reviewStore";
import type {ReviewCase} from "../../types";
import {applyExternalNewsResolutions} from "./applyExternalNewsResolutions";
import {diffExternalNewsPayload} from "./diffExternalNewsPayload";
import {getExternalNewsResumeSnapshot} from "./getExternalNewsResumeSnapshot";
import type {ExternalNewsResumeOptions, ExternalNewsResumePreview, ExternalNewsResolutionApplicationResult, ExternalNewsResumeValidation} from "./types";
import {validateExternalNewsResumePayload} from "./validateExternalNewsResumePayload";

function empty(caseId: string, generatedAt: string, reason: string): ExternalNewsResumePreview {
  const application: ExternalNewsResolutionApplicationResult = {caseId, originalPayload: {}, resultingPayload: {}, applied: [], skipped: [], failed: [], warnings: [], preparedEntities: [], generatedAt};
  const validation: ExternalNewsResumeValidation = {valid: false, errors: [], warnings: [], blockingReasons: [reason]};
  return {caseId, status: "snapshot_incomplete", originalPayload: {}, resultingPayload: {}, application, validation, changes: [], unresolvedIssueIds: [], preparedEntities: [], canResume: false, reasons: [reason], generatedAt};
}

export function buildExternalNewsResumePreview(caseOrId: string | ReviewCase, options: ExternalNewsResumeOptions = {}): ExternalNewsResumePreview {
  const generatedAt = options.now?.() ?? new Date().toISOString();
  const reviewCase = typeof caseOrId === "string" ? getReviewCase(caseOrId) : caseOrId;
  if (!reviewCase) return empty(typeof caseOrId === "string" ? caseOrId : "unknown", generatedAt, "El caso de revisión no existe.");
  const snapshotResult = getExternalNewsResumeSnapshot(reviewCase.context);
  if (!snapshotResult.snapshot || !snapshotResult.complete) return {...empty(reviewCase.id, generatedAt, `Snapshot incompleto: ${snapshotResult.missingFields.join(", ") || "datos no disponibles"}.`), originalPayload: snapshotResult.snapshot?.payload ?? {}, resultingPayload: snapshotResult.snapshot?.payload ?? {}};
  const application = applyExternalNewsResolutions({reviewCase, snapshot: snapshotResult.snapshot, options: {...options, now: () => generatedAt}});
  const validation = validateExternalNewsResumePayload(application.resultingPayload, reviewCase, application);
  const unresolvedIssueIds = reviewCase.issues.filter((issue) => !reviewCase.resolutions.some((resolution) => resolution.issueId === issue.id)).map((issue) => issue.id);
  const incompatibleStatus = ["resuming", "resumed", "dismissed"].includes(reviewCase.status);
  const reasons = [...validation.blockingReasons, ...validation.errors.map((item) => item.message), ...(incompatibleStatus ? [`El estado ${reviewCase.status} no permite reanudación.`] : [])];
  let status: ExternalNewsResumePreview["status"] = validation.errors.length ? "invalid_payload" : validation.valid && !incompatibleStatus ? "ready" : "not_ready";
  if (application.duplicateDecision?.confirmed) status = "blocked_by_duplicate";
  else if (application.preparedEntities.length) status = "blocked_by_prepared_entity";
  const canResume = status === "ready" && reasons.length === 0;
  return {caseId: reviewCase.id, status, originalPayload: application.originalPayload, resultingPayload: application.resultingPayload, application, validation, changes: diffExternalNewsPayload(application.originalPayload, application.resultingPayload, application.applied), unresolvedIssueIds, preparedEntities: application.preparedEntities, duplicateDecision: application.duplicateDecision, canResume, reasons, generatedAt};
}

export const applyExternalNewsResolutionsPreview = (caseId: string, options?: ExternalNewsResumeOptions): ExternalNewsResolutionApplicationResult => buildExternalNewsResumePreview(caseId, options).application;
