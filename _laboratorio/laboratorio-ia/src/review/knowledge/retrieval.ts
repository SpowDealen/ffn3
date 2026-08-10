import type {ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import type {KnowledgeRecurrence} from "./extractionTypes";
import {evaluateKnowledgeValidity} from "./model";
import type {
  GovernedKnowledgeCandidate,
  GovernedKnowledgeExclusionReason,
  GovernedKnowledgeQuery,
  GovernedKnowledgeRecommendation,
  GovernedKnowledgeRecommendationAction,
  GovernedKnowledgeRetrievalResult,
  GovernedRankComponents,
  GovernedRetrievalDimension,
  GovernedRetrievalInput,
} from "./retrievalTypes";
import {GOVERNED_KNOWLEDGE_RETRIEVAL_VERSION} from "./retrievalTypes";
import type {KnowledgeFingerprint, KnowledgeItem} from "./types";

const fp = (value: unknown): KnowledgeFingerprint => computeUniversalFingerprint(value as ReviewJsonValue);
const unique = <T extends string>(values: readonly T[]): readonly T[] => Object.freeze([...new Set(values)].sort());
const safe = (value: string, code: string, max = 180): string => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > max) throw new Error(code);
  return normalized;
};
const iso = (value: string, code: string): string => {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(code);
  return new Date(value).toISOString();
};

type NormalizedQuery = Required<Omit<GovernedKnowledgeQuery, "limit">> & Readonly<{limit: number}>;
type Match = Readonly<{dimensions: readonly GovernedRetrievalDimension[]; contextCodes: readonly string[]}>;

function normalizeQuery(query: GovernedKnowledgeQuery): NormalizedQuery {
  const limit = query.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("knowledge_retrieval_limit_invalid");
  const list = (values: readonly string[] | undefined, code: string) => unique((values ?? []).map((value) => safe(value, code)));
  return Object.freeze({
    caseId: safe(query.caseId, "knowledge_retrieval_case_invalid"),
    evaluatedAt: iso(query.evaluatedAt, "knowledge_retrieval_evaluated_at_invalid"),
    entityKeys: list(query.entityKeys, "knowledge_retrieval_entity_invalid"),
    entityTypes: unique(query.entityTypes ?? []),
    capabilityIds: list(query.capabilityIds, "knowledge_retrieval_capability_invalid"),
    producerIds: list(query.producerIds, "knowledge_retrieval_producer_invalid"),
    editorialContextCodes: list(query.editorialContextCodes, "knowledge_retrieval_context_invalid"),
    issueCodes: list(query.issueCodes, "knowledge_retrieval_issue_invalid"),
    relationshipKeys: list(query.relationshipKeys, "knowledge_retrieval_relationship_invalid"),
    currentEvidenceFingerprints: unique(query.currentEvidenceFingerprints),
    limit,
  });
}

const intersects = (left: readonly string[], right: readonly string[]): readonly string[] => unique(left.filter((value) => right.includes(value)));

function matches(item: KnowledgeItem, query: NormalizedQuery): Match {
  const dimensions: GovernedRetrievalDimension[] = [];
  const contextCodes: string[] = [];
  const references = (kind: KnowledgeItem["references"][number]["kind"]) => item.references.filter((reference) => reference.kind === kind).map((reference) => reference.id);
  const entityMatches = intersects(query.entityKeys, unique([item.subjectKey, ...references("entity")]));
  if (entityMatches.length) { dimensions.push("entity"); contextCodes.push(...entityMatches); }
  if (query.entityTypes.includes(item.domain)) { dimensions.push("entity_type"); contextCodes.push(item.domain); }
  const capabilityMatches = intersects(query.capabilityIds, references("capability_manifest"));
  if (capabilityMatches.length) { dimensions.push("capability"); contextCodes.push(...capabilityMatches); }
  const producerMatches = intersects(query.producerIds, unique([item.provenance.producerId, ...references("producer_manifest")]));
  if (producerMatches.length) { dimensions.push("producer"); contextCodes.push(...producerMatches); }
  const editorialMatches = intersects(query.editorialContextCodes, references("editorial_context"));
  if (editorialMatches.length) { dimensions.push("editorial_context"); contextCodes.push(...editorialMatches); }
  const issueMatches = intersects(query.issueCodes, unique([item.claimCode, ...references("issue")]));
  if (issueMatches.length) { dimensions.push("issue"); contextCodes.push(...issueMatches); }
  const relationshipMatches = intersects(query.relationshipKeys, references("relationship"));
  if (relationshipMatches.length) { dimensions.push("relationship"); contextCodes.push(...relationshipMatches); }
  if (item.provenance.caseId === query.caseId || references("case").includes(query.caseId)) { dimensions.push("case"); contextCodes.push(query.caseId); }
  return Object.freeze({dimensions: unique(dimensions), contextCodes: unique(contextCodes)});
}

