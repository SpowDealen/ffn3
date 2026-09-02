import {validateReviewResolution} from "../cases/validateResolution";
import {createReviewCase, getReviewCases, transitionReviewCase, updateReviewCase} from "../store/reviewStore";
import type {
  ReviewCandidate,
  ReviewIssue,
  ReviewJsonObject,
  ReviewJsonValue,
  ReviewModule,
  ReviewValueKind,
} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {sanitizeReviewIntakeObject, sanitizeReviewIntakeValue} from "./security";
import {REVIEW_INTAKE_TAXONOMY} from "./taxonomy";
import type {
  ReviewIntakeEntityType,
  ReviewIntakeEvidenceReference,
  ReviewIntakeRequest,
  ReviewIntakeResult,
  ReviewIntakeSource,
} from "./types";

const SOURCE_LABELS: Readonly<Record<ReviewIntakeSource, string>> = Object.freeze({
  ufc: "UFC",
  one: "ONE Championship",
  bkfc: "BKFC",
  external_news: "Fuente externa",
  sanity: "Sanity",
});

const ENTITY_LABELS: Readonly<Record<ReviewIntakeEntityType, string>> = Object.freeze({
  news: "Noticia",
  event: "Evento",
  fighter: "Luchador",
  participant: "Participante",
  organization: "Organización",
  discipline: "Disciplina",
  weight_category: "Categoría de peso",
  fight: "Combate",
  relation: "Relación",
  reference: "Referencia",
});

function normalizeIdentityPart(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("es").replace(/\s+/g, " ");
}

function logicalOriginId(input: ReviewIntakeRequest): string {
  return input.originId?.trim() || input.entityId?.trim() || input.externalId?.trim() || "";
}

export function createReviewIntakeIdentity(input: ReviewIntakeRequest): {
  identityKey: string;
  fingerprint: string;
} | undefined {
  const originId = logicalOriginId(input);
  if (!originId) return undefined;
  const semantic = {
    source: input.source,
    entityType: input.entityType,
    originId: normalizeIdentityPart(originId),
    issueType: input.issueType,
  };
  const fingerprint = computeUniversalFingerprint(semantic as unknown as ReviewJsonValue);
  return {identityKey: `review-intake:${input.source}:${fingerprint}`, fingerprint};
}

function moduleFor(source: ReviewIntakeSource, entityType: ReviewIntakeEntityType): ReviewModule {
  if (source === "external_news") return "external.news";
  if (source === "sanity") return "sanity";
  return `${source}.${entityType === "news" ? "news" : "events"}` as ReviewModule;
}

function valueKindFor(entityType: ReviewIntakeEntityType): ReviewValueKind {
  const mapping: Partial<Record<ReviewIntakeEntityType, ReviewValueKind>> = {
    fighter: "fighter",
    participant: "fighter",
    organization: "organization",
    discipline: "discipline",
    weight_category: "category",
    event: "event",
    fight: "fight",
    relation: "sanityReference",
    reference: "sanityReference",
  };
  return mapping[entityType] ?? "text";
}

function safeEvidence(
  values: readonly (string | ReviewIntakeEvidenceReference)[] = [],
): {refs: ReviewJsonValue[]; ids: string[]} {
  const refs = values.slice(0, 24).flatMap((value) => {
    const normalized = typeof value === "string" ? {id: value} : value;
    const safe = sanitizeReviewIntakeObject(normalized);
    return typeof safe.id === "string" && safe.id ? [safe] : [];
  });
  return {refs, ids: refs.map((value) => String((value as ReviewJsonObject).id))};
}

function safeCandidates(values: readonly ReviewCandidate[] = []): ReviewCandidate[] {
  return values.slice(0, 12).flatMap((candidate) => {
    const id = candidate.id.trim().slice(0, 200);
    const label = candidate.label.trim().slice(0, 240);
    if (!id || !label) return [];
    const value = sanitizeReviewIntakeValue(candidate.value);
    return [{
      id,
      label,
      value,
      entityType: candidate.entityType?.trim().slice(0, 80),
      sanityId: candidate.sanityId?.trim().slice(0, 200),
      confidence: typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence) ? Math.min(1, Math.max(0, candidate.confidence)) : undefined,
      reasons: candidate.reasons?.slice(0, 12).map((reason) => reason.trim().slice(0, 300)).filter(Boolean),
      sanityRevision: candidate.sanityRevision?.trim().slice(0, 200),
      snapshotRevision: candidate.snapshotRevision?.trim().slice(0, 200),
    }];
  });
}

function comparableCase(value: {
  title: string;
  priority: string;
  source?: string;
  subject: unknown;
  issues: unknown;
  resolutions: unknown;
  context: unknown;
}): unknown {
  return {
    title: value.title,
    priority: value.priority,
    source: value.source,
    subject: value.subject,
    issues: value.issues,
    resolutions: value.resolutions,
    context: value.context,
  };
}

