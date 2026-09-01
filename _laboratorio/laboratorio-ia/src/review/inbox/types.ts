import type {ReviewPriority} from "../types";

export const REVIEW_INBOX_VERSION = "1.0.0" as const;

export type ReviewInboxBucket = "needs_attention" | "in_process" | "resolved";

export type ReviewInboxFilters = Readonly<{
  source?: string | "all";
  entity?: string | "all";
  priority?: ReviewPriority | "all";
}>;

export type ReviewInboxItem = Readonly<{
  caseId: string;
  bucket: ReviewInboxBucket;
  sourceLabel: string;
  entityLabel: string;
  priority: ReviewPriority;
  priorityLabel: string;
  problemTitle: string;
  recommendationSummary: string;
  humanStatus: string;
  primaryAction: Readonly<{
    label: "Revisar" | "Continuar revisión" | "Ver resultado";
    href: string;
  }>;
  updatedAt: string;
  completedAt?: string;
}>;

export type ReviewInboxViewModel = Readonly<{
  version: typeof REVIEW_INBOX_VERSION;
  groups: Readonly<Record<ReviewInboxBucket, readonly ReviewInboxItem[]>>;
  counts: Readonly<Record<ReviewInboxBucket, number>>;
  facets: Readonly<{
    sources: readonly string[];
    entities: readonly string[];
    priorities: readonly ReviewPriority[];
  }>;
  filters: ReviewInboxFilters;
  total: number;
  presentationOnly: true;
  writes: false;
}>;
