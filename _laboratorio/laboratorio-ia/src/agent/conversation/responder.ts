import {
  selectBlockedDecisionSupport,
  selectDecisionSupportByAttention,
  selectDecisionSupportBySource,
  selectDecisionSupportRequiringHuman,
  type AgentDecisionSupport,
} from "../context/decisions";
import type {AgentWorkspaceModel, AgentWorkspacePriorityItem} from "../workspace/types";
import {AGENT_CONVERSATION_PROMPTS, isAgentConversationPromptId} from "./prompts";
import {routeAgentConversationIntent} from "./router";
import type {
  AgentConversationIntent,
  AgentConversationMessage,
  AgentConversationModel,
  AgentConversationPromptId,
  AgentConversationReference,
  AgentConversationResponse,
  AgentConversationRoute,
  AgentConversationSource,
  AgentConversationTurn,
} from "./types";

const UNSUPPORTED_TEXT = "No puedo interpretar esa petición con seguridad todavía. Puedo ayudarte con atención, bloqueos, recomendaciones, novedades y revisión por fuente.";
const ACTION_GUARD_TEXT = "Todavía no puedo ejecutar acciones desde la conversación. Puedo explicarte el caso o llevarte a Revisión.";
const SOURCE_LABELS: Readonly<Record<AgentConversationSource, string>> = Object.freeze({ufc: "UFC", one: "ONE Championship", bkfc: "BKFC"});

function stableIdentity(decisions: readonly AgentDecisionSupport[], currentCaseId: string | null = null): string {
  const identities = [...new Set(decisions.map((decision) => decision.trace.agentContextSnapshotIdentity))].sort();
  const snapshot = identities.length ? identities.join("+") : "agent-context:empty";
  return currentCaseId ? `${snapshot}:case:${currentCaseId}` : snapshot;
}

function stableIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "empty";
}

function message(
  snapshotIdentity: string,
  suffix: string,
  role: AgentConversationMessage["role"],
  kind: AgentConversationMessage["kind"],
  text: string,
  highlights: readonly string[] = Object.freeze([]),
  references: readonly AgentConversationReference[] = Object.freeze([]),
): AgentConversationMessage {
  return Object.freeze({
    id: `agent-conversation:${stableIdPart(snapshotIdentity)}:${suffix}`,
    role,
    kind,
    text,
    highlights: Object.freeze([...highlights]),
    references: Object.freeze([...references]),
    readOnly: true as const,
  });
}

function workspaceItem(workspace: AgentWorkspaceModel, decisionId: string): AgentWorkspacePriorityItem | undefined {
  return workspace.priorityItems.find((item) => item.id === decisionId);
}

function referenceFor(decision: AgentDecisionSupport, workspace: AgentWorkspaceModel): AgentConversationReference {
  const item = workspaceItem(workspace, decision.id);
  const sourceLabel = item?.sourceLabel ?? SOURCE_LABELS[decision.subject.source as AgentConversationSource] ?? "Laboratorio";
  const entityLabel = item?.entityLabel ?? "Asunto editorial";
  const label = item?.title ?? decision.explanation.headline;
  return Object.freeze({
    id: `agent-conversation-reference:${decision.id}`,
    kind: item?.href ? "review_case" as const : "decision_support" as const,
    label,
    sourceLabel,
    entityLabel,
    href: item?.href ?? null,
    actionLabel: item?.actionLabel ?? null,
  });
}

function referencesFor(decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel): readonly AgentConversationReference[] {
  return Object.freeze(decisions.slice(0, 3).map((decision) => referenceFor(decision, workspace)));
}

function answered(snapshotIdentity: string, suffix: string, text: string, highlights: readonly string[] = [], references: readonly AgentConversationReference[] = []): AgentConversationResponse {
  return Object.freeze({status: "answered" as const, message: message(snapshotIdentity, `${suffix}-answer`, "agent", "answer", text, highlights, references)});
}

