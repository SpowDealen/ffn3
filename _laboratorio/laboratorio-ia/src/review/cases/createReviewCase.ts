import {REVIEW_CASE_SCHEMA_VERSION} from "../constants";
import type {CreateReviewCaseInput, ReviewCase} from "../types";
import {assertSerializableReviewValue} from "./validateResolution";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildReviewCase(
  input: CreateReviewCaseInput,
  now = new Date(),
): ReviewCase {
  const createdAt = now.toISOString();
  const reviewCase: ReviewCase = {
    schemaVersion: REVIEW_CASE_SCHEMA_VERSION,
    id: createId(),
    dedupeKey: input.dedupeKey.trim(),
    module: input.module,
    title: input.title.trim(),
    status: "open",
    priority: input.priority,
    source: input.source?.trim() || undefined,
    subject: input.subject,
    issues: input.issues,
    resolutions: [],
    context: input.context ?? {},
    resumeAction: input.resumeAction,
    createdAt,
    updatedAt: createdAt,
    version: 1,
    resumeAttempts: 0,
  };

  if (!reviewCase.dedupeKey) throw new Error("ReviewCase requiere dedupeKey.");
  if (!reviewCase.title) throw new Error("ReviewCase requiere title.");
  if (!reviewCase.subject.type.trim()) {
    throw new Error("ReviewCase requiere subject.type.");
  }

  assertSerializableReviewValue(reviewCase);
  return reviewCase;
}
