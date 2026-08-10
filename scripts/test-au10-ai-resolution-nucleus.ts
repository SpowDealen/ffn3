import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  buildKnowledgeProvenance,
  buildKnowledgeSource,
  createKnowledgeCenterSnapshot,
  createKnowledgeItem,
  deriveNucleusCompletion,
  deriveNucleusState,
  derivePrimaryNucleusAction,
  governKnowledge,
  knowledgeCenterSecurity,
  nucleusResolutionSecurity,
  withKnowledgeCenterSnapshot,
  buildNucleusResolutionViewModel,
  buildNucleusSummary,
  buildNucleusEvidenceSummary,
  buildNucleusResolutionSummary,
  buildNucleusExecutionSummary,
  buildNucleusKnowledgeSummary,
  buildNucleusCompletionSummary,
  type KnowledgeItem,
  type NucleusAuthorityFacts,
  type NucleusResolutionState,
  type ReviewCase,
} from "../_laboratorio/laboratorio-ia/src/review";
import {computeUniversalFingerprint} from "../_laboratorio/laboratorio-ia/src/review/universal";

const NOW = "2026-08-10T10:00:00.000Z";
let assertions = 0;
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const deepEqual = (actual: unknown, expected: unknown, message?: string): void => { assert.deepEqual(actual, expected, message); assertions += 1; };
const fp = (value: string) => computeUniversalFingerprint(value);

const baseFacts: NucleusAuthorityFacts = Object.freeze({supported: true, stale: false, hasAnalysis: false, analyzing: false, investigating: false, identityResolved: true, planReady: true, authorizationPending: false, transactionRequired: false, transactionStarted: false, transactionExecuting: false, transactionCompleted: false, observing: false, reconciliationPending: false, compensationPending: false, humanReviewPending: false, blocked: false, caseMarkedResolved: false, evidenceSufficient: false, contradiction: false, strategyCompleted: false, outcomeVerifiable: false});
const facts = (overrides: Partial<NucleusAuthorityFacts> = {}): NucleusAuthorityFacts => Object.freeze({...baseFacts, ...overrides});
const expectState = (expected: NucleusResolutionState, overrides: Partial<NucleusAuthorityFacts>): void => equal(deriveNucleusState(facts(overrides)), expected, `state ${expected}`);

function reviewCase(overrides: Partial<ReviewCase> = {}): ReviewCase {
  return {schemaVersion: 1, id: "case:nucleus", dedupeKey: "case:nucleus", module: "external.news", title: "Caso unificado", status: "open", priority: "high", subject: {type: "news", id: "news:one"}, issues: [{id: "identity", kind: "missing_entity", valueKind: "fighter", label: "Luchador", message: "Identidad del luchador pendiente", required: true, blocking: true}], resolutions: [], context: {producer: "review_center", token: "must-not-leak", payloadSnapshot: {raw: "raw-payload-must-not-leak"}}, createdAt: NOW, updatedAt: NOW, version: 1, resumeAttempts: 0, ...overrides};
}

function knowledgeItem(state: "current" | "invalidated" = "current"): KnowledgeItem {
  const source = buildKnowledgeSource({sourceId: `source:${state}`, kind: "outcome", authority: "editorial_confirmed", sourceVersion: "AU7", observedAt: NOW, independenceGroup: `group:${state}`});
  const provenance = buildKnowledgeProvenance({caseId: "case:nucleus", caseVersion: 1, producerId: "review_center", engineVersions: {checkpoint: "AU3", inspection: "AU4", identity: "AU5", resolution: "AU6", transaction: "AU7", decision: "AU8", outcome: "AU7"}, inspectionFingerprints: [fp("inspection")], identityFingerprints: [fp("identity")], outcomeFingerprints: [fp("outcome")], memoryFingerprints: []});
  return createKnowledgeItem({domain: "fighter", kind: state === "invalidated" ? "invalidated_knowledge" : "confirmed_fact", subjectKey: `fighter:${state}`, claimCode: "fighter.identity", safeSummary: `Conocimiento seguro ${state}`, authority: "editorial_confirmed", observations: [{claimCode: "fighter.identity", subjectKey: `fighter:${state}`, polarity: "supports", safeSummary: "Observación segura", valueFingerprint: fp(state), evidenceFingerprints: [fp(`evidence:${state}`)], sourceIds: [source.sourceId], observedAt: NOW}], sources: [source], references: [{kind: "case", id: "case:nucleus", relation: "derived_from"}], validity: {state, validFrom: NOW, invalidatedAt: state === "invalidated" ? NOW : undefined, invalidationReasonCode: state === "invalidated" ? "explicit_test" : undefined, evaluatedAt: NOW}, provenance}, () => NOW);
}

