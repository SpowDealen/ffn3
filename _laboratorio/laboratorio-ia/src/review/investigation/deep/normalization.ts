import type {ReviewJsonValue} from "../../types";
export function normalizeEvidenceValue(value: ReviewJsonValue): {value: ReviewJsonValue; transformations: string[]} {
  if (typeof value !== "string") return {value, transformations: []};
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) { try { const url = new URL(trimmed); url.hash = ""; return {value: url.toString(), transformations: ["trim", "remove_url_fragment"]}; } catch { return {value: trimmed, transformations: ["trim"]}; } }
  const normalized = trimmed.normalize("NFKC").replace(/\s+/g, " ");
  return {value: normalized, transformations: normalized === value ? [] : ["trim", "unicode_nfkc", "collapse_whitespace"]};
}
export function stableHash(value: unknown): string { const text = JSON.stringify(value, Object.keys(value as object ?? {}).sort()); let hash = 2166136261; for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619); return (hash >>> 0).toString(16).padStart(8, "0"); }
