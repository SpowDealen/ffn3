import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  agentConversationContextSecurity,
  agentConversationExplainabilitySecurity,
  agentConversationReferenceResolverSecurity,
  agentConversationResponderSecurity,
  agentConversationRouterSecurity,
  buildAgentConversationExchange,
  buildAgentConversationModel,
  createAgentConversationContext,
} from "../_laboratorio/laboratorio-ia/src/agent/conversation";
import {
  agentWorkspaceFixtureSecurity,
  agentWorkspacePresentationSecurity,
  buildAgentWorkspaceFixture,
  buildAgentWorkspaceModel,
} from "../_laboratorio/laboratorio-ia/src/agent/workspace";
import {agentConversationComponentSecurity} from "../_laboratorio/laboratorio-ia/src/agent/workspace/AgentConversation";
import {agentWorkspaceComponentSecurity} from "../_laboratorio/laboratorio-ia/src/agent/workspace/AgentWorkspace";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");

function main(): void {
  const fixture = buildAgentWorkspaceFixture();
  const workspace = buildAgentWorkspaceModel(fixture.decisions, {reviewSearch: "?fixture=agent-workspace"});
  const conversation = buildAgentConversationModel(fixture.decisions, workspace, {proposals: fixture.proposals});
  const before = JSON.stringify({fixture, workspace, conversation});

  check(workspace.presentationOnly && workspace.boundary.consumesDecisionSupport, "1 B1 workspace projection");
  equal(workspace.metrics.needsAttention, 4, "2 B1 real attention");
  check(workspace.priorityItems.some((item) => item.sourceLabel === "UFC") && workspace.priorityItems.some((item) => item.sourceLabel === "ONE Championship") && workspace.priorityItems.some((item) => item.sourceLabel === "BKFC"), "3 B1 multisource");
  check(agentWorkspacePresentationSecurity.pure && !agentWorkspacePresentationSecurity.executes, "4 B1 pure");

  equal(conversation.presets.length, 3, "5 B2 presets");
  check(conversation.initialMessage.text.startsWith("He revisado el laboratorio"), "6 B2 summary");
  check(conversation.ephemeral && conversation.boundary.readOnly && !conversation.boundary.sourceOfTruth, "7 B2 ephemeral projection");
  check(agentConversationResponderSecurity.pure && agentConversationResponderSecurity.deterministic, "8 B2 responder");

  const typed = buildAgentConversationExchange(conversation, "Revisa UFC", createAgentConversationContext(conversation));
  equal(typed.turn.route.intent.type, "review_source", "9 B3 free text routed");
  check(typed.turn.agentMessage.text.startsWith("UFC: 1 asunto"), "10 B3 source scoped");
  const unsupported = buildAgentConversationExchange(conversation, "texto que no entiendo", typed.context, 1);
  equal(unsupported.turn.route.intent.type, "unsupported", "11 B3 unsupported");
  const guarded = buildAgentConversationExchange(conversation, "Hazlo", typed.context, 2);
  equal(guarded.turn.route.intent.type, "action_guard", "12 B3 action guard");
  check(agentConversationRouterSecurity.readOnly && !agentConversationRouterSecurity.planner && !agentConversationRouterSecurity.executor, "13 B3 router boundary");

  let context = createAgentConversationContext(conversation);
  const doubtful = buildAgentConversationExchange(conversation, "Enséñame la dudosa", context, 0);
  context = doubtful.context;
  const focusedId = context.focusedDecisionSupportId;
  check(Boolean(focusedId), "14 B4 real focus");
  const flow = ["¿Por qué?", "¿Qué evidencia tienes?", "¿Qué alternativas hay?", "¿Qué falta?", "¿Qué pasaría después?"];
  const intentTypes = ["why", "evidence", "alternatives", "missing_information", "expected_next"];
  for (let index = 0; index < flow.length; index += 1) {
    const exchange = buildAgentConversationExchange(conversation, flow[index]!, context, index + 1);
    equal(exchange.turn.route.intent.type, intentTypes[index], `B4 route ${intentTypes[index]}`);
    equal(exchange.resolution?.item?.decisionSupportId, focusedId, `B4 same object ${intentTypes[index]}`);
    context = exchange.context;
  }
  const evidence = buildAgentConversationExchange(conversation, "¿Qué evidencia tienes?", context, 7);
  assert.deepEqual(evidence.turn.agentMessage.sections.map((section) => section.label), ["Hechos", "Inferencias", "Hipótesis"]); assertions += 1;
  const alternatives = buildAgentConversationExchange(conversation, "¿Qué alternativas hay?", context, 8);
  equal(alternatives.turn.agentMessage.sections.length, 2, "15 B4 alternatives");
  const recommendation = buildAgentConversationExchange(conversation, "¿Por qué recomiendas esa?", context, 9);
  check(recommendation.turn.agentMessage.text.includes("no equivale a certeza"), "16 B4 recommendation nuance");
  const expected = buildAgentConversationExchange(conversation, "¿Qué pasaría después?", context, 10);
  check(expected.turn.agentMessage.text.startsWith("Si posteriormente se autoriza,"), "17 B4 conditional outcome");
  equal(expected.turn.agentMessage.metadata.expectedOutcomeObserved, false, "18 B4 expected not observed");

  const multi = buildAgentConversationExchange(conversation, "¿Qué recomiendas?", createAgentConversationContext(conversation), 0);
  const ambiguous = buildAgentConversationExchange(conversation, "¿Por qué esa?", multi.context, 1);
  equal(ambiguous.resolution?.status, "ambiguous", "19 B4 ambiguity fail-closed");
  check(ambiguous.turn.agentMessage.references.length === 2, "20 B4 disambiguation refs");

  check(agentConversationContextSecurity.ephemeral && agentConversationContextSecurity.idsOnly && !agentConversationContextSecurity.persists, "21 no memory store");
  check(agentConversationReferenceResolverSecurity.revalidatesSnapshot && agentConversationReferenceResolverSecurity.revalidatesFreshness && !agentConversationReferenceResolverSecurity.guesses, "22 safe references");
  check(agentConversationExplainabilitySecurity.preservesEpistemicStatus && !agentConversationExplainabilitySecurity.sourceOfTruth, "23 evidence semantics");
  check(agentConversationComponentSecurity.localStateOnly && agentConversationComponentSecurity.contextIdsOnly && agentConversationComponentSecurity.boundedTurns === 8, "24 UI local bounded context");
  check(!agentWorkspaceComponentSecurity.fetches && !agentWorkspaceComponentSecurity.persists && !agentWorkspaceComponentSecurity.writes && !agentWorkspaceComponentSecurity.executes, "25 workspace zero effects");
  check(!agentConversationResponderSecurity.fetches && !agentConversationResponderSecurity.writes && !agentConversationResponderSecurity.executes && !agentConversationResponderSecurity.mutatesReview, "26 conversation zero effects");
  check(!agentConversationResponderSecurity.invokesAu7 && !agentConversationResponderSecurity.invokesAu8 && !agentConversationResponderSecurity.llm && !agentConversationResponderSecurity.openAi && !agentConversationResponderSecurity.embeddings, "27 no AU/LLM");
  check(agentWorkspaceFixtureSecurity.devOnly && agentWorkspaceFixtureSecurity.readOnly && !agentWorkspaceFixtureSecurity.fetches && !agentWorkspaceFixtureSecurity.writes, "28 fixture safe");

  const component = source("_laboratorio/laboratorio-ia/src/agent/workspace/AgentConversation.tsx");
  const conversationSource = ["context.ts", "explainability.ts", "normalize.ts", "prompts.ts", "references.ts", "responder.ts", "router.ts", "types.ts"].map((file) => source(`_laboratorio/laboratorio-ia/src/agent/conversation/${file}`)).join("\n");
  check(component.includes("Profundiza en este asunto") && component.includes("agent-conversation-section"), "29 B4 visible");
  check(component.includes('aria-live="polite"') && component.includes('type="submit"') && component.includes("minLength") === false, "30 accessible native input");
  check(!/\b(?:localStorage|sessionStorage|indexedDB)\b/.test(conversationSource + component), "31 no persistence");
  check(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(conversationSource + component), "32 no network");
  check(!/createReviewCase|transitionReviewCase|addReviewResolution|executeTransaction|runAutonomous/.test(conversationSource + component), "33 no domain mutation");
  check(!/\b(?:ConversationStore|AgentStore|createStore|useReviewCases|getReviewCases|subscribeTo)\b/.test(conversationSource + component), "34 no parallel stores");
  check(!/openai\s*\(|chatCompletion\s*\(|embedding\s*\(|stream\s*\(/i.test(conversationSource + component), "35 no LLM calls");
  check(source("docs/AG4_VISIBLE_AGENT_WORKSPACE.md").length > 100 && source("docs/AG4_CONVERSATIONAL_SURFACE.md").length > 100 && source("docs/AG4_READ_ONLY_CONVERSATIONAL_INTENTS.md").length > 100, "36 B1-B3 docs intact");
  check(source("docs/AG4_CONVERSATIONAL_EXPLAINABILITY.md").includes("## Fuente de verdad y resolución") && source("docs/AG4_CONVERSATIONAL_EXPLAINABILITY.md").includes("Efectos externos: cero"), "36b B4 contract documented");
  check(source("scripts/test-ag4-visible-agent-workspace.ts").length > 100 && source("scripts/test-ag4-conversational-surface.ts").length > 100 && source("scripts/test-ag4-read-only-conversational-intents.ts").length > 100 && source("scripts/test-ag4-conversational-explainability.ts").length > 100, "37 B1-B4 suites present");
  equal(JSON.stringify({fixture, workspace, conversation}), before, "38 no input mutation");

  console.log(`AG4 Full Certification B1→B4: PASS (${assertions} assertions; contextual references, traceable explainability, epistemic separation, ambiguity/freshness guards and zero effects)`);
}

main();