function withKnowledge(items: readonly KnowledgeItem[]): ReviewCase {
  const governance = governKnowledge({items, evaluatedAt: NOW});
  const snapshot = createKnowledgeCenterSnapshot({caseId: "case:nucleus", caseVersion: 1, governance, recurrence: [], feedback: [], createdAt: NOW, updatedAt: NOW});
  const base = reviewCase({issues: [], resolutions: []});
  return {...base, context: withKnowledgeCenterSnapshot(base.context, snapshot)};
}

function main(): void {
  expectState("idle", {});
  expectState("analyzing", {analyzing: true});
  expectState("investigating", {investigating: true});
  expectState("resolving_identity", {identityResolved: false});
  expectState("planning", {planReady: false});
  expectState("awaiting_authorization", {authorizationPending: true});
  expectState("executing", {transactionRequired: true, transactionStarted: true});
  expectState("reconciliation_required", {reconciliationPending: true});
  expectState("compensation_required", {compensationPending: true});
  expectState("human_review_required", {humanReviewPending: true});
  expectState("blocked", {blocked: true});
  const completeFacts = facts({evidenceSufficient: true, strategyCompleted: true, outcomeVerifiable: true, caseMarkedResolved: true});
  equal(deriveNucleusState(completeFacts), "completed");
  expectState("stale", {stale: true});
  expectState("unsupported", {supported: false});

  const ctaCases: readonly [NucleusResolutionState, string, Partial<NucleusAuthorityFacts>][] = [
    ["idle", "analyze", {}], ["investigating", "investigate", {investigating: true}], ["resolving_identity", "resolve_identity", {identityResolved: false}], ["planning", "generate_strategy", {planReady: false}], ["executing", "continue", {transactionRequired: true, transactionStarted: true}], ["awaiting_authorization", "authorize", {authorizationPending: true}], ["reconciliation_required", "reconcile", {reconciliationPending: true}], ["compensation_required", "compensate", {compensationPending: true}], ["human_review_required", "human_review", {humanReviewPending: true}], ["stale", "regenerate", {stale: true}], ["observing", "finish", {evidenceSufficient: true, strategyCompleted: true, outcomeVerifiable: true}],
  ];
  for (const [state, action, override] of ctaCases) equal(derivePrimaryNucleusAction(state, facts(override)).kind, action);
  equal(derivePrimaryNucleusAction("unsupported", facts({supported: false})).enabled, false); equal(derivePrimaryNucleusAction("completed", completeFacts).kind, "none");

  const validCompletion = deriveNucleusCompletion(facts({evidenceSufficient: true, strategyCompleted: true, outcomeVerifiable: true})); equal(validCompletion.eligible, true); equal(validCompletion.completed, false);
  equal(deriveNucleusCompletion(facts({evidenceSufficient: true, strategyCompleted: true, outcomeVerifiable: true, blocked: true})).eligible, false);
  equal(deriveNucleusCompletion(facts({evidenceSufficient: true, strategyCompleted: true, outcomeVerifiable: true, stale: true})).eligible, false, "stale prevents completion");
  equal(deriveNucleusCompletion(facts({evidenceSufficient: true, strategyCompleted: true, outcomeVerifiable: true, transactionRequired: true})).eligible, false);
  equal(deriveNucleusCompletion(facts({evidenceSufficient: true, strategyCompleted: true, outcomeVerifiable: true, contradiction: true})).eligible, false);

  const model = buildNucleusResolutionViewModel({reviewCase: reviewCase(), evaluatedAt: NOW});
  equal(model.version, "1.0.0"); equal(model.sourceAuthorities.length, 8); deepEqual(model.sourceAuthorities, ["AU2", "AU3", "AU4", "AU5", "AU6", "AU7", "AU8", "AU9"]);
  equal(model.identity.resolved, false); equal(model.state, "resolving_identity"); equal(model.primaryAction.kind, "resolve_identity"); equal(model.presentationOnly, true); equal(model.persistsState, false); equal(model.invokesExecutors, false); equal(model.writes, false);
  check(typeof model.resolution.status === "string"); check(typeof model.execution.state === "string"); check(typeof model.autonomy.visibility === "string"); check(model.knowledge.advisoryOnly); check(model.knowledge.currentEvidencePrevails);
  const serialized = JSON.stringify(model); check(!serialized.includes("must-not-leak")); check(!serialized.includes("raw-payload-must-not-leak")); check(!serialized.toLowerCase().includes("chain-of-thought")); check(!serialized.toLowerCase().includes("authorization bearer"));

  for (const summary of [buildNucleusSummary(model), buildNucleusEvidenceSummary(model), buildNucleusResolutionSummary(model), buildNucleusExecutionSummary(model), buildNucleusKnowledgeSummary(model), buildNucleusCompletionSummary(model)]) { check(summary.length > 10); check(!summary.includes("must-not-leak")); }
  equal(model.timeline.every((event, index, all) => index === 0 || all[index - 1].order <= event.order), true); equal(new Set(model.timeline.map((event) => event.fingerprint)).size, model.timeline.length); check(model.timeline.every((event) => !JSON.stringify(event).includes("payload")));

  const currentKnowledge = buildNucleusResolutionViewModel({reviewCase: withKnowledge([knowledgeItem("current")]), evaluatedAt: NOW}); equal(currentKnowledge.knowledge.relevant, 1); equal(currentKnowledge.knowledge.advisoryOnly, true);
  const invalidatedKnowledge = buildNucleusResolutionViewModel({reviewCase: withKnowledge([knowledgeItem("invalidated")]), evaluatedAt: NOW}); equal(invalidatedKnowledge.knowledge.relevant, 0); equal(invalidatedKnowledge.knowledge.recommendations, 0);
  const unsupported = buildNucleusResolutionViewModel({reviewCase: reviewCase({subject: {type: "image"}}), evaluatedAt: NOW}); equal(unsupported.state, "unsupported"); check(unsupported.unsupported[0].includes("No soportado todavía")); equal(unsupported.primaryAction.enabled, false);

  equal(nucleusResolutionSecurity.pure, true); equal(nucleusResolutionSecurity.createsEngines, false); equal(nucleusResolutionSecurity.createsStores, false); equal(nucleusResolutionSecurity.invokesExecutors, false); equal(nucleusResolutionSecurity.accessesSanity, false); equal(nucleusResolutionSecurity.autoAppliesKnowledge, false); equal(nucleusResolutionSecurity.writes, false); equal(knowledgeCenterSecurity.replacesCurrentEvidence, false);
  const modelSource = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/nucleus/model.ts", import.meta.url), "utf8");
  check(!/from ["'][^"']*(executor|sanity|store)/i.test(modelSource)); check(!modelSource.includes("fetch(")); check(!modelSource.includes("localStorage")); check(!modelSource.includes("payloadSnapshot")); check(!modelSource.includes("chain-of-thought"));
  const detailsSource = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/components/ReviewCaseDetails.tsx", import.meta.url), "utf8"); equal((detailsSource.match(/<AIResolutionNucleus/g) ?? []).length, 1); equal(detailsSource.includes("<TransactionOperationalCenter"), false); equal(detailsSource.includes("<KnowledgeCenter"), false);
  const uiSource = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/components/AIResolutionNucleus.tsx", import.meta.url), "utf8"); check(uiSource.includes("aria-busy")); check(uiSource.includes("role=\"alert\"")); check(uiSource.includes("role=\"status\"")); check(uiSource.includes("tabIndex={-1}")); check(uiSource.includes("La evidencia actual prevalece")); check(!uiSource.includes("Forzar ejecución"));
  console.log(`AU10 B1 AI Resolution Nucleus tests: OK (${assertions} assertions; unified state/CTA, AU2–AU9 composition, completion, safe timeline, unsupported visibility and zero writes)`);
}

main();
