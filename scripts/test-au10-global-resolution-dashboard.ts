import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  assembleGlobalResolutionDashboard,
  buildCrossCaseGraph,
  buildGlobalResolutionDashboard,
  buildOperationalWorkspaceViewModel,
  crossCaseIntelligenceSecurity,
  globalResolutionDashboardSecurity,
  projectGlobalDashboardCase,
  type CrossCaseGraph,
  type GlobalDashboardCaseProjection,
  type GlobalDashboardFilters,
  type NucleusPrimaryAction,
  type ReviewCase,
} from "../_laboratorio/laboratorio-ia/src/review";

const NOW = "2026-08-10T10:00:00.000Z";
let assertions = 0;
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const deepEqual = (actual: unknown, expected: unknown, message?: string): void => { assert.deepEqual(actual, expected, message); assertions += 1; };

function reviewCase(id: string, overrides: Partial<ReviewCase> = {}): ReviewCase {
  return {schemaVersion: 1, id, dedupeKey: `dedupe:${id}`, module: "external.news", title: `Caso ${id}`, status: "open", priority: "normal", subject: {type: "news", id: `news:${id}`}, issues: [], resolutions: [], context: {producer: "producer:default", token: `token:${id}`, payloadSnapshot: {raw: `payload:${id}`}}, createdAt: "2026-06-01T10:00:00.000Z", updatedAt: NOW, version: 1, resumeAttempts: 0, ...overrides};
}

const actions: Readonly<Record<string, NucleusPrimaryAction>> = Object.freeze({
  analyze: Object.freeze({kind: "analyze", label: "Analizar", actionClass: "pure_transform", risk: "low", target: "evidence", reasonCodes: [], enabled: true}),
  authorize: Object.freeze({kind: "authorize", label: "Autorizar", actionClass: "human_decision", risk: "high", target: "execution", reasonCodes: ["authorization_required"], enabled: true}),
  reconcile: Object.freeze({kind: "reconcile", label: "Reconciliar", actionClass: "human_decision", risk: "high", target: "execution", reasonCodes: ["reconciliation_required"], enabled: true}),
  compensate: Object.freeze({kind: "compensate", label: "Compensar", actionClass: "human_decision", risk: "destructive", target: "execution", reasonCodes: ["compensation_required"], enabled: true}),
  human: Object.freeze({kind: "human_review", label: "Revisar manualmente", actionClass: "human_decision", risk: "high", target: "case", reasonCodes: ["human_required"], enabled: true}),
  continue: Object.freeze({kind: "continue", label: "Continuar", actionClass: "external_effect", risk: "medium", target: "execution", reasonCodes: [], enabled: true}),
  none: Object.freeze({kind: "none", label: "Sin acción", actionClass: "read_only", risk: "low", target: "none", reasonCodes: [], enabled: false}),
});

function projected(value: ReviewCase, overrides: Partial<GlobalDashboardCaseProjection> = {}): GlobalDashboardCaseProjection {
  const base = projectGlobalDashboardCase(value, NOW);
  return Object.freeze({...base, ...overrides});
}

