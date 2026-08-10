import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  buildKnowledgeProvenance,
  buildKnowledgeSource,
  createKnowledgeItem,
  governKnowledge,
  governedKnowledgeRetrievalSecurity,
  retrieveGovernedKnowledge,
  type GovernedKnowledgeQuery,
  type KnowledgeDomain,
  type KnowledgeItem,
  type KnowledgeKind,
  type KnowledgeRecurrence,
  type KnowledgeReference,
  type KnowledgeValidityState,
} from "../_laboratorio/laboratorio-ia/src/review/knowledge";
import {computeUniversalFingerprint} from "../_laboratorio/laboratorio-ia/src/review/universal";

const NOW = "2026-08-10T10:00:00.000Z";
const QUERY_AT = "2026-08-12T10:00:00.000Z";
let assertions = 0;
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const deepEqual = (actual: unknown, expected: unknown, message?: string): void => { assert.deepEqual(actual, expected, message); assertions += 1; };
const fp = (value: string) => computeUniversalFingerprint(value);

type ItemOptions = Readonly<{
  name: string;
  domain?: KnowledgeDomain;
  kind?: KnowledgeKind;
  subjectKey?: string;
  claimCode?: string;
  caseId?: string;
  producerId?: string;
  value?: string;
  sourceGroups?: readonly string[];
  references?: readonly KnowledgeReference[];
  validity?: KnowledgeValidityState;
  validFrom?: string;
  validUntil?: string;
  revision?: number;
}>;

function item(options: ItemOptions): KnowledgeItem {
  const sourceGroups = options.sourceGroups ?? [`source-group:${options.name}`];
  const sources = sourceGroups.map((group, index) => buildKnowledgeSource({sourceId: `source:${options.name}:${index}`, kind: "outcome", authority: index === 0 ? "editorial_confirmed" : "corroborating", sourceVersion: "AU7/1", observedAt: NOW, independenceGroup: group}));
  const caseId = options.caseId ?? "case:current";
  const producerId = options.producerId ?? "review_center";
  const subjectKey = options.subjectKey ?? "fighter:alpha";
  const claimCode = options.claimCode ?? "identity_duplicate";
  const provenance = buildKnowledgeProvenance({caseId, caseVersion: 4, producerId, engineVersions: {checkpoint: "AU3", inspection: "AU4", identity: "AU5", resolution: "AU6", transaction: "AU7", decision: "AU8", outcome: "AU7"}, checkpointFingerprint: fp(`checkpoint:${options.name}`), inspectionFingerprints: [fp(`inspection:${options.name}`)], identityFingerprints: [fp(`identity:${options.name}`)], resolutionFingerprint: fp(`resolution:${options.name}`), transactionFingerprint: fp(`transaction:${options.name}`), decisionFingerprint: fp(`decision:${options.name}`), outcomeFingerprints: [fp(`outcome:${options.name}`)], memoryFingerprints: []});
  return createKnowledgeItem({
    revision: options.revision,
    domain: options.domain ?? "fighter",
    kind: options.kind ?? "confirmed_fact",
    subjectKey,
    claimCode,
    safeSummary: `Conocimiento seguro ${options.name}`,
    authority: "editorial_confirmed",
    observations: [{claimCode, subjectKey, polarity: options.kind === "negative_evidence" ? "contradicts" : "supports", safeSummary: `Observación segura ${options.name}`, valueFingerprint: fp(options.value ?? options.name), evidenceFingerprints: [fp(`historical-evidence:${options.name}`)], sourceIds: sources.map((source) => source.sourceId), observedAt: NOW}],
    sources,
    references: options.references ?? [{kind: "case", id: caseId, relation: "derived_from"}],
    validity: {state: options.validity ?? "current", validFrom: options.validFrom ?? NOW, validUntil: options.validUntil, invalidatedAt: options.validity === "invalidated" ? NOW : undefined, supersededAt: options.validity === "superseded" ? NOW : undefined, supersededBy: options.validity === "superseded" ? "knowledge:replacement" : undefined, evaluatedAt: NOW},
    provenance,
  }, () => NOW);
}

