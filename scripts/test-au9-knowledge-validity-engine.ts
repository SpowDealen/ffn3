import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  buildKnowledgeProvenance,
  buildKnowledgeSource,
  createKnowledgeItem,
  detectGovernedKnowledgeConflicts,
  evaluateKnowledgeValidity,
  governKnowledge,
  knowledgeGovernanceSecurity,
  type KnowledgeItem,
  type KnowledgeKind,
  type KnowledgeObservationPolarity,
  type KnowledgeValidityState,
} from "../_laboratorio/laboratorio-ia/src/review/knowledge";
import {computeUniversalFingerprint} from "../_laboratorio/laboratorio-ia/src/review/universal";

const NOW = "2026-08-10T10:00:00.000Z";
const LATER = "2026-08-12T10:00:00.000Z";
let assertions = 0;
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const deepEqual = (actual: unknown, expected: unknown, message?: string): void => { assert.deepEqual(actual, expected, message); assertions += 1; };
const fp = (value: string) => computeUniversalFingerprint(value);

function item(options: Readonly<{
  name: string;
  kind?: KnowledgeKind;
  polarity?: KnowledgeObservationPolarity;
  value?: string;
  independenceGroup?: string;
  authority?: "authoritative" | "editorial_confirmed" | "corroborating" | "historical" | "weak";
  validity?: KnowledgeValidityState;
  validFrom?: string;
  validUntil?: string;
}>): KnowledgeItem {
  const source = buildKnowledgeSource({sourceId: `source:${options.name}`, kind: "outcome", authority: options.authority ?? "editorial_confirmed", sourceVersion: "AU7/1", observedAt: NOW, independenceGroup: options.independenceGroup ?? `independent:${options.name}`});
  const provenance = buildKnowledgeProvenance({caseId: `case:${options.name}`, caseVersion: 1, producerId: "review_center", engineVersions: {checkpoint: "AU3", inspection: "AU4", identity: "AU5", resolution: "AU6", transaction: "AU7", decision: "AU8", outcome: "AU7"}, inspectionFingerprints: [fp(`inspection:${options.name}`)], identityFingerprints: [fp(`identity:${options.name}`)], outcomeFingerprints: [fp(`outcome:${options.name}`)], memoryFingerprints: []});
  return createKnowledgeItem({
    domain: "fighter",
    kind: options.kind ?? "confirmed_fact",
    subjectKey: "fighter:alpha",
    claimCode: "fighter.identity",
    safeSummary: `Proyección segura ${options.name}`,
    authority: options.authority ?? "editorial_confirmed",
    observations: [{claimCode: "fighter.identity", subjectKey: "fighter:alpha", polarity: options.polarity ?? "supports", safeSummary: `Observación segura ${options.name}`, valueFingerprint: fp(options.value ?? "alpha"), evidenceFingerprints: [fp(`evidence:${options.name}`)], sourceIds: [source.sourceId], observedAt: NOW}],
    sources: [source],
    references: [{kind: "case", id: `case:${options.name}`, relation: "derived_from"}],
    validity: {state: options.validity ?? "current", validFrom: options.validFrom ?? NOW, validUntil: options.validUntil, evaluatedAt: NOW},
    provenance,
  }, () => NOW);
}

function directiveBase(target: KnowledgeItem) {
  return {knowledgeId: target.id, occurredAt: LATER, evidenceFingerprints: [fp("current-evidence")], provenanceFingerprint: fp("human-review")};
}

