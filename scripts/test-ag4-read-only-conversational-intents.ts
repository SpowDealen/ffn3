import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {
  AGENT_CONVERSATION_INTENT_PRIORITY,
  agentConversationNormalizerSecurity,
  agentConversationResponderSecurity,
  agentConversationRouterSecurity,
  buildAgentConversationModel,
  buildAgentConversationQueryTurn,
  buildAgentConversationTurn,
  normalizeConversationInput,
  respondToConversationQuery,
  routeAgentConversationIntent,
} from "../_laboratorio/laboratorio-ia/src/agent/conversation";
import {buildAgentWorkspaceFixture, buildAgentWorkspaceModel} from "../_laboratorio/laboratorio-ia/src/agent/workspace";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");
const routeType = (input: string, caseId?: string) => routeAgentConversationIntent(input, {currentCaseId: caseId}).intent.type;

function main(): void {
  const fixture = buildAgentWorkspaceFixture();
  const workspace = buildAgentWorkspaceModel(fixture.decisions, {reviewSearch: "?fixture=agent-workspace"});
  const before = JSON.stringify({decisions: fixture.decisions, workspace});

  equal(normalizeConversationInput("  ¿QUÉ   cambió?  "), "que cambio", "1 normalization trim/case/space/punctuation/accents");
  check(agentConversationNormalizerSecurity.deterministic && agentConversationNormalizerSecurity.accentInsensitive && !agentConversationNormalizerSecurity.fuzzy, "2 normalizer explicit and non-fuzzy");

  for (const input of ["¿Qué necesita mi atención?", "¿Qué tengo pendiente?", "¿Qué debo mirar?", "¿Qué requiere revisión?"]) equal(routeType(input), "attention", `attention: ${input}`);
  for (const input of ["¿Qué está bloqueado?", "¿Qué no puede continuar?", "¿Qué está parado?"]) equal(routeType(input), "blocked", `blocked: ${input}`);
  for (const input of ["¿Qué recomiendas?", "¿Qué harías?", "¿Qué opción recomiendas?"]) equal(routeType(input), "recommendations", `recommendations: ${input}`);
  for (const input of ["¿Qué ha pasado?", "¿Qué cambió?", "¿Qué novedades hay?"]) equal(routeType(input), "recent_changes", `recent: ${input}`);

  const ufc = routeAgentConversationIntent("REViSA, UFC!!!").intent;
  check(ufc.type === "review_source" && ufc.source === "ufc", "3 UFC case/punctuation");
  const one = routeAgentConversationIntent("¿Qué hay de ONE Championship?").intent;
  check(one.type === "review_source" && one.source === "one", "4 ONE alias");
  const bkfc = routeAgentConversationIntent("¿Qué hay de Bare Knuckle?").intent;
  check(bkfc.type === "review_source" && bkfc.source === "bkfc", "5 BKFC alias");

  const withCase = routeAgentConversationIntent("Explícame este caso", {currentCaseId: "case:ufc:identity"}).intent;
  check(withCase.type === "explain_current_case" && withCase.caseId === "case:ufc:identity", "6 current case safe context");
  const withoutCase = routeAgentConversationIntent("¿Qué pasa con este caso?").intent;
  check(withoutCase.type === "explain_current_case" && withoutCase.caseId === null, "7 current case absent");
  equal(routeType("Enséñame la dudosa"), "show_ambiguous", "8 ambiguous/show intent");
  equal(routeType("Abre este caso", "case:ufc:identity"), "navigate_review", "9 navigation with case");
  equal(routeType("Llévame a revisión"), "navigate_review", "10 navigation inbox");
  equal(routeType("texto absurdo sin sentido"), "unsupported", "11 unsupported");
  const emptyRoute = routeAgentConversationIntent("   ").intent;
  check(emptyRoute.type === "unsupported" && emptyRoute.reason === "empty", "11b empty input unsupported");
  equal(routeType("Hazlo"), "action_guard", "12 action guard");
  const guardedSource = routeAgentConversationIntent("Haz algo con UFC").intent;
  check(guardedSource.type === "action_guard" && guardedSource.source === "ufc", "13 ambiguous action+source fails closed by priority");
  assert.deepEqual(AGENT_CONVERSATION_INTENT_PRIORITY, ["action_guard", "navigate_review", "review_source", "explain_current_case", "show_ambiguous", "blocked", "recommendations", "attention", "recent_changes", "unsupported"]); assertions += 1;
  const normalizedRoute = routeAgentConversationIntent("  ¿QUÉ RECOMIENDAS?! ");
  const plainRoute = routeAgentConversationIntent("que recomiendas");
  equal(normalizedRoute.normalizedInput, plainRoute.normalizedInput, "same normalized phrase");
  assert.deepEqual(normalizedRoute.intent, plainRoute.intent); assertions += 1;

  const attention = respondToConversationQuery("¿Qué tengo pendiente?", fixture.decisions, workspace);
  equal(attention.response.status, "answered", "14 attention answered");
  check(attention.response.message.text.includes("4 asuntos") && attention.response.message.text.includes("2 están bloqueados"), "15 attention real counts");
  equal(attention.response.message.references.length, 3, "16 attention bounded references");

  const blocked = respondToConversationQuery("¿Qué está parado?", fixture.decisions, workspace).response;
  check(blocked.message.text.includes("2 asuntos bloqueados"), "17 blocked real count");
  equal(blocked.message.references.length, 2, "18 blocked references");

  const recommendations = respondToConversationQuery("¿Qué harías?", fixture.decisions, workspace).response;
  check(recommendations.message.text.includes("2 recomendaciones"), "19 recommendation count");
  check(recommendations.message.highlights.some((item) => item.includes("Alex Norte")) && recommendations.message.highlights.some((item) => item.includes("BKFC")), "20 recommendations real content");

  const recent = respondToConversationQuery("¿Qué ha pasado?", fixture.decisions, workspace).response;
  check(recent.message.text.includes("No tengo una ventana temporal fiable") && recent.message.text.includes("estado actual"), "21 recent is honest");
  check(!/hoy|ayer|esta semana/i.test(recent.message.text), "22 recent invents no window");

  const sourceUfc = respondToConversationQuery("Revisa UFC", fixture.decisions, workspace).response;
  check(sourceUfc.message.text.startsWith("UFC: 1 asunto"), "23 UFC scope count");
  check(sourceUfc.message.highlights.join(" ").includes("Necesitan atención: 1") && sourceUfc.message.highlights.join(" ").includes("Necesitan tu decisión: 1"), "24 UFC metrics");
  check(sourceUfc.message.references.every((reference) => reference.sourceLabel === "UFC"), "25 UFC references scoped");

  const sourceOne = respondToConversationQuery("Revisa ONE", fixture.decisions, workspace).response;
  check(sourceOne.message.text.startsWith("ONE Championship: 1 asunto"), "26 ONE scope exists");
  check(sourceOne.message.highlights.join(" ").includes("Bloqueados: 1"), "27 ONE blocker");
  check(sourceOne.message.references.every((reference) => reference.sourceLabel === "ONE Championship"), "28 ONE references scoped");

  const sourceBkfc = respondToConversationQuery("Revisa BKFC", fixture.decisions, workspace).response;
  check(sourceBkfc.message.text.startsWith("BKFC: 1 asunto"), "29 BKFC scope count");
  check(sourceBkfc.message.highlights.join(" ").includes("Recomendaciones: 1"), "30 BKFC recommendation");
  check(sourceBkfc.message.references.every((reference) => reference.sourceLabel === "BKFC"), "31 BKFC references scoped");

  const emptySource = respondToConversationQuery("Revisa UFC", fixture.decisions.filter((decision) => decision.subject.source !== "ufc"), buildAgentWorkspaceModel(fixture.decisions.filter((decision) => decision.subject.source !== "ufc"))).response;
  equal(emptySource.message.text, "No hay asuntos de UFC en el estado actual.", "32 empty source honest");

  const noCaseModel = buildAgentConversationModel(fixture.decisions, workspace);
  equal(noCaseModel.responses.explainCurrentCase.message.text, "No tengo un caso concreto seleccionado.", "33 explain without case contextual fail-closed");
  const caseModel = buildAgentConversationModel(fixture.decisions, workspace, {currentCaseId: "case:ufc:identity"});
  const explanation = caseModel.responses.explainCurrentCase.message;
  check(explanation.text.length > 20 && explanation.highlights.some((item) => item.includes("Alex Norte")), "34 explain case what/why/recommendation");
  check(explanation.highlights.some((item) => /decisi[oó]n|humana/i.test(item)), "35 explain human need");
  check(explanation.references[0]?.href?.includes("case=case%3Aufc%3Aidentity"), "36 explain safe case reference");

  const ambiguous = respondToConversationQuery("Muéstrame la ambigua", fixture.decisions, workspace).response;
  check(ambiguous.message.text.includes("necesita tu decisión"), "37 ambiguous explains ordering");
  equal(ambiguous.message.references[0]?.sourceLabel, "UFC", "38 ambiguous first by AG3 ordering");

  const action = respondToConversationQuery("Hazlo", fixture.decisions, workspace);
  equal(action.response.status, "unsupported", "39 action unsupported");
  check(action.response.message.text.startsWith("Todavía no puedo ejecutar acciones"), "40 action message explicit");
  const ambiguousAction = respondToConversationQuery("Haz algo con UFC", fixture.decisions, workspace).response;
  check(ambiguousAction.message.text.includes("revisar el estado de UFC") && ambiguousAction.message.text.includes("no ejecutar"), "41 action+source nuanced guard");
  const unsupported = respondToConversationQuery("inventame una portada", fixture.decisions, workspace).response;
  check(unsupported.message.text.startsWith("No puedo interpretar esa petición con seguridad"), "42 unsupported guidance");

  const navigation = noCaseModel.responses.navigateReview.message;
  equal(navigation.references[0]?.actionLabel, "Abrir revisión", "43 navigation CTA read-only");
  equal(navigation.references[0]?.href, "/revision?fixture=agent-workspace", "44 navigation preserves fixture");
  const caseNavigation = caseModel.responses.navigateReview.message;
  check(caseNavigation.references[0]?.href?.includes("case=case%3Aufc%3Aidentity"), "45 navigation selected case");
  check(caseNavigation.text.includes("No ejecutaré ninguna acción"), "46 navigation does not execute");

  const presetTurn = buildAgentConversationTurn(noCaseModel, "attention");
  const typedTurn = buildAgentConversationQueryTurn(noCaseModel, "¿Qué necesita mi atención?");
  assert.deepEqual(presetTurn.route, typedTurn.route); assertions += 1;
  assert.deepEqual(presetTurn.agentMessage, typedTurn.agentMessage); assertions += 1;
  equal(presetTurn.promptId, "attention", "47 preset identified");
  equal(typedTurn.promptId, null, "48 typed query identified");
  assert.deepEqual(buildAgentConversationQueryTurn(noCaseModel, "¿Qué cambió?", 2), buildAgentConversationQueryTurn(noCaseModel, "¿Qué cambió?", 2)); assertions += 1;
  check(buildAgentConversationQueryTurn(noCaseModel, "Hazlo").agentMessage.kind === "system_notice", "49 guarded turn visible");
  equal(JSON.stringify({decisions: fixture.decisions, workspace}), before, "50 no mutation");

  check(fixture.decisions.some((decision) => decision.subject.source === "one" && decision.freshness.status === "stale"), "51 ONE fixture minimal existing AG3 data");
  check(fixture.reviewCases.some((reviewCase) => reviewCase.id === "case:one:stale"), "52 ONE Review deep link resolves");

  const conversationPath = "_laboratorio/laboratorio-ia/src/agent/conversation";
  const conversationSource = readdirSync(conversationPath).filter((file) => file.endsWith(".ts")).map((file) => source(`${conversationPath}/${file}`)).join("\n");
  const component = source("_laboratorio/laboratorio-ia/src/agent/workspace/AgentConversation.tsx");
  const screen = source("_laboratorio/laboratorio-ia/src/app/screens/LaboratoryStatusScreen.tsx");
  const styles = source("_laboratorio/laboratorio-ia/src/styles.css");

  check(component.includes('<label htmlFor="agent-conversation-query">') && component.includes('type="text"'), "53 accessible label/input");
  check(component.includes("Pregunta por prioridades, bloqueos o una fuente…") && component.includes("maxLength={240}") && !component.includes("Pregúntame cualquier cosa"), "54 honest bounded input");
  check(component.includes("onSubmit={submit}") && component.includes('type="submit"'), "55 native Enter submit");
  check(component.includes("inputRef.current?.focus()") && styles.includes(".agent-conversation-form input:focus-visible"), "56 focus contract");
  check(component.includes("slice(-8)") && component.includes("localStateOnly"), "57 bounded ephemeral history");
  check(component.includes("buildAgentConversationQueryTurn") && component.includes("preset.label"), "58 presets and free text share router");
  check(screen.includes("new URLSearchParams(agentReviewSearch).get(\"case\")") && screen.includes("{currentCaseId}"), "59 safe case context from router search");
  check(styles.includes(".agent-conversation-form input, .agent-conversation-form button { min-height: 44px") && styles.includes(".agent-conversation-form button { width: 100%"), "60 targets desktop/mobile");
  check(component.includes('aria-live="polite"') && component.includes("Puedo consultar y explicar el estado"), "61 live region and visible limits");

  check(agentConversationRouterSecurity.pure && agentConversationRouterSecurity.deterministic && agentConversationRouterSecurity.readOnly && !agentConversationRouterSecurity.planner && !agentConversationRouterSecurity.executor && !agentConversationRouterSecurity.authority, "62 router is not planner/executor/authority");
  check(agentConversationResponderSecurity.pure && agentConversationResponderSecurity.readOnly && !agentConversationResponderSecurity.llm && !agentConversationResponderSecurity.openAi && !agentConversationResponderSecurity.embeddings, "63 responder no LLM/OpenAI/embeddings");
  check(!agentConversationResponderSecurity.executes && !agentConversationResponderSecurity.persists && !agentConversationResponderSecurity.writes && !agentConversationResponderSecurity.mutatesReview && !agentConversationResponderSecurity.invokesAu7 && !agentConversationResponderSecurity.invokesAu8, "64 zero execution/domain effects");
  check(!/\b(?:localStorage|sessionStorage|indexedDB)\b/.test(conversationSource + component), "65 no persistence");
  check(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(conversationSource + component), "66 no network");
  check(!/createReviewCase|transitionReviewCase|addReviewResolution|executeTransaction|runAutonomous/.test(conversationSource + component), "67 no Review/domain mutation");
  check(!/\b(?:ConversationStore|AgentStore|createStore|useReviewCases|getReviewCases|subscribeTo)\b/.test(conversationSource + component), "68 no parallel store");
  check(!/openai\s*\(|chatCompletion\s*\(|embedding\s*\(|stream\s*\(/i.test(conversationSource + component), "69 no LLM calls");
  const docs = source("docs/AG4_READ_ONLY_CONVERSATIONAL_INTENTS.md");
  check(docs.includes("## Normalización y prioridad") && docs.includes("## Guardas y límites"), "70 routing documented");
  check(docs.includes("LLM/OpenAI/embeddings/streaming: ninguno") && docs.includes("Efectos externos: cero"), "71 boundaries documented");

  console.log(`AG4 B3 Read-only Conversational Intents: PASS (${assertions} assertions)`);
}

main();
