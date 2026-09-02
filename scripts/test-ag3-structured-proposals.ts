import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import type {AgentContext, AgentContextItem} from "../_laboratorio/laboratorio-ia/src/agent/context";
import {
  AGENT_STRUCTURED_PROPOSAL_VERSION,
  buildStructuredProposals,
  createStructuredProposalFixture,
  selectBlockedProposals,
  selectHumanDecisionRequiredProposals,
  selectProposalsBySource,
  selectRecommendedProposals,
  structuredProposalBuilderSecurity,
  structuredProposalFixtureSecurity,
  structuredProposalSelectorsSecurity,
} from "../_laboratorio/laboratorio-ia/src/agent/context/proposals";

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

function reverseContext(context: AgentContext): AgentContext {
  const items = Object.freeze([...context.items].reverse().map((item) => Object.freeze({
    ...item,
    issueCodes: Object.freeze([...(item.issueCodes ?? [])].reverse()),
    decisionOptions: Object.freeze([...(item.decisionOptions ?? [])].reverse()),
    confidences: Object.freeze([...item.confidences].reverse()),
    sufficiency: Object.freeze([...item.sufficiency].reverse()),
    recommendationIds: Object.freeze([...item.recommendationIds].reverse()),
    references: Object.freeze({
      ...item.references,
      observationIds: Object.freeze([...item.references.observationIds].reverse()),
      diagnosisIds: Object.freeze([...item.references.diagnosisIds].reverse()),
      proposalIds: Object.freeze([...item.references.proposalIds].reverse()),
      insightIds: Object.freeze([...item.references.insightIds].reverse()),
      evidenceIds: Object.freeze([...item.references.evidenceIds].reverse()),
      fingerprints: Object.freeze([...item.references.fingerprints].reverse()),
    }),
  })));
  return Object.freeze({...context, items, statements: Object.freeze([...context.statements].reverse()), recommendations: Object.freeze([...context.recommendations].reverse())});
}

function contextWithUnknown(context: AgentContext): AgentContext {
  const base = context.items.find((item) => item.id === "editorial:ag2-insight:ag2-signal:news_missing_relevant_entity:noticia:news:without-review:evidence:orphan-news")!;
  const item: AgentContextItem = Object.freeze({
    ...base,
    id: "editorial:unknown",
    title: "Situación no clasificada",
    summary: "No existe información suficiente para clasificar la situación.",
    issueCodes: Object.freeze([]),
    decisionOptions: Object.freeze([]),
    entity: Object.freeze({type: "unknown", label: "Entidad desconocida"}),
    decisionNeed: "review_recommended",
    confidences: Object.freeze([]),
    risk: Object.freeze({level: "unavailable", source: "unavailable"}),
    sufficiency: Object.freeze([{status: "unknown" as const, source: "unknown" as const, determinesReadiness: false as const}]),
    recommendationIds: Object.freeze([]),
    references: Object.freeze({observationIds: Object.freeze([]), diagnosisIds: Object.freeze([]), proposalIds: Object.freeze([]), insightIds: Object.freeze([]), evidenceIds: Object.freeze([]), fingerprints: Object.freeze([])}),
  });
  return Object.freeze({...context, items: Object.freeze([item]), statements: Object.freeze([]), recommendations: Object.freeze([])});
}

