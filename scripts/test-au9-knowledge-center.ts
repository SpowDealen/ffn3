import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  applyKnowledgeCenterLifecycleAction,
  buildKnowledgeCenterViewModel,
  buildKnowledgeConflictSummary,
  buildKnowledgeFeedbackSummary,
  buildKnowledgeRecommendationSummary,
  buildKnowledgeSummary,
  buildKnowledgeValiditySummary,
  buildKnowledgeProvenance,
  buildKnowledgeSource,
  createKnowledgeCenterSnapshot,
  createKnowledgeItem,
  governKnowledge,
  knowledgeCenterSecurity,
  readKnowledgeCenterSnapshot,
  retrieveGovernedKnowledge,
  withKnowledgeCenterSnapshot,
  type FeedbackRecord,
  type KnowledgeDomain,
  type KnowledgeItem,
  type KnowledgeRecurrence,
} from "../_laboratorio/laboratorio-ia/src/review/knowledge";
import {computeUniversalFingerprint} from "../_laboratorio/laboratorio-ia/src/review/universal";

const NOW = "2026-08-10T10:00:00.000Z";
const LATER = "2026-08-12T10:00:00.000Z";
const fp = (value: string) => computeUniversalFingerprint(value);
let assertions = 0;
const equal = <T>(a: T, b: T, message?: string): void => { assert.equal(a, b, message); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const deepEqual = (a: unknown, b: unknown, message?: string): void => { assert.deepEqual(a, b, message); assertions += 1; };

function item(name: string, domain: KnowledgeDomain = "fighter", subjectKey = `${domain}:alpha`, value = name): KnowledgeItem {
  const source = buildKnowledgeSource({sourceId: `source:${name}`, kind: "outcome", authority: "editorial_confirmed", sourceVersion: "AU7", observedAt: NOW, independenceGroup: `independent:${name}`});
  const provenance = buildKnowledgeProvenance({caseId: "case:center", caseVersion: 4, producerId: "review_center", engineVersions: {checkpoint: "AU3", inspection: "AU4", identity: "AU5", resolution: "AU6", transaction: "AU7", decision: "AU8", outcome: "AU7"}, inspectionFingerprints: [fp(`inspection:${name}`)], identityFingerprints: [fp(`identity:${name}`)], outcomeFingerprints: [fp(`outcome:${name}`)], memoryFingerprints: []});
  return createKnowledgeItem({domain, kind: "confirmed_fact", subjectKey, claimCode: `${domain}.confirmed`, safeSummary: `Resumen seguro ${name}`, authority: "editorial_confirmed", observations: [{claimCode: `${domain}.confirmed`, subjectKey, polarity: "supports", safeSummary: `Observación segura ${name}`, valueFingerprint: fp(value), evidenceFingerprints: [fp(`evidence:${name}`)], sourceIds: [source.sourceId], observedAt: NOW}], sources: [source], references: [{kind: "case", id: "case:center", relation: "derived_from"}], validity: {state: "current", validFrom: NOW, evaluatedAt: NOW}, provenance}, () => NOW);
}
function recurrence(entry: KnowledgeItem): KnowledgeRecurrence { return {knowledgeId: entry.id, observationCount: 3, independentSourceCount: 2, producerCount: 2, caseCount: 2, firstObservedAt: NOW, lastObservedAt: LATER, occurrenceIds: ["occ:one", "occ:two"], recurrenceFingerprint: fp(`recurrence:${entry.id}`), replacesCurrentEvidence: false}; }
function feedback(entry: KnowledgeItem): FeedbackRecord { return {schemaVersion: "1.0.0", feedbackId: "feedback:center", caseId: "case:center", caseVersion: 4, status: "confirmed_success", classification: "reinforce", decisionFingerprint: fp("decision"), sufficiencyFingerprint: fp("sufficiency"), autonomyFingerprint: fp("autonomy"), strategyFingerprint: fp("strategy"), transactionFingerprint: fp("transaction"), outcomeFingerprint: fp("outcome"), knowledgeFingerprints: [entry.knowledgeFingerprint], parts: [], reasonCodes: ["outcome_confirmed"], observedAt: LATER, feedbackFingerprint: fp("feedback"), learningEligible: true, outcomeAuthorityConfirmed: true, advisoryOnly: true, requiresCurrentEvidence: true, replacesCurrentEvidence: false}; }

function main(): void {
  const fighter = item("fighter", "fighter");
  const event = item("event", "event");
  const organization = item("organization", "organization");
  const weight = item("weight", "weight_category");
  const news = item("news", "news");
  const fight = item("fight", "fight");
  const result = item("result", "result");
  const relation = item("relation", "relationship");
  const replacement = item("fighter-v2", "fighter", "fighter:alpha", "fighter");
  const governance = governKnowledge({items: [fighter, event, organization, weight, news, fight, result, relation, replacement], evaluatedAt: NOW});
  const retrieval = retrieveGovernedKnowledge({governance, recurrence: [recurrence(fighter)], query: {caseId: "case:center", evaluatedAt: NOW, entityKeys: ["fighter:alpha"], entityTypes: ["fighter"], currentEvidenceFingerprints: [fp("current")], limit: 50}});
  const snapshot = createKnowledgeCenterSnapshot({caseId: "case:center", caseVersion: 4, governance, recurrence: [recurrence(fighter)], retrieval, feedback: [feedback(fighter)], createdAt: NOW, updatedAt: NOW});
  equal(snapshot.schemaVersion, "1.0.0"); equal(snapshot.advisoryOnly, true); equal(snapshot.requiresCurrentEvidence, true); equal(snapshot.replacesCurrentEvidence, false); equal(snapshot.createsPolicy, false); equal(snapshot.elevatesAuthority, false); equal(snapshot.writes, false);
  equal(snapshot.snapshotFingerprint, createKnowledgeCenterSnapshot({caseId: "case:center", caseVersion: 4, governance, recurrence: [recurrence(fighter)], retrieval, feedback: [feedback(fighter)], createdAt: LATER, updatedAt: LATER}).snapshotFingerprint, "timestamps do not alter snapshot identity");
  const context = withKnowledgeCenterSnapshot({producer: "test"}, snapshot); equal(readKnowledgeCenterSnapshot(context)?.snapshotFingerprint, snapshot.snapshotFingerprint); equal(readKnowledgeCenterSnapshot({}), undefined); equal(readKnowledgeCenterSnapshot({au9Knowledge: {schemaVersion: "bad"}}), undefined);
  const model = buildKnowledgeCenterViewModel(snapshot, NOW, ["fighter", "image"]); equal(model.availability, "ready"); equal(model.entries.length, 9); equal(model.recommendations.length > 0, true); equal(model.feedback.length, 1); equal(model.lifecycleCounts.current, 9); check(model.unsupported.some((entry) => entry.startsWith("image:"))); equal(model.safeToAct, true); check(model.advisoryNotice.includes("nunca sustituye"));
  for (const domain of ["fighter", "event", "organization", "weight_category", "news", "fight", "result", "relationship"] as const) check(model.entries.some((entry) => entry.item.domain === domain), `domain ${domain}`);
  const fighterEntry = model.entries.find((entry) => entry.item.id === fighter.id)!;
  equal(buildKnowledgeSummary(fighter).safeSummary, "Resumen seguro fighter"); equal(buildKnowledgeSummary(fighter).advisoryOnly, true); equal(buildKnowledgeValiditySummary(fighter, NOW).effectiveState, "current"); equal(fighterEntry.recurrence?.independentSourceCount, 2); equal(buildKnowledgeFeedbackSummary(feedback(fighter)).classification, "reinforce");
  const recommendation = retrieval.recommendations[0]; const candidate = retrieval.candidates.find((entry) => entry.knowledgeId === recommendation.knowledgeId); equal(buildKnowledgeRecommendationSummary(recommendation, candidate).requiresCurrentEvidence, true); check(buildKnowledgeRecommendationSummary(recommendation, candidate).limitations.includes("current_evidence_required"));
  const contradictory = governKnowledge({items: [fighter, item("fighter-conflict", "fighter", "fighter:alpha", "different")], evaluatedAt: NOW}); check(contradictory.conflicts.length > 0); equal(buildKnowledgeConflictSummary(contradictory.conflicts[0]).requiresCurrentEvidence, true);
  const reviewed = applyKnowledgeCenterLifecycleAction(snapshot, {kind: "mark_review", knowledgeId: fighter.id, occurredAt: LATER, reasonCode: "operator_review_requested"}); equal(reviewed.governance.activeItems.find((entry) => entry.id !== fighter.id && entry.references.some((ref) => ref.id === fighter.id))?.validity.state, "under_review"); equal(reviewed.governance.items.some((entry) => entry.id === fighter.id), true); equal(reviewed.retrieval, undefined, "lifecycle change clears old retrieval");
  const invalidated = applyKnowledgeCenterLifecycleAction(snapshot, {kind: "invalidate", knowledgeId: fighter.id, occurredAt: LATER, reasonCode: "false_match"}); equal(invalidated.governance.activeItems.some((entry) => entry.validity.state === "invalidated"), true); equal(invalidated.governance.items.length, snapshot.governance.items.length + 1);
  const superseded = applyKnowledgeCenterLifecycleAction(snapshot, {kind: "supersede", knowledgeId: fighter.id, supersededByKnowledgeId: replacement.id, occurredAt: LATER, reasonCode: "newer_evidence"}); equal(superseded.governance.activeItems.some((entry) => entry.validity.state === "superseded"), true); check(superseded.governance.items.some((entry) => entry.id === fighter.id));
  assert.throws(() => applyKnowledgeCenterLifecycleAction(snapshot, {kind: "supersede", knowledgeId: fighter.id, supersededByKnowledgeId: event.id, occurredAt: LATER, reasonCode: "wrong_subject"}), /replacement_invalid/); assertions += 1;
  const stale = buildKnowledgeCenterViewModel(snapshot, "2027-01-01T00:00:00.000Z"); equal(stale.availability, "ready", "current knowledge is not timestamp-stale without a temporal window");
  const ordered = buildKnowledgeCenterViewModel(snapshot, NOW); const reversed = buildKnowledgeCenterViewModel(createKnowledgeCenterSnapshot({...snapshot, governance: governKnowledge({items: [...governance.items].reverse(), evaluatedAt: NOW}), updatedAt: LATER}), NOW); deepEqual(ordered.entries.map((entry) => entry.summary.fingerprint), reversed.entries.map((entry) => entry.summary.fingerprint));
  equal(knowledgeCenterSecurity.pure, true); equal(knowledgeCenterSecurity.createsStores, false); equal(knowledgeCenterSecurity.launchesPlanners, false); equal(knowledgeCenterSecurity.invokesExecutors, false); equal(knowledgeCenterSecurity.launchesSchedulers, false); equal(knowledgeCenterSecurity.accessesSanity, false); equal(knowledgeCenterSecurity.accessesNetwork, false); equal(knowledgeCenterSecurity.autoAppliesRecommendations, false); equal(knowledgeCenterSecurity.writes, false); equal(knowledgeCenterSecurity.replacesCurrentEvidence, false);
  const sources = ["center.ts", "centerTypes.ts", "../components/KnowledgeCenter.tsx"].map((file) => readFileSync(new URL(`../_laboratorio/laboratorio-ia/src/review/knowledge/${file}`, import.meta.url), "utf8")).join("\n");
  check(!sources.includes("fetch(")); check(!sources.includes("localStorage")); check(!/rawPayload/i.test(sources)); check(!sources.includes("execute(")); check(!sources.includes("createKnowledgeItem("));
  console.log(`AU9 B6 Knowledge Center tests: OK (${assertions} assertions; lifecycle, history, retrieval, recommendations, feedback, safe summaries, unsupported image and zero writes)`);
}
main();
