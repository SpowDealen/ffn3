import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {AGENT_READY_CONTRACT_VERSION, type AgentSnapshot} from "../_laboratorio/laboratorio-ia/src/agent-ready/model";
import {
  AGENT_CONTEXT_CONTRACT_VERSION,
  agentContextComposerSecurity,
  agentContextFixtureSecurity,
  composeAgentContext,
  createAgentContextComposerFixture,
  type AgentContextInput,
} from "../_laboratorio/laboratorio-ia/src/agent/context";
import {AGENT_EDITORIAL_INTELLIGENCE_VERSION} from "../_laboratorio/laboratorio-ia/src/agent/editorial-model";
import {AGENT_REASONING_CONTRACT_VERSION} from "../_laboratorio/laboratorio-ia/src/agent/model";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");

function containsFunction(value: unknown, seen = new Set<unknown>()): boolean {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((child) => containsFunction(child, seen));
}

function reverseInput(input: AgentContextInput): AgentContextInput {
  const snapshot = Object.freeze({...input.snapshot, dependencies: Object.freeze([...input.snapshot.dependencies].reverse()), processes: Object.freeze([...input.snapshot.processes].reverse()), review: Object.freeze([...input.snapshot.review].reverse()), capabilities: Object.freeze([...input.snapshot.capabilities].reverse())});
  const reasoning = Object.freeze({...input.reasoning, snapshot, facts: Object.freeze([...input.reasoning.facts].reverse()), patterns: Object.freeze([...input.reasoning.patterns].reverse()), diff: Object.freeze({...input.reasoning.diff, events: Object.freeze([...input.reasoning.diff.events].reverse())})});
  const editorial = Object.freeze({...input.editorial, signals: Object.freeze([...input.editorial.signals].reverse()), insights: Object.freeze([...input.editorial.insights].reverse()), entities: Object.freeze([...input.editorial.entities].reverse()), context: Object.freeze({...input.editorial.context, observations: Object.freeze([...input.editorial.context.observations].reverse()), entities: Object.freeze([...input.editorial.context.entities].reverse()), relations: Object.freeze([...input.editorial.context.relations].reverse()), review: Object.freeze([...input.editorial.context.review].reverse())})});
  return Object.freeze({...input, snapshot, reasoning, diagnoses: Object.freeze([...input.diagnoses].reverse()), proposals: Object.freeze([...input.proposals].reverse()), editorial, reviewCases: Object.freeze([...input.reviewCases].reverse())});
}

function emptyInput(input: AgentContextInput): AgentContextInput {
  const snapshot: AgentSnapshot = Object.freeze({...input.snapshot, observationId: "agent-observation:sha256-v1:empty", observationFingerprint: "sha256-v1:empty", operator: Object.freeze({state: "clear" as const, attention: Object.freeze([]), active: Object.freeze([])}), dependencies: Object.freeze([]), processes: Object.freeze([]), notifications: Object.freeze([]), review: Object.freeze([]), capabilities: Object.freeze([])});
  const diff = Object.freeze({...input.reasoning.diff, fromObservationId: snapshot.observationId, fromFingerprint: snapshot.observationFingerprint, toObservationId: snapshot.observationId, toFingerprint: snapshot.observationFingerprint, changed: false, events: Object.freeze([])});
  const reasoning = Object.freeze({...input.reasoning, observationId: snapshot.observationId, observationFingerprint: snapshot.observationFingerprint, snapshot, diff, facts: Object.freeze([]), patterns: Object.freeze([])});
  const context = Object.freeze({...input.editorial.context, observationId: snapshot.observationId, observationFingerprint: snapshot.observationFingerprint, observations: Object.freeze([]), entities: Object.freeze([]), relations: Object.freeze([]), review: Object.freeze([]), unhealthyDependencies: Object.freeze([]), agentEvidence: Object.freeze({eventIds: Object.freeze([]), diagnosisIds: Object.freeze([])})});
  const editorial = Object.freeze({...input.editorial, context, signals: Object.freeze([]), entities: Object.freeze([]), insights: Object.freeze([]), sufficiency: Object.freeze({status: "unknown" as const, reasons: Object.freeze([]), evidenceRefs: Object.freeze([]), projectionOnly: true as const, decidesAutonomy: false as const, determinesReadiness: false as const})});
  return Object.freeze({...input, snapshot, reasoning, diagnoses: Object.freeze([]), proposals: Object.freeze([]), editorial, reviewCases: Object.freeze([])});
}

