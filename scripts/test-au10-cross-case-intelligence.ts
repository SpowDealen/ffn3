import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  buildCrossCaseGraph,
  buildKnowledgeProvenance,
  buildKnowledgeSource,
  buildOperationalWorkspaceViewModel,
  createKnowledgeCenterSnapshot,
  createKnowledgeItem,
  crossCaseIntelligenceSecurity,
  governKnowledge,
  relationsForCase,
  withKnowledgeCenterSnapshot,
  type CrossCaseRelationKind,
  type KnowledgeItem,
  type ReviewCase,
} from "../_laboratorio/laboratorio-ia/src/review";
import {computeUniversalFingerprint} from "../_laboratorio/laboratorio-ia/src/review/universal";

const NOW = "2026-08-10T10:00:00.000Z";
let assertions = 0;
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const deepEqual = (actual: unknown, expected: unknown, message?: string): void => { assert.deepEqual(actual, expected, message); assertions += 1; };
const fp = (value: string) => computeUniversalFingerprint(value);

function reviewCase(id: string, overrides: Partial<ReviewCase> = {}): ReviewCase {
  return {schemaVersion: 1, id, dedupeKey: `dedupe:${id}`, module: "external.news", title: `Caso ${id}`, status: "open", priority: "normal", subject: {type: "news", id: `news:${id}`}, issues: [], resolutions: [], context: {producer: `producer:${id}`, token: `secret:${id}`, payloadSnapshot: {raw: `payload:${id}`}}, createdAt: NOW, updatedAt: NOW, version: 1, resumeAttempts: 0, ...overrides};
}

function kinds(graph: ReturnType<typeof buildCrossCaseGraph>, caseId: string): CrossCaseRelationKind[] {
  return relationsForCase(graph, caseId).map((entry) => entry.kind);
}

function compactCheckpoint(caseId: string, planFingerprint: string, transactionFingerprint: string, capability = "reuse:fighter"): ReviewCase["globalResolution"] {
  return {
    caseId, caseVersion: 1, producer: "producer:checkpoint", planFingerprint, phase: "planned",
    plan: {requiredCapabilities: [capability], operations: []},
    transaction: {transactionFingerprint},
  } as unknown as ReviewCase["globalResolution"];
}

function governedItem(): KnowledgeItem {
  const source = buildKnowledgeSource({sourceId: "source:shared", kind: "outcome", authority: "editorial_confirmed", sourceVersion: "AU7", observedAt: NOW, independenceGroup: "official:shared"});
  const provenance = buildKnowledgeProvenance({caseId: "case:origin", caseVersion: 1, producerId: "review_center", engineVersions: {checkpoint: "AU3", inspection: "AU4", identity: "AU5", resolution: "AU6", transaction: "AU7", decision: "AU8", outcome: "AU7"}, inspectionFingerprints: [fp("inspection")], identityFingerprints: [fp("identity")], outcomeFingerprints: [fp("outcome")], memoryFingerprints: []});
  return createKnowledgeItem({domain: "fighter", kind: "confirmed_fact", subjectKey: "fighter:shared-knowledge", claimCode: "fighter.identity", safeSummary: "Identidad gobernada vigente", authority: "editorial_confirmed", observations: [{claimCode: "fighter.identity", subjectKey: "fighter:shared-knowledge", polarity: "supports", safeSummary: "Confirmación editorial", valueFingerprint: fp("shared-value"), evidenceFingerprints: [fp("shared-evidence")], sourceIds: [source.sourceId], observedAt: NOW}], sources: [source], references: [{kind: "case", id: "case:origin", relation: "derived_from"}], validity: {state: "current", validFrom: NOW, evaluatedAt: NOW}, provenance}, () => NOW);
}

function withKnowledge(reviewCaseValue: ReviewCase, item: KnowledgeItem): ReviewCase {
  const governance = governKnowledge({items: [item], evaluatedAt: NOW});
  const snapshot = createKnowledgeCenterSnapshot({caseId: reviewCaseValue.id, caseVersion: reviewCaseValue.version, governance, recurrence: [], feedback: [], createdAt: NOW, updatedAt: NOW});
  return {...reviewCaseValue, context: withKnowledgeCenterSnapshot(reviewCaseValue.context, snapshot)};
}