function attentionResponse(decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel, snapshotIdentity: string): AgentConversationResponse {
  const attention = selectDecisionSupportByAttention(decisions).filter((decision) => decision.priority !== "no_attention");
  if (!attention.length) return answered(snapshotIdentity, "attention", "No hay nada que requiera tu atención ahora mismo.");
  const first = workspaceItem(workspace, attention[0]!.id);
  const text = `Hay ${attention.length} ${attention.length === 1 ? "asunto que necesita" : "asuntos que necesitan"} tu atención. ${workspace.metrics.blocked ? `${workspace.metrics.blocked} ${workspace.metrics.blocked === 1 ? "está bloqueado" : "están bloqueados"}.` : "No hay bloqueos actuales."}`;
  const highlights = [
    first ? `Empieza por ${first.title}: ${first.statusLabel.toLowerCase()}.` : `Empieza por ${attention[0]!.explanation.headline.toLowerCase()}.`,
    workspace.metrics.humanDecisionRequired ? `${workspace.metrics.humanDecisionRequired} ${workspace.metrics.humanDecisionRequired === 1 ? "asunto necesita" : "asuntos necesitan"} tu decisión.` : "Ningún asunto requiere una decisión humana.",
  ];
  return answered(snapshotIdentity, "attention", text, highlights, referencesFor(attention, workspace));
}

function blockedResponse(decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel, snapshotIdentity: string): AgentConversationResponse {
  const blocked = selectBlockedDecisionSupport(decisions);
  if (!blocked.length) return answered(snapshotIdentity, "blocked", "No hay asuntos bloqueados ahora mismo.");
  const highlights = blocked.slice(0, 3).map((decision) => {
    const item = workspaceItem(workspace, decision.id);
    const title = item?.title ?? decision.explanation.headline;
    const missing = item?.blockedBy ?? decision.missingInformation[0]?.summary ?? decision.humanDecision.explanation;
    return missing ? `${title}. Falta resolver: ${missing}` : `${title}.`;
  });
  return answered(snapshotIdentity, "blocked", `${blocked.length === 1 ? "Hay un asunto bloqueado" : `Hay ${blocked.length} asuntos bloqueados`} antes de que el flujo pueda continuar.`, highlights, referencesFor(blocked, workspace));
}

function recommendationsResponse(decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel, snapshotIdentity: string): AgentConversationResponse {
  const recommendations = selectDecisionSupportByAttention(decisions).filter((decision) => decision.preferredOption !== null && (decision.decisionState === "clear_recommendation" || decision.decisionState === "recommendation_with_caveats"));
  if (!recommendations.length) return answered(snapshotIdentity, "recommendations", "No hay recomendaciones disponibles con la evidencia actual.");
  const clear = recommendations.filter((decision) => decision.decisionState === "clear_recommendation").length;
  const reserved = recommendations.length - clear;
  const parts = [clear ? `${clear} ${clear === 1 ? "es clara" : "son claras"}` : null, reserved ? `${reserved} ${reserved === 1 ? "requiere revisión" : "requieren revisión"}` : null].filter((part): part is string => Boolean(part));
  const highlights = recommendations.slice(0, 3).map((decision) => `${workspaceItem(workspace, decision.id)?.sourceLabel ?? "Laboratorio"}: ${decision.preferredOption!.label}. ${decision.explanation.summary}`);
  return answered(snapshotIdentity, "recommendations", `Tengo ${recommendations.length} ${recommendations.length === 1 ? "recomendación" : "recomendaciones"}: ${parts.join(" y ")}.`, highlights, referencesFor(recommendations, workspace));
}

