import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {
  agentConversationContextSecurity,
  agentConversationExplainabilitySecurity,
  agentConversationReferenceResolverSecurity,
  buildAgentConversationExchange,
  buildAgentConversationModel,
  createAgentConversationContext,
  resolveAgentConversationReference,
  routeAgentConversationIntent,
  type AgentConversationContext,
} from "../_laboratorio/laboratorio-ia/src/agent/conversation";
import {buildAgentWorkspaceFixture, buildAgentWorkspaceModel} from "../_laboratorio/laboratorio-ia/src/agent/workspace";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");

function contextFocused(model: ReturnType<typeof buildAgentConversationModel>, decisionSupportId: string): AgentConversationContext {
  const item = model.explainabilityItems.find((candidate) => candidate.decisionSupportId === decisionSupportId)!;
  return Object.freeze({snapshotIdentity: model.snapshotIdentity, currentCaseId: model.currentCaseId, focusedDecisionSupportId: item.decisionSupportId, focusedProposalId: item.proposalId, previousReferencedIds: Object.freeze([]), lastReferencedIds: Object.freeze([]), lastIntentType: "show_ambiguous" as const});
}

function main(): void {
  const fixture = buildAgentWorkspaceFixture();
  const workspace = buildAgentWorkspaceModel(fixture.decisions, {reviewSearch: "?fixture=agent-workspace"});
  const model = buildAgentConversationModel(fixture.decisions, workspace, {proposals: fixture.proposals});
  const before = JSON.stringify({decisions: fixture.decisions, proposals: fixture.proposals, workspace});

  equal(model.explainabilityItems.length, fixture.decisions.length, "1 projection per visible decision");
  check(model.explainabilityItems.every((item) => item.decisionSupportId && item.proposalId && item.snapshotIdentity), "2 trace identities retained");
  check(model.explainabilityItems.every((item) => item.reference.decisionSupportId === item.decisionSupportId && item.reference.proposalId === item.proposalId), "3 references carry internal metadata");
  const ufc = model.explainabilityItems.find((item) => item.reviewCaseId === "case:ufc:identity")!;
  check(ufc.facts.length > 0 && ufc.inferences.length > 0 && ufc.hypotheses.length > 0, "4 epistemic evidence available");
  equal(ufc.alternatives.length, 2, "5 real alternatives preserved");
  equal(ufc.recommendation?.label, "Usar Alex Norte", "6 real recommendation preserved");
  check(ufc.missingInformation.length === 2 && ufc.expectedOutcome?.observed === false, "7 missing and expected outcome preserved");

  const intentCases = [
    ["¿Por qué?", "why"], ["¿Por qué dices eso?", "why"], ["¿Por qué está bloqueado?", "why"],
    ["¿Qué evidencia tienes?", "evidence"], ["¿En qué te basas?", "evidence"], ["¿Qué datos apoyan eso?", "evidence"],
    ["¿Qué alternativas hay?", "alternatives"], ["¿Qué otras opciones tengo?", "alternatives"],
    ["¿Por qué recomiendas esa?", "why_recommended"], ["¿Por qué esa opción?", "why_recommended"],
    ["¿Qué falta?", "missing_information"], ["¿Qué necesitas saber?", "missing_information"],
    ["¿Qué pasaría después?", "expected_next"], ["¿Qué ocurriría si se aprueba?", "expected_next"], ["¿Qué pasaría si lo hago?", "expected_next"],
    ["Explícame esa", "explain_reference"], ["Explícame la anterior", "explain_reference"], ["Explícame la dudosa", "explain_reference"],
  ] as const;
  for (const [input, expected] of intentCases) equal(routeAgentConversationIntent(input).intent.type, expected, `router ${input}`);
  equal(routeAgentConversationIntent("Hazlo").intent.type, "action_guard", "8 action remains guarded");
  equal(routeAgentConversationIntent("Entonces hazlo").intent.type, "action_guard", "9 contextual action remains guarded");

  let context = createAgentConversationContext(model);
  equal(context.focusedDecisionSupportId, null, "10 initial context empty");
  equal(context.lastReferencedIds.length, 0, "11 reload has no reference memory");
  const doubtful = buildAgentConversationExchange(model, "Enséñame la dudosa", context, 0);
  context = doubtful.context;
  equal(context.focusedDecisionSupportId, ufc.decisionSupportId, "12 doubtful focuses real UFC decision");
  equal(context.focusedProposalId, ufc.proposalId, "13 proposal focus trace");
  equal(doubtful.turn.agentMessage.metadata.referencedReviewCaseIds[0], "case:ufc:identity", "14 case metadata");

  const why = buildAgentConversationExchange(model, "¿Por qué?", context, 1);
  context = why.context;
  equal(why.resolution?.reason, "last_reference", "15 follow-up uses last explicit reference");
  equal(why.resolution?.item?.decisionSupportId, ufc.decisionSupportId, "16 why same object");
  check(why.turn.agentMessage.sections.some((section) => section.label === "Motivos" && section.items.length > 0), "17 why from explanation reasons");
  check(why.turn.agentMessage.sections.some((section) => section.label === "Dudas abiertas"), "18 why exposes ambiguity");

  const evidence = buildAgentConversationExchange(model, "¿Qué evidencia tienes?", context, 2);
  context = evidence.context;
  equal(evidence.resolution?.item?.decisionSupportId, ufc.decisionSupportId, "19 evidence same object");
  assert.deepEqual(evidence.turn.agentMessage.sections.map((section) => section.label), ["Hechos", "Inferencias", "Hipótesis"]); assertions += 1;
  check(evidence.turn.agentMessage.sections.every((section) => section.items.length > 0), "20 no invented empty categories");
  check(evidence.turn.agentMessage.sections.find((section) => section.label === "Hechos")!.items.every((item) => item.includes("Fuente:")), "21 fact sources visible");
  check(!JSON.stringify(evidence.turn.agentMessage.sections).includes("case:ufc:identity"), "22 raw case ID hidden from evidence copy");

  const alternatives = buildAgentConversationExchange(model, "¿Qué alternativas hay?", context, 3);
  context = alternatives.context;
  equal(alternatives.resolution?.item?.decisionSupportId, ufc.decisionSupportId, "23 alternatives same object");
  assert.deepEqual(alternatives.turn.agentMessage.sections.map((section) => section.label), ["Usar Alex Norte", "Usar Álex Sur"]); assertions += 1;
  check(alternatives.turn.agentMessage.sections[0]!.items.some((item) => item.startsWith("A favor:")), "24 strengths humanized");
  check(alternatives.turn.agentMessage.sections[1]!.items.some((item) => item.startsWith("En contra:")), "25 weaknesses humanized");
  check(alternatives.turn.agentMessage.sections.every((section) => section.items.some((item) => item.includes("Viable según AG3"))), "26 viability preserved without scoring");

  const recommended = buildAgentConversationExchange(model, "¿Por qué recomiendas esa?", context, 4);
  context = recommended.context;
  check(recommended.turn.agentMessage.text.includes("Usar Alex Norte") && recommended.turn.agentMessage.text.includes("no equivale a certeza"), "27 recommendation distinct from certainty");
  check(recommended.turn.agentMessage.sections.some((section) => section.label === "Por qué no las demás" && section.items.some((item) => item.includes("Álex Sur"))), "28 rejected alternative explained");
  check(recommended.turn.agentMessage.sections.some((section) => section.label === "Reservas e incertidumbre"), "29 caveats visible");

  const missing = buildAgentConversationExchange(model, "¿Qué falta?", context, 5);
  context = missing.context;
  equal(missing.turn.agentMessage.sections.find((section) => section.label === "Información pendiente")?.items.length, 2, "30 real missing information");

  const expected = buildAgentConversationExchange(model, "¿Qué pasaría después?", context, 6);
  context = expected.context;
  check(expected.turn.agentMessage.text.startsWith("Si posteriormente se autoriza,"), "31 expected outcome conditional");
  equal(expected.turn.agentMessage.metadata.expectedOutcomeObserved, false, "32 expected outcome stays unobserved");
  check(!expected.turn.agentMessage.text.startsWith("Se hará"), "33 no future asserted as fact");

  const explainPrevious = buildAgentConversationExchange(model, "Explícame la anterior", context, 7);
  equal(explainPrevious.resolution?.item?.decisionSupportId, ufc.decisionSupportId, "34 explain previous same object");
  check(explainPrevious.turn.agentMessage.sections.some((section) => section.label === "Recomendación"), "35 explain summary covers recommendation");
  check(explainPrevious.turn.agentMessage.references[0]?.href?.includes("case=case%3Aufc%3Aidentity"), "36 explanation navigates to canonical Review case");

  const action = buildAgentConversationExchange(model, "Entonces hazlo", context, 8);
  equal(action.turn.route.intent.type, "action_guard", "37 action collision guarded");
  check(action.turn.agentMessage.text.includes("no puedo ejecutar acciones"), "38 action does not execute");
  const hypothetical = buildAgentConversationExchange(model, "¿Qué pasaría si lo hago?", context, 9);
  equal(hypothetical.turn.route.intent.type, "expected_next", "39 hypothetical collision explained");

  const urlWorkspace = buildAgentWorkspaceModel(fixture.decisions, {reviewSearch: "?fixture=agent-workspace&case=case%3Afixture%3Abkfc%3Aclear"});
  const urlModel = buildAgentConversationModel(fixture.decisions, urlWorkspace, {currentCaseId: "case:fixture:bkfc:clear", proposals: fixture.proposals});
  const urlResolution = resolveAgentConversationReference(urlModel, createAgentConversationContext(urlModel), routeAgentConversationIntent("¿Por qué UFC?", {currentCaseId: urlModel.currentCaseId}));
  equal(urlResolution.reason, "current_case", "40 URL case wins");
  equal(urlResolution.item?.reviewCaseId, "case:fixture:bkfc:clear", "41 URL case chosen over explicit source");

  const explicitResolution = resolveAgentConversationReference(model, createAgentConversationContext(model), routeAgentConversationIntent("¿Por qué UFC?"));
  equal(explicitResolution.reason, "explicit_reference", "42 explicit reference wins without URL");
  equal(explicitResolution.item?.reviewCaseId, "case:ufc:identity", "43 explicit UFC resolved");

  const focusedBkfc = contextFocused(model, model.explainabilityItems.find((item) => item.reviewCaseId === "case:fixture:bkfc:clear")!.decisionSupportId);
  const focusedResolution = resolveAgentConversationReference(model, focusedBkfc, routeAgentConversationIntent("¿Por qué?"));
  equal(focusedResolution.reason, "focused_reference", "44 focused reference fallback");
  equal(focusedResolution.item?.reviewCaseId, "case:fixture:bkfc:clear", "45 focused object resolved");

  const uniqueResolution = resolveAgentConversationReference(model, createAgentConversationContext(model), routeAgentConversationIntent("¿Por qué?"));
  equal(uniqueResolution.reason, "unique_ambiguous", "46 unique ambiguous fallback");
  equal(uniqueResolution.item?.decisionSupportId, ufc.decisionSupportId, "47 unique ambiguous object");

  const recommendations = buildAgentConversationExchange(model, "¿Qué recomiendas?", createAgentConversationContext(model), 0);
  equal(recommendations.context.lastReferencedIds.length, 2, "48 multiple references retained");
  equal(recommendations.context.focusedDecisionSupportId, null, "49 multiple references do not guess focus");
  const ambiguous = buildAgentConversationExchange(model, "¿Por qué esa?", recommendations.context, 1);
  equal(ambiguous.resolution?.status, "ambiguous", "50 two candidates fail closed");
  check(ambiguous.turn.agentMessage.text.startsWith("No puedo saber con seguridad"), "51 ambiguity asks for selection");
  equal(ambiguous.turn.agentMessage.references.length, 2, "52 ambiguity offers both read-only references");

  const staleWorkspace = buildAgentWorkspaceModel(fixture.decisions, {reviewSearch: "?fixture=agent-workspace&case=case%3Aone%3Astale"});
  const staleModel = buildAgentConversationModel(fixture.decisions, staleWorkspace, {currentCaseId: "case:one:stale", proposals: fixture.proposals});
  const stale = buildAgentConversationExchange(staleModel, "¿Qué evidencia tienes?", createAgentConversationContext(staleModel));
  equal(stale.resolution?.status, "stale", "53 stale reference fails closed");
  check(stale.turn.agentMessage.text.includes("desactualizada"), "54 stale reason human");

  const reducedDecisions = fixture.decisions.filter((decision) => !decision.ambiguities.length);
  const reducedWorkspace = buildAgentWorkspaceModel(reducedDecisions, {reviewSearch: "?fixture=agent-workspace"});
  const reducedModel = buildAgentConversationModel(reducedDecisions, reducedWorkspace, {proposals: fixture.proposals});
  const missingReference = buildAgentConversationExchange(reducedModel, "¿Por qué?", createAgentConversationContext(reducedModel));
  equal(missingReference.resolution?.status, "missing", "55 missing reference fails closed");
  check(missingReference.turn.agentMessage.text.includes("No tengo una referencia segura"), "56 missing reference guidance");

  const changedDecisions = fixture.decisions.map((decision) => Object.freeze({...decision, trace: Object.freeze({...decision.trace, agentContextSnapshotIdentity: "agent-context:changed"})}));
  const changedWorkspace = buildAgentWorkspaceModel(changedDecisions, {reviewSearch: "?fixture=agent-workspace"});
  const changedModel = buildAgentConversationModel(changedDecisions, changedWorkspace, {proposals: fixture.proposals});
  const changed = buildAgentConversationExchange(changedModel, "¿Por qué?", context);
  equal(changed.resolution?.reason, "snapshot_changed", "57 snapshot change invalidates old context");
  equal(changed.context.focusedDecisionSupportId, null, "58 snapshot change clears focus");
  equal(changed.context.lastReferencedIds.length, 0, "59 snapshot change clears last references");

  const contradictionItem = model.explainabilityItems.find((item) => item.contradictions.length)!;
  const contradiction = buildAgentConversationExchange(model, "¿Por qué?", contextFocused(model, contradictionItem.decisionSupportId));
  check(contradiction.turn.agentMessage.sections.some((section) => section.label === "Contradicciones" && section.items.length), "60 contradiction explained from AG3");

  const clearMissing = buildAgentConversationExchange(urlModel, "¿Qué falta?", createAgentConversationContext(urlModel));
  equal(clearMissing.turn.agentMessage.text, "No falta información relevante para entender este caso.", "61 no missing info invented");
  const noOutcome = buildAgentConversationExchange(staleModel, "¿Qué pasaría después?", createAgentConversationContext(staleModel));
  equal(noOutcome.resolution?.status, "stale", "62 stale prevents expected outcome explanation");

  equal(JSON.stringify({decisions: fixture.decisions, proposals: fixture.proposals, workspace}), before, "63 no AG3/workspace mutation");
  check(agentConversationContextSecurity.ephemeral && agentConversationContextSecurity.idsOnly && !agentConversationContextSecurity.persists, "64 context ephemeral IDs only");
  check(agentConversationReferenceResolverSecurity.pure && agentConversationReferenceResolverSecurity.revalidatesSnapshot && agentConversationReferenceResolverSecurity.revalidatesFreshness && !agentConversationReferenceResolverSecurity.guesses, "65 resolver safe");
  check(agentConversationExplainabilitySecurity.pure && agentConversationExplainabilitySecurity.preservesEpistemicStatus && !agentConversationExplainabilitySecurity.llm && !agentConversationExplainabilitySecurity.executes, "66 explainability boundary");

  const conversationPath = "_laboratorio/laboratorio-ia/src/agent/conversation";
  const conversationSource = readdirSync(conversationPath).filter((file) => file.endsWith(".ts")).map((file) => source(`${conversationPath}/${file}`)).join("\n");
  const component = source("_laboratorio/laboratorio-ia/src/agent/workspace/AgentConversation.tsx");
  const styles = source("_laboratorio/laboratorio-ia/src/styles.css");
  check(component.includes("createAgentConversationContext") && component.includes("buildAgentConversationExchange"), "67 context integrated locally");
  check(component.includes("agent-conversation-section") && component.includes("Profundiza en este asunto"), "68 structured explainability and suggestions visible");
  check(styles.includes(".agent-conversation-followups .review-button { min-height: 44px") && styles.includes(".agent-conversation-section"), "69 accessible explainability styles");
  check(component.includes('aria-live="polite"') && component.includes('type="submit"'), "70 existing accessible conversation intact");
  check(!/\b(?:localStorage|sessionStorage|indexedDB)\b/.test(conversationSource + component), "71 no persistent memory");
  check(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(conversationSource + component), "72 no network");
  check(!/createReviewCase|transitionReviewCase|addReviewResolution|executeTransaction|runAutonomous/.test(conversationSource + component), "73 no domain mutation/execution");
  check(!/\b(?:ConversationStore|AgentStore|createStore|useReviewCases|getReviewCases|subscribeTo)\b/.test(conversationSource + component), "74 no parallel stores");
  check(!/openai\s*\(|chatCompletion\s*\(|embedding\s*\(|stream\s*\(/i.test(conversationSource + component), "75 no LLM/OpenAI");

  const ufcReference = buildAgentConversationExchange(model, "Revisa UFC", createAgentConversationContext(model), 0);
  const bkfcReference = buildAgentConversationExchange(model, "Revisa BKFC", ufcReference.context, 1);
  const previousDistinct = buildAgentConversationExchange(model, "Explícame la anterior", bkfcReference.context, 2);
  equal(previousDistinct.resolution?.item?.reviewCaseId, "case:ufc:identity", "76 previous resolves the prior distinct reference");
  check(!/review_nucleus|\binsufficient\b|\bconfidences\b/i.test(JSON.stringify([...alternatives.turn.agentMessage.sections, ...recommended.turn.agentMessage.sections])), "77 technical proposal copy humanized");
  check(!/LES 8:review|AG[12] (?:evidence|signal|diagnosis)/i.test(JSON.stringify(evidence.turn.agentMessage.sections)), "78 evidence source labels humanized");

  console.log(`AG4 B4 Conversational Explainability: PASS (${assertions} assertions)`);
}

main();