function main(): void {
  const fighterA = reviewCase("fighter-a", {subject: {type: "fighter", sanityId: "fighter:ilia"}, context: {producer: "feed:a", token: "fighter-secret-a"}});
  const fighterB = reviewCase("fighter-b", {subject: {type: "news", id: "news:fighter-b"}, issues: [{id: "fighter", kind: "ambiguous_reference", valueKind: "fighter", label: "Luchador", message: "Seleccionar", candidates: [{id: "candidate:ilia", label: "Ilia", value: {}, sanityId: "fighter:ilia"}]}], resolutions: [{type: "select_candidate", issueId: "fighter", candidateId: "candidate:ilia"}], context: {producer: "feed:b", payloadSnapshot: {secret: "fighter-secret-b"}}});
  const fighterGraph = buildCrossCaseGraph({cases: [fighterA, fighterB], evaluatedAt: NOW});
  check(kinds(fighterGraph, fighterA.id).includes("shared_fighter"));
  equal(kinds(fighterGraph, fighterA.id).includes("merge_candidate"), false, "one shared fighter alone must not speculate a merge");

  const eventA = reviewCase("event-a", {subject: {type: "event", sanityId: "event:ufc-400"}});
  const eventB = reviewCase("event-b", {subject: {type: "event", id: "event:ufc-400"}});
  const eventGraph = buildCrossCaseGraph({cases: [eventA, eventB], evaluatedAt: NOW});
  check(kinds(eventGraph, eventA.id).includes("shared_event"));

  const duplicateA = reviewCase("duplicate-a", {dedupeKey: "canonical:duplicate", subject: {type: "news", id: "news:duplicate"}});
  const duplicateB = reviewCase("duplicate-b", {dedupeKey: "canonical:duplicate", subject: {type: "news", id: "news:duplicate"}});
  const duplicateGraph = buildCrossCaseGraph({cases: [duplicateA, duplicateB], evaluatedAt: NOW});
  check(kinds(duplicateGraph, duplicateA.id).includes("possible_duplicate_case"));
  check(kinds(duplicateGraph, duplicateA.id).includes("merge_candidate"));
  equal(duplicateGraph.relations.filter((entry) => entry.kind === "possible_duplicate_case").length, 1, "equivalent duplicate evidence must consolidate into one relation");
  check(duplicateGraph.groups.some((entry) => entry.recommendation === "compare_before_resolution" && entry.neverAutoMerged));

  const parent = reviewCase("parent");
  const child = reviewCase("child", {issues: [{id: "dependency", kind: "blocked_dependency", label: "Caso previo", message: "Espera", expected: {caseId: parent.id}, blocking: true}], context: {producer: "child", dependsOnCaseIds: [parent.id], blockedByCaseId: parent.id}});
  const dependencyGraph = buildCrossCaseGraph({cases: [parent, child], evaluatedAt: NOW});
  check(kinds(dependencyGraph, child.id).includes("dependency_chain"));
  check(kinds(dependencyGraph, child.id).includes("blocked_by_other_case"));
  check(dependencyGraph.groups.some((entry) => entry.recommendation === "coordinate_dependency"));

  const multiA = reviewCase("multi-a", {subject: {type: "fighter", id: "fighter:shared"}, issues: [{id: "event", kind: "missing_reference", valueKind: "event", label: "Evento", message: "Falta", candidates: [{id: "event:shared", label: "Evento", value: {}, sanityId: "event:shared"}]}], resolutions: [{type: "select_candidate", issueId: "event", candidateId: "event:shared"}]});
  const multiB = reviewCase("multi-b", {subject: {type: "fighter", id: "fighter:shared"}, issues: [{id: "event", kind: "missing_reference", valueKind: "event", label: "Evento", message: "Falta"}], resolutions: [{type: "link_reference", issueId: "event", sanityId: "event:shared"}]});
  const multiGraph = buildCrossCaseGraph({cases: [multiA, multiB], evaluatedAt: NOW});
  check(kinds(multiGraph, multiA.id).includes("shared_fighter")); check(kinds(multiGraph, multiA.id).includes("shared_event")); check(kinds(multiGraph, multiA.id).includes("merge_candidate"));

  const txA = reviewCase("tx-a", {globalResolution: compactCheckpoint("tx-a", "sha256-v1:plan-shared", "sha256-v1:tx-shared")});
  const txB = reviewCase("tx-b", {globalResolution: compactCheckpoint("tx-b", "sha256-v1:plan-shared", "sha256-v1:tx-shared")});
  const transactionGraph = buildCrossCaseGraph({cases: [txA, txB], evaluatedAt: NOW});
  check(kinds(transactionGraph, txA.id).includes("shared_resolution")); check(kinds(transactionGraph, txA.id).includes("shared_transaction"));

  const knowledge = governedItem();
  const knowledgeGraph = buildCrossCaseGraph({cases: [withKnowledge(reviewCase("knowledge-a"), knowledge), withKnowledge(reviewCase("knowledge-b"), knowledge)], evaluatedAt: NOW});
  check(kinds(knowledgeGraph, "knowledge-a").includes("shared_knowledge"));

  const organizationGraph = buildCrossCaseGraph({cases: [reviewCase("org-a", {subject: {type: "organization", id: "org:ufc"}}), reviewCase("org-b", {subject: {type: "organization", id: "org:ufc"}})], evaluatedAt: NOW});
  check(kinds(organizationGraph, "org-a").includes("shared_organization"));
  for (const [subjectType, relationCase] of [["category", "category"], ["discipline", "discipline"], ["fight", "fight"], ["result", "result"], ["news", "news"]] as const) {
    const graph = buildCrossCaseGraph({cases: [reviewCase(`${relationCase}-a`, {subject: {type: subjectType, id: `${subjectType}:shared`}}), reviewCase(`${relationCase}-b`, {subject: {type: subjectType, id: `${subjectType}:shared`}})], evaluatedAt: NOW});
    check(graph.relations.length > 0, `${subjectType} must produce an evidence-backed relation`);
  }

  const ordered = buildCrossCaseGraph({cases: [duplicateA, duplicateB, parent, child, fighterA, fighterB], evaluatedAt: NOW});
  const reversed = buildCrossCaseGraph({cases: [fighterB, fighterA, child, parent, duplicateB, duplicateA], evaluatedAt: NOW});
  deepEqual(reversed, ordered, "snapshot order must not affect graph, ranks or fingerprints");
  equal(ordered.relations.every((entry, index, all) => index === 0 || all[index - 1].rank.total > entry.rank.total || (all[index - 1].rank.total === entry.rank.total && all[index - 1].relationFingerprint.localeCompare(entry.relationFingerprint) <= 0)), true);
  equal(new Set(ordered.relations.map((entry) => entry.relationFingerprint)).size, ordered.relations.length);
  equal(new Set(ordered.edges.map((entry) => entry.edgeId)).size, ordered.edges.length);

  const unsupported = reviewCase("image", {subject: {type: "image", id: "same"}});
  const stale = reviewCase("stale", {status: "stale", subject: {type: "fighter", id: "fighter:ilia"}});
  const exclusions = buildCrossCaseGraph({cases: [fighterA, unsupported, stale], evaluatedAt: NOW});
  deepEqual(exclusions.unsupportedCaseIds, ["image"]); deepEqual(exclusions.staleCaseIds, ["stale"]);
  equal(relationsForCase(exclusions, "image").length, 0); equal(relationsForCase(exclusions, "stale").length, 0);
  assert.throws(() => buildCrossCaseGraph({cases: [], evaluatedAt: "invalid"}), /evaluated_at_invalid/); assertions += 1;

  for (const graph of [fighterGraph, eventGraph, duplicateGraph, dependencyGraph, transactionGraph, knowledgeGraph]) {
    equal(graph.advisoryOnly, true); equal(graph.requiresCurrentEvidence, true); equal(graph.replacesCurrentEvidence, false); equal(graph.persistsGraph, false); equal(graph.writes, false);
    check(graph.relations.every((entry) => entry.advisoryOnly && entry.requiresCurrentEvidence && !entry.replacesCurrentEvidence && entry.evidence.every((evidence) => evidence.current)));
  }
  const serialized = JSON.stringify(ordered); check(!serialized.includes("secret:")); check(!serialized.includes("payload:")); check(!serialized.includes("payloadSnapshot"));
  const workspace = buildOperationalWorkspaceViewModel({reviewCase: fighterA, evaluatedAt: NOW}); equal(workspace.zones.length, 6); equal(workspace.onePrimaryAction, true); equal(workspace.writes, false);

  equal(crossCaseIntelligenceSecurity.pure, true); equal(crossCaseIntelligenceSecurity.derivesFromSnapshotOnly, true); equal(crossCaseIntelligenceSecurity.createsStores, false); equal(crossCaseIntelligenceSecurity.createsPlanners, false); equal(crossCaseIntelligenceSecurity.createsExecutors, false); equal(crossCaseIntelligenceSecurity.createsSchedulers, false); equal(crossCaseIntelligenceSecurity.createsRuntimes, false); equal(crossCaseIntelligenceSecurity.createsAuthority, false); equal(crossCaseIntelligenceSecurity.persistsGraph, false); equal(crossCaseIntelligenceSecurity.accessesSanity, false); equal(crossCaseIntelligenceSecurity.accessesNetwork, false); equal(crossCaseIntelligenceSecurity.executesOperations, false); equal(crossCaseIntelligenceSecurity.autoMerges, false); equal(crossCaseIntelligenceSecurity.speculativeRelations, false); equal(crossCaseIntelligenceSecurity.advisoryOnly, true); equal(crossCaseIntelligenceSecurity.requiresCurrentEvidence, true); equal(crossCaseIntelligenceSecurity.replacesCurrentEvidence, false); equal(crossCaseIntelligenceSecurity.writes, false);

  const engineSource = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/nucleus/crossCase.ts", import.meta.url), "utf8");
  check(!/from ["'][^"']*(store|executor|sanity)/i.test(engineSource)); check(!engineSource.includes("fetch(")); check(!engineSource.includes("localStorage")); check(!engineSource.includes("payloadSnapshot"));
  const uiSource = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/components/CrossCaseIntelligencePanel.tsx", import.meta.url), "utf8");
  check(uiSource.includes("Inteligencia transversal")); check(uiSource.includes("slice(0, 3)")); check(uiSource.includes("Evidencia:")); check(uiSource.includes("Recomendación:")); check(uiSource.includes("Ver límites")); check(!uiSource.includes("onExecute")); check(!uiSource.includes("onMerge"));
  console.log(`AU10 B3 Cross-Case Intelligence tests: OK (${assertions} assertions; graph, relations, ranking, groups, UI contract, unsupported, advisory-only and zero writes)`);
}

main();