function sourceResponse(source: AgentConversationSource, decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel, snapshotIdentity: string): AgentConversationResponse {
  const scoped = selectDecisionSupportBySource(decisions, source);
  const label = SOURCE_LABELS[source];
  if (!scoped.length) return answered(snapshotIdentity, `source-${source}`, `No hay asuntos de ${label} en el estado actual.`);
  const attention = scoped.filter((decision) => decision.priority !== "no_attention").length;
  const blocked = selectBlockedDecisionSupport(scoped).length;
  const recommendations = scoped.filter((decision) => decision.preferredOption && ["clear_recommendation", "recommendation_with_caveats"].includes(decision.decisionState)).length;
  const human = scoped.filter((decision) => decision.humanDecision.status === "required" || decision.decisionState === "human_decision_required").length;
  const noAction = scoped.filter((decision) => decision.decisionState === "no_action_needed").length;
  const text = `${label}: ${scoped.length} ${scoped.length === 1 ? "asunto" : "asuntos"} en el estado actual.`;
  const highlights = [`Necesitan atención: ${attention}. Bloqueados: ${blocked}.`, `Recomendaciones: ${recommendations}. Necesitan tu decisión: ${human}. Sin acción: ${noAction}.`];
  return answered(snapshotIdentity, `source-${source}`, text, highlights, referencesFor(scoped, workspace));
}

function recentChangesResponse(workspace: AgentWorkspaceModel, snapshotIdentity: string): AgentConversationResponse {
  return answered(snapshotIdentity, "recent-changes", `No tengo una ventana temporal fiable para afirmar qué cambió. Solo puedo resumir el estado actual: ${workspace.summary}`);
}

function ambiguousResponse(decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel, snapshotIdentity: string): AgentConversationResponse {
  const ambiguous = selectDecisionSupportRequiringHuman(decisions);
  if (!ambiguous.length) return answered(snapshotIdentity, "ambiguous", "No hay asuntos que necesiten tu decisión en el estado actual.");
  const first = ambiguous[0]!;
  const item = workspaceItem(workspace, first.id);
  const equivalents = ambiguous.filter((decision) => decision.priority === first.priority).length;
  const text = equivalents > 1 ? `Hay ${equivalents} asuntos con la misma prioridad que necesitan tu decisión.` : "Este es el asunto que necesita tu decisión primero.";
  return answered(snapshotIdentity, "ambiguous", text, [item?.humanDecisionReason ?? first.humanDecision.explanation ?? first.explanation.summary], referencesFor([first], workspace));
}

function currentCaseResponse(caseId: string | null, decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel, snapshotIdentity: string): AgentConversationResponse {
  if (!caseId) return answered(snapshotIdentity, "current-case-none", "No tengo un caso concreto seleccionado.");
  const decision = decisions.find((candidate) => candidate.trace.reviewCaseId === caseId);
  if (!decision) return answered(snapshotIdentity, "current-case-missing", "El caso seleccionado no está disponible en el estado actual.");
  const recommendation = decision.preferredOption ? `Recomendación: ${decision.preferredOption.label}.` : "No hay una recomendación defendible todavía.";
  const human = decision.humanDecision.status === "required" ? decision.humanDecision.explanation ?? "Necesita una decisión humana." : decision.humanDecision.status === "blocked" ? decision.humanDecision.explanation ?? "Está bloqueado antes de una decisión humana." : "No necesita una decisión humana ahora mismo.";
  return answered(snapshotIdentity, "current-case", decision.explanation.summary, [decision.explanation.why[0] ?? decision.explanation.headline, recommendation, human], referencesFor([decision], workspace));
}

function reviewRootHref(workspace: AgentWorkspaceModel): string {
  const available = workspace.priorityItems.find((item) => item.href)?.href;
  if (!available) return "/revision";
  const url = new URL(available, "http://localhost");
  url.searchParams.delete("case");
  return `${url.pathname}${url.search}`;
}

