import type {ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {createKnowledgeItem, evaluateKnowledgeValidity} from "./model";
import type {
  GovernKnowledgeInput,
  KnowledgeConflictCandidate,
  KnowledgeGovernanceResult,
  KnowledgeLifecycleTransition,
  KnowledgeLifecycleTransitionKind,
  KnowledgeValidityAssessment,
} from "./governanceTypes";
import {KNOWLEDGE_GOVERNANCE_VERSION} from "./governanceTypes";
import type {KnowledgeConflict, KnowledgeFingerprint, KnowledgeItem, KnowledgeReference, KnowledgeValidityState} from "./types";

const fp = (value: unknown): KnowledgeFingerprint => computeUniversalFingerprint(value as ReviewJsonValue);
const unique = <T extends string>(values: readonly T[]): readonly T[] => Object.freeze([...new Set(values)].sort());
const atIso = (value: string, code: string): string => {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(code);
  return new Date(value).toISOString();
};
const safeCode = (value: string, code: string, max = 180): string => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > max) throw new Error(code);
  return normalized;
};

function activeKnowledge(items: readonly KnowledgeItem[]): readonly KnowledgeItem[] {
  const normalized = new Map<string, KnowledgeItem>();
  for (const item of items) normalized.set(item.id, item);
  const predecessors = new Set<string>();
  for (const item of normalized.values()) {
    for (const reference of item.references) {
      if (reference.kind === "knowledge" && reference.relation === "derived_from") predecessors.add(reference.id);
    }
  }
  return Object.freeze([...normalized.values()].filter((item) => !predecessors.has(item.id)).sort((a, b) => a.knowledgeFingerprint.localeCompare(b.knowledgeFingerprint)));
}

function incompatible(left: KnowledgeItem, right: KnowledgeItem): boolean {
  for (const a of left.observations) {
    for (const b of right.observations) {
      if ((a.polarity === "supports" && b.polarity === "contradicts") || (a.polarity === "contradicts" && b.polarity === "supports")) return true;
      if (a.valueFingerprint && b.valueFingerprint && a.valueFingerprint !== b.valueFingerprint) return true;
    }
  }
  return false;
}

function overlap(left: KnowledgeItem, right: KnowledgeItem): boolean {
  if (!left.validity.validUntil || !right.validity.validUntil) return false;
  return Date.parse(left.validity.validFrom) <= Date.parse(right.validity.validUntil)
    && Date.parse(right.validity.validFrom) <= Date.parse(left.validity.validUntil);
}

function independent(left: KnowledgeItem, right: KnowledgeItem): boolean {
  const groups = new Set(left.sources.map((source) => source.independenceGroup));
  return right.sources.every((source) => !groups.has(source.independenceGroup));
}

function conflictReasons(left: KnowledgeItem, right: KnowledgeItem): readonly string[] {
  if (!incompatible(left, right)) return Object.freeze([]);
  const reasons: string[] = [];
  if (left.kind === "confirmed_fact" && right.kind === "confirmed_fact") reasons.push("fact_vs_fact");
  if ([left.kind, right.kind].includes("observed_pattern") && [left.kind, right.kind].includes("confirmed_fact")) reasons.push("pattern_vs_fact");
  if ([left.kind, right.kind].includes("historical_experience") && [left.kind, right.kind].includes("negative_evidence")) reasons.push("experience_vs_negative_evidence");
  if (overlap(left, right)) reasons.push("incompatible_temporal_windows");
  if (independent(left, right)) reasons.push("independent_sources_incompatible");
  if (left.observations.some((entry) => entry.polarity === "supports") !== right.observations.some((entry) => entry.polarity === "supports")) reasons.push("observation_polarity_conflict");
  return unique(reasons);
}

