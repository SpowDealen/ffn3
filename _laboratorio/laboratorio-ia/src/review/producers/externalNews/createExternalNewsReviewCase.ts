import {createReviewCase, getReviewCases, updateReviewCase} from "../../store/reviewStore";
import type {ReviewJsonObject, ReviewJsonValue, ReviewPriority} from "../../types";
import {validateReviewResolution} from "../../cases/validateResolution";
import {detectExternalNewsIssues} from "./detectExternalNewsIssues";
import {createExternalNewsReviewKey} from "./externalNewsReviewKey";
import type {ExternalNewsReviewCaseResult, ExternalNewsReviewContext, ExternalNewsReviewInput} from "./types";

const SENSITIVE = /(token|secret|password|authorization|cookie|api[_-]?key|headers?)/i;
function snapshot(value: unknown, depth = 0): ReviewJsonValue {
  if (depth > 5 || value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return null;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.length > 4_000 ? `${value.slice(0, 3_999)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => snapshot(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !SENSITIVE.test(key)).slice(0, 80).map(([key, child]) => [key, snapshot(child, depth + 1)]));
  return null;
}

export function buildExternalNewsReviewContext(input: ExternalNewsReviewInput, createdAt: string): ExternalNewsReviewContext {
  const unresolvedRelations = [!input.resolved.disciplina ? "discipline" : "", input.analysis.organizacionPrincipal && !input.resolved.organizacion ? "organization" : "", input.analysis.eventoPrincipal && !input.resolved.evento ? "event" : "", ...(input.analysis.luchadoresPrincipales ?? []).filter((name) => !input.resolved.luchadoresPrincipales.some((item) => item.label === name)).map((name) => `fighter:${name}`)].filter(Boolean);
  return {producer: "external_news", sourceId: input.source.id, sourceName: input.source.name, sourceUrl: input.item.sourceUrl, externalItemId: input.item.id, canonicalUrl: input.item.canonicalUrl, title: input.item.title, operation: input.operation ?? "analyze", payloadSnapshot: snapshot({id: input.item.id, title: input.item.title, excerpt: input.item.excerpt, bodyText: input.item.bodyText, canonicalUrl: input.item.canonicalUrl, publishedAt: input.item.publishedAt, image: input.item.image, tags: input.item.tags}) as ReviewJsonObject, analysisSnapshot: snapshot({analysis: input.analysis, resolved: input.resolved, warnings: input.warnings}) as ReviewJsonObject, unresolvedRelations, createdAt};
}

export function createOrUpdateExternalNewsReviewCase(input: ExternalNewsReviewInput): ExternalNewsReviewCaseResult {
  const detection = detectExternalNewsIssues(input);
  const counts = {issueCount: detection.issues.length, blockingIssueCount: detection.issues.filter((item) => item.blocking).length, requiredIssueCount: detection.issues.filter((item) => item.required).length};
  if (!detection.issues.length) return {status: "clean", ...counts};
  const dedupeKey = createExternalNewsReviewKey(input);
  const existing = getReviewCases().find((item) => item.dedupeKey === dedupeKey && !["resumed", "dismissed"].includes(item.status));
  const createdAt = existing?.context.createdAt && typeof existing.context.createdAt === "string" ? existing.context.createdAt : input.now?.() ?? new Date().toISOString();
  const context = buildExternalNewsReviewContext(input, createdAt);
  if (!existing) {
    const created = createReviewCase({dedupeKey, module: "external.news", title: `Revisión externa: ${input.item.title || input.item.id}`, priority: detection.hasBlockingIssues ? "high" : "normal", source: input.source.name, subject: {type: "external_news", id: input.item.id, label: input.item.title, sourceUrl: input.item.sourceUrl}, issues: detection.issues, context});
    return {status: "created", caseId: created.id, ...counts};
  }
  const prospectiveCase = {...existing, issues: detection.issues};
  const resolutions = existing.resolutions.filter((resolution) => validateReviewResolution(prospectiveCase, resolution).valid);
  const priority: ReviewPriority = detection.hasBlockingIssues ? "high" : "normal";
  const comparable = {title: `Revisión externa: ${input.item.title || input.item.id}`, priority, source: input.source.name, subject: {type: "external_news", id: input.item.id, label: input.item.title, sourceUrl: input.item.sourceUrl}, issues: detection.issues, resolutions, context};
  const current = {title: existing.title, priority: existing.priority, source: existing.source, subject: existing.subject, issues: existing.issues, resolutions: existing.resolutions, context: existing.context};
  if (JSON.stringify(comparable) === JSON.stringify(current)) return {status: "unchanged", caseId: existing.id, ...counts};
  updateReviewCase(existing.id, comparable);
  return {status: "updated", caseId: existing.id, ...counts};
}