function navigationResponse(caseId: string | null, decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel, snapshotIdentity: string): AgentConversationResponse {
  const selected = caseId ? decisions.find((decision) => decision.trace.reviewCaseId === caseId) : undefined;
  const selectedReference = selected ? referenceFor(selected, workspace) : undefined;
  const reference = selectedReference?.href ? selectedReference : Object.freeze({id: "agent-conversation-reference:review", kind: "decision_support" as const, label: "Bandeja de revisión", sourceLabel: "Review", entityLabel: "Revisión editorial", href: reviewRootHref(workspace), actionLabel: "Abrir revisión" as const});
  return answered(snapshotIdentity, "navigate-review", caseId && selectedReference?.href ? "Puedo llevarte al caso seleccionado en Revisión. No ejecutaré ninguna acción." : "Puedo llevarte a Revisión. No ejecutaré ninguna acción.", [], [reference]);
}

export function respondToConversationIntent(intent: AgentConversationIntent, decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel, snapshotIdentity = stableIdentity(decisions, "caseId" in intent ? intent.caseId : null)): AgentConversationResponse {
  if (intent.type === "attention") return attentionResponse(decisions, workspace, snapshotIdentity);
  if (intent.type === "blocked") return blockedResponse(decisions, workspace, snapshotIdentity);
  if (intent.type === "recommendations") return recommendationsResponse(decisions, workspace, snapshotIdentity);
  if (intent.type === "recent_changes") return recentChangesResponse(workspace, snapshotIdentity);
  if (intent.type === "review_source") return sourceResponse(intent.source, decisions, workspace, snapshotIdentity);
  if (intent.type === "explain_current_case") return currentCaseResponse(intent.caseId, decisions, workspace, snapshotIdentity);
  if (intent.type === "show_ambiguous") return ambiguousResponse(decisions, workspace, snapshotIdentity);
  if (intent.type === "navigate_review") return navigationResponse(intent.caseId, decisions, workspace, snapshotIdentity);
  if (intent.type === "action_guard") {
    const text = intent.source ? `Puedo revisar el estado de ${SOURCE_LABELS[intent.source]} o llevarte a Revisión, pero no ejecutar acciones todavía.` : ACTION_GUARD_TEXT;
    return Object.freeze({status: "unsupported" as const, message: message(snapshotIdentity, "action-guard-answer", "agent", "system_notice", text)});
  }
  return Object.freeze({status: "unsupported" as const, message: message(snapshotIdentity, "unsupported-answer", "agent", "system_notice", UNSUPPORTED_TEXT)});
}

export function respondToConversationQuery(input: string, decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel, context: Readonly<{currentCaseId?: string | null}> = {}): Readonly<{route: AgentConversationRoute; response: AgentConversationResponse}> {
  const route = routeAgentConversationIntent(input, context);
  return Object.freeze({route, response: respondToConversationIntent(route.intent, decisions, workspace, stableIdentity(decisions, context.currentCaseId?.trim() || null))});
}

export function respondToConversationPrompt(promptId: string, decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel): AgentConversationResponse {
  const prompt = isAgentConversationPromptId(promptId) ? AGENT_CONVERSATION_PROMPTS.find((candidate) => candidate.id === promptId)!.label : promptId;
  return respondToConversationQuery(prompt, decisions, workspace).response;
}

function initialMessage(decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel, snapshotIdentity: string): AgentConversationMessage {
  const stale = decisions.some((decision) => decision.freshness.status === "stale");
  const text = workspace.status === "empty" ? "He revisado el laboratorio. No hay nada que requiera tu atención ahora mismo." : `He revisado el laboratorio. ${workspace.summary}`;
  return message(snapshotIdentity, "initial", "agent", "summary", stale ? `${text} El análisis puede estar desactualizado.` : text);
}