function recurrenceFor(item: KnowledgeItem, recurrence: readonly KnowledgeRecurrence[]): KnowledgeRecurrence | undefined {
  const lineageIds = new Set([item.id, ...item.references.filter((reference) => reference.kind === "knowledge" && reference.relation === "derived_from").map((reference) => reference.id)]);
  return recurrence.filter((entry) => lineageIds.has(entry.knowledgeId)).sort((a, b) => b.observationCount - a.observationCount || b.independentSourceCount - a.independentSourceCount || a.recurrenceFingerprint.localeCompare(b.recurrenceFingerprint))[0];
}

function components(item: KnowledgeItem, match: Match, recurrence: KnowledgeRecurrence | undefined): GovernedRankComponents {
  const exactEntity = match.dimensions.includes("entity") ? 5 : 0;
  const relevance = Math.min(40, match.dimensions.length * 5 + exactEntity);
  const independentSources = recurrence?.independentSourceCount ?? new Set(item.sources.map((source) => source.independenceGroup)).size;
  const sourceIndependence = Math.min(20, independentSources * 5);
  const recurrenceScore = Math.min(15, (recurrence?.observationCount ?? item.observations.length) * 3);
  const validity = item.validity.state === "current" ? 15 : 10;
  const contextualProximity = Math.min(10,
    (match.dimensions.includes("case") ? 4 : 0)
    + (match.dimensions.includes("editorial_context") ? 3 : 0)
    + (match.dimensions.includes("issue") ? 3 : 0)
    + (match.dimensions.includes("producer") ? 2 : 0)
    + (match.dimensions.includes("capability") ? 2 : 0)
    + (match.dimensions.includes("relationship") ? 2 : 0));
  return Object.freeze({relevance, sourceIndependence, recurrence: recurrenceScore, validity, contextualProximity, total: relevance + sourceIndependence + recurrenceScore + validity + contextualProximity});
}

function recommendationAction(candidate: GovernedKnowledgeCandidate, hasCurrentEvidence: boolean): GovernedKnowledgeRecommendationAction {
  if (!hasCurrentEvidence) return "inspect_current_evidence";
  if (candidate.kind === "negative_evidence") return "avoid_known_risk";
  if (candidate.kind === "contradiction") return "request_human_review";
  return "consider_historical_knowledge";
}

