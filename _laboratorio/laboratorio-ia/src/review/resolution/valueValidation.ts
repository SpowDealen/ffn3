import type {ReviewJsonObject, ReviewJsonValue, ReviewValueKind} from "../types";
import {isSerializableReviewValue} from "../cases/validateResolution";

export const REVIEW_SIMPLE_TEXT_LIMIT = 5_000;
export const REVIEW_LONG_TEXT_LIMIT = 50_000;
export const REVIEW_REASON_LIMIT = 1_000;
export const REVIEW_URL_LIMIT = 2_000;
export const REVIEW_ENTITY_DRAFT_LIMIT = 100 * 1_024;

const SECRET_KEY_PATTERN = /(token|secret|password|authorization|cookie|api[_-]?key)/i;

export type ReviewValueValidation =
  | {valid: true; value: ReviewJsonValue}
  | {valid: false; error: string};

function getExpectedNumber(expected: ReviewJsonObject | undefined, key: "min" | "max"): number | undefined {
  const value = expected?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function validateReviewEditorValue(
  rawValue: string | boolean,
  valueKind: ReviewValueKind | undefined,
  options: {expected?: ReviewJsonObject; longText?: boolean} = {},
): ReviewValueValidation {
  if (valueKind === "boolean") {
    return typeof rawValue === "boolean"
      ? {valid: true, value: rawValue}
      : {valid: false, error: "Selecciona Sí o No."};
  }

  const value = String(rawValue).trim();
  if (!value) return {valid: false, error: "Introduce un valor antes de guardar."};

  if (valueKind === "text" || valueKind === undefined) {
    const limit = options.longText ? REVIEW_LONG_TEXT_LIMIT : REVIEW_SIMPLE_TEXT_LIMIT;
    if (value.length > limit) return {valid: false, error: `El texto no puede superar ${limit.toLocaleString("es-ES")} caracteres.`};
  }

  if (valueKind === "number") {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return {valid: false, error: "Introduce un número finito válido."};
    const min = getExpectedNumber(options.expected, "min");
    const max = getExpectedNumber(options.expected, "max");
    if (min !== undefined && numberValue < min) return {valid: false, error: `El valor mínimo es ${min}.`};
    if (max !== undefined && numberValue > max) return {valid: false, error: `El valor máximo es ${max}.`};
    return {valid: true, value: numberValue};
  }

  if (valueKind === "date") {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
      ? {valid: true, value: new Date(timestamp).toISOString()}
      : {valid: false, error: "Introduce una fecha válida."};
  }

  if (valueKind === "url" || valueKind === "image") {
    if (value.length > REVIEW_URL_LIMIT) return {valid: false, error: `La URL no puede superar ${REVIEW_URL_LIMIT} caracteres.`};
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      return {valid: true, value};
    } catch {
      return {valid: false, error: "Introduce una URL HTTP o HTTPS válida."};
    }
  }

  return {valid: true, value};
}

function findSuspiciousKey(value: ReviewJsonValue, path = "draft"): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = findSuspiciousKey(value[index], `${path}[${index}]`);
      if (match) return match;
    }
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) return `${path}.${key}`;
      const match = findSuspiciousKey(child, `${path}.${key}`);
      if (match) return match;
    }
  }
  return null;
}

export function validateEntityDraft(value: unknown):
  | {valid: true; draft: ReviewJsonObject}
  | {valid: false; error: string} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {valid: false, error: "El borrador debe ser un objeto JSON."};
  }
  if (!isSerializableReviewValue(value)) {
    return {valid: false, error: "El borrador solo puede contener valores JSON serializables."};
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return {valid: false, error: "El borrador no es serializable."};
  }
  if (new Blob([serialized]).size > REVIEW_ENTITY_DRAFT_LIMIT) {
    return {valid: false, error: "El borrador no puede superar 100 KB."};
  }
  const suspiciousKey = findSuspiciousKey(value as ReviewJsonValue);
  if (suspiciousKey) return {valid: false, error: `El borrador contiene una clave sensible no permitida: ${suspiciousKey}.`};
  return {valid: true, draft: value as ReviewJsonObject};
}

export function validateReviewReason(reason: string, required: boolean): string | null {
  const value = reason.trim();
  if (required && !value) return "Introduce un motivo.";
  if (value.length > REVIEW_REASON_LIMIT) return `El motivo no puede superar ${REVIEW_REASON_LIMIT} caracteres.`;
  return null;
}