function main(): void {
  const raw = [
    reviewCase("safe-open", {context: {producer: "producer:alpha", token: "secret-dashboard"}, subject: {type: "fighter", id: "fighter:safe"}, priority: "low"}),
    reviewCase("supervised", {status: "in_review", context: {producer: "producer:beta"}, subject: {type: "event", id: "event:supervised"}}),
    reviewCase("resolved", {status: "resolved", resolvedAt: NOW, priority: "low"}),
    reviewCase("blocked-a", {dedupeKey: "duplicate:blocked", subject: {type: "fighter", id: "fighter:blocked"}, priority: "critical"}),
    reviewCase("blocked-b", {dedupeKey: "duplicate:blocked", subject: {type: "fighter", id: "fighter:blocked"}, priority: "high"}),
    reviewCase("stale", {status: "stale"}),
    reviewCase("unsupported", {subject: {type: "image", id: "image:one"}}),
    reviewCase("auth-a"), reviewCase("auth-b"), reviewCase("recon-a"), reviewCase("recon-b"), reviewCase("compensation", {priority: "critical"}), reviewCase("human"),
  ];
  const byId = new Map(raw.map((entry) => [entry.id, entry]));
  const p = (id: string, overrides: Partial<GlobalDashboardCaseProjection> = {}) => projected(byId.get(id)!, overrides);
  const projections: GlobalDashboardCaseProjection[] = [
    p("safe-open", {autonomy: "Autónomo seguro", risk: "low", capabilities: ["inspect:fighter"], knowledgeStates: ["current"], knowledge: {current: 2, underReview: 0, contradictory: 0, invalidated: 0, recommendations: 1, recentLearning: 1}}),
    p("supervised", {autonomy: "Autónomo supervisado", risk: "medium", action: actions.continue, nucleusState: "executing", fingerprints: ["sha256-v1:transaction-supervised"], capabilities: ["reuse:event"], timeline: [{id: "decision", order: 40, kind: "decision_made", label: "Decisión", safeSummary: "Decisión AU8.", fingerprint: "sha256-v1:decision"}, {id: "transaction", order: 60, kind: "transaction_prepared", label: "Transacción", safeSummary: "Transacción AU7.", fingerprint: "sha256-v1:transaction"}]}),
    p("resolved", {caseStatus: "resolved", nucleusState: "completed", action: actions.none, autonomy: "Autónomo seguro"}),
    p("blocked-a", {nucleusState: "blocked", blocked: true, missingExecutor: true, action: actions.human, capabilities: ["create:fighter"], blockers: ["missing_required_capability"], knowledgeStates: ["contradictory"], knowledge: {current: 0, underReview: 0, contradictory: 1, invalidated: 0, recommendations: 0, recentLearning: 0}}),
    p("blocked-b", {nucleusState: "blocked", blocked: true, missingExecutor: true, action: actions.human, capabilities: ["create:fighter"], blockers: ["missing_required_capability"]}),
    p("stale", {caseStatus: "stale", nucleusState: "stale", stale: true, knowledgeStates: ["invalidated"], knowledge: {current: 0, underReview: 0, contradictory: 0, invalidated: 2, recommendations: 0, recentLearning: 0}}),
    p("unsupported", {nucleusState: "unsupported", unsupported: true, action: actions.none}),
    p("auth-a", {nucleusState: "awaiting_authorization", authorizationRequired: true, action: actions.authorize, risk: "high"}),
    p("auth-b", {nucleusState: "awaiting_authorization", authorizationRequired: true, action: actions.authorize, risk: "high"}),
    p("recon-a", {nucleusState: "reconciliation_required", reconciliationRequired: true, action: actions.reconcile, risk: "high"}),
    p("recon-b", {nucleusState: "reconciliation_required", reconciliationRequired: true, action: actions.reconcile, risk: "high"}),
    p("compensation", {nucleusState: "compensation_required", compensationRequired: true, action: actions.compensate, risk: "destructive"}),
    p("human", {nucleusState: "human_review_required", humanReviewRequired: true, action: actions.human, risk: "high", knowledgeStates: ["under_review"], knowledge: {current: 0, underReview: 1, contradictory: 0, invalidated: 0, recommendations: 2, recentLearning: 2}}),
  ];

  const baseGraph = buildCrossCaseGraph({cases: raw, evaluatedAt: NOW});
  const seedRelation = baseGraph.relations.find((entry) => entry.caseIds.includes("blocked-a") && entry.caseIds.includes("blocked-b"))!;
  check(seedRelation, "B3 duplicate relation required");
  const sharedConflict = Object.freeze({...seedRelation, relationId: "cross:shared-conflict", kind: "shared_conflict" as const, safeReason: "Conflicto AU9 compartido.", relationFingerprint: "sha256-v1:shared-conflict"});
  const graph: CrossCaseGraph = Object.freeze({...baseGraph, relations: Object.freeze([...baseGraph.relations, sharedConflict]), graphFingerprint: "sha256-v1:dashboard-graph"});
  const build = (items = projections, filters?: GlobalDashboardFilters, customGraph = graph, limits?: {priorityCases?: number; activity?: number; timeline?: number; relations?: number; bottlenecks?: number}) => assembleGlobalResolutionDashboard({projections: items, crossCaseGraph: customGraph, evaluatedAt: NOW, filters, limits});
  const dashboard = build();

  equal(dashboard.version, "1.0.0"); equal(dashboard.summary.totalCases, 13); equal(dashboard.summary.open, 11); equal(dashboard.summary.resolved, 1); equal(dashboard.summary.blocked, 2); equal(dashboard.summary.stale, 1); equal(dashboard.summary.unsupported, 1); equal(dashboard.summary.authorizationRequired, 2); equal(dashboard.summary.reconciliationRequired, 2); equal(dashboard.summary.compensationRequired, 1); equal(dashboard.summary.humanReviewRequired, 1); check(dashboard.summary.autonomousSafe > 0); equal(dashboard.summary.autonomousSupervised, 1);
  equal(dashboard.health.state, "critical"); check(dashboard.health.reasonCodes.includes("compensation_required")); check(dashboard.health.reasonCodes.includes("shared_conflict"));

  const healthy = build([p("resolved", {caseStatus: "resolved", nucleusState: "completed", action: actions.none, blocked: false, stale: false, unsupported: false, missingExecutor: false})], undefined, buildCrossCaseGraph({cases: [byId.get("resolved")!], evaluatedAt: NOW})); equal(healthy.health.state, "healthy");
  const attention = build([p("auth-a", {authorizationRequired: true, action: actions.authorize})], undefined, buildCrossCaseGraph({cases: [byId.get("auth-a")!], evaluatedAt: NOW})); equal(attention.health.state, "attention");
  const degraded = build([p("stale", {caseStatus: "stale", stale: true})], undefined, buildCrossCaseGraph({cases: [byId.get("stale")!], evaluatedAt: NOW})); equal(degraded.health.state, "degraded");
  const critical = build([p("compensation", {compensationRequired: true})], undefined, buildCrossCaseGraph({cases: [byId.get("compensation")!], evaluatedAt: NOW})); equal(critical.health.state, "critical");

  equal(dashboard.activity.counts.cases_created, 13); check(dashboard.activity.counts.decisions > 0); equal(dashboard.activity.counts.transactions, 1); equal(dashboard.activity.counts.reconciliations, 2); equal(dashboard.activity.counts.outcomes, 1); check(dashboard.activity.counts.knowledge_updates >= 3); equal(dashboard.activity.recent.every((entry, index, all) => index === 0 || all[index - 1].occurredAt >= entry.occurredAt), true);

  const bottleneckKinds = dashboard.bottlenecks.map((entry) => entry.kind);
  check(bottleneckKinds.includes("capability_blocked")); check(bottleneckKinds.includes("missing_executor")); check(bottleneckKinds.includes("repeated_authorization")); check(bottleneckKinds.includes("recurring_reconciliation")); check(bottleneckKinds.includes("stale_cases")); check(bottleneckKinds.includes("unsupported_entity_type")); check(bottleneckKinds.includes("shared_conflict")); check(bottleneckKinds.includes("shared_blocker")); check(dashboard.bottlenecks.every((entry) => entry.advisoryOnly && entry.safeCause.length > 10 && entry.requiredAction.length > 10));

  check(dashboard.crossCase.clusters.length > 0); check(dashboard.crossCase.relatedCaseCount >= 2); check(dashboard.crossCase.duplicateCandidateCount > 0); check(dashboard.crossCase.sharedBlockerCount > 0); check(dashboard.crossCase.coordinatedResolutionOpportunities > 0); equal(dashboard.crossCase.advisoryOnly, true);
  equal(dashboard.knowledge.current, 2); equal(dashboard.knowledge.contradictory, 1); equal(dashboard.knowledge.underReview, 1); equal(dashboard.knowledge.invalidated, 2); equal(dashboard.knowledge.recommendationsRelevant, 3); equal(dashboard.knowledge.recentLearning, 3); equal(dashboard.knowledge.advisoryOnly, true); equal(dashboard.knowledge.replacesCurrentEvidence, false);

  check(dashboard.priorityCases.length > 0); equal(dashboard.priorityCases.every((entry, index, all) => index === 0 || all[index - 1].impact > entry.impact || (all[index - 1].impact === entry.impact && all[index - 1].priorityFingerprint <= entry.priorityFingerprint)), true); check(dashboard.priorityCases.every((entry) => entry.explanation.length === 7)); check(dashboard.priorityCases.every((entry) => Object.values(entry.components).reduce((sum, value) => sum + value, 0) === entry.impact)); check(dashboard.priorityCases[0].explanation.some((entry) => entry.startsWith("severity:"))); check(dashboard.priorityCases[0].explanation.some((entry) => entry.startsWith("cross_case_impact:")));
  deepEqual(build([...projections].reverse()), dashboard, "ranking and dashboard must be deterministic regardless of snapshot order");

  const filterCases: readonly [GlobalDashboardFilters, number][] = [
    [{status: "resolved"}, 1], [{producer: "producer:alpha"}, 1], [{entityType: "fighter"}, 3], [{severity: "critical"}, 2], [{autonomy: "Autónomo supervisado"}, 1], [{risk: "destructive"}, 1], [{capability: "create:fighter"}, 2], [{knowledgeState: "under_review"}, 1],
  ];
  for (const [filters, count] of filterCases) { const filtered = build(projections, filters); equal(filtered.filteredCaseCount, count, JSON.stringify(filters)); equal(filtered.scopedSummary.totalCases, count); equal(filtered.summary.totalCases, 13, "global total must not be rewritten by UI filters"); }
  check(dashboard.facets.statuses.includes("resolved")); check(dashboard.facets.producers.includes("producer:alpha")); check(dashboard.facets.capabilities.includes("create:fighter")); check(dashboard.facets.knowledgeStates.includes("contradictory"));

  const limited = build(projections, undefined, graph, {priorityCases: 2, activity: 3, timeline: 2, relations: 1, bottlenecks: 2}); equal(limited.priorityCases.length, 2); equal(limited.activity.recent.length, 3); equal(limited.timeline.length, 2); equal(limited.crossCase.relations.length, 1); equal(limited.bottlenecks.length, 2); equal(limited.performance.outputLimited, true); equal(limited.performance.lazyHeavySections, true); equal(limited.performance.persistsFilters, false); equal(limited.performance.fullSortComplexity, "O(n log n)");
  equal(dashboard.timeline.every((entry, index) => entry.order === index + 1), true); equal(new Set(dashboard.timeline.map((entry) => entry.fingerprint)).size, dashboard.timeline.length);

  equal(dashboard.advisoryOnly, true); equal(dashboard.replacesCurrentEvidence, false); equal(dashboard.presentationOnly, true); equal(dashboard.persistsState, false); equal(dashboard.invokesExecutors, false); equal(dashboard.writes, false);
  const serialized = JSON.stringify(dashboard); check(!serialized.includes("secret-dashboard")); check(!serialized.includes("token:")); check(!serialized.includes("payload:")); check(!serialized.includes("payloadSnapshot"));
  assert.throws(() => assembleGlobalResolutionDashboard({projections: [], crossCaseGraph: baseGraph, evaluatedAt: "invalid"}), /evaluated_at_invalid/); assertions += 1;
  const integrated = buildGlobalResolutionDashboard({cases: raw, evaluatedAt: NOW, limits: {priorityCases: 3}}); equal(integrated.summary.totalCases, raw.length); equal(integrated.priorityCases.length, 3); equal(integrated.crossCase.advisoryOnly, true);

  const workspace = buildOperationalWorkspaceViewModel({reviewCase: raw[0], evaluatedAt: NOW}); equal(workspace.zones.length, 6); equal(workspace.onePrimaryAction, true); equal(workspace.writes, false);
  const b3Replay = buildCrossCaseGraph({cases: [...raw].reverse(), evaluatedAt: NOW}); deepEqual(b3Replay, buildCrossCaseGraph({cases: raw, evaluatedAt: NOW})); equal(crossCaseIntelligenceSecurity.writes, false);
  equal(globalResolutionDashboardSecurity.pure, true); equal(globalResolutionDashboardSecurity.derivesSnapshotsOnly, true); equal(globalResolutionDashboardSecurity.createsStores, false); equal(globalResolutionDashboardSecurity.createsEngines, false); equal(globalResolutionDashboardSecurity.createsPlanners, false); equal(globalResolutionDashboardSecurity.createsExecutors, false); equal(globalResolutionDashboardSecurity.createsSchedulers, false); equal(globalResolutionDashboardSecurity.createsAuthority, false); equal(globalResolutionDashboardSecurity.persistsFilters, false); equal(globalResolutionDashboardSecurity.persistsTimeline, false); equal(globalResolutionDashboardSecurity.accessesSanity, false); equal(globalResolutionDashboardSecurity.accessesNetwork, false); equal(globalResolutionDashboardSecurity.invokesExecutors, false); equal(globalResolutionDashboardSecurity.mutatesCases, false); equal(globalResolutionDashboardSecurity.autoAppliesKnowledge, false); equal(globalResolutionDashboardSecurity.autoExecutes, false); equal(globalResolutionDashboardSecurity.exposesPayloads, false); equal(globalResolutionDashboardSecurity.exposesTokens, false); equal(globalResolutionDashboardSecurity.advisoryOnly, true); equal(globalResolutionDashboardSecurity.replacesCurrentEvidence, false); equal(globalResolutionDashboardSecurity.writes, false);

  const source = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/nucleus/dashboard.ts", import.meta.url), "utf8"); check(!/from ["'][^"']*(store|executor|sanity)/i.test(source)); check(!source.includes("fetch(")); check(!source.includes("localStorage")); check(!source.includes("payloadSnapshot"));
  const ui = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/components/NucleusGlobalDashboard.tsx", import.meta.url), "utf8"); check(ui.includes("Global Resolution Dashboard")); check(ui.includes("LazyDashboardDetails")); check(ui.includes("<Suspense fallback=")); check(ui.includes("aria-busy")); check(ui.includes("role=\"status\"")); check(ui.includes("role=\"alert\"")); check(ui.includes("aria-expanded")); check(ui.includes("aria-controls")); check(ui.includes("Limpiar filtros")); check(!ui.includes("localStorage")); check(!ui.includes("execute("));
  const details = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/components/GlobalResolutionDashboardDetails.tsx", import.meta.url), "utf8"); check(details.includes("Inteligencia transversal")); check(details.includes("Cuellos de botella")); check(details.includes("Conocimiento")); check(details.includes("Actividad reciente"));
  const reviewCenter = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/components/ReviewCenter.tsx", import.meta.url), "utf8"); check(reviewCenter.includes("<NucleusGlobalDashboard"));
  const css = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/styles.css", import.meta.url), "utf8"); check(css.includes("@media (max-width: 900px)")); check(css.includes("@media (max-width: 560px)")); check(css.includes("@media (max-width: 390px)")); check(css.includes("prefers-reduced-motion"));
  console.log(`AU10 B4 Global Resolution Dashboard tests: OK (${assertions} assertions; 47 acceptance areas, model, health, activity, bottlenecks, B3, knowledge, ranking, filters, limits, UI and zero writes)`);
}

main();