export function buildAgentConversationModel(decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel, options: Readonly<{currentCaseId?: string | null}> = {}): AgentConversationModel {
  const currentCaseId = options.currentCaseId?.trim() || null;
  const snapshotIdentity = stableIdentity(decisions, currentCaseId);
  const response = (input: string) => respondToConversationQuery(input, decisions, workspace, {currentCaseId}).response;
  const responses = Object.freeze({
    attention: response("¿Qué necesita mi atención?"),
    blocked: response("¿Qué está bloqueado?"),
    recommendations: response("¿Qué recomiendas?"),
    recentChanges: response("¿Qué ha pasado?"),
    showAmbiguous: response("Enséñame la dudosa"),
    explainCurrentCase: response("Explícame este caso"),
    navigateReview: response("Llévame a revisión"),
    sources: Object.freeze({ufc: response("Revisa UFC"), one: response("Revisa ONE"), bkfc: response("Revisa BKFC")}),
  });
  return Object.freeze({
    snapshotIdentity,
    initialMessage: initialMessage(decisions, workspace, snapshotIdentity),
    presets: Object.freeze(AGENT_CONVERSATION_PROMPTS.map((prompt) => Object.freeze({...prompt, response: response(prompt.label)}))),
    currentCaseId,
    responses,
    workspaceStatus: workspace.status,
    ephemeral: true as const,
    boundary: Object.freeze({readOnly: true as const, sourceOfTruth: false as const, executes: false as const, persists: false as const, plans: false as const, createsAuthority: false as const, mutatesReview: false as const}),
  });
}

function emptyWorkspace(model: AgentConversationModel): AgentWorkspaceModel {
  return {status: model.workspaceStatus, statusLabel: "", headline: "", summary: "", metrics: {needsAttention: 0, clearRecommendations: 0, humanDecisionRequired: 0, blocked: 0, noAction: 0}, priorityItems: [], hiddenPriorityCount: 0, presentationOnly: true, boundary: {consumesDecisionSupport: true, readOnly: true, executes: false, persists: false, createsAuthority: false, mutatesReview: false}};
}

function responseFromModel(model: AgentConversationModel, route: AgentConversationRoute): AgentConversationResponse {
  const intent = route.intent;
  if (intent.type === "attention") return model.responses.attention;
  if (intent.type === "blocked") return model.responses.blocked;
  if (intent.type === "recommendations") return model.responses.recommendations;
  if (intent.type === "recent_changes") return model.responses.recentChanges;
  if (intent.type === "review_source") return model.responses.sources[intent.source];
  if (intent.type === "show_ambiguous") return model.responses.showAmbiguous;
  if (intent.type === "explain_current_case") return model.responses.explainCurrentCase;
  if (intent.type === "navigate_review") return model.responses.navigateReview;
  return respondToConversationIntent(intent, [], emptyWorkspace(model), model.snapshotIdentity);
}

export function buildAgentConversationQueryTurn(model: AgentConversationModel, input: string, sequence = 0, promptId: AgentConversationPromptId | null = null): AgentConversationTurn {
  const route = routeAgentConversationIntent(input, {currentCaseId: model.currentCaseId});
  const response = responseFromModel(model, route);
  const queryId = promptId ?? stableIdPart(route.normalizedInput);
  const baseId = `agent-conversation:${stableIdPart(model.snapshotIdentity)}:${queryId}:${sequence}`;
  return Object.freeze({
    id: `${baseId}:turn`,
    promptId,
    route,
    operatorMessage: message(model.snapshotIdentity, `${queryId}:${sequence}:operator`, "operator", "question", route.input),
    agentMessage: response.message,
  });
}

export function buildAgentConversationTurn(model: AgentConversationModel, promptId: AgentConversationPromptId): AgentConversationTurn {
  const preset = model.presets.find((candidate) => candidate.id === promptId)!;
  return buildAgentConversationQueryTurn(model, preset.label, 0, promptId);
}

export const agentConversationResponderSecurity = Object.freeze({pure: true, deterministic: true, readOnly: true, sourceOfTruth: false, createsStore: false, persists: false, fetches: false, writes: false, executes: false, plans: false, createsAuthority: false, mutatesReview: false, invokesAu7: false, invokesAu8: false, llm: false, openAi: false, embeddings: false, streaming: false} as const);
