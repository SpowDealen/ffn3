import type {ReviewJsonValue} from "../types";
import {OUTCOME_FINGERPRINT_VERSION} from "./constants";

const VOLATILE = new Set(["createdAt", "updatedAt", "occurredAt", "generatedAt", "completedAt", "startedAt", "runId", "attemptId", "executionId"]);
function normalizeText(value: string): string { return value.normalize("NFC").trim(); }
export function canonicalizeOutcomeValue(value: unknown, key = ""): ReviewJsonValue {
  if (VOLATILE.has(key) || value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return null;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return normalizeText(value);
  if (Array.isArray(value)) return value.map((item) => canonicalizeOutcomeValue(item));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([childKey]) => !VOLATILE.has(childKey)).sort(([left], [right]) => left.localeCompare(right)).map(([childKey, child]) => [childKey, canonicalizeOutcomeValue(child, childKey)]));
  return null;
}
function hash(value: string): string { let result = 2166136261; for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619); return (result >>> 0).toString(36).padStart(7, "0"); }
export function fingerprintOutcomeValue(scope: string, value: unknown): string { return `${OUTCOME_FINGERPRINT_VERSION}:${scope}:${hash(JSON.stringify(canonicalizeOutcomeValue(value)))}`; }
export const buildDecisionFingerprint = (value: {issueType: string; entityType?: string; operation: string; target?: unknown; resolution: unknown; scope?: unknown; producer: string; schemaVersion: number}): string => fingerprintOutcomeValue("decision", value);
export const buildContextFingerprint = (value: unknown): string => fingerprintOutcomeValue("context", value);
export const buildInputFingerprint = (value: unknown): string => fingerprintOutcomeValue("input", value);
export const buildEvidenceFingerprint = (value: unknown): string => fingerprintOutcomeValue("evidence", value);
