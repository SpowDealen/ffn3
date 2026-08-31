import type {ReviewJsonObject, ReviewJsonValue} from "../types";

const SENSITIVE_KEY = /(token|secret|password|authorization|cookie|api[_-]?key|headers?|credential|session)/i;

export function sanitizeReviewIntakeValue(
  value: unknown,
  depth = 0,
): ReviewJsonValue {
  if (
    depth > 4 ||
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) return null;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 1_000 ? `${trimmed.slice(0, 999)}…` : trimmed;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 24).map((item) => sanitizeReviewIntakeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_KEY.test(key))
        .slice(0, 40)
        .map(([key, child]) => [key, sanitizeReviewIntakeValue(child, depth + 1)]),
    );
  }
  return null;
}

export function sanitizeReviewIntakeObject(value: unknown): ReviewJsonObject {
  const safe = sanitizeReviewIntakeValue(value);
  return safe && typeof safe === "object" && !Array.isArray(safe) ? safe : {};
}
