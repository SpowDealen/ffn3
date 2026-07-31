import type {ReviewCaseStatus, ReviewModule} from "./types";

export const REVIEW_CASE_SCHEMA_VERSION = 1 as const;
export const REVIEW_CASE_STORAGE_KEY = "ffn3.review-cases.v1";
export const MAX_REVIEW_CASES = 250;
export const FINAL_REVIEW_CASE_TTL_MS = 90 * 24 * 60 * 60 * 1_000;

export const REVIEW_MODULES: readonly ReviewModule[] = [
  "ufc.news",
  "ufc.events",
  "bkfc.news",
  "bkfc.events",
  "one.news",
  "one.events",
  "external.news",
  "editorial.builder",
  "entity.reconciliation",
  "sanity",
];

export const REVIEW_CASE_STATUSES: readonly ReviewCaseStatus[] = [
  "open",
  "in_review",
  "resolved",
  "resuming",
  "resumed",
  "resume_failed",
  "stale",
  "dismissed",
];