function main(): void {
  const current = item({name: "current"});
  const currentResult = governKnowledge({items: [current], evaluatedAt: LATER});
  equal(currentResult.items.length, 1); equal(currentResult.activeItems[0].validity.state, "current"); equal(currentResult.transitions.length, 0); equal(currentResult.assessments[0].effectiveState, "current");
  equal(currentResult.advisoryOnly, true); equal(currentResult.replacesCurrentEvidence, false); equal(currentResult.writes, false); equal(currentResult.retrievesKnowledge, false); equal(currentResult.modifiesDecisions, false); equal(currentResult.resolvesConflicts, false);

  const temporal = item({name: "temporal", kind: "temporal_knowledge", validity: "temporal", validFrom: "2026-08-01T00:00:00.000Z", validUntil: "2026-08-11T00:00:00.000Z"});
  equal(evaluateKnowledgeValidity(temporal, NOW).state, "temporal");
  const expired = governKnowledge({items: [temporal], evaluatedAt: LATER});
  equal(expired.items.length, 2); equal(expired.activeItems[0].validity.state, "expired"); equal(expired.activeItems[0].revision, 2); equal(expired.transitions[0].kind, "expire"); check(expired.activeItems[0].references.some((reference) => reference.relation === "derived_from" && reference.id === temporal.id)); equal(expired.items.some((entry) => entry.id === temporal.id), true, "la revisión histórica debe conservarse");
  const expiredAgain = governKnowledge({items: expired.items, evaluatedAt: "2026-08-13T10:00:00.000Z"});
  equal(expiredAgain.items.length, 2); equal(expiredAgain.transitions.length, 0, "no debe crear otra revisión expirada");

  const invalidated = governKnowledge({items: [current], evaluatedAt: LATER, invalidations: [{...directiveBase(current), reasonCode: "human_confirmed_false_match"}]});
  equal(invalidated.activeItems[0].validity.state, "invalidated"); equal(invalidated.activeItems[0].kind, "invalidated_knowledge"); equal(invalidated.activeItems[0].validity.invalidationReasonCode, "human_confirmed_false_match"); equal(invalidated.transitions[0].kind, "invalidate"); equal(invalidated.items.length, 2); equal(invalidated.activeItems[0].provenance.provenanceFingerprint, current.provenance.provenanceFingerprint);

  const replacement = item({name: "replacement", value: "alpha-v2"});
  const superseded = governKnowledge({items: [current, replacement], evaluatedAt: LATER, supersessions: [{...directiveBase(current), supersededById: replacement.id, reasonCode: "newer_confirmed_revision"}]});
  const supersededRevision = superseded.activeItems.find((entry) => entry.validity.state === "superseded");
  check(supersededRevision); equal(supersededRevision?.validity.supersededBy, replacement.id); equal(superseded.transitions.some((entry) => entry.kind === "supersede"), true); check(supersededRevision?.references.some((reference) => reference.relation === "supersedes" && reference.id === replacement.id)); equal(superseded.items.some((entry) => entry.id === current.id), true);
  equal(superseded.conflicts.length, 0, "el conocimiento sustituido no debe competir con su reemplazo"); equal(superseded.activeItems.find((entry) => entry.id === replacement.id)?.validity.state, "current"); check(superseded.transitions[0].evidenceFingerprints.includes(fp("current-evidence")));

  const reviewed = governKnowledge({items: [current], evaluatedAt: LATER, reviews: [{knowledgeId: current.id, occurredAt: LATER, reasonCodes: ["editorial_review_required"], provenanceFingerprint: fp("review")}]});
  equal(reviewed.activeItems[0].validity.state, "under_review"); equal(reviewed.assessments[0].requiresReview, true); equal(reviewed.transitions[0].kind, "request_review");

  const factA = item({name: "fact-a", value: "identity-a", authority: "authoritative", independenceGroup: "official-a"});
  const factB = item({name: "fact-b", value: "identity-b", independenceGroup: "official-b"});
  const factConflict = detectGovernedKnowledgeConflicts([factB, factA]);
  equal(factConflict.length, 1); check(factConflict[0].reasonCodes.includes("fact_vs_fact")); check(factConflict[0].reasonCodes.includes("independent_sources_incompatible")); equal(factConflict[0].severity, "critical"); equal(factConflict[0].requiresCurrentEvidence, true);
  deepEqual(factConflict, detectGovernedKnowledgeConflicts([factA, factB]), "la detección debe ignorar el orden de entrada");

  const pattern = item({name: "pattern", kind: "observed_pattern", value: "identity-pattern"});
  const patternConflict = detectGovernedKnowledgeConflicts([pattern, factA]);
  check(patternConflict[0].reasonCodes.includes("pattern_vs_fact"));
  const experience = item({name: "experience", kind: "historical_experience", value: "identity-a", polarity: "supports"});
  const negative = item({name: "negative", kind: "negative_evidence", value: "identity-b", polarity: "contradicts"});
  const experienceConflict = detectGovernedKnowledgeConflicts([experience, negative]);
  check(experienceConflict[0].reasonCodes.includes("experience_vs_negative_evidence")); check(experienceConflict[0].reasonCodes.includes("observation_polarity_conflict"));
  const temporalA = item({name: "temporal-a", kind: "temporal_knowledge", validity: "temporal", value: "team-a", validFrom: "2026-08-01T00:00:00.000Z", validUntil: "2026-08-20T00:00:00.000Z"});
  const temporalB = item({name: "temporal-b", kind: "temporal_knowledge", validity: "temporal", value: "team-b", validFrom: "2026-08-10T00:00:00.000Z", validUntil: "2026-08-30T00:00:00.000Z"});
  check(detectGovernedKnowledgeConflicts([temporalA, temporalB])[0].reasonCodes.includes("incompatible_temporal_windows"));
  equal(detectGovernedKnowledgeConflicts([factA, item({name: "same", value: "identity-a"})]).length, 0, "evidencia compatible no debe producir conflicto");

  const governedConflict = governKnowledge({items: [factB, factA], evaluatedAt: LATER});
  equal(governedConflict.conflicts.length, 1); equal(governedConflict.conflictCandidates.length, 1); equal(governedConflict.conflictCandidates[0].status, "under_review"); equal(governedConflict.conflictCandidates[0].winnerSelected, false); equal(governedConflict.conflictCandidates[0].advisoryOnly, true); equal(governedConflict.conflictCandidates[0].replacesCurrentEvidence, false);
  equal(governedConflict.activeItems.every((entry) => entry.validity.state === "contradictory"), true); equal(governedConflict.activeItems.every((entry) => entry.revision === 2), true); equal(governedConflict.transitions.every((entry) => entry.kind === "mark_contradictory"), true); equal(governedConflict.assessments.every((entry) => entry.requiresReview), true); equal(governedConflict.items.length, 4);
  const governedReplay = governKnowledge({items: governedConflict.items, evaluatedAt: "2026-08-14T10:00:00.000Z"});
  equal(governedReplay.items.length, 4); equal(governedReplay.transitions.length, 0); equal(governedReplay.conflicts[0].conflictFingerprint, governedConflict.conflicts[0].conflictFingerprint);
  const replayAgain = governKnowledge({items: governedReplay.items, evaluatedAt: "2026-08-15T10:00:00.000Z"});
  equal(replayAgain.governanceFingerprint, governedReplay.governanceFingerprint, "el estado gobernado debe ser idempotente");

  const ordered = governKnowledge({items: [factA, factB], evaluatedAt: LATER});
  const reversed = governKnowledge({items: [factB, factA], evaluatedAt: LATER});
  equal(ordered.governanceFingerprint, reversed.governanceFingerprint); deepEqual(ordered.transitions, reversed.transitions);
  const expirationLater = governKnowledge({items: [temporal], evaluatedAt: "2026-08-20T00:00:00.000Z"});
  equal(expirationLater.governanceFingerprint, expired.governanceFingerprint, "timestamps operativos posteriores no alteran fingerprints semánticos");
  equal(governKnowledge({items: [current], evaluatedAt: NOW}).governanceFingerprint, governKnowledge({items: [current], evaluatedAt: LATER}).governanceFingerprint);
  check(ordered.governanceFingerprint.startsWith("sha256-v1:")); check(ordered.transitions.every((entry) => entry.transitionFingerprint.startsWith("sha256-v1:"))); check(ordered.assessments.every((entry) => entry.assessmentFingerprint.startsWith("sha256-v1:")));

  equal(knowledgeGovernanceSecurity.pure, true); equal(knowledgeGovernanceSecurity.preservesRevisionHistory, true); equal(knowledgeGovernanceSecurity.choosesConflictWinner, false); equal(knowledgeGovernanceSecurity.createsStores, false); equal(knowledgeGovernanceSecurity.launchesPlanners, false); equal(knowledgeGovernanceSecurity.invokesExecutors, false); equal(knowledgeGovernanceSecurity.accessesSanity, false); equal(knowledgeGovernanceSecurity.accessesNetwork, false); equal(knowledgeGovernanceSecurity.writes, false); equal(knowledgeGovernanceSecurity.replacesCurrentEvidence, false);
  const sources = ["governance.ts", "governanceTypes.ts"].map((file) => readFileSync(new URL(`../_laboratorio/laboratorio-ia/src/review/knowledge/${file}`, import.meta.url), "utf8")).join("\n");
  check(!/from ["'][^"']*(store|executor|sanity|planner)/i.test(sources)); check(!sources.includes("fetch(")); check(!sources.includes("localStorage")); check(!sources.includes("payload")); check(!sources.includes("secret"));
  console.log(`AU9 B3 knowledge validity and contradiction tests: OK (${assertions} assertions; lifecycle, temporal governance, conflicts, immutable revisions, provenance, deterministic fingerprints and zero writes)`);
}

main();
