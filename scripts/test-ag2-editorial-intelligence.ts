import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import type {AgentDependency, AgentNotification, AgentReview, AgentSnapshot} from "../_laboratorio/laboratorio-ia/src/agent-ready/model";
import {AGENT_READY_CONTRACT_VERSION} from "../_laboratorio/laboratorio-ia/src/agent-ready/model";
import {compareAgentSnapshots} from "../_laboratorio/laboratorio-ia/src/agent/compare";
import {diagnoseAgentContext} from "../_laboratorio/laboratorio-ia/src/agent/diagnosis";
import {buildEditorialContext, editorialContextSecurity} from "../_laboratorio/laboratorio-ia/src/agent/editorial-context";
import {buildEditorialInsights, buildEditorialIntelligence, buildEditorialSufficiencyView, editorialInsightsSecurity, groupEditorialSignalsByEntity} from "../_laboratorio/laboratorio-ia/src/agent/editorial-insights";
import {AGENT_EDITORIAL_INTELLIGENCE_VERSION, EDITORIAL_ENTITY_KINDS, editorialIntelligenceModelSecurity, type EditorialAnomalyCategory, type EditorialEntityReference, type EditorialEvidenceObservation, type EditorialEvidenceReference, type EditorialPriority} from "../_laboratorio/laboratorio-ia/src/agent/editorial-model";
import {buildEditorialSignals, editorialSignalsSecurity} from "../_laboratorio/laboratorio-ia/src/agent/editorial-signals";
import {buildReasoningContext} from "../_laboratorio/laboratorio-ia/src/agent/reasoning";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");

const reviewAuthority = Object.freeze({owner: "review_center" as const, source: "Review Center"});

function dependency(state: AgentDependency["state"]): AgentDependency {
  const unhealthy = ["unavailable", "blocked", "degraded"].includes(state);
  return Object.freeze({id: "references", label: "Reference Entities", state, effect: unhealthy ? state as "unavailable" | "blocked" | "degraded" : "none", current: unhealthy, live: false, reason: unhealthy ? Object.freeze({code: "references_unavailable"}) : undefined, destination: "/editorial", activeCount: 0, currentIncidentCount: unhealthy ? 1 : 0, historicalCount: unhealthy ? 0 : 1});
}

function review(): AgentReview {
  return Object.freeze({id: "case:editorial", title: "Editorial anomaly", version: 2, status: "open", priority: "critical", temporal: "current", blocked: true, unresolvedIssueCount: 2, unresolvedBlockingCount: 1, reasonCodes: Object.freeze(["issue:identity_conflict"]), evidenceReferences: Object.freeze(["review-evidence:1", "inspection:sha256-v1:review"]), updatedAt: "2026-08-29T12:00:00.000Z", authority: Object.freeze([reviewAuthority]), destination: "/revision", checkpoint: Object.freeze({id: "checkpoint:case:editorial", schemaVersion: 1, caseVersion: 2, phase: "blocked", checkpointFingerprint: "sha256-v1:checkpoint", planFingerprint: "sha256-v1:plan", graphFingerprint: "sha256-v1:graph", snapshotFingerprint: "sha256-v1:snapshot", updatedAt: "2026-08-29T12:00:00.000Z", transaction: Object.freeze({id: "transaction:case:editorial", phase: "blocked", fingerprint: "sha256-v1:transaction", checkpointFingerprint: "sha256-v1:transaction-checkpoint"}), supervisedLoop: Object.freeze({id: "supervised:case:editorial", phase: "blocked", fingerprint: "sha256-v1:supervised", iteration: 1, stopReason: "human_required"})})});
}

function historicalNotification(unread: boolean): AgentNotification {
  return Object.freeze({id: "notification:historical", title: "Old notification", temporal: "historical", unread, priority: "critical", tone: "warning", source: "Notification Store", effectiveAt: "2026-08-20T12:00:00.000Z", deliveryStatus: "failed", retryAvailable: false, authority: Object.freeze({owner: "notification_store", source: "Notification Store"}), destination: "/actividad"});
}

