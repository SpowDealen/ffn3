import {
  REVIEW_CASE_SCHEMA_VERSION,
  REVIEW_CASE_STATUSES,
  REVIEW_MODULES,
} from "../constants";
import type {ReviewCase} from "../types";
import {isSerializableReviewValue} from "../cases/validateResolution";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVersionOneReviewCase(value: unknown): value is ReviewCase {
  if (!isRecord(value) || value.schemaVersion !== REVIEW_CASE_SCHEMA_VERSION) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.dedupeKey === "string" &&
    REVIEW_MODULES.includes(value.module as ReviewCase["module"]) &&
    typeof value.title === "string" &&
    REVIEW_CASE_STATUSES.includes(value.status as ReviewCase["status"]) &&
    ["critical", "high", "normal", "low"].includes(String(value.priority)) &&
    isRecord(value.subject) &&
    typeof value.subject.type === "string" &&
    Array.isArray(value.issues) &&
    Array.isArray(value.resolutions) &&
    isRecord(value.context) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Number.isInteger(value.version) &&
    Number.isInteger(value.resumeAttempts) &&
    isSerializableReviewValue(value)
  );
}

export function migrateReviewCases(value: unknown): ReviewCase[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isVersionOneReviewCase);
}
