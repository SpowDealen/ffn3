import type {ReviewJsonObject, ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {evaluateKnowledgeValidity} from "./model";
import {governKnowledge} from "./governance";
import type {KnowledgeConflict, KnowledgeFingerprint, KnowledgeItem, KnowledgeValidityState} from "./types";
import {
  KNOWLEDGE_CENTER_VERSION,
  type KnowledgeCenterLifecycleAction,
  type KnowledgeCenterSnapshot,
  type KnowledgeCenterViewModel,
  type KnowledgeConflictSummary,
  type KnowledgeFeedbackSummary,
  type KnowledgeRecommendationSummary,
  type KnowledgeSafeSummary,
  type KnowledgeValiditySummary,
} from "./centerTypes";

const states: readonly KnowledgeValidityState[] = ["current", "temporal", "expired", "invalidated", "superseded", "contradictory", "under_review"];
const supportedDomains = new Set(["news", "event", "fighter", "organization", "weight_category", "fight", "result", "relationship"]);
const fp = (value: unknown): KnowledgeFingerprint => computeUniversalFingerprint(value as ReviewJsonValue);
const unique = <T extends string>(values: readonly T[]): readonly T[] => Object.freeze([...new Set(values)].sort());
const short = (value: string): string => value.length <= 18 ? value : `${value.slice(0, 10)}…${value.slice(-6)}`;
const iso = (value: string, code: string): string => {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(code);
  return new Date(value).toISOString();
};

export function createKnowledgeCenterSnapshot(input: Omit<KnowledgeCenterSnapshot, "schemaVersion" | "snapshotFingerprint" | "advisoryOnly" | "requiresCurrentEvidence" | "replacesCurrentEvidence" | "createsPolicy" | "elevatesAuthority" | "writes">): KnowledgeCenterSnapshot {
  const semantic = {
    schemaVersion: KNOWLEDGE_CENTER_VERSION,
    caseId: input.caseId,
    caseVersion: input.caseVersion,
    governanceFingerprint: input.governance.governanceFingerprint,
    recurrenceFingerprints: input.recurrence.map((entry) => entry.recurrenceFingerprint).sort(),
    retrievalFingerprint: input.retrieval?.retrievalFingerprint,
    feedbackFingerprints: input.feedback.map((entry) => entry.feedbackFingerprint).sort(),
  };
  return Object.freeze({...input, schemaVersion: KNOWLEDGE_CENTER_VERSION, createdAt: iso(input.createdAt, "knowledge_center_created_at_invalid"), updatedAt: iso(input.updatedAt, "knowledge_center_updated_at_invalid"), snapshotFingerprint: fp(semantic), advisoryOnly: true, requiresCurrentEvidence: true, replacesCurrentEvidence: false, createsPolicy: false, elevatesAuthority: false, writes: false});
}

/** Fails closed for unrecognised context; no raw context is ever surfaced by B6. */
export function readKnowledgeCenterSnapshot(context: ReviewJsonObject): KnowledgeCenterSnapshot | undefined {
  const value = context.au9Knowledge;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<KnowledgeCenterSnapshot>;
  if (candidate.schemaVersion !== KNOWLEDGE_CENTER_VERSION || !candidate.caseId || typeof candidate.caseVersion !== "number" || !candidate.governance || !Array.isArray(candidate.recurrence) || !Array.isArray(candidate.feedback) || candidate.advisoryOnly !== true || candidate.requiresCurrentEvidence !== true || candidate.replacesCurrentEvidence !== false || candidate.createsPolicy !== false || candidate.elevatesAuthority !== false || candidate.writes !== false || !candidate.snapshotFingerprint) return undefined;
  return candidate as KnowledgeCenterSnapshot;
}

export function buildKnowledgeSummary(item: KnowledgeItem): KnowledgeSafeSummary {
  return Object.freeze({knowledgeId: item.id, revision: item.revision, domain: item.domain, kind: item.kind, safeSummary: item.safeSummary, lifecycle: item.validity.state, fingerprint: short(item.knowledgeFingerprint), provenanceFingerprint: short(item.provenance.provenanceFingerprint), advisoryOnly: true, requiresCurrentEvidence: true});
}

export function buildKnowledgeValiditySummary(item: KnowledgeItem, evaluatedAt: string): KnowledgeValiditySummary {
  const evaluated = evaluateKnowledgeValidity(item, iso(evaluatedAt, "knowledge_center_evaluated_at_invalid"));
  const state = item.validity.state;
  const effectiveState = state === "current" || state === "temporal" ? evaluated.state : state;
  const reasonCodes = unique([
    ...(item.validity.invalidationReasonCode ? [item.validity.invalidationReasonCode] : []),
    ...(state === "contradictory" ? ["knowledge_conflict"] : []),
    ...(state === "under_review" ? ["review_required"] : []),
    ...(effectiveState === "expired" ? ["validity_window_expired"] : []),
  ]);
  return Object.freeze({knowledgeId: item.id, state, effectiveState, reasonCodes, validFrom: item.validity.validFrom, validUntil: item.validity.validUntil, evaluatedAt: evaluated.evaluatedAt, stale: state !== effectiveState, requiresReview: effectiveState === "contradictory" || effectiveState === "under_review"});
}

export function buildKnowledgeRecommendationSummary(recommendation: NonNullable<KnowledgeCenterSnapshot["retrieval"]>["recommendations"][number], candidate?: NonNullable<KnowledgeCenterSnapshot["retrieval"]>["candidates"][number]): KnowledgeRecommendationSummary {
  return Object.freeze({recommendationId: recommendation.recommendationId, action: recommendation.action, safeExplanation: recommendation.safeExplanation, rank: candidate?.rank ?? 0, relevance: candidate?.components.relevance ?? 0, sourceIndependence: candidate?.components.sourceIndependence ?? 0, recurrence: candidate?.components.recurrence ?? 0, validity: candidate?.components.validity ?? 0, contextualProximity: candidate?.components.contextualProximity ?? 0, reasonCodes: recommendation.reasonCodes, matchedDimensions: recommendation.context.matchedDimensions, limitations: recommendation.limitations, fingerprint: short(recommendation.recommendationFingerprint), advisoryOnly: true, requiresCurrentEvidence: true});
}

export function buildKnowledgeConflictSummary(conflict: KnowledgeConflict): KnowledgeConflictSummary {
  return Object.freeze({conflictId: conflict.conflictId, severity: conflict.severity, knowledgeItemIds: [...conflict.knowledgeItemIds].sort(), reasonCodes: unique(conflict.reasonCodes), fingerprint: short(conflict.conflictFingerprint), requiresCurrentEvidence: true});
}

export function buildKnowledgeFeedbackSummary(record: KnowledgeCenterSnapshot["feedback"][number]): KnowledgeFeedbackSummary {
  return Object.freeze({feedbackId: record.feedbackId, status: record.status, classification: record.classification, reasonCodes: unique(record.reasonCodes), learningEligible: record.learningEligible, outcomeAuthorityConfirmed: record.outcomeAuthorityConfirmed, fingerprint: short(record.feedbackFingerprint), advisoryOnly: true, requiresCurrentEvidence: true});
}

export function applyKnowledgeCenterLifecycleAction(snapshot: KnowledgeCenterSnapshot, action: KnowledgeCenterLifecycleAction): KnowledgeCenterSnapshot {
  const occurredAt = iso(action.occurredAt, "knowledge_center_action_at_invalid");
  const target = snapshot.governance.activeItems.find((item) => item.id === action.knowledgeId);
  if (!target || !["current", "temporal"].includes(target.validity.state)) throw new Error("knowledge_center_action_target_not_actionable");
  if (!action.reasonCode.trim()) throw new Error("knowledge_center_action_reason_required");
  const evidenceFingerprints = unique([...target.observations.flatMap((entry) => entry.evidenceFingerprints), target.knowledgeFingerprint]);
  const base = {items: snapshot.governance.items, evaluatedAt: occurredAt};
  const governance = action.kind === "mark_review"
    ? governKnowledge({...base, reviews: [{knowledgeId: target.id, reasonCodes: [action.reasonCode], occurredAt, provenanceFingerprint: target.provenance.provenanceFingerprint}]})
    : action.kind === "invalidate"
      ? governKnowledge({...base, invalidations: [{knowledgeId: target.id, reasonCode: action.reasonCode, occurredAt, evidenceFingerprints, provenanceFingerprint: target.provenance.provenanceFingerprint}]})
      : (() => {
        const replacement = snapshot.governance.activeItems.find((item) => item.id === action.supersededByKnowledgeId);
        if (!replacement || replacement.id === target.id || replacement.domain !== target.domain || replacement.subjectKey !== target.subjectKey) throw new Error("knowledge_center_supersession_replacement_invalid");
        return governKnowledge({...base, supersessions: [{knowledgeId: target.id, supersededById: replacement.id, reasonCode: action.reasonCode, occurredAt, evidenceFingerprints, provenanceFingerprint: target.provenance.provenanceFingerprint}]});
      })();
  return createKnowledgeCenterSnapshot({...snapshot, governance, retrieval: undefined, updatedAt: occurredAt});
}

export function buildKnowledgeCenterViewModel(snapshot: KnowledgeCenterSnapshot | undefined, evaluatedAt: string, unsupportedSubjects: readonly string[] = []): KnowledgeCenterViewModel {
  const unsupported = unique(["image: unsupported; AU9 has no governed knowledge contract for images.", ...unsupportedSubjects.filter((value) => !supportedDomains.has(value)).map((value) => `${value}: unsupported by the universal editorial knowledge contract.`)]);
  const emptyCounts = Object.freeze(Object.fromEntries(states.map((state) => [state, 0])) as Record<KnowledgeValidityState, number>);
  if (!snapshot) return Object.freeze({availability: "absent", entries: [], recommendations: [], feedback: [], conflicts: [], lifecycleCounts: emptyCounts, unsupported, reasonCodes: ["knowledge_snapshot_unavailable"], safeToAct: false, advisoryNotice: "No hay snapshot AU9 recuperable. El Centro no crea conocimiento ni ejecuta acciones."});
  const conflictMap = new Map(snapshot.governance.conflicts.map((conflict) => [conflict.conflictFingerprint, buildKnowledgeConflictSummary(conflict)]));
  const predecessorIds = new Map<string, string[]>();
  const successorIds = new Map<string, string[]>();
  for (const item of snapshot.governance.items) for (const ref of item.references) if (ref.kind === "knowledge" && ref.relation === "derived_from") {
    predecessorIds.set(item.id, [...(predecessorIds.get(item.id) ?? []), ref.id]);
    successorIds.set(ref.id, [...(successorIds.get(ref.id) ?? []), item.id]);
  }
  const recurrences = new Map(snapshot.recurrence.map((entry) => [entry.knowledgeId, entry]));
  const entries = snapshot.governance.items.map((item) => {
    const validity = buildKnowledgeValiditySummary(item, evaluatedAt);
    const conflicts = item.conflicts.map((conflict) => conflictMap.get(conflict.conflictFingerprint) ?? buildKnowledgeConflictSummary(conflict)).sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
    return Object.freeze({item, summary: buildKnowledgeSummary(item), validity, recurrence: recurrences.get(item.id), predecessorIds: unique(predecessorIds.get(item.id) ?? []), successorIds: unique(successorIds.get(item.id) ?? []), conflicts, actionable: ["current", "temporal"].includes(validity.effectiveState)});
  }).sort((a, b) => a.item.createdAt.localeCompare(b.item.createdAt) || a.item.revision - b.item.revision || a.item.id.localeCompare(b.item.id));
  const lifecycleCounts = Object.freeze(Object.fromEntries(states.map((state) => [state, entries.filter((entry) => entry.validity.effectiveState === state).length])) as Record<KnowledgeValidityState, number>);
  const candidates = new Map((snapshot.retrieval?.candidates ?? []).map((candidate) => [candidate.knowledgeId, candidate]));
  const recommendations = Object.freeze((snapshot.retrieval?.recommendations ?? []).map((recommendation) => buildKnowledgeRecommendationSummary(recommendation, candidates.get(recommendation.knowledgeId))).sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)));
  const conflicts = Object.freeze([...conflictMap.values()].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)));
  const feedback = Object.freeze(snapshot.feedback.map(buildKnowledgeFeedbackSummary).sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)));
  const stale = entries.some((entry) => entry.validity.stale);
  return Object.freeze({availability: stale ? "stale" : "ready", snapshot, entries: Object.freeze(entries), recommendations, feedback, conflicts, lifecycleCounts, unsupported, reasonCodes: stale ? ["knowledge_snapshot_requires_governance_refresh"] : [], safeToAct: !stale, advisoryNotice: "La recomendación histórica nunca sustituye la evidencia actual ni autoriza una decisión o ejecución."});
}

/** Existing AU3 case context remains the sole persisted review-case boundary. */
export function withKnowledgeCenterSnapshot(context: ReviewJsonObject, snapshot: KnowledgeCenterSnapshot): ReviewJsonObject {
  return Object.freeze({...context, au9Knowledge: snapshot as unknown as ReviewJsonValue});
}
