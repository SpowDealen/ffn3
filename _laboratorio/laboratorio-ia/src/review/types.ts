import type {GlobalResolutionCheckpoint} from "./globalResolution/checkpoint/types";

export type ReviewCaseStatus =
  | "open"
  | "in_review"
  | "resolved"
  | "resuming"
  | "resumed"
  | "resume_failed"
  | "stale"
  | "dismissed";

export type ReviewIssueKind =
  | "required_field"
  | "invalid_value"
  | "missing_image"
  | "invalid_url"
  | "missing_reference"
  | "ambiguous_reference"
  | "missing_entity"
  | "duplicate_candidate"
  | "contradictory_data"
  | "low_confidence"
  | "insufficient_content"
  | "recoverable_error"
  | "partial_creation"
  | "blocked_dependency";

export type ReviewValueKind =
  | "text"
  | "date"
  | "number"
  | "boolean"
  | "image"
  | "url"
  | "sanityReference"
  | "discipline"
  | "organization"
  | "event"
  | "fighter"
  | "fight"
  | "category";

export type ReviewModule =
  | "ufc.news"
  | "ufc.events"
  | "bkfc.news"
  | "bkfc.events"
  | "one.news"
  | "one.events"
  | "external.news"
  | "editorial.builder"
  | "sanity";

export type ReviewPriority = "critical" | "high" | "normal" | "low";

export type ReviewJsonPrimitive = string | number | boolean | null;
export type ReviewJsonValue =
  | ReviewJsonPrimitive
  | ReviewJsonValue[]
  | {[key: string]: ReviewJsonValue};
export type ReviewJsonObject = {[key: string]: ReviewJsonValue};

export type ReviewSubject = {
  type: string;
  id?: string;
  label?: string;
  sourceUrl?: string;
  sanityId?: string;
  sanityRevision?: string;
};

export type ReviewCandidate = {
  id: string;
  label: string;
  value: ReviewJsonValue;
  entityType?: string;
  sanityId?: string;
  confidence?: number;
  reasons?: string[];
  sanityRevision?: string;
  snapshotRevision?: string;
};

export type ReviewIssue = {
  id: string;
  kind: ReviewIssueKind;
  valueKind?: ReviewValueKind;
  fieldPath?: string;
  label: string;
  message: string;
  required?: boolean;
  blocking?: boolean;
  currentValue?: ReviewJsonValue;
  expected?: ReviewJsonObject;
  candidates?: ReviewCandidate[];
  evidence?: string[];
};

export type ReviewResolution =
  | {type: "set_value"; issueId: string; value: ReviewJsonValue}
  | {type: "select_candidate"; issueId: string; candidateId: string}
  | {type: "link_reference"; issueId: string; sanityId: string}
  | {
      type: "create_entity";
      issueId: string;
      entityType: string;
      draft: ReviewJsonObject;
    }
  | {type: "select_image"; issueId: string; url?: string; assetId?: string}
  | {type: "confirm_duplicate"; issueId: string; duplicateId: string}
  | {type: "reject_duplicate"; issueId: string; reason?: string}
  | {type: "accept_value"; issueId: string; reason?: string}
  | {type: "discard"; issueId: string; reason: string}
  | {type: "retry"; issueId: string};

export type ReviewResumeAction =
  | {
      kind: "endpoint";
      operation: string;
      method: "POST" | "PUT" | "PATCH";
      payload: ReviewJsonObject;
    }
  | {
      kind: "internal_operation";
      operation: string;
      payload: ReviewJsonObject;
    }
  | {
      kind: "continue_process";
      processType: string;
      checkpoint: string;
      payload: ReviewJsonObject;
    }
  | {
      kind: "create_draft";
      contentType: string;
      document: ReviewJsonObject;
    }
  | {
      kind: "update_entity";
      documentId: string;
      patch: ReviewJsonObject;
      expectedRevision?: string;
    }
  | {
      kind: "repeat_resolution";
      resolver: string;
      payload: ReviewJsonObject;
    };

export type ReviewCase = {
  schemaVersion: 1;
  id: string;
  dedupeKey: string;
  module: ReviewModule;
  title: string;
  status: ReviewCaseStatus;
  priority: ReviewPriority;
  source?: string;
  subject: ReviewSubject;
  issues: ReviewIssue[];
  resolutions: ReviewResolution[];
  context: ReviewJsonObject;
  resumeAction?: ReviewResumeAction;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resumedAt?: string;
  version: number;
  resumeAttempts: number;
  lastResumeError?: string;
  dismissReason?: string;
  resumeExecution?: ReviewResumeExecution;
  entityMaterialization?: ReviewEntityMaterialization;
  globalResolution?: GlobalResolutionCheckpoint;
};

export type ReviewEntityMaterialization = {status: "never" | "running" | "succeeded" | "failed" | "reconciliation_required"; attemptCount: number; startedAt?: string; completedAt?: string; failedAt?: string; issueResults: Array<{issueId: string; identityKey?: string; entityType: string; entityId?: string; status: string; error?: {code: string; message: string}}>};

export type ReviewResumeExecution = {
  status: "never" | "resuming" | "succeeded" | "failed";
  attemptCount: number;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  previewFingerprint?: string;
  caseVersionAtStart?: number;
  draftId?: string;
  documentId?: string;
  error?: {code: string; message: string};
  summary?: {appliedResolutionCount: number; changeCount: number; sourceName?: string; title?: string};
};

export type CreateReviewCaseInput = Pick<
  ReviewCase,
  "dedupeKey" | "module" | "title" | "priority" | "subject" | "issues"
> &
  Partial<Pick<ReviewCase, "source" | "context" | "resumeAction">>;

export type UpdateReviewCaseInput = Partial<
  Pick<
    ReviewCase,
    | "title"
    | "priority"
    | "source"
    | "subject"
    | "issues"
    | "resolutions"
    | "context"
    | "resumeAction"
    | "lastResumeError"
    | "dismissReason"
    | "resumeExecution"
    | "entityMaterialization"
  >
>;
