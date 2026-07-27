import type {ContentFormState} from "../../../types";
import type {ReviewJsonObject} from "../../types";
import type {ExternalNewsResumePreview} from "./types";

export type ExternalNewsDraftSaveResult = {success: boolean; draftId?: string; documentId?: string; message?: string; error?: string; metadata?: ReviewJsonObject};
export type ExternalNewsResumeExecutor = {buildOutput(formState: ContentFormState): Promise<ReviewJsonObject> | ReviewJsonObject; saveDraft(output: ReviewJsonObject, options: {idempotencyKey: string}): Promise<ExternalNewsDraftSaveResult>; notify?(event: {type: "started" | "succeeded" | "failed" | "stale" | "duplicate_blocked"; caseId: string; message: string}): void | Promise<void>};
export type ExecuteExternalNewsResumeOptions = {expectedCaseVersion?: number; expectedPreviewFingerprint?: string; preparedPreview?: ExternalNewsResumePreview; preparedPreviewFingerprint?: string; now?: () => string};
export type ExternalNewsResumeErrorCode = "case_not_found" | "unsupported_producer" | "executor_unavailable" | "invalid_state" | "already_resuming" | "already_resumed" | "stale_preview" | "preview_not_ready" | "payload_mapping_failed" | "output_build_failed" | "draft_save_failed" | "draft_saved_state_failed" | "transition_failed" | "unknown_error";
export type ExecuteExternalNewsResumeResult = {success: boolean; status: "succeeded" | ExternalNewsResumeErrorCode; caseId: string; message: string; draftId?: string; documentId?: string; previewFingerprint?: string; caseVersion?: number};