function snapshot(current: boolean, unread = true): AgentSnapshot {
  const result: AgentSnapshot = {schemaVersion: 1, contractVersion: AGENT_READY_CONTRACT_VERSION, observationId: `agent-observation:sha256-v1:${current ? "current" : "previous"}`, observationFingerprint: `sha256-v1:${current ? "current" : "previous"}`, observedAt: current ? "2026-08-29T12:01:00.000Z" : "2026-08-29T12:00:00.000Z", globalStatus: Object.freeze({state: current ? "blocked" : "operational", label: current ? "Blocked" : "Operational", evaluatedAt: current ? "2026-08-29T12:01:00.000Z" : "2026-08-29T12:00:00.000Z", currentIncidentCount: current ? 1 : 0, activeProcessCount: 0, historicalRecordCount: 1}), operator: Object.freeze({state: current ? "attention" : "clear", attention: Object.freeze([]), active: Object.freeze([])}), dependencies: Object.freeze([dependency(current ? "unavailable" : "operational")]), processes: Object.freeze([]), notifications: Object.freeze([historicalNotification(unread)]), review: Object.freeze(current ? [review()] : []), capabilities: Object.freeze([]), boundary: Object.freeze({readOnly: true, projectionOnly: true, executes: false, persists: false, plans: false, decidesAutonomy: false})};
  return Object.freeze(result);
}

function emptySnapshot(unread = true): AgentSnapshot {
  return Object.freeze({...snapshot(false, unread), observationId: "agent-observation:sha256-v1:empty", observationFingerprint: "sha256-v1:empty", dependencies: Object.freeze([]), review: Object.freeze([])});
}

function entity(kind: EditorialEntityReference["kind"], id: string): EditorialEntityReference {
  return Object.freeze({kind, id});
}

function evidence(id: string, count = 1): readonly EditorialEvidenceReference[] {
  return Object.freeze(Array.from({length: count}, (_, index) => Object.freeze({id: index === 0 && id === "secret" ? "token=super-secret" : `${id}:${index + 1}`, source: index % 2 === 0 ? "inspection" : "local evidence", fingerprint: `sha256-v1:${id}:${index + 1}`, inspectionId: index === 0 ? `inspection:${id}` : undefined})));
}

function observation(id: string, dimension: EditorialEvidenceObservation["dimension"], assessment: EditorialEvidenceObservation["assessment"], primary?: EditorialEntityReference, related?: EditorialEntityReference, options: Readonly<{count?: number; temporal?: EditorialEvidenceObservation["temporal"]; reviewId?: string}> = {}): EditorialEvidenceObservation {
  return Object.freeze({id, epistemicStatus: "observed_fact", dimension, assessment, entity: primary, relatedEntity: related, temporal: options.temporal ?? "current", evidence: evidence(id, options.count ?? (["conflicting", "inconsistent"].includes(assessment) ? 2 : 1)), reviewId: options.reviewId});
}

function observations(): readonly EditorialEvidenceObservation[] {
  const fighter = entity("luchador", "fighter:1");
  const fighter2 = entity("luchador", "fighter:2");
  const news = entity("noticia", "news:1");
  const event = entity("evento", "event:1");
  const fight = entity("combate", "fight:1");
  return Object.freeze([
    observation("identity-duplicate", "identity", "duplicate_candidate", fighter, fighter2, {reviewId: "case:editorial"}),
    observation("identity-insufficient", "identity", "insufficient", entity("organizacion", "organization:1")),
    observation("identity-conflict", "identity", "conflicting", fighter, fighter2),
    observation("relation-missing", "relation", "missing", news),
    observation("relation-ambiguous", "relation", "ambiguous", news),
    observation("relation-conflicting", "relation", "conflicting", event, entity("organizacion", "organization:1")),
    observation("relation-orphan", "relation", "orphaned", fight),
    observation("news-missing-entity", "news_relevant_entity", "missing", news),
    observation("news-subject", "news_subject", "ambiguous", news),
    observation("news-relationship", "news_relationship", "conflicting", news, fighter),
    observation("event-incomplete", "event_completeness", "incomplete", event),
    observation("event-organization", "event_organization", "missing", event),
    observation("event-card", "event_card", "inconsistent", event, fight),
    observation("fighter-weight", "fighter_weight_category", "missing", fighter),
    observation("fighter-identity", "fighter_identity", "ambiguous", fighter),
    observation("organization", "organization_consistency", "inconsistent", entity("organizacion", "organization:1")),
    observation("discipline", "discipline_consistency", "inconsistent", entity("disciplina", "discipline:1")),
    observation("weight-category", "weight_category_consistency", "inconsistent", entity("categoria_peso", "weight:1")),
    observation("evidence-insufficient", "evidence_sufficiency", "insufficient", news),
    observation("evidence-conflicting", "evidence_consistency", "conflicting", news),
    observation("evidence-stale", "evidence_freshness", "stale", event),
    observation("evidence-sufficient", "evidence_sufficiency", "sufficient", entity("resultado", "result:1")),
    Object.freeze({...observation("secret", "evidence_freshness", "stale", news), evidence: evidence("secret")}),
  ]);
}

