import type {NormalizedIdentityValue} from "./types";

const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/gu;
const DECORATIVE = /\p{Extended_Pictographic}|\uFE0F/gu;
const DIACRITICS = /\p{M}+/gu;
const QUOTES = /[“”„‟«»]/gu;
const APOSTROPHES = /[’‘`´]/gu;
const DASHES = /[‐‑‒–—―]/gu;
const PUNCTUATION = /[.,;:!?()[\]{}|/\\]+/gu;
const EDITORIAL_SUFFIX = /\s+(?:preview|results?|resultados?|full card|fight card|cartelera|breaking|última hora)\s*$/iu;
const TRACKING_PARAMS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "ref", "source"]);
const SENSITIVE_ASSIGNMENT = /(?:token|secret|authorization|password)\s*[=:]\s*\S+/giu;

function apply(value: string, transformations: string[], code: string, transform: (current: string) => string): string {
  const next = transform(value);
  if (next !== value) transformations.push(code);
  return next;
}

export function normalizeIdentityText(
  originalValue: string,
  options: {removeDiacritics?: boolean; removeEditorialSuffix?: boolean; normalizeVersus?: boolean; compactAcronym?: boolean} = {},
): NormalizedIdentityValue {
  const transformations: string[] = [];
  const safeOriginal = originalValue.replace(SENSITIVE_ASSIGNMENT, "$1=[redacted]");
  if (safeOriginal !== originalValue) transformations.push("sensitive_value_redacted");
  let value = safeOriginal;
  value = apply(value, transformations, "unicode_nfkc", (current) => current.normalize("NFKC"));
  value = apply(value, transformations, "invisible_removed", (current) => current.replace(INVISIBLE, ""));
  value = apply(value, transformations, "decorative_emoji_removed", (current) => current.replace(DECORATIVE, " "));
  value = apply(value, transformations, "quotes_normalized", (current) => current.replace(QUOTES, '"').replace(APOSTROPHES, "'"));
  value = apply(value, transformations, "dashes_normalized", (current) => current.replace(DASHES, "-"));
  value = apply(value, transformations, "lowercase", (current) => current.toLocaleLowerCase("und"));
  if (options.normalizeVersus) value = apply(value, transformations, "versus_normalized", (current) => current.replace(/\b(?:versus|vs\.?|v\.)\b/giu, "vs"));
  if (options.removeEditorialSuffix) value = apply(value, transformations, "editorial_suffix_removed", (current) => current.replace(EDITORIAL_SUFFIX, ""));
  value = apply(value, transformations, "punctuation_removed", (current) => current.replace(PUNCTUATION, " ").replace(/["']/gu, " "));
  if (options.removeDiacritics !== false) value = apply(value, transformations, "diacritics_removed", (current) => current.normalize("NFD").replace(DIACRITICS, "").normalize("NFC"));
  value = apply(value, transformations, "whitespace_collapsed", (current) => current.replace(/[-_]+/gu, " ").replace(/\s+/gu, " ").trim());
  if (options.compactAcronym && value.split(" ").every((part) => part.length === 1)) value = apply(value, transformations, "acronym_compacted", (current) => current.replace(/\s+/gu, ""));
  return Object.freeze({originalValue: safeOriginal.slice(0, 500), normalizedValue: value.slice(0, 300), transformations: Object.freeze([...new Set(transformations)])});
}

export function normalizeAcronym(value: string): NormalizedIdentityValue {
  const base = normalizeIdentityText(value, {compactAcronym: true});
  const compact = base.normalizedValue.replace(/\s+/gu, "");
  return Object.freeze({...base, normalizedValue: compact, transformations: Object.freeze([...new Set([...base.transformations, ...(compact !== base.normalizedValue ? ["acronym_compacted"] : [])])])});
}

const ROMAN: Readonly<Record<string, number>> = Object.freeze({I: 1, V: 5, X: 10, L: 50, C: 100});
export function romanToInteger(value: string): number | undefined {
  const roman = value.trim().toUpperCase();
  if (!roman || !/^[IVXLC]+$/u.test(roman)) return undefined;
  let result = 0;
  for (let index = 0; index < roman.length; index += 1) {
    const current = ROMAN[roman[index]];
    const next = ROMAN[roman[index + 1]] ?? 0;
    result += current < next ? -current : current;
  }
  return result > 0 ? result : undefined;
}

export function normalizeEdition(value?: string | number): string | undefined {
  if (value === undefined) return undefined;
  const raw = String(value).trim();
  const ordinal = raw.match(/^(\d+)(?:st|nd|rd|th|º|ª)?$/iu)?.[1];
  if (ordinal) return String(Number(ordinal));
  const roman = romanToInteger(raw);
  return roman ? String(roman) : normalizeIdentityText(raw).normalizedValue || undefined;
}

export function normalizeIdentityDate(value?: string): string | undefined {
  if (!value) return undefined;
  const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/u);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : undefined;
}

export function normalizeCanonicalUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    const hostname = url.hostname.toLowerCase().replace(/^(?:www\.|m\.)/u, "");
    const params = [...url.searchParams.entries()].filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase())).sort(([a], [b]) => a.localeCompare(b));
    const pathname = url.pathname.replace(/\/(?:amp|mobile)\/?$/iu, "").replace(/\/+/gu, "/").replace(/\/$/u, "") || "/";
    const query = new URLSearchParams(params).toString();
    return `${url.protocol.toLowerCase()}//${hostname}${pathname}${query ? `?${query}` : ""}`;
  } catch {
    return undefined;
  }
}

export function normalizeDomain(value?: string): string | undefined {
  const url = value?.includes("://") ? normalizeCanonicalUrl(value) : normalizeCanonicalUrl(value ? `https://${value}` : undefined);
  return url ? new URL(url).hostname : undefined;
}

export function normalizedTokens(value: string): string[] {
  return [...new Set(normalizeIdentityText(value).normalizedValue.split(" ").filter(Boolean))].sort();
}

export function tokenSimilarity(left: string, right: string): number {
  const a = new Set(normalizedTokens(left));
  const b = new Set(normalizedTokens(right));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / (a.size + b.size - intersection);
}

export function normalizeParticipantPair(values: readonly string[]): string[] {
  return values.map((value) => normalizeIdentityText(value).normalizedValue).filter(Boolean).sort();
}

export function normalizeWeight(limit?: number, unit?: "kg" | "lb"): {limitKg?: number; limitLb?: number} {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0 || !unit) return {};
  const limitKg = unit === "kg" ? limit : limit * 0.45359237;
  const limitLb = unit === "lb" ? limit : limit / 0.45359237;
  return {limitKg: Number(limitKg.toFixed(2)), limitLb: Number(limitLb.toFixed(2))};
}

export function stripEventEditorialTitle(value: string): string {
  const normalized = normalizeIdentityText(value, {normalizeVersus: true, removeEditorialSuffix: true}).normalizedValue;
  const numbered = normalized.match(/^(.+?\s+\d+)\b/u)?.[1];
  return (numbered ?? normalized.split(/\s+(?:vs)\s+/u)[0]).replace(/\s+(?:abu dhabi|las vegas|london|paris|madrid)$/u, "").trim();
}
