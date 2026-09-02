import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {
  AGENT_CONVERSATION_PROMPTS,
  agentConversationPromptsSecurity,
  agentConversationResponderSecurity,
  buildAgentConversationModel,
  buildAgentConversationTurn,
  respondToConversationPrompt,
} from "../_laboratorio/laboratorio-ia/src/agent/conversation";
import {createDecisionSupportFixture} from "../_laboratorio/laboratorio-ia/src/agent/context/decisions";
import {buildAgentWorkspaceFixture, buildAgentWorkspaceModel} from "../_laboratorio/laboratorio-ia/src/agent/workspace";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");

function main(): void {
  const fixture = buildAgentWorkspaceFixture();
  const workspace = buildAgentWorkspaceModel(fixture.decisions, {reviewSearch: "?fixture=agent-workspace"});
  const before = JSON.stringify({decisions: fixture.decisions, workspace});
  const conversation = buildAgentConversationModel(fixture.decisions, workspace);

  equal(conversation.initialMessage.role, "agent", "1 initial role agent");
  equal(conversation.initialMessage.kind, "summary", "2 initial kind summary");
  check(conversation.initialMessage.text.startsWith("He revisado el laboratorio."), "3 initial human intro");
  check(conversation.initialMessage.text.includes("3 asuntos necesitan tu atención"), "4 initial real count");
  check(conversation.initialMessage.text.includes("1 tiene una recomendación clara"), "5 initial recommendation count");
  check(conversation.initialMessage.text.includes("1 necesita tu decisión"), "6 initial human decision count");

  equal(AGENT_CONVERSATION_PROMPTS.length, 3, "7 closed preset count");
  assert.deepEqual(AGENT_CONVERSATION_PROMPTS.map((prompt) => prompt.label), ["¿Qué necesita mi atención?", "¿Qué está bloqueado?", "¿Qué recomiendas?"]); assertions += 1;
  equal(conversation.presets.length, 3, "8 model contains presets");

  const attention = respondToConversationPrompt("attention", fixture.decisions, workspace);
  equal(attention.status, "answered", "9 attention answered");
  check(attention.message.text.includes("3 asuntos") && attention.message.text.includes("1 está bloqueado"), "10 attention groups real state");
  check(attention.message.highlights.some((entry) => entry.startsWith("Empieza por")), "11 attention orients first item");
  check(attention.message.highlights.some((entry) => entry.includes("necesita tu decisión")), "12 attention highlights human decision");
  equal(attention.message.references.length, 3, "13 attention limited references");

  const blocked = respondToConversationPrompt("blocked", fixture.decisions, workspace);
  equal(blocked.status, "answered", "14 blocked answered");
  check(blocked.message.text.includes("un asunto bloqueado"), "15 blocked real count");
  check(blocked.message.highlights.some((entry) => entry.includes("Falta resolver")), "16 blocked says what is missing");
  equal(blocked.message.references.length, 1, "17 blocked reference");
  equal(blocked.message.references[0]?.kind, "decision_support", "18 blocked without Review does not invent case");

  const recommendations = respondToConversationPrompt("recommendations", fixture.decisions, workspace);
  equal(recommendations.status, "answered", "19 recommendations answered");
  check(recommendations.message.text.includes("2 recomendaciones") && recommendations.message.text.includes("1 es clara") && recommendations.message.text.includes("1 requiere revisión"), "20 recommendations grouped");
  check(recommendations.message.highlights.some((entry) => entry.includes("UFC: Usar Alex Norte")), "21 UFC preferred option");
  check(recommendations.message.highlights.some((entry) => entry.includes("BKFC: Usar BKFC")), "22 BKFC preferred option");
  check(recommendations.message.references.every((reference) => reference.href?.startsWith("/revision?fixture=agent-workspace&case=") && ["Revisar caso", "Ver caso"].includes(reference.actionLabel ?? "")), "23 references navigation only");
  check(!JSON.stringify(recommendations).match(/Resolver|Aprobar|Aplicar|Continuar/), "24 no action CTA");

  const noBlockedDecisions = fixture.decisions.filter((decision) => !decision.decisionState.startsWith("blocked_by_"));
  const noBlockedWorkspace = buildAgentWorkspaceModel(noBlockedDecisions);
  equal(respondToConversationPrompt("blocked", noBlockedDecisions, noBlockedWorkspace).message.text, "No hay asuntos bloqueados ahora mismo.", "25 no blockers honest");
  const noRecommendationDecisions = fixture.decisions.filter((decision) => !["clear_recommendation", "recommendation_with_caveats"].includes(decision.decisionState));
  const noRecommendationWorkspace = buildAgentWorkspaceModel(noRecommendationDecisions);
  equal(respondToConversationPrompt("recommendations", noRecommendationDecisions, noRecommendationWorkspace).message.text, "No hay recomendaciones disponibles con la evidencia actual.", "26 no recommendations honest");

  const emptyWorkspace = buildAgentWorkspaceModel([]);
  const emptyConversation = buildAgentConversationModel([], emptyWorkspace);
  check(emptyConversation.initialMessage.text.includes("No hay nada que requiera tu atención"), "27 empty initial coherent");
  equal(respondToConversationPrompt("attention", [], emptyWorkspace).message.text, "No hay nada que requiera tu atención ahora mismo.", "28 empty attention coherent");
  equal(respondToConversationPrompt("blocked", [], emptyWorkspace).message.text, "No hay asuntos bloqueados ahora mismo.", "29 empty blocked coherent");
  equal(respondToConversationPrompt("recommendations", [], emptyWorkspace).message.text, "No hay recomendaciones disponibles con la evidencia actual.", "30 empty recommendations coherent");

  const ag3 = createDecisionSupportFixture();
  const staleDecision = ag3.decisions.find((decision) => decision.freshness.status === "stale")!;
  const staleWorkspace = buildAgentWorkspaceModel([staleDecision]);
  check(buildAgentConversationModel([staleDecision], staleWorkspace).initialMessage.text.includes("El análisis puede estar desactualizado."), "31 stale visible");

  const linkedCaseIds = recommendations.message.references.map((reference) => reference.href ? new URL(reference.href, "http://localhost").searchParams.get("case") : null).filter(Boolean);
  check(linkedCaseIds.every((caseId) => fixture.reviewCases.some((reviewCase) => reviewCase.id === caseId)), "32 references resolve in Review fixture");
  check(recommendations.message.references.every((reference) => reference.sourceLabel && reference.entityLabel && reference.label), "33 references human labels");
  check(recommendations.message.references.every((reference) => reference.kind === "review_case"), "34 review references explicit");

  const repeated = buildAgentConversationModel(fixture.decisions, workspace);
  assert.deepEqual(repeated, conversation); assertions += 1;
  const reversedDecisions = Object.freeze([...fixture.decisions].reverse());
  const reversedWorkspace = buildAgentWorkspaceModel(reversedDecisions, {reviewSearch: "?fixture=agent-workspace"});
  assert.deepEqual(buildAgentConversationModel(reversedDecisions, reversedWorkspace), conversation); assertions += 1;
  equal(JSON.stringify({decisions: fixture.decisions, workspace}), before, "35 no mutation");
  equal(repeated.snapshotIdentity, conversation.snapshotIdentity, "36 same snapshot same identity");

  const unsupported = respondToConversationPrompt("unexpected", fixture.decisions, workspace);
  equal(unsupported.status, "unsupported", "37 unknown fails closed");
  equal(unsupported.message.kind, "system_notice", "38 unknown system notice");
  equal(unsupported.message.text, "Esta versión del agente solo puede consultar y explicar el estado.", "39 unknown no improvisation");
  equal(respondToConversationPrompt("Hazlo", fixture.decisions, workspace).message.text, unsupported.message.text, "40 action intent fails closed");

  const turn = buildAgentConversationTurn(conversation, "recommendations");
  equal(turn.operatorMessage.role, "operator", "41 operator role");
  equal(turn.operatorMessage.kind, "question", "42 operator question");
  equal(turn.agentMessage.role, "agent", "43 agent role");
  equal(turn.agentMessage.kind, "answer", "44 agent answer");
  equal(turn.operatorMessage.text, "¿Qué recomiendas?", "45 prompt preserved");
  assert.deepEqual(buildAgentConversationTurn(conversation, "recommendations"), turn); assertions += 1;
  check(turn.id.includes("recommendations") && turn.id.includes("turn"), "46 stable turn ID");
  check(turn.operatorMessage.readOnly && turn.agentMessage.readOnly, "47 messages read-only");

  check(conversation.ephemeral && conversation.boundary.readOnly && !conversation.boundary.sourceOfTruth, "48 ephemeral projection boundary");
  check(!conversation.boundary.executes && !conversation.boundary.persists && !conversation.boundary.plans && !conversation.boundary.createsAuthority && !conversation.boundary.mutatesReview, "49 zero authority/effects boundary");
  check(agentConversationPromptsSecurity.closedSet && !agentConversationPromptsSecurity.freeText && !agentConversationPromptsSecurity.actionIntents, "50 closed prompts");
  check(agentConversationResponderSecurity.pure && agentConversationResponderSecurity.deterministic && agentConversationResponderSecurity.readOnly, "51 responder pure deterministic read-only");
  check(!agentConversationResponderSecurity.createsStore && !agentConversationResponderSecurity.persists && !agentConversationResponderSecurity.fetches && !agentConversationResponderSecurity.writes, "52 no store/network/write");
  check(!agentConversationResponderSecurity.executes && !agentConversationResponderSecurity.plans && !agentConversationResponderSecurity.createsAuthority && !agentConversationResponderSecurity.mutatesReview, "53 no planner/executor/authority/Review mutation");
  check(!agentConversationResponderSecurity.invokesAu7 && !agentConversationResponderSecurity.invokesAu8 && !agentConversationResponderSecurity.llm && !agentConversationResponderSecurity.openAi && !agentConversationResponderSecurity.streaming, "54 no AU/LLM/OpenAI/streaming");

  const conversationPath = "_laboratorio/laboratorio-ia/src/agent/conversation";
  const conversationSource = readdirSync(conversationPath).filter((file) => file.endsWith(".ts")).map((file) => source(`${conversationPath}/${file}`)).join("\n");
  const component = source("_laboratorio/laboratorio-ia/src/agent/workspace/AgentConversation.tsx");
  const workspaceComponent = source("_laboratorio/laboratorio-ia/src/agent/workspace/AgentWorkspace.tsx");
  const screen = source("_laboratorio/laboratorio-ia/src/app/screens/LaboratoryStatusScreen.tsx");
  const styles = source("_laboratorio/laboratorio-ia/src/styles.css");

  check(component.includes("useState") && component.includes("useEffect") && component.includes("model.snapshotIdentity"), "55 local state resets on snapshot");
  check(component.includes("current.turns.filter((entry) => entry.promptId !== promptId)"), "56 one turn per preset");
  check(component.includes('aria-live="polite"') && component.includes('aria-label="Conversación con el Agente Editorial"'), "57 semantic live message list");
  check(component.includes("InteractionButton") && component.includes("InteractionLink"), "58 LES5 controls/navigation");
  check(component.includes("FeedbackBanner") && component.includes("No he podido preparar la respuesta"), "59 fail-soft LES1");
  check(component.includes("Agente") && component.includes("Tú") && component.includes("Solo consulta"), "60 roles/read-only visible");
  check(!/<input|<textarea|contentEditable|placeholder=/.test(component), "61 no fake free text");
  check(workspaceComponent.includes("<AgentConversation") && screen.includes("buildAgentConversationModel"), "62 integrated into B1");
  check(styles.includes(".agent-conversation-prompts .review-button { min-height: 44px") && styles.includes("@media (max-width: 680px)"), "63 accessible responsive targets");
  check(styles.includes("max-height: 430px") && styles.includes("overflow-y: auto"), "64 bounded thread");
  check(!/\b(?:localStorage|sessionStorage|indexedDB)\b/.test(conversationSource + component), "65 no persistence");
  check(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(conversationSource + component), "66 no network");
  check(!/createReviewCase|transitionReviewCase|addReviewResolution|executeTransaction|runAutonomous/.test(conversationSource + component), "67 no domain mutation/execution");
  check(!/\b(?:ConversationStore|AgentStore|createStore|useReviewCases|getReviewCases|subscribeTo)\b/.test(conversationSource + component), "68 no parallel stores");
  check(!/openai\s*\(|chatCompletion\s*\(|stream\s*\(/i.test(conversationSource + component), "69 no LLM calls");
  check(source("scripts/test-ag4-visible-agent-workspace.ts").includes("AG4 B1 Visible Agent Workspace: PASS") && source("scripts/test-ag3-full-certification.ts").length > 100, "70 B1/AG3 intact");

  console.log(`AG4 B2 Conversational Surface: PASS (${assertions} assertions)`);
}

main();