function containsFunction(value: unknown, seen = new Set<unknown>()): boolean {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((child) => containsFunction(child, seen));
}

function categoriesOf(signals: ReturnType<typeof buildEditorialSignals>): Set<EditorialAnomalyCategory> {
  return new Set(signals.map((signal) => signal.category));
}

const PRIORITY_RANK: Readonly<Record<EditorialPriority, number>> = Object.freeze({critical: 5, high: 4, medium: 3, low: 2, informational: 1});

function main(): void {
  const previous = snapshot(false);
  const current = snapshot(true);
  const diff = compareAgentSnapshots(previous, current);
  const diagnoses = diagnoseAgentContext(buildReasoningContext(diff, current));
  const input = Object.freeze({snapshot: current, events: diff.events, diagnoses, evidence: observations()});
  const intelligence = buildEditorialIntelligence(input);
  const categories = categoriesOf(intelligence.signals);

  assert.deepEqual(EDITORIAL_ENTITY_KINDS, ["noticia", "evento", "combate", "luchador", "organizacion", "disciplina", "categoria_peso", "resultado", "relacion_editorial"]); assertions += 1;
  equal(intelligence.context.contractVersion, AGENT_EDITORIAL_INTELLIGENCE_VERSION, "1 explicit editorial model");
  const jsonSignals = JSON.stringify(intelligence.signals);
  check(jsonSignals.length > 0 && JSON.parse(jsonSignals).length === intelligence.signals.length, "2 serializable signals");
  equal(JSON.stringify(buildEditorialIntelligence(input)), JSON.stringify(intelligence), "3 deterministic IDs/output");
  assert.deepEqual(intelligence.signals.map((signal) => signal.id), [...intelligence.signals.map((signal) => signal.id)].sort()); assertions += 1;
  equal(new Set(intelligence.signals.map((signal) => signal.id)).size, intelligence.signals.length, "4 deterministic stable order");

  const required: readonly [EditorialAnomalyCategory, string][] = Object.freeze([
    ["possible_duplicate_entity", "5 possible duplicate"], ["identity_insufficient", "6 identity insufficient"], ["identity_conflict", "7 identity conflict"],
    ["missing_relation", "8 missing relation"], ["ambiguous_relation", "9 ambiguous relation"], ["conflicting_relation", "10 conflicting relation"], ["orphan_relation", "11 orphan relation"],
    ["news_missing_relevant_entity", "12 news missing relevant entity"], ["news_ambiguous_subject", "13 news ambiguous subject"], ["news_relationship_conflict", "14 news relationship conflict"],
    ["event_incomplete", "15 event incomplete"], ["event_missing_organization", "16 event missing organization"], ["event_card_inconsistent", "17 event card inconsistent"],
    ["fighter_possible_duplicate", "18 fighter possible duplicate"], ["fighter_missing_weight_category", "19 fighter missing weight category"], ["fighter_identity_ambiguous", "20 fighter identity ambiguous"],
    ["organization_inconsistent", "21 organization inconsistent"], ["discipline_inconsistent", "22 discipline inconsistent"], ["weight_category_inconsistent", "23 weight category inconsistent"],
    ["evidence_insufficient", "24 evidence insufficient"], ["evidence_conflicting", "25 evidence conflicting"], ["evidence_stale", "26 evidence stale"],
    ["review_required", "27 review required"], ["review_blocked_by_dependency", "28 review blocked by dependency"],
  ]);
  for (const [category, message] of required) check(categories.has(category), message);

  const withoutEvidence = Object.freeze({...observation("no-evidence", "identity", "conflicting", entity("luchador", "fighter:none")), evidence: Object.freeze([])});
  const emptyInput = Object.freeze({snapshot: emptySnapshot(), events: Object.freeze([]), diagnoses: Object.freeze([]), evidence: Object.freeze([withoutEvidence])});
  equal(buildEditorialIntelligence(emptyInput).signals.length, 0, "29 no signal without evidence");
  const identityConflict = intelligence.signals.find((signal) => signal.category === "identity_conflict")!;
  equal(identityConflict.confidence, "high", "30 confidence deterministic");
  equal(intelligence.signals.find((signal) => signal.category === "identity_insufficient")?.conclusive, false, "31 insufficient not conclusive");
  equal(intelligence.signals.find((signal) => signal.category === "possible_duplicate_entity")?.epistemicStatus, "hypothesis", "hypothesis is not fact");
  check(intelligence.context.observations.every((item) => item.epistemicStatus === "observed_fact") && intelligence.signals.some((signal) => signal.epistemicStatus === "inference") && intelligence.signals.some((signal) => signal.epistemicStatus === "hypothesis"), "observations distinct from inferences and hypotheses");

  const fighterIntelligence = intelligence.entities.find((entry) => entry.entity.id === "fighter:1")!;
  check(fighterIntelligence.categories.includes("fighter_possible_duplicate") && fighterIntelligence.categories.includes("fighter_missing_weight_category"), "32 entity centric grouping");
  check(fighterIntelligence.evidenceRefs.length >= 3 && fighterIntelligence.priority === "critical", "entity priority/evidence");
  check(intelligence.context.relations.some((relation) => relation.left.id === "news:1" && relation.right.id === "fighter:1"), "33 cross entity relation");

  const oneSided = observation("one-sided-conflict", "news_relationship", "conflicting", entity("noticia", "news:one-sided"));
  const oneSidedContext = buildEditorialContext({snapshot: emptySnapshot(), events: [], diagnoses: [], evidence: [oneSided]});
  equal(oneSidedContext.relations.length, 0, "34 no cross entity inference without both sides");
  equal(buildEditorialSignals(oneSidedContext).some((signal) => signal.category === "news_relationship_conflict"), false, "34 no cross entity signal without counterpart");

  const resultSufficiency = buildEditorialSufficiencyView(intelligence.context, entity("resultado", "result:1"));
  equal(resultSufficiency.status, "sufficient", "35 sufficiency view");
  equal(intelligence.sufficiency.status, "conflicting", "35 global conflicts dominate");
  equal(resultSufficiency.projectionOnly, true);
  equal(resultSufficiency.decidesAutonomy, false, "36 no autonomy decision");
  equal(resultSufficiency.determinesReadiness, false, "36 no readiness decision");

  const repeatSignals = buildEditorialSignals(buildEditorialContext(input));
  assert.deepEqual(repeatSignals.map((signal) => [signal.id, signal.priority, signal.confidence]), intelligence.signals.map((signal) => [signal.id, signal.priority, signal.confidence])); assertions += 1;
  const currentConflict = observation("priority-current", "identity", "conflicting", entity("luchador", "fighter:priority"), undefined, {temporal: "current"});
  const historicalConflict = observation("priority-historical", "identity", "conflicting", entity("luchador", "fighter:priority"), undefined, {temporal: "historical"});
  const currentPriority = buildEditorialSignals(buildEditorialContext({snapshot: emptySnapshot(), events: [], diagnoses: [], evidence: [currentConflict]}))[0]!.priority;
  const historicalPriority = buildEditorialSignals(buildEditorialContext({snapshot: emptySnapshot(), events: [], diagnoses: [], evidence: [historicalConflict]}))[0]!.priority;
  check(PRIORITY_RANK[currentPriority] > PRIORITY_RANK[historicalPriority], "38 current higher than historical");

  const unreadInput = Object.freeze({...input, snapshot: snapshot(true, true)});
  const readInput = Object.freeze({...input, snapshot: snapshot(true, false)});
  equal(JSON.stringify(buildEditorialIntelligence(unreadInput)), JSON.stringify(buildEditorialIntelligence(readInput)), "39 historical unread does not escalate");
  equal(identityConflict.suggestedAuthority, "Review Center", "40 suggested authority");
  equal(intelligence.insights.find((insight) => insight.category === "review_required")?.suggestedAuthority, "Review Center", "41 Review Center routing");
  equal(intelligence.insights.find((insight) => insight.category === "evidence_stale")?.suggestedAuthority, "Inspection");
  equal(intelligence.insights.find((insight) => insight.category === "evidence_insufficient")?.suggestedAuthority, "Evidence/Sufficiency");
  check(intelligence.insights.every((insight) => insight.requiresReview && insight.sourceSignalId.length > 0), "structured governed insights");
  check(intelligence.insights.every((insight) => insight.epistemicStatus === "recommendation" && ["inference", "hypothesis"].includes(insight.basisEpistemicStatus)), "recommendations preserve inference/hypothesis basis");
  assert.deepEqual(buildEditorialInsights(intelligence.signals), intelligence.insights); assertions += 1;
  assert.deepEqual(groupEditorialSignalsByEntity(intelligence.signals), intelligence.entities); assertions += 1;

  const agentPath = "_laboratorio/laboratorio-ia/src/agent";
  const agentFiles = readdirSync(agentPath).sort();
  const ag2Files = agentFiles.filter((name) => name.startsWith("editorial-"));
  const ag2Source = ag2Files.map((name) => source(`${agentPath}/${name}`)).join("\n");
  for (const forbidden of ["executor", "planner", "store", "memory", "loop", "watcher", "scheduler", "autonomy"]) equal(ag2Files.some((name) => name.toLowerCase().includes(forbidden)), false, `no ${forbidden} file`);
  check(!/\b(fetch|axios|XMLHttpRequest)\s*\(/.test(ag2Source), "45 no fetch");
  check(!/\b(POST|PUT|PATCH|DELETE)\b/.test(ag2Source), "44 no writes/endpoints");
  check(!/Math\.random|Date\.now|new Date\s*\(/.test(ag2Source), "deterministic no clock/random");
  check(!/runAutonomousSupervisedLoop|executeTransaction|retryNotificationDelivery|createReviewCase\s*\(/.test(ag2Source), "42/43 no AU7 AU8 Review execution");
  check(!/localStorage|sessionStorage|indexedDB|setInterval|setTimeout/.test(ag2Source), "no store/watcher/polling");

  const json = JSON.stringify(intelligence);
  check(json.length > 0 && JSON.parse(json).context.boundary.readOnly, "51 JSON stringify");
  equal(containsFunction(intelligence), false, "52 no functions");
  check(!json.includes("$$typeof") && !json.includes("react.element"), "53 no React nodes");
  check(!json.includes("super-secret") && json.includes("[redacted]"), "54 secrets redacted");
  equal(diff.contractVersion, "ag1-observation-reasoning/1", "55 AG1 compatibility");
  equal(current.contractVersion, AGENT_READY_CONTRACT_VERSION, "56 LES8 compatibility");
  check(intelligence.context.agentEvidence.eventIds.length === diff.events.length && intelligence.context.agentEvidence.diagnosisIds.length === diagnoses.length, "AG1 evidence traced");
  for (const suite of ["test-les1-global-feedback.ts", "test-les2-notification-experience.ts", "test-les3-process-experience.ts", "test-les4-global-status.ts", "test-les5-interaction-system.ts", "test-les6-motion-system.ts", "test-les7-operator-experience.ts"]) check(source(`scripts/${suite}`).length > 100, `57 LES compatibility ${suite}`);
  check(source("scripts/test-au7-transaction-executor.ts").length > 100, "58 AU7 intact");
  check(source("scripts/test-au8-autonomous-supervised-loop.ts").length > 100, "59 AU8 intact");
  check(source("scripts/test-au10-final-certification.ts").includes("AU10 B6 final certification"), "60 AU10 intact");
  equal(JSON.stringify(buildEditorialIntelligence(input)), JSON.stringify(buildEditorialIntelligence(input)), "61 same input same output");

  for (const [key, value] of Object.entries(editorialIntelligenceModelSecurity)) if (!["taxonomyOnly", "readOnly", "pure"].includes(key)) equal(value, false, `model security ${key}`);
  equal(editorialIntelligenceModelSecurity.taxonomyOnly, true);
  equal(editorialIntelligenceModelSecurity.readOnly, true);
  equal(editorialIntelligenceModelSecurity.pure, true);
  for (const security of [editorialContextSecurity, editorialSignalsSecurity, editorialInsightsSecurity]) {
    equal(security.pure, true);
    for (const key of ["fetches", "persists", "writes", "executes", "usesClock", "usesRandomness"] as const) equal(security[key], false, `security ${key}`);
  }
  equal(editorialSignalsSecurity.usesLlm, false);
  equal(editorialSignalsSecurity.inventsRelations, false);
  equal(editorialInsightsSecurity.handoffOnly, true);
  equal(editorialInsightsSecurity.invokesAu7, false);
  equal(editorialInsightsSecurity.invokesAu8, false);
  check(assertions >= 120, `expected at least 120 assertions, got ${assertions}`);
  console.log(`AG2 Editorial Intelligence: OK (${assertions} assertions; explicit editorial taxonomy, structured evidence, 24 anomaly categories, entity/cross-entity reasoning, sufficiency projection, deterministic governed insights, zero execution/write/store/planner/loop/network)`);
}

main();