function recurrence(target: KnowledgeItem, observations: number, independentSources: number): KnowledgeRecurrence {
  return {knowledgeId: target.id, observationCount: observations, independentSourceCount: independentSources, producerCount: 2, caseCount: 3, firstObservedAt: "2026-07-01T00:00:00.000Z", lastObservedAt: NOW, occurrenceIds: ["occurrence:1", "occurrence:2"], recurrenceFingerprint: fp(`recurrence:${target.id}:${observations}:${independentSources}`), replacesCurrentEvidence: false};
}

const queryBase: GovernedKnowledgeQuery = {
  caseId: "case:current",
  evaluatedAt: QUERY_AT,
  entityKeys: ["fighter:alpha"],
  entityTypes: ["fighter"],
  capabilityIds: ["identity_resolution"],
  producerIds: ["external_news"],
  editorialContextCodes: ["news_intake"],
  issueCodes: ["identity_duplicate"],
  relationshipKeys: ["organization:ufc"],
  currentEvidenceFingerprints: [fp("current-evidence")],
  limit: 10,
};

function main(): void {
  const rich = item({name: "rich", producerId: "external_news", sourceGroups: ["official", "editorial", "external"], references: [
    {kind: "case", id: "case:current", relation: "derived_from"},
    {kind: "entity", id: "fighter:alpha", relation: "about"},
    {kind: "capability_manifest", id: "identity_resolution", relation: "supports"},
    {kind: "producer_manifest", id: "external_news", relation: "supports"},
    {kind: "editorial_context", id: "news_intake", relation: "about"},
    {kind: "issue", id: "identity_duplicate", relation: "about"},
    {kind: "relationship", id: "organization:ufc", relation: "about"},
  ]});
  const modest = item({name: "modest", caseId: "case:other", subjectKey: "fighter:beta", claimCode: "profile_review", value: "modest", sourceGroups: ["single"]});
  const governance = governKnowledge({items: [modest, rich], evaluatedAt: NOW});
  const ranked = retrieveGovernedKnowledge({governance, recurrence: [recurrence(rich, 8, 4), recurrence(modest, 1, 1)], query: queryBase});
  equal(ranked.status, "ranked"); equal(ranked.candidates.length, 2); equal(ranked.candidates[0].knowledgeId, rich.id); equal(ranked.candidates[0].rank, 1); check(ranked.candidates[0].components.total > ranked.candidates[1].components.total);
  equal(ranked.candidates[0].components.relevance, 40); equal(ranked.candidates[0].components.sourceIndependence, 20); equal(ranked.candidates[0].components.recurrence, 15); equal(ranked.candidates[0].components.validity, 15); equal(ranked.candidates[0].components.contextualProximity, 10); equal(ranked.candidates[0].components.total, 100);
  for (const dimension of ["entity", "entity_type", "capability", "producer", "editorial_context", "issue", "relationship", "case"] as const) check(ranked.candidates[0].matchedDimensions.includes(dimension), `dimensión ${dimension}`);
  check(ranked.candidates[0].matchedContextCodes.includes("news_intake")); check(ranked.candidates[0].matchedContextCodes.includes("organization:ufc")); check(ranked.candidates[0].sourceFingerprints.length === 3); check(ranked.candidates[0].evidenceFingerprints.length === 1); equal(ranked.candidates[0].recurrenceFingerprint, recurrence(rich, 8, 4).recurrenceFingerprint);
  equal(ranked.advisoryOnly, true); equal(ranked.requiresCurrentEvidence, true); equal(ranked.replacesCurrentEvidence, false); equal(ranked.modifiesDecisions, false); equal(ranked.appliesRecommendations, false); equal(ranked.writes, false);

  const recommendation = ranked.recommendations[0];
  equal(recommendation.action, "consider_historical_knowledge"); equal(recommendation.advisoryOnly, true); equal(recommendation.requiresCurrentEvidence, true); equal(recommendation.replacesCurrentEvidence, false); equal(recommendation.provenance.knowledgeFingerprint, rich.knowledgeFingerprint); equal(recommendation.provenance.provenanceFingerprint, rich.provenance.provenanceFingerprint); equal(recommendation.context.caseId, "case:current"); equal(recommendation.context.queryFingerprint, ranked.queryFingerprint); equal(recommendation.historicalEvidence.observationCount, 8); equal(recommendation.historicalEvidence.independentSourceCount, 4); check(recommendation.limitations.includes("current_evidence_required")); check(recommendation.limitations.includes("does_not_authorize_action")); check(recommendation.reasonCodes.includes("current_evidence_remains_authoritative")); check(recommendation.recommendationFingerprint.startsWith("sha256-v1:"));

  const withoutCurrentEvidence = retrieveGovernedKnowledge({governance, query: {...queryBase, currentEvidenceFingerprints: []}});
  equal(withoutCurrentEvidence.recommendations[0].action, "inspect_current_evidence"); check(withoutCurrentEvidence.recommendations[0].limitations.includes("current_evidence_missing")); check(withoutCurrentEvidence.reasonCodes.includes("current_evidence_required"));
  const negative = item({name: "negative", kind: "negative_evidence", value: "false-match"});
  const negativeResult = retrieveGovernedKnowledge({governance: governKnowledge({items: [negative], evaluatedAt: NOW}), query: queryBase});
  equal(negativeResult.recommendations[0].action, "avoid_known_risk");

  const invalidated = item({name: "invalidated", validity: "invalidated", value: "rich"});
  const superseded = item({name: "superseded", validity: "superseded", value: "rich"});
  const expired = item({name: "expired", kind: "temporal_knowledge", validity: "expired", value: "rich", validFrom: "2026-07-01T00:00:00.000Z", validUntil: "2026-08-01T00:00:00.000Z"});
  const contradictory = item({name: "contradictory", validity: "contradictory", value: "rich"});
  const underReview = item({name: "under-review", validity: "under_review", value: "rich"});
  const filtered = retrieveGovernedKnowledge({governance: governKnowledge({items: [invalidated, superseded, expired, contradictory, underReview, rich], evaluatedAt: NOW}), query: queryBase});
  equal(filtered.candidates.length, 1); equal(filtered.candidates[0].knowledgeId, rich.id); equal(filtered.excluded.invalidated, 1); equal(filtered.excluded.superseded, 1); equal(filtered.excluded.expired, 1); equal(filtered.excluded.contradictory, 1); equal(filtered.excluded.under_review, 1);
  equal(filtered.recommendations.some((entry) => [invalidated.id, superseded.id, expired.id, contradictory.id, underReview.id].includes(entry.knowledgeId)), false);
  const conflictingFact = item({name: "conflicting-fact", value: "different-identity"});
  const conflictGovernance = governKnowledge({items: [rich, conflictingFact], evaluatedAt: NOW});
  equal(conflictGovernance.conflicts.length, 1);
  const conflictFiltered = retrieveGovernedKnowledge({governance: conflictGovernance, query: queryBase});
  equal(conflictFiltered.candidates.length, 0); equal(conflictFiltered.recommendations.length, 0); equal(conflictFiltered.excluded.contradictory, 2);

  const temporalCurrent = item({name: "temporal-current", kind: "temporal_knowledge", validity: "temporal", value: "temporal-compatible", validFrom: "2026-08-11T00:00:00.000Z", validUntil: "2026-08-20T00:00:00.000Z"});
  const temporalFuture = item({name: "temporal-future", kind: "temporal_knowledge", validity: "temporal", value: "temporal-compatible", validFrom: "2026-08-15T00:00:00.000Z", validUntil: "2026-08-30T00:00:00.000Z"});
  const temporalStale = item({name: "temporal-stale", kind: "temporal_knowledge", validity: "temporal", value: "temporal-compatible", validFrom: "2026-08-01T00:00:00.000Z", validUntil: "2026-08-11T00:00:00.000Z"});
  const temporalGovernance = governKnowledge({items: [temporalCurrent, temporalFuture, temporalStale], evaluatedAt: NOW});
  const temporalResult = retrieveGovernedKnowledge({governance: temporalGovernance, query: queryBase});
  equal(temporalResult.candidates.length, 1); equal(temporalResult.candidates[0].knowledgeId, temporalCurrent.id); equal(temporalResult.candidates[0].validityState, "temporal"); equal(temporalResult.candidates[0].components.validity, 10); check(temporalResult.candidates[0].limitations.includes("temporal_scope_limited")); equal(temporalResult.excluded.temporal_not_current, 1); equal(temporalResult.excluded.expired, 1, "la consulta debe detectar governance temporal stale");

  const duplicateRevision = createKnowledgeItem({...rich, revision: 2, createdAt: rich.createdAt, updatedAt: rich.updatedAt});
  equal(duplicateRevision.contentFingerprint, rich.contentFingerprint); check(duplicateRevision.id !== rich.id);
  const duplicates = retrieveGovernedKnowledge({governance: governKnowledge({items: [rich, duplicateRevision], evaluatedAt: NOW}), query: queryBase});
  equal(duplicates.candidates.length, 1); equal(duplicates.candidates[0].revision, 2); equal(duplicates.deduplicatedCount, 1); equal(duplicates.excluded.duplicate, 1);

  const unrelated = item({name: "unrelated", domain: "event", subjectKey: "event:other", claimCode: "event_schedule", caseId: "case:other", producerId: "other", references: [{kind: "case", id: "case:other", relation: "derived_from"}]});
  const noMatch = retrieveGovernedKnowledge({governance: governKnowledge({items: [unrelated], evaluatedAt: NOW}), query: queryBase});
  equal(noMatch.status, "no_relevant_knowledge"); equal(noMatch.candidates.length, 0); equal(noMatch.recommendations.length, 0); equal(noMatch.excluded.not_relevant, 1);

  const ordered = retrieveGovernedKnowledge({governance: governKnowledge({items: [rich, modest], evaluatedAt: NOW}), recurrence: [recurrence(rich, 8, 4)], query: queryBase});
  const reordered = retrieveGovernedKnowledge({governance: governKnowledge({items: [modest, rich], evaluatedAt: NOW}), recurrence: [recurrence(rich, 8, 4)], query: {...queryBase, entityKeys: [...(queryBase.entityKeys ?? [])].reverse(), issueCodes: [...(queryBase.issueCodes ?? [])].reverse()}});
  equal(ordered.queryFingerprint, reordered.queryFingerprint); equal(ordered.retrievalFingerprint, reordered.retrievalFingerprint); deepEqual(ordered.candidates, reordered.candidates); check(ordered.retrievalFingerprint.startsWith("sha256-v1:")); check(ordered.candidates.every((entry) => entry.rankFingerprint.startsWith("sha256-v1:")));
  const limited = retrieveGovernedKnowledge({governance, query: {...queryBase, limit: 1}}); equal(limited.candidates.length, 1);
  assert.throws(() => retrieveGovernedKnowledge({governance, query: {...queryBase, limit: 51}}), /knowledge_retrieval_limit_invalid/); assertions += 1;

  equal(governedKnowledgeRetrievalSecurity.pure, true); equal(governedKnowledgeRetrievalSecurity.explainableRanking, true); equal(governedKnowledgeRetrievalSecurity.historicalConfidenceGrantsAuthority, false); equal(governedKnowledgeRetrievalSecurity.retrievesFromStores, false); equal(governedKnowledgeRetrievalSecurity.createsStores, false); equal(governedKnowledgeRetrievalSecurity.launchesPlanners, false); equal(governedKnowledgeRetrievalSecurity.invokesExecutors, false); equal(governedKnowledgeRetrievalSecurity.launchesSchedulers, false); equal(governedKnowledgeRetrievalSecurity.createsParallelRuntime, false); equal(governedKnowledgeRetrievalSecurity.accessesSanity, false); equal(governedKnowledgeRetrievalSecurity.accessesNetwork, false); equal(governedKnowledgeRetrievalSecurity.modifiesDecisions, false); equal(governedKnowledgeRetrievalSecurity.appliesRecommendations, false); equal(governedKnowledgeRetrievalSecurity.writes, false); equal(governedKnowledgeRetrievalSecurity.replacesCurrentEvidence, false);
  const sources = ["retrieval.ts", "retrievalTypes.ts"].map((file) => readFileSync(new URL(`../_laboratorio/laboratorio-ia/src/review/knowledge/${file}`, import.meta.url), "utf8")).join("\n");
  check(!/from ["'][^"']*(store|executor|sanity|planner|scheduler)/i.test(sources)); check(!sources.includes("fetch(")); check(!sources.includes("localStorage")); check(!sources.includes("decisionEngine")); check(!sources.includes("outcome.payload"));
  console.log(`AU9 B4 governed retrieval and recommendation tests: OK (${assertions} assertions; eight retrieval dimensions, ranking, lifecycle filters, temporal freshness, deduplication, advisory recommendations and zero writes)`);
}

main();
