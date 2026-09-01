import {selectNeedsAttentionReviewCases} from "../store/selectors";
import {buildSimplifiedReviewCasePresentation} from "../presentation";
import type {ReviewCase, ReviewPriority} from "../types";
import {
  REVIEW_INBOX_VERSION,
  type ReviewInboxBucket,
  type ReviewInboxFilters,
  type ReviewInboxItem,
  type ReviewInboxViewModel,
} from "./types";

const PRIORITY_RANK: Readonly<Record<ReviewPriority, number>> = Object.freeze({critical: 4, high: 3, normal: 2, low: 1});
const PROCESS_RANK: Readonly<Record<string, number>> = Object.freeze({resuming: 4, in_review: 3, resume_failed: 2, stale: 1});
const RESOLVED_STATUSES = new Set(["resolved", "resumed", "dismissed"]);
const PROCESS_STATUSES = new Set(["resuming", "in_review", "resume_failed", "stale"]);

function isInboxExcluded(reviewCase: ReviewCase): boolean {
  return reviewCase.context.historical === true ||
    reviewCase.context.temporal === "historical" ||
    reviewCase.context.readonlyDiagnostic === true ||
    reviewCase.context.readOnlyDiagnostic === true;
}

function bucketFor(reviewCase: ReviewCase, needsAttentionIds: ReadonlySet<string>): ReviewInboxBucket | undefined {
  if (needsAttentionIds.has(reviewCase.id)) return "needs_attention";
  if (RESOLVED_STATUSES.has(reviewCase.status)) return "resolved";
  if (PROCESS_STATUSES.has(reviewCase.status)) return "in_process";
  return undefined;
}

function humanPriorityLabel(priority: ReviewPriority): string {
  return priority === "critical" ? "Crítica" : priority === "high" ? "Alta" : priority === "normal" ? "Normal" : "Baja";
}

function humanStatus(reviewCase: ReviewCase, bucket: ReviewInboxBucket): string {
  if (bucket === "needs_attention") return "Necesita tu atención";
  if (bucket === "resolved") return reviewCase.status === "dismissed" ? "Descartado" : "Resuelto";
  return reviewCase.status === "resume_failed" ? "Necesita revisar el proceso" : "En proceso";
}

function actionFor(caseId: string, bucket: ReviewInboxBucket): ReviewInboxItem["primaryAction"] {
  return Object.freeze({
    label: bucket === "needs_attention" ? "Revisar" : bucket === "in_process" ? "Continuar revisión" : "Ver resultado",
    href: `/revision?case=${encodeURIComponent(caseId)}`,
  });
}

export function buildReviewInboxItem(reviewCase: ReviewCase, bucket: ReviewInboxBucket): ReviewInboxItem {
  const presentation = buildSimplifiedReviewCasePresentation(reviewCase);
  return Object.freeze({
    caseId: reviewCase.id,
    bucket,
    sourceLabel: presentation.sourceLabel,
    entityLabel: presentation.entityLabel,
    priority: reviewCase.priority,
    priorityLabel: humanPriorityLabel(reviewCase.priority),
    problemTitle: presentation.problem.title,
    recommendationSummary: presentation.recommendation.summary,
    humanStatus: humanStatus(reviewCase, bucket),
    primaryAction: actionFor(reviewCase.id, bucket),
    updatedAt: reviewCase.updatedAt,
    completedAt: reviewCase.resolvedAt ?? reviewCase.resumedAt,
  });
}

function recent(left?: string, right?: string): number {
  const leftTime = Date.parse(left ?? "") || 0;
  const rightTime = Date.parse(right ?? "") || 0;
  return rightTime - leftTime;
}

function sortItems(bucket: ReviewInboxBucket, statuses: ReadonlyMap<string, ReviewCase["status"]>) {
  return (left: ReviewInboxItem, right: ReviewInboxItem): number => {
    if (bucket === "resolved") return recent(left.completedAt ?? left.updatedAt, right.completedAt ?? right.updatedAt) || left.caseId.localeCompare(right.caseId);
    const priority = PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority];
    if (priority) return priority;
    if (bucket === "in_process") {
      const state = (PROCESS_RANK[statuses.get(right.caseId) ?? ""] ?? 0) - (PROCESS_RANK[statuses.get(left.caseId) ?? ""] ?? 0);
      if (state) return state;
    }
    return recent(left.updatedAt, right.updatedAt) || left.caseId.localeCompare(right.caseId);
  };
}

function matches(item: ReviewInboxItem, filters: ReviewInboxFilters): boolean {
  return (!filters.source || filters.source === "all" || item.sourceLabel === filters.source) &&
    (!filters.entity || filters.entity === "all" || item.entityLabel === filters.entity) &&
    (!filters.priority || filters.priority === "all" || item.priority === filters.priority);
}

export function selectReviewInbox(reviewCases: readonly ReviewCase[], filters: ReviewInboxFilters = {}): ReviewInboxViewModel {
  const eligible = reviewCases.filter((reviewCase) => !isInboxExcluded(reviewCase));
  const needsAttentionIds = new Set(selectNeedsAttentionReviewCases(eligible).map((reviewCase) => reviewCase.id));
  const statuses = new Map(eligible.map((reviewCase) => [reviewCase.id, reviewCase.status] as const));
  const allItems = eligible.flatMap((reviewCase) => {
    const bucket = bucketFor(reviewCase, needsAttentionIds);
    return bucket ? [buildReviewInboxItem(reviewCase, bucket)] : [];
  });
  const filtered = allItems.filter((item) => matches(item, filters));
  const group = (bucket: ReviewInboxBucket): readonly ReviewInboxItem[] => Object.freeze(filtered.filter((item) => item.bucket === bucket).sort(sortItems(bucket, statuses)));
  const groups = Object.freeze({needs_attention: group("needs_attention"), in_process: group("in_process"), resolved: group("resolved")});
  const counts = Object.freeze({needs_attention: groups.needs_attention.length, in_process: groups.in_process.length, resolved: groups.resolved.length});
  const compare = (left: string, right: string): number => left.localeCompare(right, "es", {sensitivity: "base"});
  return Object.freeze({
    version: REVIEW_INBOX_VERSION,
    groups,
    counts,
    facets: Object.freeze({
      sources: Object.freeze([...new Set(allItems.map((item) => item.sourceLabel))].sort(compare)),
      entities: Object.freeze([...new Set(allItems.map((item) => item.entityLabel))].sort(compare)),
      priorities: Object.freeze((["critical", "high", "normal", "low"] as const).filter((priority) => allItems.some((item) => item.priority === priority))),
    }),
    filters: Object.freeze({...filters}),
    total: counts.needs_attention + counts.in_process + counts.resolved,
    presentationOnly: true,
    writes: false,
  });
}

export const reviewInboxSecurity = Object.freeze({
  pure: true,
  derivesFromReviewCase: true,
  reusesNeedsAttentionSelector: true,
  createsStores: false,
  createsRepositories: false,
  persistsState: false,
  createsPolling: false,
  invokesAu7: false,
  invokesAu8: false,
  createsResumeEngines: false,
  writes: false,
} as const);
