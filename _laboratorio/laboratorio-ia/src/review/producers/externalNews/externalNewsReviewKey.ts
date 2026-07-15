import {normalizeText} from "../../autonomous";
import type {ExternalNewsReviewInput} from "./types";

function normalizeUrl(value: string): string | undefined {
  try { const url = new URL(value); url.hash = ""; [...url.searchParams.keys()].filter((key) => key.startsWith("utm_") || ["fbclid", "gclid"].includes(key)).forEach((key) => url.searchParams.delete(key)); return url.toString().replace(/\/$/, ""); }
  catch { return undefined; }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); }
  return (result >>> 0).toString(36);
}

export function createExternalNewsReviewKey(input: ExternalNewsReviewInput): string {
  const canonical = normalizeUrl(input.item.canonicalUrl);
  const identity = canonical ?? input.item.id ?? normalizeUrl(input.item.sourceUrl) ?? hash(`${normalizeText(input.item.title)}|${input.item.publishedAt ?? ""}`);
  return `external-news:${input.source.id}:${identity}`;
}

export const createExternalNewsIssueId = (caseKey: string, relation: string, suffix?: string): string => `${caseKey}:${relation}${suffix ? `:${normalizeText(suffix, true).replace(/[^a-z0-9]+/g, "-")}` : ""}`;
