import type {
  ReviewCandidate,
  ReviewJsonObject,
  ReviewPriority,
} from "../types";

export const REVIEW_INTAKE_ISSUE_TYPES = [
  "missing_entity",
  "ambiguous_entity",
  "duplicate_entity",
  "missing_relation",
  "ambiguous_relation",
  "conflicting_relation",
  "insufficient_evidence",
  "conflicting_evidence",
  "missing_required_field",
  "incomplete_event",
  "unresolved_fighter",
  "unresolved_category",
  "review_required",
] as const;

export type ReviewIntakeIssueType =
  (typeof REVIEW_INTAKE_ISSUE_TYPES)[number];

export type ReviewIntakeSource =
  | "ufc"
  | "one"
  | "bkfc"
  | "external_news"
  | "sanity";

export type ReviewIntakeEntityType =
  | "news"
  | "event"
  | "fighter"
  | "participant"
  | "organization"
  | "discipline"
  | "weight_category"
  | "fight"
  | "relation"
  | "reference";

export type ReviewIntakeEvidenceReference = Readonly<{
  id: string;
  source?: string;
  fingerprint?: string;
}>;

export type ReviewIntakeRequest = Readonly<{
  actionable: boolean;
  source: ReviewIntakeSource;
  entityType: ReviewIntakeEntityType;
  originId?: string;
  entityId?: string;
  externalId?: string;
  subjectLabel?: string;
  issueType: ReviewIntakeIssueType;
  summary: string;
  title?: string;
  priority?: ReviewPriority;
  evidenceRefs?: readonly (string | ReviewIntakeEvidenceReference)[];
  candidates?: readonly ReviewCandidate[];
  originContext?: ReviewJsonObject;
  resumeContext?: ReviewJsonObject;
  now?: () => string;
}>;

export type ReviewIntakeResult = Readonly<{
  status: "created" | "updated" | "unchanged" | "ignored";
  caseId?: string;
  identityKey?: string;
  fingerprint?: string;
  reasonCode?: string;
}>;

export type ReviewCaseHumanLabels = Readonly<{
  sourceLabel: string;
  entityLabel: string;
  problemTitle: string;
  problemSummary: string;
}>;