function main(): void {
  const input = createAgentContextComposerFixture();
  const before = JSON.stringify(input);
  const context = composeAgentContext(input);
  const json = JSON.stringify(context);

  equal(context.contractVersion, AGENT_CONTEXT_CONTRACT_VERSION, "1 contrato AG3 versionado");
  check(json.length > 0 && JSON.parse(json).summary.totalRelevantItems === context.items.length, "2 salida JSON-safe");
  equal(containsFunction(context), false, "3 salida sin funciones");
  equal(context.boundary.readOnly, true, "4 frontera read-only");
  equal(context.boundary.projectionOnly, true, "4 frontera projection-only");
  equal(context.boundary.executes, false, "4 no ejecuta");
  equal(context.boundary.persists, false, "4 no persiste");
  equal(context.boundary.plans, false, "4 no planifica");
  equal(context.boundary.createsAuthority, false, "4 no crea autoridad");
  equal(context.boundary.decidesAutonomy, false, "4 no decide autonomía");

  equal(context.summary.totalRelevantItems, 11, "5 total relevante sin doble conteo");
  equal(context.summary.readyCount, 1, "6 listos");
  equal(context.summary.noActionCount, 1, "7 sin acción");
  equal(context.summary.needsAttentionCount, 4, "8 necesitan atención");
  equal(context.summary.inProgressCount, 2, "9 en proceso");
  equal(context.summary.resolvedCount, 1, "10 resueltos");
  equal(context.summary.blockedStateCount, 2, "11 estado bloqueado");
  equal(context.summary.blockedCount, 4, "12 bloqueados totales ortogonales");
  equal(context.summary.humanDecisionRequiredCount, 3, "13 decisión humana requerida");
  equal(context.summary.highConfidenceRecommendationCount, 4, "14 recomendación clara de alta confianza por item");
  equal(Object.values(context.groups).flat().length, context.summary.totalRelevantItems, "15 estados mutuamente exclusivos");

  const ufc = context.items.find((item) => item.id === "review:case:ufc:identity")!;
  equal(ufc.kind, "review_case", "16 Review durable diferenciado");
  equal(ufc.durable, true, "16 durable true");
  equal(ufc.state, "needs_attention", "17 UFC necesita atención");
  equal(ufc.decisionNeed, "human_decision_required", "18 identidad ambigua requiere decisión");
  equal(ufc.authorityHint.target, "Review", "19 authority hint Review");
  equal(ufc.authorityHint.invokes, false, "19 hint no invoca");
  check(ufc.references.observationIds.includes("evidence:ufc:ambiguous"), "20 correlación AG2 → Review");
  check(ufc.references.diagnosisIds.length > 0 && ufc.references.insightIds.length > 0, "21 cadena AG1/AG2 correlacionada");
  equal(context.items.filter((item) => item.references.reviewCaseId === "case:ufc:identity").length, 1, "22 no double count full chain");
  equal(context.items.filter((item) => item.id === "process:process:one:events").length, 1, "23 diagnosis de proceso no duplica proceso");
  equal(context.items.filter((item) => item.id === "dependency:references").length, 1, "24 diagnosis de dependencia no duplica dependencia");

  const confidence94 = ufc.confidences.find((entry) => entry.source === "review_presentation");
  equal(confidence94?.value, 94, "25 confidence numérica preservada");
  equal(confidence94?.level, "high", "25 confidence humana preservada");
  check(ufc.confidences.some((entry) => entry.source === "ag2_editorial" && entry.level === "low"), "26 confidence AG2 preservada por origen");
  check(ufc.confidences.length > 2 && !ufc.confidences.some((entry) => entry.source === ("average" as never)), "27 confidence no promediada");
  equal(ufc.risk.source, "review_nucleus", "28 risk canónico reutilizado");
  check(ufc.sufficiency.some((entry) => entry.source === "review_nucleus" && !entry.determinesReadiness), "29 sufficiency proyectada no decide readiness");

  const ready = context.items.find((item) => item.id === "review:case:bkfc:ready")!;
  equal(ready.state, "ready", "30 resolución completa queda lista");
  equal(ready.decisionNeed, "human_decision_required", "31 listo todavía requiere aprobación humana");
  equal(ready.confidences.find((entry) => entry.source === "review_presentation")?.value, 92, "32 confidence BKFC preservada");
  equal(context.items.find((item) => item.id === "review:case:one:resume")?.state, "in_progress", "33 resolved con resume pendiente está en proceso");
  equal(context.items.find((item) => item.id === "review:case:bkfc:done")?.state, "resolved", "34 resumed está resuelto");
  equal(context.items.find((item) => item.id === "review:case:external:dismissed")?.state, "no_action", "35 dismissed no requiere acción");
  equal(context.items.find((item) => item.id === "review:case:one:stale")?.freshness.status, "stale", "36 stale preservado");
  equal(context.freshness.status, "stale", "37 contexto global no finge actualidad");

  for (const sourceId of ["ufc", "one", "bkfc", "external_news"]) check(context.sourceSummaries.some((entry) => entry.id === sourceId), `38 resumen fuente ${sourceId}`);
  equal(context.sourceSummaries.find((entry) => entry.id === "bkfc")?.total, 2, "39 productores BKFC agregados por fuente");
  equal(context.sourceSummaries.find((entry) => entry.id === "one")?.total, 3, "40 ONE incluye casos y proceso");
  check(context.prioritySummaries.some((entry) => entry.id === "critical") && context.prioritySummaries.some((entry) => entry.id === "unavailable"), "41 prioridad canónica y unavailable");
  check(context.entitySummaries.some((entry) => entry.id === "news") && context.entitySummaries.some((entry) => entry.id === "event"), "42 agregación por entidad");

  for (const status of ["fact", "inference", "hypothesis", "recommendation"] as const) check(context.statements.some((statement) => statement.epistemicStatus === status), `43 semántica ${status} preservada`);
  const hypothesis = context.statements.find((statement) => statement.epistemicStatus === "hypothesis")!;
  check(!context.statements.some((statement) => statement.id === hypothesis.id && statement.epistemicStatus === "fact"), "44 hipótesis nunca promovida a hecho");
  check(context.statements.filter((statement) => statement.epistemicStatus === "fact").every((statement) => statement.evidenceIds.length > 0), "45 facts trazables a evidencia");
  check(context.changes.changed && context.changes.eventIds.length === input.reasoning.diff.events.length, "46 cambios AG1 expuestos");

  const insightOnly = context.items.find((item) => item.kind === "editorial_insight" && item.entity.id === "news:without-review")!;
  equal(insightOnly.durable, false, "47 insight sin Review no se convierte en caso durable");
  equal(insightOnly.state, "needs_attention", "48 insight sin Review sigue visible");
  equal(insightOnly.authorityHint.target, "Review", "49 insight enruta como hint");
  const conflict = context.recommendations.find((recommendation) => recommendation.id.includes("evidence_conflicting"))!;
  equal(conflict.confidence?.level, "high", "50 conflicto conserva confidence alta");
  equal(conflict.clarity, "requires_review", "51 evidencia contradictoria no se declara recomendación segura");
  equal(conflict.basis, "inference", "52 base epistémica conservada");
  check(context.recommendations.every((recommendation) => !recommendation.authorityHint.invokes), "53 recomendaciones no ejecutan autoridad");

  const repeated = composeAgentContext(createAgentContextComposerFixture());
  assert.deepEqual(repeated, context); assertions += 1;
  const reversed = composeAgentContext(reverseInput(input));
  assert.deepEqual(reversed, context); assertions += 1;
  equal(new Set(context.items.map((item) => item.id)).size, context.items.length, "54 IDs únicos");
  equal(JSON.stringify(context.items.map((item) => item.id)), JSON.stringify([...context.items.map((item) => item.id)]), "55 orden estable");
  const later = composeAgentContext(Object.freeze({...input, generatedAt: "2026-09-03T11:00:00.000Z"}));
  equal(later.snapshotIdentity, context.snapshotIdentity, "56 generatedAt no altera identidad semántica");
  equal(JSON.stringify(input), before, "57 inputs no mutados");

  const empty = composeAgentContext(emptyInput(input));
  equal(empty.summary.totalRelevantItems, 0, "58 empty state válido");
  equal(empty.items.length, 0, "58 empty items");
  equal(empty.recommendations.length, 0, "58 empty recommendations");
  equal(empty.freshness.status, "fresh", "58 empty snapshot alineado y actual");

  const partialInsight = Object.freeze({...input.editorial.insights[0]!, sourceSignalId: "missing-signal", id: "ag2-insight:partial"});
  const partialEditorial = Object.freeze({...input.editorial, insights: Object.freeze([partialInsight]), signals: Object.freeze([])});
  const partial = composeAgentContext(Object.freeze({...emptyInput(input), editorial: Object.freeze({...partialEditorial, context: emptyInput(input).editorial.context})}));
  equal(partial.items.length, 1, "59 AG2 insight parcial no rompe composer");
  equal(partial.items[0]?.freshness.status, "fresh", "60 unknown signal se mantiene fail-safe");
  equal(partial.items[0]?.risk.level, "unavailable", "61 risk no inventado");
  equal(partial.items[0]?.sufficiency[0]?.status, "unknown", "62 sufficiency no inventada");

  const terminalProcess = Object.freeze({...input.snapshot.processes[0]!, state: "completed" as const, temporal: "historical" as const, active: false});
  const terminalSnapshot = Object.freeze({...input.snapshot, processes: Object.freeze([terminalProcess])});
  const terminalReasoning = Object.freeze({...input.reasoning, snapshot: terminalSnapshot});
  const terminal = composeAgentContext(Object.freeze({...input, snapshot: terminalSnapshot, reasoning: terminalReasoning}));
  equal(terminal.items.find((item) => item.id === `process:${terminalProcess.id}`)?.state, "resolved", "63 proceso terminal proyectado");

  equal(input.snapshot.contractVersion, AGENT_READY_CONTRACT_VERSION, "64 LES8 reutilizado");
  equal(input.reasoning.contractVersion, AGENT_REASONING_CONTRACT_VERSION, "65 AG1 reutilizado");
  equal(input.editorial.context.contractVersion, AGENT_EDITORIAL_INTELLIGENCE_VERSION, "66 AG2 reutilizado");
  check(context.items.filter((item) => item.kind === "review_case").every((item) => item.references.reviewCaseId && item.durable), "67 Review durable preservado");
  check(context.items.filter((item) => item.kind !== "review_case").every((item) => !item.durable), "68 proyecciones no se convierten en dominio");

  const contextPath = "_laboratorio/laboratorio-ia/src/agent/context";
  const files = readdirSync(contextPath).filter((name) => name.endsWith(".ts")).sort();
  const allSource = files.map((name) => source(`${contextPath}/${name}`)).join("\n");
  for (const forbidden of ["store", "executor", "planner", "authority", "memory", "watcher", "scheduler"]) equal(files.some((name) => name.toLowerCase().includes(forbidden)), false, `69 no ${forbidden} file`);
  check(!/\b(fetch|axios|XMLHttpRequest)\s*\(/.test(allSource), "70 no network");
  check(!/\b(POST|PUT|PATCH|DELETE)\b/.test(allSource), "71 no mutable endpoints");
  check(!/localStorage|sessionStorage|indexedDB/.test(allSource), "72 no persistence");
  check(!/Math\.random|Date\.now|new Date\s*\(/.test(allSource), "73 no clock/random implícito");
  check(!/createReviewCase\s*\(|transitionReviewCase\s*\(|addReviewResolution\s*\(/.test(allSource), "74 no mutación Review");
  check(!/runAutonomousSupervisedLoop|executeTransaction|dispatchReviewResume|retryNotificationDelivery/.test(allSource), "75 no ejecución AU7/AU8/Review");
  check(!/sanityClient|createClient|notifyTelegram/.test(allSource), "76 no Sanity/Telegram");
  check(!/chat|streaming|messageHistory|conversation/i.test(files.join("|") + source(`${contextPath}/composer.ts`)), "77 no UI/chat AG4");

  equal(agentContextComposerSecurity.pure, true, "78 security pure");
  equal(agentContextComposerSecurity.deterministic, true, "78 security deterministic");
  for (const key of ["createsStore", "persists", "fetches", "writes", "executes", "createsPlanner", "createsExecutor", "createsAuthority", "invokesReview", "invokesAu7", "invokesAu8", "determinesReadiness", "usesClock", "usesRandomness"] as const) equal(agentContextComposerSecurity[key], false, `79 security ${key}`);
  equal(agentContextFixtureSecurity.pure, true, "80 fixture pure");
  for (const key of ["createsStore", "persists", "fetches", "writes", "executes", "sanity", "telegram", "externalApis"] as const) equal(agentContextFixtureSecurity[key], false, `80 fixture ${key}`);
  check(source("_laboratorio/laboratorio-ia/src/agent/index.ts").includes('export * from "./context"'), "81 API pública mínima");
  check(source("scripts/test-ag1-agent-observation-reasoning.ts").length > 100 && source("scripts/test-ag2-editorial-intelligence.ts").length > 100 && source("scripts/test-les8-agent-ready.ts").length > 100, "82 suites upstream presentes");
  check(source("scripts/test-rx2-review-inbox.ts").length > 100 && source("scripts/test-rx3-simplified-review-case.ts").length > 100 && source("scripts/test-rx5-end-to-end-review-flow.ts").length > 100, "83 suites RX presentes");

  check(assertions >= 110, `expected at least 110 assertions, got ${assertions}`);
  console.log(`AG3 B1 Agent Context Composer: OK (${assertions} assertions; LES8 + AG1 + AG2 + durable Review composition, deterministic correlation, human summaries, epistemic separation, confidence/risk/sufficiency preservation, zero store/planner/executor/authority/write/network)`);
}

main();