function main(): void {
  const fixture = createStructuredProposalFixture();
  const before = JSON.stringify(fixture.context);
  const proposals = buildStructuredProposals(fixture.context);
  const json = JSON.stringify(proposals);

  equal(proposals.length, fixture.context.items.length, "1 una propuesta por item correlacionado B1");
  equal(proposals.length, 11, "2 fixture mixto completo");
  equal(JSON.parse(json).length, proposals.length, "3 JSON-safe");
  equal(containsFunction(proposals), false, "4 salida sin funciones");
  check(proposals.every((proposal) => proposal.version === AGENT_STRUCTURED_PROPOSAL_VERSION), "5 contrato versionado");
  equal(new Set(proposals.map((proposal) => proposal.id)).size, proposals.length, "6 IDs únicos");
  check(proposals.every((proposal) => proposal.id === `agent-structured-proposal:${proposal.trace.contextItemId}`), "7 identidad derivada de B1");
  check(proposals.every((proposal) => proposal.trace.agentContextSnapshotIdentity === fixture.context.snapshotIdentity), "8 identidad snapshot trazable");
  check(proposals.every((proposal) => proposal.freshness.fingerprints.includes(fixture.context.snapshotIdentity)), "9 freshness vinculada a B1");

  const ufc = proposals.find((proposal) => proposal.trace.contextItemId === "review:case:ufc:identity")!;
  equal(ufc.proposalClass, "identity_resolution", "10 clase identidad");
  equal(ufc.subject.kind, "news", "11 subject normalizado");
  equal(ufc.subject.source, "ufc", "12 source UFC");
  check(ufc.issue.codes.includes("ambiguous_reference"), "13 código Review preservado");
  check(ufc.facts.length >= 3, "14 paquete de hechos");
  check(ufc.inferences.length >= 1, "15 paquete de inferencias");
  check(ufc.hypotheses.length >= 1, "16 paquete de hipótesis");
  check(ufc.facts.every((entry) => entry.epistemicStatus === "fact"), "17 facts no contienen hipótesis");
  check(ufc.inferences.every((entry) => entry.epistemicStatus === "inference"), "18 inferences separadas");
  check(ufc.hypotheses.every((entry) => entry.epistemicStatus === "hypothesis"), "19 hypotheses separadas");
  check(ufc.facts.every((entry) => entry.referenceIds.length > 0), "20 facts trazables");

  equal(ufc.alternatives.length, 2, "21 alternativas reales sin inventar tercera opción");
  const alexNorte = ufc.alternatives.find((alternative) => alternative.optionId === "fighter:alex-norte")!;
  const alexSur = ufc.alternatives.find((alternative) => alternative.optionId === "fighter:alex-sur")!;
  equal(alexNorte.label, "Usar Alex Norte", "22 nombre humano recomendado");
  equal(alexNorte.confidence?.value, 94, "23 confidence 94 preservada");
  equal(alexSur.label, "Usar Álex Sur", "24 nombre humano alternativo");
  equal(alexSur.confidence?.value, 61, "25 confidence 61 preservada");
  equal(alexNorte.authorityHint.target, "Review", "26 alternativa enruta a Review");
  equal(alexNorte.authorityHint.invokes, false, "27 alternativa no invoca Review");
  check(ufc.alternatives.every((alternative) => alternative.capability === null), "28 no inventa capability");
  check(ufc.alternatives.every((alternative) => alternative.supportedByEvidence), "29 alternativas con soporte");

  equal(ufc.recommendation?.alternativeId, alexNorte.id, "30 recomendación selecciona Alex Norte");
  equal(ufc.recommendation?.sourceRecommendationId, "ag3-recommendation:review:case:ufc:identity", "31 recomendación B1 trazable");
  equal(ufc.recommendation?.confidence?.value, 94, "32 confidence de recomendación no fabricada");
  check(Boolean(ufc.recommendation?.rationale.primaryReasons.length), "33 rationale explica por qué");
  check(ufc.recommendation?.rationale.rejectedAlternatives.some((entry) => entry.alternativeId === alexSur.id), "34 rationale explica alternativa rechazada");
  check(ufc.recommendation?.rationale.caveats.some((entry) => entry.includes("no se han promediado")), "35 rationale conserva mezcla");
  equal(ufc.confidence.status, "mixed", "36 confidences incompatibles se declaran mixed");
  equal(ufc.confidence.aggregated, false, "37 no averaging");
  check(ufc.confidence.entries.some((entry) => entry.source === "review_presentation" && entry.value === 94), "38 provenance Review");
  check(ufc.confidence.entries.some((entry) => entry.source === "ag2_editorial" && entry.level === "low"), "39 provenance AG2");
  equal(ufc.risk.status, "known", "40 riesgo conocido");
  equal(ufc.risk.value, "low", "41 riesgo Nucleus preservado");
  equal(ufc.risk.source, "review_nucleus", "42 fuente riesgo");
  equal(ufc.risk.inferredFromConfidence, false, "43 riesgo no inferido de confidence");
  equal(ufc.sufficiency.status, "insufficient", "44 sufficiency preservada");
  equal(ufc.sufficiency.determinesReadiness, false, "45 sufficiency no decide readiness");
  equal(ufc.humanDecision.status, "required", "46 ambigüedad requiere humano");
  equal(ufc.authorityHint.target, "Review", "47 authority hint metadata");
  equal(ufc.authorityHint.invokes, false, "48 authority no invocada");
  equal(ufc.expectedOutcome?.kind, "expected", "49 outcome esperado");
  equal(ufc.expectedOutcome?.observed, false, "50 expected nunca observed");
  check(ufc.expectedOutcome?.summary.includes("solo podría continuar") === true, "51 no promete ejecución");
  check(ufc.unresolvedQuestions.length >= 2, "52 incertidumbre visible");
  check(ufc.unresolvedQuestions.some((entry) => entry.sourceStatementIds.some((id) => id.includes("hypothesis"))), "53 pregunta trazada a hipótesis");
  equal(ufc.trace.reviewCaseId, "case:ufc:identity", "54 Review durable enlazado");
  check(ufc.trace.diagnosisIds.length > 0 && ufc.trace.insightIds.length > 0 && ufc.trace.sourceReferences.length > 0, "55 cadena completa trazable");
  equal(ufc.durable, false, "56 propuesta nunca es ReviewCase");

  const conflict = proposals.find((proposal) => proposal.issue.codes.includes("evidence_conflicting"))!;
  equal(conflict.recommendation, null, "57 contradicción permite no recomendar");
  equal(conflict.sufficiency.status, "conflicting", "58 contradicción preservada");
  equal(conflict.humanDecision.status, "blocked", "59 contradicción bloqueada");
  equal(conflict.risk.status, "unknown", "60 riesgo ausente queda unknown");
  equal(conflict.risk.value, "unavailable", "61 no inventa risk");
  check(conflict.facts.some((entry) => entry.summary.includes("conflicting")), "62 hecho AG2 correlacionado por B1");
  check(conflict.inferences.length > 0, "63 inferencia contradictoria separada");
  check(conflict.unresolvedQuestions.some((entry) => entry.id.endsWith(":contradiction")), "64 pregunta contradictoria abierta");
  equal(conflict.trace.reviewCaseId, undefined, "65 proposal sin ReviewCase");

  const orphan = proposals.find((proposal) => proposal.issue.codes.includes("news_missing_relevant_entity"))!;
  equal(orphan.proposalClass, "missing_entity", "66 clase missing entity");
  equal(orphan.subject.kind, "news", "67 subject humano");
  equal(orphan.trace.reviewCaseId, undefined, "68 insight no se convierte en Review durable");
  equal(orphan.durable, false, "69 proposal no durable");
  equal(orphan.recommendation?.confidence?.level, "high", "70 recommendation AG2 conserva confidence");
  equal(orphan.risk.status, "unknown", "71 risk desconocido no inferido");

  const external = proposals.find((proposal) => proposal.trace.contextItemId === "review:case:external:dismissed")!;
  equal(external.proposalClass, "no_action", "72 clase no action");
  equal(external.humanDecision.status, "not_required", "73 no action no requiere humano");
  equal(external.alternatives[0]?.kind, "no_action", "74 alternativa no action explícita");
  equal(external.recommendation?.alternativeId, external.alternatives[0]?.id, "75 no action recomendado explícitamente");
  equal(external.expectedOutcome?.observed, false, "76 no action sigue siendo expected");

  const stale = proposals.find((proposal) => proposal.trace.contextItemId === "review:case:one:stale")!;
  equal(stale.humanDecision.status, "blocked", "77 stale bloqueado");
  equal(stale.recommendation, null, "78 blocked no es recomendación ejecutable");
  equal(stale.freshness.status, "stale", "79 freshness preservada");
  check(stale.alternatives.some((entry) => entry.kind === "maintain_state" && entry.viable), "80 mantener bloqueo viable");
  check(stale.alternatives.some((entry) => entry.kind === "authority_review" && !entry.viable && entry.unavailableReason === "context_stale"), "81 alternativa stale no fingida viable");

  const process = proposals.find((proposal) => proposal.trace.contextItemId === "process:process:one:events")!;
  equal(process.proposalClass, "resume_flow", "82 proceso clasificado");
  equal(process.subject.kind, "process", "83 subject proceso");
  equal(process.recommendation, null, "84 proceso activo no recibe recomendación inventada");
  equal(process.alternatives[0]?.kind, "no_action", "85 mantener flujo actual");
  equal(process.humanDecision.status, "not_required", "86 flujo actual no requiere decisión");

  const ready = proposals.find((proposal) => proposal.trace.contextItemId === "review:case:bkfc:ready")!;
  equal(ready.recommendation?.confidence?.value, 92, "87 confidence BKFC 92");
  equal(ready.humanDecision.status, "required", "88 ready todavía requiere humano");
  equal(ready.expectedOutcome?.observed, false, "89 outcome BKFC no observado");

  const repeated = buildStructuredProposals(fixture.context);
  assert.deepEqual(repeated, proposals); assertions += 1;
  const reversed = buildStructuredProposals(reverseContext(fixture.context));
  assert.deepEqual(reversed, proposals); assertions += 1;
  equal(JSON.stringify(fixture.context), before, "90 B1 no mutado");
  check(proposals.every((proposal, index) => index === 0 || proposals[index - 1]!.id.localeCompare(proposal.id) <= 0), "91 orden estable");

  const empty = buildStructuredProposals(Object.freeze({...fixture.context, items: Object.freeze([]), statements: Object.freeze([]), recommendations: Object.freeze([])}));
  equal(empty.length, 0, "92 empty context válido");
  const unknown = buildStructuredProposals(contextWithUnknown(fixture.context))[0]!;
  equal(unknown.proposalClass, "other", "93 unknown no rompe clasificación");
  equal(unknown.subject.kind, "unknown", "94 subject unknown explícito");
  equal(unknown.confidence.status, "unknown", "95 confidence unknown");
  equal(unknown.risk.status, "unknown", "96 risk unknown");
  equal(unknown.sufficiency.status, "unknown", "97 sufficiency unknown");
  equal(unknown.recommendation, null, "98 sin evidencia no fuerza recommendation");
  check(unknown.unresolvedQuestions.length >= 3, "99 unknowns conservados");

  equal(selectRecommendedProposals(proposals).length, 5, "100 selector recommendations");
  equal(selectHumanDecisionRequiredProposals(proposals).length, 2, "101 selector human required");
  equal(selectBlockedProposals(proposals).length, 3, "102 selector blocked");
  equal(selectProposalsBySource(proposals, "ufc").length, 1, "103 selector source UFC");
  equal(selectProposalsBySource([...proposals].reverse(), "bkfc").map((entry) => entry.id).join("|"), selectProposalsBySource(proposals, "bkfc").map((entry) => entry.id).join("|"), "104 selectors deterministas");

  for (const proposal of proposals) {
    equal(proposal.boundary.decisionSupportOnly, true, "105 decision support only");
    equal(proposal.boundary.executes, false, "105 no execute");
    equal(proposal.boundary.persists, false, "105 no persist");
    equal(proposal.boundary.plans, false, "105 no plan");
    equal(proposal.boundary.createsAuthority, false, "105 no authority");
    equal(proposal.boundary.mutatesReview, false, "105 no Review mutation");
    equal(proposal.boundary.decidesAutonomy, false, "105 no autonomy");
    check(proposal.alternatives.every((alternative) => !alternative.authorityHint.invokes), "106 alternatives metadata only");
    check(proposal.recommendation === null ? proposal.expectedOutcome === null : proposal.expectedOutcome?.observed === false, "107 expected/observed contract");
  }

  const path = "_laboratorio/laboratorio-ia/src/agent/context/proposals";
  const files = readdirSync(path).filter((name) => name.endsWith(".ts")).sort();
  const allSource = files.map((name) => source(`${path}/${name}`)).join("\n");
  for (const forbidden of ["store", "executor", "planner", "authority", "memory", "watcher", "scheduler"]) equal(files.some((name) => name.toLowerCase().includes(forbidden)), false, `108 no ${forbidden} file`);
  check(!/from\s+["'][^"']*review\/(?:store|types|nucleus|presentation)/.test(allSource), "109 consume AgentContext, no raw Review");
  check(!/from\s+["'][^"']*(?:agent-ready|editorial-model|\.\.\/\.\.\/model)/.test(allSource), "110 no acceso lateral LES8/AG1/AG2");
  check(!/\b(fetch|axios|XMLHttpRequest)\s*\(/.test(allSource), "111 no network");
  check(!/localStorage|sessionStorage|indexedDB/.test(allSource), "112 no persistence");
  check(!/Math\.random|Date\.now|new Date\s*\(/.test(allSource), "113 no clock/random");
  check(!/createReviewCase\s*\(|transitionReviewCase\s*\(|addReviewResolution\s*\(/.test(allSource), "114 no Review mutation");
  check(!/runAutonomousSupervisedLoop|executeTransaction|dispatchReviewResume|retryNotificationDelivery/.test(allSource), "115 no execution");
  check(!/sanityClient|createClient|notifyTelegram/.test(allSource), "116 no Sanity/Telegram");
  check(!/chat|streaming|messageHistory|conversation/i.test(files.join("|") + source(`${path}/builder.ts`)), "117 no AG4 UI/chat");

  equal(structuredProposalBuilderSecurity.pure, true, "118 builder pure");
  equal(structuredProposalBuilderSecurity.deterministic, true, "118 builder deterministic");
  equal(structuredProposalBuilderSecurity.consumesAgentContextOnly, true, "118 B1 only");
  for (const key of ["createsStore", "createsProposalStore", "persists", "fetches", "writes", "executes", "createsPlanner", "createsExecutor", "createsAuthority", "mutatesReview", "mutatesAg1", "mutatesAg2", "mutatesLes8", "invokesReview", "invokesAu7", "invokesAu8", "decidesAutonomy", "determinesReadiness", "usesClock", "usesRandomness"] as const) equal(structuredProposalBuilderSecurity[key], false, `119 security ${key}`);
  equal(structuredProposalSelectorsSecurity.pure, true, "120 selectors pure");
  equal(structuredProposalSelectorsSecurity.mutates, false, "120 selectors no mutation");
  equal(structuredProposalFixtureSecurity.devOnly, true, "121 fixture dev-only");
  for (const key of ["createsStore", "persists", "fetches", "writes", "executes", "sanity", "telegram", "externalApis"] as const) equal(structuredProposalFixtureSecurity[key], false, `121 fixture ${key}`);

  check(source("_laboratorio/laboratorio-ia/src/agent/context/index.ts").includes('export * from "./proposals"'), "122 export público B2");
  check(source("scripts/test-ag3-agent-context-composer.ts").length > 100, "123 B1 suite presente");
  check(source("scripts/test-ag2-editorial-intelligence.ts").length > 100 && source("scripts/test-ag1-agent-observation-reasoning.ts").length > 100 && source("scripts/test-les8-agent-ready.ts").length > 100, "124 upstream suites presentes");
  check(assertions >= 220, `expected at least 220 assertions, got ${assertions}`);
  console.log(`AG3 B2 Structured Proposals: OK (${assertions} assertions; AgentContext-only, stable identity, evidence separation, real alternatives, optional recommendation, confidence/risk/sufficiency provenance, expected-not-observed outcomes, traceability and zero store/planner/executor/authority/write/network)`);
}

main();
