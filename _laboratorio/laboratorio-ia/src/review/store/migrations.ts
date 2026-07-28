import {
  REVIEW_CASE_SCHEMA_VERSION,
  REVIEW_CASE_STATUSES,
  REVIEW_MODULES,
} from "../constants";
import type {ReviewCase} from "../types";
import {isSerializableReviewValue} from "../cases/validateResolution";
import {validateGlobalResolutionCheckpoint} from "../globalResolution/checkpoint/checkpoint";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function migrateVersionOneReviewCase(value: unknown): ReviewCase | undefined {
  if (!isRecord(value) || value.schemaVersion !== REVIEW_CASE_SCHEMA_VERSION) {
    return undefined;
  }

  const candidate = {...value};
  if ("globalResolution" in candidate && !validateGlobalResolutionCheckpoint(candidate.globalResolution).ok) delete candidate.globalResolution;
  const valid =
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
    isSerializableReviewValue(candidate);
  return valid ? candidate as unknown as ReviewCase : undefined;
}

export function migrateReviewCases(value: unknown): ReviewCase[] {
  if (!Array.isArray(value)) return [];
  return value.map(migrateVersionOneReviewCase).filter((reviewCase): reviewCase is ReviewCase => Boolean(reviewCase));
}
