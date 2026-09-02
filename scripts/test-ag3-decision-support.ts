import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {
  AGENT_DECISION_SUPPORT_VERSION,
  buildDecisionSupport,
  createDecisionSupportFixture,
  decisionSupportBuilderSecurity,
  decisionSupportFixtureSecurity,
  decisionSupportSelectorsSecurity,
  selectBlockedDecisionSupport,
  selectClearDecisionSupport,
  selectContradictoryDecisionSupport,
  selectDecisionSupportByAttention,
  selectDecisionSupportBySource,
  selectDecisionSupportRequiringHuman,
} from "../_laboratorio/laboratorio-ia/src/agent/context/decisions";
import type {AgentStructuredProposal} from "../_laboratorio/laboratorio-ia/src/agent/context/proposals";

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

function reverseProposal(proposal: AgentStructuredProposal): AgentStructuredProposal {
  return Object.freeze({
    ...proposal,
    issue: Object.freeze({...proposal.issue, codes: Object.freeze([...proposal.issue.codes].reverse())}),
    facts: Object.freeze([...proposal.facts].reverse()),
    inferences: Object.freeze([...proposal.inferences].reverse()),
    hypotheses: Object.freeze([...proposal.hypotheses].reverse()),
    alternatives: Object.freeze([...proposal.alternatives].reverse().map((alternative) => Object.freeze({...alternative, benefits: Object.freeze([...alternative.benefits].reverse()), risks: Object.freeze([...alternative.risks].reverse()), limitations: Object.freeze([...alternative.limitations].reverse())}))),
    recommendation: proposal.recommendation ? Object.freeze({...proposal.recommendation, rationale: Object.freeze({...proposal.recommendation.rationale, primaryReasons: Object.freeze([...proposal.recommendation.rationale.primaryReasons].reverse()), rejectedAlternatives: Object.freeze([...proposal.recommendation.rationale.rejectedAlternatives].reverse()), caveats: Object.freeze([...proposal.recommendation.rationale.caveats].reverse())})}) : null,
    confidence: Object.freeze({...proposal.confidence, entries: Object.freeze([...proposal.confidence.entries].reverse())}),
    sufficiency: Object.freeze({...proposal.sufficiency, entries: Object.freeze([...proposal.sufficiency.entries].reverse())}),
    humanDecision: Object.freeze({...proposal.humanDecision, reasons: Object.freeze([...proposal.humanDecision.reasons].reverse())}),
    unresolvedQuestions: Object.freeze([...proposal.unresolvedQuestions].reverse()),
    trace: Object.freeze({...proposal.trace, observationIds: Object.freeze([...proposal.trace.observationIds].reverse()), diagnosisIds: Object.freeze([...proposal.trace.diagnosisIds].reverse()), proposalIds: Object.freeze([...proposal.trace.proposalIds].reverse()), insightIds: Object.freeze([...proposal.trace.insightIds].reverse()), sourceReferences: Object.freeze([...proposal.trace.sourceReferences].reverse())}),
    freshness: Object.freeze({...proposal.freshness, fingerprints: Object.freeze([...proposal.freshness.fingerprints].reverse())}),
  });
}

function unknownProposal(base: AgentStructuredProposal): AgentStructuredProposal {
  return Object.freeze({
    ...base,
    id: "agent-structured-proposal:unknown",
    proposalClass: "other",
    sourcePriority: "unavailable",
    subject: Object.freeze({kind: "unknown", id: null, label: "Entidad desconocida", source: null}),
    issue: Object.freeze({codes: Object.freeze([]), label: "Situación no clasificada", summary: "No existe base suficiente para clasificar la situación.", reason: "No existen observaciones relacionadas."}),
    facts: Object.freeze([]),
    inferences: Object.freeze([]),
    hypotheses: Object.freeze([]),
    alternatives: Object.freeze([]),
    recommendation: null,
    confidence: Object.freeze({status: "unknown", entries: Object.freeze([]), aggregated: false}),
    risk: Object.freeze({status: "unknown", value: "unavailable", source: "unavailable", inferredFromConfidence: false}),
    sufficiency: Object.freeze({status: "unknown" as const, entries: Object.freeze([{status: "unknown" as const, source: "unknown" as const, determinesReadiness: false as const}]), determinesReadiness: false as const}),
    humanDecision: Object.freeze({status: "recommended", reasons: Object.freeze(["unknown_basis"])}),
    authorityHint: Object.freeze({target: "unknown", source: "Existing authority", invokes: false}),
    expectedOutcome: null,
    unresolvedQuestions: Object.freeze([]),
    trace: Object.freeze({agentContextSnapshotIdentity: base.trace.agentContextSnapshotIdentity, contextItemId: "unknown", observationIds: Object.freeze([]), diagnosisIds: Object.freeze([]), proposalIds: Object.freeze([]), insightIds: Object.freeze([]), sourceReferences: Object.freeze([])}),
  });
}