function recommendation(candidate: GovernedKnowledgeCandidate, query: NormalizedQuery, queryFingerprint: KnowledgeFingerprint, recurrence: KnowledgeRecurrence | undefined): GovernedKnowledgeRecommendation {
  const action = recommendationAction(candidate, query.currentEvidenceFingerprints.length > 0);
  const explanations: Record<GovernedKnowledgeRecommendationAction, string> = {
    consider_historical_knowledge: "Existe conocimiento histórico gobernado relevante; debe contrastarse con la evidencia actual antes de decidir.",
    inspect_current_evidence: "Falta evidencia actual en el contexto de recuperación; inspección obligatoria antes de utilizar el conocimiento histórico.",
    avoid_known_risk: "La experiencia histórica contiene evidencia negativa relevante; revisar el riesgo con evidencia actual.",
    request_human_review: "El conocimiento relevante requiere revisión humana y no puede aplicarse automáticamente.",
  };
  const reasonCodes = unique([`recommendation_${action}`, ...candidate.reasonCodes, "current_evidence_remains_authoritative"]);
  const semantic = {
    action,
    knowledgeId: candidate.knowledgeId,
    reasonCodes,
    provenance: {knowledgeFingerprint: candidate.knowledgeFingerprint, provenanceFingerprint: candidate.provenanceFingerprint, sourceFingerprints: candidate.sourceFingerprints},
    context: {caseId: query.caseId, matchedDimensions: candidate.matchedDimensions, matchedContextCodes: candidate.matchedContextCodes, queryFingerprint},
    historicalEvidence: {evidenceFingerprints: candidate.evidenceFingerprints, observationCount: recurrence?.observationCount ?? 1, independentSourceCount: recurrence?.independentSourceCount ?? Math.max(1, candidate.sourceFingerprints.length), recurrenceFingerprint: recurrence?.recurrenceFingerprint},
    limitations: candidate.limitations,
    advisoryOnly: true as const,
    requiresCurrentEvidence: true as const,
    replacesCurrentEvidence: false as const,
  };
  const recommendationFingerprint = fp(semantic);
  return Object.freeze({...semantic, recommendationId: `governed-knowledge-recommendation:${recommendationFingerprint.slice(-24)}`, safeExplanation: explanations[action], recommendationFingerprint});
}

function emptyExclusions(): Record<GovernedKnowledgeExclusionReason, number> {
  return {invalidated: 0, superseded: 0, expired: 0, contradictory: 0, under_review: 0, temporal_not_current: 0, not_relevant: 0, duplicate: 0};
}

