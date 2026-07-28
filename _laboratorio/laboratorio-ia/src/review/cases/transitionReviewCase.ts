import type {
  ReviewCase,
  ReviewCaseStatus,
  ReviewResolution,
  UpdateReviewCaseInput,
} from "../types";
import {
  assertSerializableReviewValue,
  canResolveReviewCase,
  validateReviewResolution,
} from "./validateResolution";

const ALLOWED_TRANSITIONS: Record<ReviewCaseStatus, readonly ReviewCaseStatus[]> = {
  open: ["in_review", "resolved", "resuming", "stale", "dismissed"],
  in_review: ["open", "resolved", "resuming", "stale", "dismissed"],
  resolved: ["resuming", "open", "stale", "dismissed"],
  resuming: ["resumed", "resume_failed", "stale"],
  resumed: [],
  resume_failed: ["resuming", "open", "stale", "dismissed"],
  stale: ["open", "resuming", "dismissed"],
  dismissed: [],
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function withVersion(
  reviewCase: ReviewCase,
  changes: Partial<ReviewCase>,
  now: Date,
): ReviewCase {
  const updated = {
    ...reviewCase,
    ...changes,
    updatedAt: now.toISOString(),
    version: reviewCase.version + 1,
  };
  assertSerializableReviewValue(updated);
  return updated;
}

export function applyReviewCaseTransition(
  reviewCase: ReviewCase,
  status: ReviewCaseStatus,
  now = new Date(),
  dismissReason?: string,
): ReviewCase {
  if (status === reviewCase.status) return reviewCase;
  if (!ALLOWED_TRANSITIONS[reviewCase.status].includes(status)) {
    throw new Error(
      `Transición de ReviewCase no permitida: ${reviewCase.status} → ${status}.`,
    );
  }
  if (status === "resolved" && !canResolveReviewCase(reviewCase)) {
    throw new Error("No se puede resolver un caso con problemas bloqueantes pendientes.");
  }

  const timestamp = now.toISOString();
  return withVersion(
    reviewCase,
    {
      status,
      resolvedAt: status === "resolved" ? timestamp : reviewCase.resolvedAt,
      resumedAt: status === "resumed" ? timestamp : reviewCase.resumedAt,
      resumeAttempts:
        status === "resuming"
          ? reviewCase.resumeAttempts + 1
          : reviewCase.resumeAttempts,
      lastResumeError:
        status === "resuming" || status === "resumed"
          ? undefined
          : reviewCase.lastResumeError,
      dismissReason:
        status === "dismissed"
          ? dismissReason?.trim() || undefined
          : reviewCase.dismissReason,
    },
    now,
  );
}

export function applyReviewCaseUpdate(
  reviewCase: ReviewCase,
  input: UpdateReviewCaseInput,
  now = new Date(),
): ReviewCase {
  return withVersion(reviewCase, input, now);
}

export function applyReviewCaseCheckpointUpdate(
  reviewCase: ReviewCase,
  globalResolution: ReviewCase["globalResolution"],
  now = new Date(),
): ReviewCase {
  const updated: ReviewCase = {
    ...reviewCase,
    globalResolution,
    updatedAt: now.toISOString(),
  };
  assertSerializableReviewValue(updated);
  return updated;
}

export function applyReviewResolution(
  reviewCase: ReviewCase,
  resolution: ReviewResolution,
  now = new Date(),
): ReviewCase {
  const validation = validateReviewResolution(reviewCase, resolution);
  if (!validation.valid) throw new Error(validation.error);

  const existing = reviewCase.resolutions.find(
    (current) => current.issueId === resolution.issueId,
  );
  if (existing && structurallyEqual(existing, resolution)) {
    return reviewCase;
  }

  return withVersion(
    reviewCase,
    {
      resolutions: [
        ...reviewCase.resolutions.filter(
          (current) => current.issueId !== resolution.issueId,
        ),
        resolution,
      ],
    },
    now,
  );
}

export function removeReviewResolutionValue(
  reviewCase: ReviewCase,
  issueId: string,
  now = new Date(),
): ReviewCase {
  const resolutions = reviewCase.resolutions.filter(
    (resolution) => resolution.issueId !== issueId,
  );
  if (resolutions.length === reviewCase.resolutions.length) return reviewCase;
  return withVersion(reviewCase, {resolutions}, now);
}
