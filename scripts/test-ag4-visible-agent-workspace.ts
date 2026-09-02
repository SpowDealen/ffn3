import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {
  agentWorkspaceFixtureSecurity,
  agentWorkspacePresentationSecurity,
  buildAgentWorkspaceFixture,
  buildAgentWorkspaceModel,
} from "../_laboratorio/laboratorio-ia/src/agent/workspace";
import {createDecisionSupportFixture, selectDecisionSupportByAttention} from "../_laboratorio/laboratorio-ia/src/agent/context/decisions";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");

function main(): void {
  const ag3 = createDecisionSupportFixture();
  const fixture = buildAgentWorkspaceFixture();
  const before = JSON.stringify(fixture.decisions);
  const model = buildAgentWorkspaceModel(fixture.decisions, {reviewSearch: "?fixture=agent-workspace"});

  const noAction = ag3.decisions.filter((decision) => decision.decisionState === "no_action_needed");
  const clear = ag3.decisions.find((decision) => decision.decisionState === "clear_recommendation")!;
  const blocked = ag3.decisions.find((decision) => decision.decisionState === "blocked_by_contradiction")!;
  const stale = ag3.decisions.find((decision) => decision.freshness.status === "stale")!;

  equal(buildAgentWorkspaceModel(noAction).status, "calm", "1 estado calm");
  equal(buildAgentWorkspaceModel([clear]).status, "attention", "2 estado attention");
  equal(buildAgentWorkspaceModel([blocked]).status, "blocked", "3 estado blocked");
  const empty = buildAgentWorkspaceModel([]);
  equal(empty.status, "empty", "4 estado empty");
  equal(empty.priorityItems.length, 0, "5 empty sin items artificiales");
  check(empty.summary.includes("todavía no tiene asuntos relevantes"), "6 empty humano");

  equal(model.metrics.needsAttention, 4, "7 métrica attention");
  equal(model.metrics.clearRecommendations, 1, "8 métrica clear recommendation");
  equal(model.metrics.humanDecisionRequired, 1, "9 métrica human decision");
  equal(model.metrics.blocked, 2, "10 métrica blocked");
  equal(model.metrics.noAction, 1, "11 métrica no action");
  check(model.summary.includes("4 asuntos necesitan tu atención"), "12 summary directo");

  const expectedOrder = selectDecisionSupportByAttention(fixture.decisions).filter((decision) => decision.priority !== "no_attention").map((decision) => decision.id);
  assert.deepEqual(model.priorityItems.map((item) => item.id), expectedOrder); assertions += 1;
  check(model.priorityItems.every((item) => !noAction.some((decision) => decision.id === item.id)), "13 no-action fuera de prioridad");
  equal(model.hiddenPriorityCount, 0, "14 límite sin elementos ocultos");
  equal(buildAgentWorkspaceModel(ag3.decisions, {priorityLimit: 2}).priorityItems.length, 2, "15 lista limitada");

  const human = model.priorityItems.find((item) => item.kind === "human_decision")!;
  equal(human.statusLabel, "Necesita tu decisión", "16 label decisión humana");
  check(Boolean(human.humanDecisionReason), "17 decisión humana explicada");
  equal(human.sourceLabel, "UFC", "18 source label UFC");
  equal(human.entityLabel, "Noticia", "19 entity label humana");
  equal(human.recommendation, "Usar Alex Norte", "20 recomendación AG3 preservada");
  equal(human.confidenceLabel, "Recomendación de confianza alta", "21 confidence canónica humanizada");
  check(human.href?.includes("/revision?fixture=agent-workspace&case=case%3Aufc%3Aidentity"), "22 deep link preserva fixture y case");
  equal(human.actionLabel, "Revisar caso", "23 CTA read-only");

  const blockedItem = model.priorityItems.find((item) => item.kind === "blocked")!;
  equal(blockedItem.statusLabel, "Bloqueado por contradicción", "24 contradicción humanizada");
  check(blockedItem.title === "Evidencia contradictoria en evento" && !blockedItem.title.includes("event:conflicting"), "25 IDs crudos ocultos");
  check(Boolean(blockedItem.blockedBy), "26 bloqueo explica qué falta");
  equal(blockedItem.href, null, "27 sin autoridad Review no inventa destino");

  const staleModel = buildAgentWorkspaceModel([stale]);
  equal(staleModel.priorityItems[0]?.staleWarning, "Este análisis puede estar desactualizado.", "28 stale humanizado");
  equal(staleModel.priorityItems[0]?.sourceLabel, "ONE Championship", "29 source ONE humanizada");
  check(model.priorityItems.some((item) => item.sourceLabel === "BKFC"), "30 source BKFC");
  check(model.priorityItems.some((item) => item.sourceLabel === "Análisis editorial"), "31 source técnica humanizada");

  assert.deepEqual(buildAgentWorkspaceModel(fixture.decisions, {reviewSearch: "?fixture=agent-workspace"}), model); assertions += 1;
  equal(JSON.stringify(fixture.decisions), before, "32 input no mutado");
  check(model.presentationOnly && model.boundary.consumesDecisionSupport && model.boundary.readOnly, "33 boundary projection read-only");
  check(!model.boundary.executes && !model.boundary.persists && !model.boundary.createsAuthority && !model.boundary.mutatesReview, "34 boundary sin efectos");

  equal(fixture.decisions.length, 5, "35 fixture autocontenido");
  check(["clear_recommendation", "recommendation_with_caveats", "blocked_by_contradiction", "no_action_needed"].every((state) => fixture.decisions.some((decision) => decision.decisionState === state)), "36 fixture cubre estados");
  check(new Set(fixture.decisions.map((decision) => decision.subject.source)).size >= 4, "37 fixture multisource");
  const linkedCaseIds = model.priorityItems.map((item) => item.href ? new URL(item.href, "http://localhost").searchParams.get("case") : null).filter(Boolean);
  check(linkedCaseIds.every((caseId) => fixture.reviewCases.some((reviewCase) => reviewCase.id === caseId)), "38 deep links resuelven en Review fixture");
  check(agentWorkspaceFixtureSecurity.devOnly && agentWorkspaceFixtureSecurity.readOnly && !agentWorkspaceFixtureSecurity.writes && !agentWorkspaceFixtureSecurity.fetches, "39 fixture DEV-safe");
  check(!agentWorkspaceFixtureSecurity.accessesSanity && !agentWorkspaceFixtureSecurity.accessesTelegram && !agentWorkspaceFixtureSecurity.accessesExternalApis, "40 fixture sin integraciones");
  check(!agentWorkspaceFixtureSecurity.invokesAu7 && !agentWorkspaceFixtureSecurity.invokesAu8, "41 fixture no invoca AU7/AU8");

  const workspacePath = "_laboratorio/laboratorio-ia/src/agent/workspace";
  const workspaceFiles = readdirSync(workspacePath).filter((file) => /\.(?:ts|tsx)$/.test(file));
  const workspaceSource = workspaceFiles.map((file) => source(`${workspacePath}/${file}`)).join("\n");
  const component = source(`${workspacePath}/AgentWorkspace.tsx`);
  const presentation = source(`${workspacePath}/presentation.ts`);
  const app = source("_laboratorio/laboratorio-ia/src/app/LaboratoryApp.tsx");
  const screen = source("_laboratorio/laboratorio-ia/src/app/screens/LaboratoryStatusScreen.tsx");
  const styles = source("_laboratorio/laboratorio-ia/src/styles.css");

  check(component.includes("Agente Editorial") && component.includes("Prioridades editoriales"), "42 summary visible");
  check(component.includes("FeedbackSkeleton") && component.includes('loadState === "loading"'), "43 loading LES1");
  check(component.includes("FeedbackBanner") && component.includes('loadState === "error"'), "44 error fail-soft LES1");
  check(component.includes("FeedbackEmptyState") && component.includes('model.status === "empty"'), "45 empty LES1");
  check(component.includes("InteractionLink") && component.includes("adaptNavigationInteraction"), "46 navegación LES5");
  check(component.includes("Necesita tu decisión.") && component.includes("Qué falta:"), "47 decisión y bloqueo visibles");
  check(screen.indexOf("<AgentWorkspace") < screen.indexOf("<GlobalStatusSummary"), "48 ubicado arriba en Inicio");
  check(app.includes('search.get("fixture") === AGENT_WORKSPACE_FIXTURE_QUERY') && app.includes("import.meta.env.DEV"), "49 fixture solo DEV");
  check(app.includes("buildReviewContextSearch(search)") && !app.includes("window.location"), "50 routing existente sin hard reload");
  check(styles.includes(".agent-workspace-item .interaction-link, .agent-workspace-more .interaction-link { min-height: 44px") && styles.includes("@media (max-width: 560px)"), "51 targets y mobile");
  check(styles.includes("@media (prefers-reduced-motion: reduce) { .agent-workspace { animation: none; }"), "52 reduced motion");
  check(component.includes('aria-labelledby="agent-workspace-title"') && component.includes("<h2") && component.includes("<h3") && component.includes("<h4"), "53 jerarquía accesible");
  check(!/<textarea|contentEditable|type="text"|placeholder=/.test(component), "54 sin conversación/input");
  check(!/\b(?:localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest)\b/.test(workspaceSource), "55 workspace sin persistencia/red");
  check(!/createReviewCase|transitionReviewCase|addReviewResolution|executeTransaction|runAutonomous/.test(workspaceSource), "56 sin mutations/ejecución");
  check(!/\b(?:ConversationStore|AgentStore|createStore|useReviewCases|getReviewCases|subscribeTo)\b/.test(workspaceSource), "57 sin stores ni suscripciones");
  check(!/openai|chat completion|streaming|prompt template/i.test(workspaceSource), "58 sin LLM/chat");
  check(presentation.includes("selectDecisionSupportByAttention") && !component.includes("selectDecisionSupportByAttention"), "59 prioridad B3 fuera de React");
  check(agentWorkspacePresentationSecurity.pure && agentWorkspacePresentationSecurity.deterministic && agentWorkspacePresentationSecurity.consumesDecisionSupportOnly, "60 adapter puro sobre B3");
  check(!agentWorkspacePresentationSecurity.createsStore && !agentWorkspacePresentationSecurity.writes && !agentWorkspacePresentationSecurity.executes, "61 adapter sin efectos");
  check(source("scripts/test-ag3-full-certification.ts").length > 100 && source("scripts/test-au10-final-certification.ts").length > 100, "62 AG3/AU10 intactos");

  console.log(`AG4 B1 Visible Agent Workspace: PASS (${assertions} assertions)`);
}

main();