/** Pure selection over caller-supplied B3 output. No store, network or decision access. */
export function retrieveGovernedKnowledge(input: GovernedRetrievalInput): GovernedKnowledgeRetrievalResult {
  if (!input.governance.advisoryOnly || input.governance.replacesCurrentEvidence || input.governance.modifiesDecisions || input.governance.writes) throw new Error("knowledge_retrieval_governance_contract_invalid");
  const query = normalizeQuery(input.query);
  const querySemantic = {...query, currentEvidenceFingerprints: query.currentEvidenceFingerprints};
  const queryFingerprint = fp(querySemantic);
  const exclusions = emptyExclusions();
  const conflictIds = new Set(input.governance.conflicts.flatMap((conflict) => conflict.knowledgeItemIds));
  const eligible: Array<{item: KnowledgeItem; match: Match}> = [];

  for (const item of [...input.governance.activeItems].sort((a, b) => a.knowledgeFingerprint.localeCompare(b.knowledgeFingerprint))) {
    const storedState = item.validity.state;
    if (storedState === "invalidated" || storedState === "superseded" || storedState === "expired" || storedState === "contradictory" || storedState === "under_review") {
      exclusions[storedState] += 1;
      continue;
    }
    if (conflictIds.has(item.id)) { exclusions.contradictory += 1; continue; }
    if (Date.parse(query.evaluatedAt) < Date.parse(item.validity.validFrom)) { exclusions.temporal_not_current += 1; continue; }
    const effective = evaluateKnowledgeValidity(item, query.evaluatedAt).state;
    if (effective === "expired") { exclusions.expired += 1; continue; }
    if (effective !== "current" && effective !== "temporal") { exclusions[effective] += 1; continue; }
    const match = matches(item, query);
    if (!match.dimensions.length) { exclusions.not_relevant += 1; continue; }
    eligible.push({item, match});
  }

  const deduplicated = new Map<string, {item: KnowledgeItem; match: Match}>();
  for (const entry of eligible) {
    const previous = deduplicated.get(entry.item.contentFingerprint);
    if (!previous) deduplicated.set(entry.item.contentFingerprint, entry);
    else {
      exclusions.duplicate += 1;
      if (entry.item.revision > previous.item.revision || (entry.item.revision === previous.item.revision && entry.item.knowledgeFingerprint.localeCompare(previous.item.knowledgeFingerprint) < 0)) deduplicated.set(entry.item.contentFingerprint, entry);
    }
  }

  const rankedWithoutPosition = [...deduplicated.values()].map(({item, match}) => {
    const recurrence = recurrenceFor(item, input.recurrence ?? []);
    const score = components(item, match, recurrence);
    const sourceFingerprints = unique(item.sources.map((source) => source.provenanceFingerprint));
    const evidenceFingerprints = unique(item.observations.flatMap((observation) => observation.evidenceFingerprints));
    const limitations = unique(["advisory_only", "current_evidence_required", "does_not_authorize_action", ...(item.validity.state === "temporal" ? ["temporal_scope_limited"] : []), ...(query.currentEvidenceFingerprints.length ? [] : ["current_evidence_missing"])]);
    const reasonCodes = unique([...match.dimensions.map((dimension) => `matched_${dimension}`), `validity_${item.validity.state}`, `independent_sources_${recurrence?.independentSourceCount ?? new Set(item.sources.map((source) => source.independenceGroup)).size}`, `observations_${recurrence?.observationCount ?? item.observations.length}`]);
    const semantic = {knowledgeId: item.id, revision: item.revision, knowledgeFingerprint: item.knowledgeFingerprint, contentFingerprint: item.contentFingerprint, domain: item.domain, kind: item.kind, subjectKey: item.subjectKey, claimCode: item.claimCode, validityState: item.validity.state as "current" | "temporal", matchedDimensions: match.dimensions, matchedContextCodes: match.contextCodes, components: score, reasonCodes, sourceFingerprints, evidenceFingerprints, provenanceFingerprint: item.provenance.provenanceFingerprint, recurrenceFingerprint: recurrence?.recurrenceFingerprint, limitations, advisoryOnly: true as const, replacesCurrentEvidence: false as const};
    return {semantic, recurrence, rankFingerprint: fp(semantic), safeSummary: item.safeSummary};
  }).sort((a, b) => b.semantic.components.total - a.semantic.components.total || a.rankFingerprint.localeCompare(b.rankFingerprint)).slice(0, query.limit);

  const candidates = Object.freeze(rankedWithoutPosition.map((entry, index) => Object.freeze({...entry.semantic, rank: index + 1, safeSummary: entry.safeSummary, rankFingerprint: entry.rankFingerprint})));
  const recurrenceByRank = new Map(rankedWithoutPosition.map((entry) => [entry.rankFingerprint, entry.recurrence]));
  const recommendations = Object.freeze(candidates.map((candidate) => recommendation(candidate, query, queryFingerprint, recurrenceByRank.get(candidate.rankFingerprint))));
  const status = candidates.length ? "ranked" as const : "no_relevant_knowledge" as const;
  const reasonCodes = unique(candidates.length ? ["governed_knowledge_ranked", ...(query.currentEvidenceFingerprints.length ? ["current_evidence_supplied"] : ["current_evidence_required"])] : ["no_governed_knowledge_matched"]);
  const semantic = {schemaVersion: GOVERNED_KNOWLEDGE_RETRIEVAL_VERSION, status, queryFingerprint, candidateFingerprints: candidates.map((candidate) => candidate.rankFingerprint), recommendationFingerprints: recommendations.map((entry) => entry.recommendationFingerprint), excluded: exclusions, retrievedCount: candidates.length, deduplicatedCount: exclusions.duplicate, reasonCodes, advisoryOnly: true as const, requiresCurrentEvidence: true as const, replacesCurrentEvidence: false as const, modifiesDecisions: false as const, appliesRecommendations: false as const, writes: false as const};
  const retrievalFingerprint = fp(semantic);
  return Object.freeze({...semantic, candidates, recommendations, retrievalFingerprint});
}
