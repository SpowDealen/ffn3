import type {ReviewJsonValue} from "../types";

export const AUTONOMOUS_THRESHOLDS = {
  minimumConfidence: 0.85,
  dominantCandidate: 0.85,
  dominantGap: 0.15,
  uniqueCandidate: 0.9,
  exactMatch: 0.99,
  duplicate: 0.97,
  currentValue: 0.9,
} as const;

export function normalizeConfidence(value?: number): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}

export function normalizeText(value: string, removeAccents = false): string {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("es").replace(/\s+/g, " ");
  return removeAccents ? normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : normalized;
}

export function comparableValue(value: ReviewJsonValue): string {
  if (typeof value === "string") return normalizeText(value, true);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  return JSON.stringify(value);
}
