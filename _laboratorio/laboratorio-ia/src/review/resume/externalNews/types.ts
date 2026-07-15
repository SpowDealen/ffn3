import type {ReviewCase, ReviewJsonObject, ReviewJsonValue} from "../../types";

export type ExternalNewsResumeSnapshot = {
  producer: "external_news";
  source: {id: string; name: string; url?: string};
  item: {id?: string; title?: string; canonicalUrl?: string; sourceUrl?: string; publishedAt?: string; imageUrl?: string};
  analysis: ReviewJsonObject;
  resolved: ReviewJsonObject;
  payload: ReviewJsonObject;
  operation: "analyze" | "prepare" | "resolve" | "create_draft";
  capturedAt: string;
  schemaVersion: 1;
};

export type ExternalNewsSnapshotResult = {snapshot?: ExternalNewsResumeSnapshot; complete: boolean; missingFields: string[]; warnings: string[]};
export type ExternalNewsAppliedResolution = {issueId: string; resolutionType: string; path: string; previousValue?: ReviewJsonValue; nextValue?: ReviewJsonValue};
export type ExternalNewsResolutionApplicationResult = {caseId: string; originalPayload: ReviewJsonObject; resultingPayload: ReviewJsonObject; applied: ExternalNewsAppliedResolution[]; skipped: Array<{issueId: string; reason: string}>; failed: Array<{issueId: string; error: string}>; warnings: string[]; preparedEntities: ReviewJsonObject[]; duplicateDecision?: {confirmed: boolean; targetId?: string}; generatedAt: string};
export type ExternalNewsResumeValidation = {valid: boolean; errors: Array<{path?: string; code: string; message: string}>; warnings: Array<{path?: string; code: string; message: string}>; blockingReasons: string[]};
export type ExternalNewsPayloadChange = {path: string; kind: "added" | "removed" | "changed"; before?: ReviewJsonValue; after?: ReviewJsonValue; issueId?: string};
export type ExternalNewsResumePreview = {caseId: string; status: "ready" | "not_ready" | "snapshot_incomplete" | "blocked_by_duplicate" | "blocked_by_prepared_entity" | "invalid_payload"; originalPayload: ReviewJsonObject; resultingPayload: ReviewJsonObject; application: ExternalNewsResolutionApplicationResult; validation: ExternalNewsResumeValidation; changes: ExternalNewsPayloadChange[]; unresolvedIssueIds: string[]; preparedEntities: ReviewJsonObject[]; duplicateDecision?: {confirmed: boolean; targetId?: string}; canResume: boolean; reasons: string[]; generatedAt: string};
export type ExternalNewsResumeOptions = {now?: () => string};
export type ExternalNewsApplicationInput = {reviewCase: ReviewCase; snapshot: ExternalNewsResumeSnapshot; options?: ExternalNewsResumeOptions};
