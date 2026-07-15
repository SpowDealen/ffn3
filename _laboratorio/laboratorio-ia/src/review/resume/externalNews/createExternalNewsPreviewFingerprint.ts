import type {ReviewCase, ReviewJsonValue} from "../../types";
import type {ExternalNewsResumePreview} from "./types";

function stable(value: ReviewJsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function fnv1a(value: string): string { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36); }

export function createExternalNewsPreviewFingerprint(reviewCase: ReviewCase, preview: ExternalNewsResumePreview): string {
  return fnv1a(stable({caseId: reviewCase.id, caseVersion: reviewCase.version, snapshotSchemaVersion: 1, resultingPayload: preview.resultingPayload, resolutions: reviewCase.resolutions, validation: {valid: preview.validation.valid, errors: preview.validation.errors, blockingReasons: preview.validation.blockingReasons}, unresolvedIssueIds: preview.unresolvedIssueIds, duplicateDecision: preview.duplicateDecision ?? null, preparedEntities: preview.preparedEntities}));
}