/** Detects candidates only. It never ranks evidence or selects a winner. */
export function detectGovernedKnowledgeConflicts(items: readonly KnowledgeItem[]): readonly KnowledgeConflict[] {
  const eligible = activeKnowledge(items).filter((item) => !["expired", "invalidated", "superseded"].includes(item.validity.state));
  const groups = new Map<string, KnowledgeItem[]>();
  for (const item of eligible) {
    const key = `${item.domain}:${item.subjectKey}:${item.claimCode}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const conflicts = new Map<string, KnowledgeConflict>();
  for (const group of groups.values()) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex];
        const right = group[rightIndex];
        const shared = left.conflicts.find((candidate) => right.conflicts.some((entry) => entry.conflictFingerprint === candidate.conflictFingerprint));
        if (shared) {
          conflicts.set(shared.conflictFingerprint, shared);
          continue;
        }
        const reasonCodes = conflictReasons(left, right);
        if (!reasonCodes.length) continue;
        const knowledgeItemIds = unique([left.id, right.id]);
        const observationFingerprints = unique([...left.observations, ...right.observations].map((entry) => entry.observationFingerprint));
        const body = {
          subjectKey: left.subjectKey,
          claimCode: left.claimCode,
          knowledgeItemIds,
          observationFingerprints,
          severity: [left, right].some((entry) => entry.authority === "authoritative") ? "critical" as const : "blocking" as const,
          reasonCodes,
          requiresCurrentEvidence: true as const,
        };
        const conflictFingerprint = fp(body);
        conflicts.set(conflictFingerprint, Object.freeze({...body, conflictId: `knowledge-conflict:${conflictFingerprint.slice(-24)}`, conflictFingerprint}));
      }
    }
  }
  return Object.freeze([...conflicts.values()].sort((a, b) => a.conflictFingerprint.localeCompare(b.conflictFingerprint)));
}

function previousReference(item: KnowledgeItem): KnowledgeReference {
  return Object.freeze({kind: "knowledge", id: item.id, relation: "derived_from", fingerprint: item.knowledgeFingerprint});
}

function revise(
  item: KnowledgeItem,
  state: KnowledgeValidityState,
  evaluatedAt: string,
  options: Readonly<{kind?: KnowledgeItem["kind"]; conflicts?: readonly KnowledgeConflict[]; invalidationReasonCode?: string; supersededBy?: string}>,
): KnowledgeItem {
  return createKnowledgeItem({
    ...item,
    kind: options.kind ?? item.kind,
    revision: item.revision + 1,
    references: [...item.references, previousReference(item), ...(options.supersededBy ? [{kind: "knowledge" as const, id: options.supersededBy, relation: "supersedes" as const}] : [])],
    conflicts: options.conflicts ?? item.conflicts,
    validity: {
      ...item.validity,
      state,
      evaluatedAt,
      invalidatedAt: state === "invalidated" ? evaluatedAt : item.validity.invalidatedAt,
      invalidationReasonCode: options.invalidationReasonCode ?? item.validity.invalidationReasonCode,
      supersededAt: state === "superseded" ? evaluatedAt : item.validity.supersededAt,
      supersededBy: options.supersededBy ?? item.validity.supersededBy,
    },
    createdAt: item.createdAt,
    updatedAt: evaluatedAt,
  }, () => evaluatedAt);
}

function transition(kind: KnowledgeLifecycleTransitionKind, from: KnowledgeItem, to: KnowledgeItem, reasons: readonly string[], evidenceFingerprints: readonly KnowledgeFingerprint[], occurredAt: string, provenanceFingerprint: KnowledgeFingerprint): KnowledgeLifecycleTransition {
  const semantic = {kind, fromKnowledgeId: from.id, fromRevision: from.revision, fromFingerprint: from.knowledgeFingerprint, toKnowledgeId: to.id, toRevision: to.revision, toFingerprint: to.knowledgeFingerprint, reasonCodes: unique(reasons), evidenceFingerprints: unique(evidenceFingerprints), provenanceFingerprint};
  const transitionFingerprint = fp(semantic);
  return Object.freeze({...semantic, transitionId: `knowledge-transition:${transitionFingerprint.slice(-24)}`, occurredAt, transitionFingerprint});
}

function candidate(conflict: KnowledgeConflict): KnowledgeConflictCandidate {
  const semantic = {conflictFingerprint: conflict.conflictFingerprint, knowledgeItemIds: unique(conflict.knowledgeItemIds), reasonCodes: unique(conflict.reasonCodes), status: "under_review" as const, winnerSelected: false as const, advisoryOnly: true as const, replacesCurrentEvidence: false as const};
  const candidateFingerprint = fp(semantic);
  return Object.freeze({...semantic, conflict, candidateId: `knowledge-conflict-candidate:${candidateFingerprint.slice(-24)}`, candidateFingerprint});
}

function assessment(item: KnowledgeItem, previousState: KnowledgeValidityState, reasonCodes: readonly string[], evaluatedAt: string): KnowledgeValidityAssessment {
  const requiresReview = item.validity.state === "contradictory" || item.validity.state === "under_review";
  const semantic = {knowledgeId: item.id, revision: item.revision, knowledgeFingerprint: item.knowledgeFingerprint, previousState, effectiveState: item.validity.state, reasonCodes: unique(reasonCodes), requiresReview, advisoryOnly: true as const, replacesCurrentEvidence: false as const};
  const assessmentFingerprint = fp(semantic);
  return Object.freeze({...semantic, assessmentId: `knowledge-validity-assessment:${assessmentFingerprint.slice(-24)}`, evaluatedAt, assessmentFingerprint});
}

/**
 * Applies pure lifecycle governance to already supplied public KnowledgeItems.
 * The returned history includes every input revision and any newly linked revision.
 */
export function governKnowledge(input: GovernKnowledgeInput): KnowledgeGovernanceResult {
  const evaluatedAt = atIso(input.evaluatedAt, "knowledge_governance_evaluated_at_invalid");
  const originals = [...new Map(input.items.map((item) => [item.id, item])).values()];
  const initiallyActive = activeKnowledge(originals);
  const invalidations = new Map((input.invalidations ?? []).map((entry) => [entry.knowledgeId, entry]));
  const supersessions = new Map((input.supersessions ?? []).map((entry) => [entry.knowledgeId, entry]));
  const reviews = new Map((input.reviews ?? []).map((entry) => [entry.knowledgeId, entry]));
  const conflicts = detectGovernedKnowledgeConflicts(initiallyActive.filter((item) => !invalidations.has(item.id) && !supersessions.has(item.id)));
  const conflictsByItem = new Map<string, KnowledgeConflict[]>();
  for (const conflict of conflicts) for (const id of conflict.knowledgeItemIds) conflictsByItem.set(id, [...(conflictsByItem.get(id) ?? []), conflict]);
  const revisions: KnowledgeItem[] = [];
  const transitions: KnowledgeLifecycleTransition[] = [];
  const priorStates = new Map<string, KnowledgeValidityState>();
  const reasonsById = new Map<string, readonly string[]>();

  for (const item of initiallyActive) {
    const invalidation = invalidations.get(item.id);
    const supersession = supersessions.get(item.id);
    const itemConflicts = conflictsByItem.get(item.id) ?? [];
    const review = reviews.get(item.id);
    let revised: KnowledgeItem | undefined;
    let kind: KnowledgeLifecycleTransitionKind | undefined;
    let reasons: readonly string[] = [];
    let evidenceFingerprints: readonly KnowledgeFingerprint[] = unique(item.observations.flatMap((entry) => entry.evidenceFingerprints));
    let provenanceFingerprint = item.provenance.provenanceFingerprint;

    if (invalidation && item.validity.state !== "invalidated") {
      const occurredAt = atIso(invalidation.occurredAt, "knowledge_invalidation_occurred_at_invalid");
      const reasonCode = safeCode(invalidation.reasonCode, "knowledge_invalidation_reason_invalid", 120);
      revised = revise(item, "invalidated", occurredAt, {kind: "invalidated_knowledge", invalidationReasonCode: reasonCode});
      kind = "invalidate";
      reasons = unique(["explicit_invalidation", reasonCode]);
      evidenceFingerprints = unique(invalidation.evidenceFingerprints);
      provenanceFingerprint = invalidation.provenanceFingerprint;
    } else if (supersession && item.validity.state !== "superseded") {
      const occurredAt = atIso(supersession.occurredAt, "knowledge_supersession_occurred_at_invalid");
      const supersededById = safeCode(supersession.supersededById, "knowledge_superseded_by_invalid");
      const reasonCode = safeCode(supersession.reasonCode, "knowledge_supersession_reason_invalid", 120);
      revised = revise(item, "superseded", occurredAt, {supersededBy: supersededById});
      kind = "supersede";
      reasons = unique(["explicit_supersession", reasonCode]);
      evidenceFingerprints = unique(supersession.evidenceFingerprints);
      provenanceFingerprint = supersession.provenanceFingerprint;
    } else if (itemConflicts.length && item.validity.state !== "contradictory") {
      revised = revise(item, "contradictory", evaluatedAt, {conflicts: unique(itemConflicts.map((entry) => entry.conflictFingerprint)).map((fingerprint) => itemConflicts.find((entry) => entry.conflictFingerprint === fingerprint)!) });
      kind = "mark_contradictory";
      reasons = unique(itemConflicts.flatMap((entry) => entry.reasonCodes));
    } else if (review && item.validity.state !== "under_review" && item.validity.state !== "contradictory") {
      const occurredAt = atIso(review.occurredAt, "knowledge_review_occurred_at_invalid");
      revised = revise(item, "under_review", occurredAt, {});
      kind = "request_review";
      reasons = unique(["review_requested", ...review.reasonCodes]);
      provenanceFingerprint = review.provenanceFingerprint;
    } else {
      const evaluated = evaluateKnowledgeValidity(item, evaluatedAt);
      if (evaluated.state === "expired" && item.validity.state !== "expired") {
        revised = revise(item, "expired", evaluatedAt, {});
        kind = "expire";
        reasons = Object.freeze(["validity_window_expired"]);
      }
    }

    if (revised && kind) {
      revisions.push(revised);
      transitions.push(transition(kind, item, revised, reasons.map((reason) => safeCode(reason, "knowledge_transition_reason_invalid", 120)), evidenceFingerprints, revised.validity.evaluatedAt, provenanceFingerprint));
      priorStates.set(revised.id, item.validity.state);
      reasonsById.set(revised.id, reasons);
    }
  }

  const items = Object.freeze([...originals, ...revisions].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.revision - b.revision || a.id.localeCompare(b.id)));
  const activeItems = activeKnowledge(items);
  const assessments = Object.freeze(activeItems.map((item) => assessment(item, priorStates.get(item.id) ?? item.validity.state, reasonsById.get(item.id) ?? [], evaluatedAt)).sort((a, b) => a.assessmentFingerprint.localeCompare(b.assessmentFingerprint)));
  const conflictCandidates = Object.freeze(conflicts.map(candidate).sort((a, b) => a.candidateFingerprint.localeCompare(b.candidateFingerprint)));
  const orderedTransitions = Object.freeze(transitions.sort((a, b) => a.transitionFingerprint.localeCompare(b.transitionFingerprint)));
  const semantic = {
    schemaVersion: KNOWLEDGE_GOVERNANCE_VERSION,
    itemFingerprints: items.map((item) => item.knowledgeFingerprint).sort(),
    activeFingerprints: activeItems.map((item) => item.knowledgeFingerprint).sort(),
    assessmentFingerprints: assessments.map((entry) => entry.assessmentFingerprint),
    conflictFingerprints: conflicts.map((entry) => entry.conflictFingerprint),
    candidateFingerprints: conflictCandidates.map((entry) => entry.candidateFingerprint),
    transitionFingerprints: orderedTransitions.map((entry) => entry.transitionFingerprint),
  };
  const governanceFingerprint = fp(semantic);
  return Object.freeze({
    schemaVersion: KNOWLEDGE_GOVERNANCE_VERSION,
    items,
    activeItems,
    assessments,
    conflicts,
    conflictCandidates,
    transitions: orderedTransitions,
    governanceFingerprint,
    advisoryOnly: true,
    replacesCurrentEvidence: false,
    retrievesKnowledge: false,
    modifiesDecisions: false,
    resolvesConflicts: false,
    writes: false,
  });
}