export function createOrUpdateReviewCaseFromIntake(
  input: ReviewIntakeRequest,
): ReviewIntakeResult {
  if (!input.actionable) return {status: "ignored", reasonCode: "human_action_not_required"};
  const summary = input.summary.trim().slice(0, 1_000);
  if (!summary) return {status: "ignored", reasonCode: "summary_required"};
  const identity = createReviewIntakeIdentity(input);
  if (!identity) return {status: "ignored", reasonCode: "origin_identity_required"};

  const originId = logicalOriginId(input);
  const taxonomy = REVIEW_INTAKE_TAXONOMY[input.issueType];
  const issueId = `review-intake-issue:${identity.fingerprint.slice(-20)}`;
  const evidence = safeEvidence(input.evidenceRefs);
  const candidates = safeCandidates(input.candidates);
  const issue: ReviewIssue = {
    id: issueId,
    kind: taxonomy.issueKind,
    valueKind: valueKindFor(input.entityType),
    fieldPath: input.entityType,
    label: taxonomy.label,
    message: summary,
    required: true,
    blocking: true,
    candidates: candidates.length ? candidates : undefined,
    evidence: evidence.ids.length ? evidence.ids : undefined,
    expected: {
      entityType: input.entityType,
      humanIssueType: input.issueType,
      originId,
      ag2Category: taxonomy.ag2Category,
    },
  };
  const sourceLabel = SOURCE_LABELS[input.source];
  const entityLabel = ENTITY_LABELS[input.entityType];
  const problemTitle = input.title?.trim().slice(0, 300) || taxonomy.label;
  const title = `${sourceLabel} · ${entityLabel}: ${problemTitle}`;
  const now = input.now?.() ?? new Date().toISOString();
  const existing = getReviewCases().find((reviewCase) =>
    reviewCase.dedupeKey === identity.identityKey &&
    !["resumed", "dismissed"].includes(reviewCase.status),
  );
  const createdAt = typeof existing?.context.unifiedReviewIntake === "object" &&
    existing.context.unifiedReviewIntake !== null &&
    !Array.isArray(existing.context.unifiedReviewIntake) &&
    typeof existing.context.unifiedReviewIntake.createdAt === "string"
      ? existing.context.unifiedReviewIntake.createdAt
      : now;
  const unifiedReviewIntake: ReviewJsonObject = {
    schemaVersion: 1,
    identityKey: identity.identityKey,
    fingerprint: identity.fingerprint,
    source: input.source,
    entityType: input.entityType,
    issueType: input.issueType,
    actionRequired: "human_review",
    sourceLabel,
    entityLabel,
    problemTitle,
    problemSummary: summary,
    originId,
    createdAt,
    evidenceRefs: evidence.refs,
    origin: sanitizeReviewIntakeObject(input.originContext),
    resume: sanitizeReviewIntakeObject(input.resumeContext),
  };
  const context: ReviewJsonObject = {
    ...(existing?.context ?? {}),
    producer: typeof input.resumeContext?.producer === "string" && input.resumeContext.producer.trim()
      ? input.resumeContext.producer.trim().slice(0, 120)
      : `${input.source}_${input.entityType}`,
    unifiedReviewIntake,
  };
  const subject = {
    type: input.entityType,
    id: input.entityId?.trim() || originId,
    label: input.subjectLabel?.trim().slice(0, 300) || undefined,
  };
  const priority = input.priority ?? taxonomy.defaultPriority;
  if (!existing) {
    const created = createReviewCase({
      dedupeKey: identity.identityKey,
      module: moduleFor(input.source, input.entityType),
      title,
      priority,
      source: sourceLabel,
      subject,
      issues: [issue],
      context,
    });
    return {...identity, status: "created", caseId: created.id};
  }

  if (existing.status === "resuming") {
    return {...identity, status: "unchanged", caseId: existing.id, reasonCode: "case_executing"};
  }

  const prospective = {...existing, issues: [issue]};
  const resolutions = existing.resolutions.filter((resolution) =>
    validateReviewResolution(prospective, resolution).valid,
  );
  const next = {title, priority, source: sourceLabel, subject, issues: [issue], resolutions, context};
  if (JSON.stringify(comparableCase(next)) === JSON.stringify(comparableCase(existing))) {
    if (existing.status === "resolved") {
      transitionReviewCase(existing.id, "open");
      return {...identity, status: "updated", caseId: existing.id, reasonCode: "resolved_issue_reopened"};
    }
    return {...identity, status: "unchanged", caseId: existing.id};
  }
  updateReviewCase(existing.id, next);
  if (existing.status === "resolved") transitionReviewCase(existing.id, "open");
  return {...identity, status: "updated", caseId: existing.id};
}
