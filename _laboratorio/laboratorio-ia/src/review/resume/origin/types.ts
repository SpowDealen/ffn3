import type {ReviewIntakeRequest} from "../../intake";
import type {ReviewJsonObject, ReviewResolution} from "../../types";

export const OFFICIAL_REVIEW_RESUME_PRODUCERS = [
  "ufc_news",
  "ufc_events",
  "one_news",
  "one_events",
  "bkfc_news",
  "bkfc_events",
] as const;

export type OfficialReviewResumeProducer = typeof OFFICIAL_REVIEW_RESUME_PRODUCERS[number];
export type ReviewResumeProducer = OfficialReviewResumeProducer | "external_news";

export type ReviewOriginResumeContext = Readonly<{
  schemaVersion: 1;
  producer: OfficialReviewResumeProducer;
  originId: string;
  operation: string;
  fingerprint: string;
}>;

export type ReviewOriginResumeRequest = Readonly<{
  caseId: string;
  caseVersion: number;
  producer: OfficialReviewResumeProducer;
  originId: string;
  operation: string;
  fingerprint: string;
  resolutions: readonly ReviewResolution[];
  context: ReviewJsonObject;
  idempotencyKey: string;
  signal: AbortSignal;
}>;

export type ReviewOriginAuthorityResult = Readonly<{
  outcome: "succeeded" | "already_applied" | "review_required" | "blocked" | "changed" | "conflict" | "failed";
  observed: boolean;
  resultId?: string;
  message?: string;
  followUp?: ReviewIntakeRequest;
}>;

export type ReviewOriginResumeAuthority = Readonly<{
  authorityId: string;
  producer: OfficialReviewResumeProducer;
  continueOrigin(request: ReviewOriginResumeRequest): Promise<ReviewOriginAuthorityResult>;
}>;

export type DispatchReviewResumeResult = Readonly<{
  success: boolean;
  status:
    | "resumed"
    | "already_resumed"
    | "already_resuming"
    | "case_not_found"
    | "invalid_state"
    | "invalid_resume_context"
    | "authorization_required"
    | "authority_unavailable"
    | "changed"
    | "conflict"
    | "review_required"
    | "result_not_observed"
    | "resume_failed";
  caseId: string;
  producer?: ReviewResumeProducer;
  message: string;
  resultId?: string;
  followUpCaseId?: string;
}>;

export type DispatchReviewResumeInput = Readonly<{
  caseId: string;
  expectedCaseVersion: number;
  expectedFingerprint: string;
  authorized: boolean;
  signal?: AbortSignal;
  now?: () => string;
}>;

export type ReviewProducerSupport = Readonly<{
  producer: string;
  status: "supported" | "partially_supported" | "not_supported_yet";
  authority: string;
  reason: string;
}>;