function main(): void {
  const fixture = createDecisionSupportFixture();
  const before = JSON.stringify(fixture.proposals);
  const decisions = buildDecisionSupport(fixture.proposals);
  const json = JSON.stringify(decisions);

  equal(decisions.length, fixture.proposals.length, "1 una decisión por proposal B2");
  equal(decisions.length, 13, "2 fixture cubre matriz B3");
  equal(JSON.parse(json).length, decisions.length, "3 JSON-safe");
  equal(containsFunction(decisions), false, "4 sin funciones");
  check(decisions.every((decision) => decision.version === AGENT_DECISION_SUPPORT_VERSION), "5 contrato versionado");
  equal(new Set(decisions.map((decision) => decision.id)).size, decisions.length, "6 IDs únicos");
  check(decisions.every((decision) => decision.id === `agent-decision-support:${decision.proposalId}`), "7 identidad estable derivada de B2");
  check(decisions.every((decision) => decision.trace.structuredProposalId === decision.proposalId), "8 enlace proposal preservado");

  const clear = decisions.find((decision) => decision.trace.contextItemId === "fixture:bkfc:clear")!;
  equal(clear.decisionState, "clear_recommendation", "9 recomendación clara");
  equal(clear.preferredOption?.label, "Usar BKFC", "10 preferred option correcta");
  equal(clear.evidenceAssessment.strength, "strong", "11 evidencia fuerte sin score nuevo");
  equal(clear.explanation.headline, "Recomendación clara", "12 headline humano");
  check(clear.explanation.why.some((reason) => reason.includes("BKFC")), "13 why preferred concreto");
  equal(clear.explanation.caveats.length, 0, "14 clear sin caveats ocultos");
  equal(clear.humanDecision.status, "not_required", "15 clear no inventa humano");
  equal(clear.decisionQuestions.length, 0, "16 clear no pregunta sin necesidad");
  equal(clear.priority, "normal_attention", "17 prioridad canónica estable");

  const ufc = decisions.find((decision) => decision.trace.contextItemId === "review:case:ufc:identity")!;
  equal(ufc.decisionState, "recommendation_with_caveats", "18 recomendación con reservas");
  equal(ufc.preferredOption?.label, "Usar Alex Norte", "19 Alex Norte preferred");
  equal(ufc.preferredOption?.confidence?.value, 94, "20 confidence 94 preservada");
  const alexSur = ufc.alternatives.find((alternative) => alternative.label === "Usar Álex Sur")!;
  equal(alexSur.confidence?.value, 61, "21 confidence 61 preservada");
  equal(ufc.preferredOption?.relativeAssessment, "preferred", "22 posición preferred");
  equal(alexSur.relativeAssessment, "weaker", "23 alternativa weaker por role B2");
  check(Boolean(ufc.preferredOption?.strengths.length), "24 fortalezas estructuradas");
  check(alexSur.weaknesses.some((weakness) => weakness.includes("no identifica") || weakness.includes("No figura")), "25 debilidad explicada");
  check(ufc.preferredOption?.supportingEvidenceRefs.length !== 0, "26 evidencia soporte trazable");
  equal(ufc.preferredOption?.risk.value, "low", "27 risk B2 preservado");
  equal(ufc.evidenceAssessment.strength, "mixed", "28 evidencia mixed sin promedio");
  equal(ufc.evidenceAssessment.synthesizedConfidence, false, "29 no sintetiza confidence");
  equal(ufc.evidenceAssessment.confidence.aggregated, false, "30 confidence sigue sin averaging");
  check(ufc.explanation.why.length > 0, "31 why preferred disponible");
  check(ufc.explanation.whyNot.some((entry) => entry.alternativeId === alexSur.alternativeId), "32 why not alternative");
  check(ufc.explanation.caveats.some((entry) => entry.includes("Suficiencia insufficient")), "33 caveat sufficiency visible");
  equal(ufc.humanDecision.status, "required", "34 decisión humana conservada");
  check(ufc.humanDecision.explanation?.includes("varias alternativas") === true, "35 framing humano explica por qué");
  equal(ufc.ambiguities.length, 1, "36 ambiguity first-class");
  equal(ufc.contradictions.length, 0, "37 ambiguity no se mezcla con contradiction");
  check(ufc.ambiguities[0]!.alternativeIds.length === 2, "38 ambiguity enlaza alternativas");
  check(ufc.missingInformation.some((entry) => entry.summary.includes("evidencia suficiente")), "39 missing info específica");
  check(ufc.decisionQuestions.some((question) => question.relatedAlternativeIds.length === 2), "40 pregunta concreta de elección");
  equal(ufc.tradeoffs.length, 1, "41 tradeoff A/B");
  check(ufc.tradeoffs[0]!.dimensions.some((dimension) => dimension.kind === "confidence"), "42 tradeoff confidence sin score");
  check(ufc.tradeoffs[0]!.dimensions.some((dimension) => dimension.kind === "evidence_support"), "43 tradeoff evidencia");
  check(ufc.tradeoffs[0]!.evidenceRefs.length > 0, "44 tradeoff trazable");
  equal(ufc.expectedOutcome?.observed, false, "45 expected no observed");
  equal(ufc.explanation.whatWouldHappenNext, ufc.expectedOutcome?.summary ?? null, "46 outcome explicado sin promesa");
  equal(ufc.priority, "critical_attention", "47 prioridad crítica canónica");
  equal(ufc.authorityHint.target, "Review", "48 authority hint Review");
  equal(ufc.authorityHint.invokes, false, "49 authority metadata only");
  equal(ufc.trace.reviewCaseId, "case:ufc:identity", "50 Review trace");
  check(ufc.trace.sourceReferences.length > 0, "51 referencias completas");

  const equivalent = decisions.find((decision) => decision.trace.contextItemId === "fixture:ufc:equivalent-alternatives")!;
  equal(equivalent.decisionState, "human_decision_required", "52 alternativas plausibles requieren humano");
  equal(equivalent.preferredOption, null, "53 B3 no fuerza highest confidence");
  check(equivalent.alternatives.every((alternative) => alternative.relativeAssessment === "competitive"), "54 alternativas sin recomendación son competitive");
  equal(equivalent.tradeoffs.length, 1, "55 comparación sin preferred");
  equal(equivalent.ambiguities.length, 1, "56 ambigüedad preservada");
  equal(equivalent.humanDecision.status, "required", "57 humano requerido");
  check(equivalent.decisionQuestions.some((question) => question.prompt.includes("Alex Norte") && question.prompt.includes("Álex Sur")), "58 pregunta presenta opciones");

  const conflict = decisions.find((decision) => decision.trace.contextItemId.includes("evidence_conflicting"))!;
  equal(conflict.decisionState, "blocked_by_contradiction", "59 contradicción bloquea decisión");
  equal(conflict.preferredOption, null, "60 contradicción sin preferencia");
  equal(conflict.evidenceAssessment.strength, "contradictory", "61 fuerza contradictory");
  equal(conflict.contradictions.length, 1, "62 contradicción first-class");
  equal(conflict.contradictions[0]?.impact, "blocks_decision", "63 impacto bloqueante");
  check(Boolean(conflict.contradictions[0]?.evidenceRefs.length), "64 contradicción trazable");
  equal(conflict.ambiguities.length, 0, "65 contradiction no es ambiguity");
  check(conflict.explanation.headline.includes("contradictoria"), "66 lenguaje humano");
  check(conflict.humanDecision.explanation?.includes("contradicciones") === true, "67 explica input humano");
  equal(conflict.priority, "critical_attention", "68 contradiction first attention");

  const stale = decisions.find((decision) => decision.trace.contextItemId === "review:case:one:stale")!;
  equal(stale.decisionState, "blocked_by_missing_information", "69 stale bloqueado por información");
  equal(stale.preferredOption, null, "70 stale no ejecutable/preferred");
  equal(stale.freshness.status, "stale", "71 freshness preservada");
  equal(stale.freshness.refreshPerformed, false, "72 B3 no refresca");
  check(stale.explanation.caveats.some((entry) => entry.includes("requiere refresh")), "73 refresh futuro explicado");
  check(stale.missingInformation.some((entry) => entry.summary.includes("actualizado")), "74 desbloqueo específico");

  const insufficient = decisions.find((decision) => decision.trace.contextItemId.includes("news:without-review"))!;
  equal(insufficient.trace.reviewCaseId, undefined, "75 soporte sin ReviewCase");
  equal(insufficient.decisionState, "recommendation_with_caveats", "76 recomendación AG2 con unknowns");
  equal(insufficient.evidenceAssessment.strength, "strong", "77 evidencia AG2 high preservada");
  check(insufficient.missingInformation.length > 0, "78 información faltante visible");

  const external = decisions.find((decision) => decision.trace.contextItemId === "review:case:external:dismissed")!;
  equal(external.decisionState, "no_action_needed", "79 no action explícito");
  equal(external.explanation.headline, "No requiere intervención", "80 no action lenguaje humano");
  equal(external.humanDecision.status, "not_required", "81 no action sin humano");
  equal(external.decisionQuestions.length, 0, "82 no action sin preguntas");
  equal(external.contradictions.length, 0, "83 no action no blocked");
  equal(external.priority, "no_attention", "84 no action sin atención");

  const process = decisions.find((decision) => decision.trace.contextItemId === "process:process:one:events")!;
  equal(process.decisionState, "no_action_needed", "85 proceso en curso no es decisión humana");
  equal(process.preferredOption, null, "86 mantener flujo no se convierte en recomendación");
  equal(process.decisionQuestions.length, 0, "87 flujo actual sin pregunta artificial");
  equal(process.priority, "no_attention", "88 proceso sin atención inventada");

  const repeated = buildDecisionSupport(fixture.proposals);
  assert.deepEqual(repeated, decisions); assertions += 1;
  const reversed = buildDecisionSupport(Object.freeze([...fixture.proposals].reverse().map(reverseProposal)));
  assert.deepEqual(reversed, decisions); assertions += 1;
  equal(JSON.stringify(fixture.proposals), before, "89 proposals B2 no mutadas");
  check(decisions.every((decision, index) => index === 0 || decisions[index - 1]!.id.localeCompare(decision.id) <= 0), "90 orden estable");

  equal(buildDecisionSupport(Object.freeze([])).length, 0, "91 empty input válido");
  const unknown = buildDecisionSupport(Object.freeze([unknownProposal(fixture.proposals[0]!)]))[0]!;
  equal(unknown.decisionState, "human_decision_required", "92 unknown fail-closed");
  equal(unknown.preferredOption, null, "93 unknown sin preferred");
  equal(unknown.evidenceAssessment.strength, "unknown", "94 evidence unknown");
  equal(unknown.alternatives.length, 0, "95 alternativas no inventadas");
  equal(unknown.authorityHint.target, "unknown", "96 authority unknown");
  equal(unknown.expectedOutcome, null, "97 outcome no inventado");

  equal(selectClearDecisionSupport(decisions).length, 1, "98 selector clear");
  equal(selectDecisionSupportRequiringHuman(decisions).length, 3, "99 selector human required");
  equal(selectBlockedDecisionSupport(decisions).length, 3, "100 selector blocked");
  equal(selectContradictoryDecisionSupport(decisions).length, 1, "101 selector contradiction");
  equal(selectDecisionSupportBySource(decisions, "ufc").length, 2, "102 selector source");
  const attention = selectDecisionSupportByAttention([...decisions].reverse());
  equal(attention[0]?.priority, "critical_attention", "103 attention selector first critical");
  equal(attention.at(-1)?.priority, "no_attention", "104 attention selector last no attention");
  equal(JSON.stringify(attention), JSON.stringify(selectDecisionSupportByAttention(decisions)), "105 attention stable");

  for (const decision of decisions) {
    equal(decision.boundary.derived, true, "106 derived");
    equal(decision.boundary.readOnly, true, "106 read-only");
    equal(decision.boundary.explains, true, "106 explains");
    equal(decision.boundary.compares, true, "106 compares");
    equal(decision.boundary.executes, false, "106 no execute");
    equal(decision.boundary.persists, false, "106 no persist");
    equal(decision.boundary.plans, false, "106 no plan");
    equal(decision.boundary.createsAuthority, false, "106 no authority");
    equal(decision.boundary.mutatesProposal, false, "106 no proposal mutation");
    equal(decision.boundary.mutatesReview, false, "106 no Review mutation");
    equal(decision.boundary.decidesAutonomy, false, "106 no autonomy");
    equal(decision.authorityHint.invokes, false, "107 hint does not invoke");
    check(decision.expectedOutcome === null || decision.expectedOutcome.observed === false, "108 expected != observed");
  }

  const path = "_laboratorio/laboratorio-ia/src/agent/context/decisions";
  const files = readdirSync(path).filter((name) => name.endsWith(".ts")).sort();
  const allSource = files.map((name) => source(`${path}/${name}`)).join("\n");
  for (const forbidden of ["store", "executor", "planner", "authority", "memory", "watcher", "scheduler", "autonomy"]) equal(files.some((name) => name.toLowerCase().includes(forbidden)), false, `109 no ${forbidden} file`);
  check(!/from\s+["'][^"']*(?:review|agent-ready|editorial-model)/.test(allSource), "110 consume B2, no raw layers");
  check(!/\b(fetch|axios|XMLHttpRequest)\s*\(/.test(allSource), "111 no network");
  check(!/localStorage|sessionStorage|indexedDB/.test(allSource), "112 no persistence");
  check(!/Math\.random|Date\.now|new Date\s*\(/.test(allSource), "113 no clock/random");
  check(!/createReviewCase\s*\(|transitionReviewCase\s*\(|addReviewResolution\s*\(/.test(allSource), "114 no Review mutation");
  check(!/runAutonomousSupervisedLoop|executeTransaction|dispatchReviewResume|retryNotificationDelivery/.test(allSource), "115 no execution");
  check(!/sanityClient|createClient|notifyTelegram/.test(allSource), "116 no Sanity/Telegram");
  check(!/openai|chatCompletion|streaming|messageHistory|conversationEngine|promptTemplate/i.test(allSource), "117 no LLM/AG4");
  check(!/score\s*:|score\s*[+*/-]/i.test(source(`${path}/builder.ts`)), "118 no scoring engine");

  equal(decisionSupportBuilderSecurity.pure, true, "119 builder pure");
  equal(decisionSupportBuilderSecurity.deterministic, true, "119 deterministic");
  equal(decisionSupportBuilderSecurity.consumesStructuredProposalsOnly, true, "119 B2 only");
  equal(decisionSupportBuilderSecurity.explanationAndComparisonOnly, true, "119 comparison only");
  for (const key of ["createsStore", "createsDecisionStore", "persists", "fetches", "writes", "executes", "createsPlanner", "createsExecutor", "createsAuthority", "mutatesProposal", "mutatesReview", "invokesReview", "invokesAu7", "invokesAu8", "decidesAutonomy", "determinesReadiness", "refreshes", "usesClock", "usesRandomness", "usesLlm"] as const) equal(decisionSupportBuilderSecurity[key], false, `120 security ${key}`);
  equal(decisionSupportSelectorsSecurity.presentationPriorityOnly, true, "121 priority presentation only");
  equal(decisionSupportSelectorsSecurity.plans, false, "121 selector not planner");
  equal(decisionSupportFixtureSecurity.devOnly, true, "122 fixture dev-only");
  for (const key of ["createsStore", "persists", "fetches", "writes", "executes", "sanity", "telegram", "externalApis"] as const) equal(decisionSupportFixtureSecurity[key], false, `122 fixture ${key}`);

  check(source("_laboratorio/laboratorio-ia/src/agent/context/index.ts").includes('export * from "./decisions"'), "123 export público B3");
  check(source("scripts/test-ag3-structured-proposals.ts").length > 100 && source("scripts/test-ag3-agent-context-composer.ts").length > 100, "124 suites B1/B2 presentes");
  check(assertions >= 290, `expected at least 290 assertions, got ${assertions}`);
  console.log(`AG3 B3 Decision Support: OK (${assertions} assertions; B2-only explanation/comparison, optional preference, evidence strength without scoring, first-class contradiction/ambiguity/missing information, human framing, deterministic attention and zero store/planner/executor/authority/write/network/LLM)`);
}

main();
