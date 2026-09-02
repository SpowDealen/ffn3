import {
  selectBlockedDecisionSupport,
  selectDecisionSupportByAttention,
  type AgentDecisionSupport,
} from "../context/decisions";
import type {AgentWorkspaceModel, AgentWorkspacePriorityItem} from "../workspace/types";
import {AGENT_CONVERSATION_PROMPTS, isAgentConversationPromptId} from "./prompts";
import type {
  AgentConversationMessage,
  AgentConversationModel,
  AgentConversationPromptId,
  AgentConversationReference,
  AgentConversationResponse,
  AgentConversationTurn,
} from "./types";

const UNSUPPORTED_TEXT = "Esta versión del agente solo puede consultar y explicar el estado.";

function stableIdentity(decisions: readonly AgentDecisionSupport[]): string {
  const identities = [...new Set(decisions.map((decision) => decision.trace.agentContextSnapshotIdentity))].sort();
  return identities.length ? identities.join("+") : "agent-context:empty";
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
  const sourceLabel = item?.sourceLabel ?? "Laboratorio";
  const entityLabel = item?.entityLabel ?? "Asunto editorial";
  const label = item?.title ?? decision.explanation.headline;
  return Object.freeze({
    id: `agent-conversation-reference:${decision.id}`,
    kind: item?.href ? "review_case" as const : "decision_support" as const,
    label,
    sourceLabel,
    entityLabel,
    href: item?.href ?? null,
    actionLabel: item?.actionLabel === "Revisar caso" || item?.actionLabel === "Ver caso" ? item.actionLabel : null,
  });
}

function referencesFor(decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel): readonly AgentConversationReference[] {
  return Object.freeze(decisions.slice(0, 3).map((decision) => referenceFor(decision, workspace)));
}

function attentionResponse(decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel, snapshotIdentity: string): AgentConversationResponse {
  const attention = selectDecisionSupportByAttention(decisions).filter((decision) => decision.priority !== "no_attention");
  if (!attention.length) return Object.freeze({
    status: "answered" as const,
    message: message(snapshotIdentity, "attention-answer", "agent", "answer", "No hay nada que requiera tu atención ahora mismo."),
  });
  const first = workspaceItem(workspace, attention[0]!.id);
  const text = `Hay ${attention.length} ${attention.length === 1 ? "asunto que necesita" : "asuntos que necesitan"} tu atención. ${workspace.metrics.blocked ? `${workspace.metrics.blocked} ${workspace.metrics.blocked === 1 ? "está bloqueado" : "están bloqueados"}.` : "No hay bloqueos actuales."}`;
  const highlights = [
    first ? `Empieza por ${first.title}: ${first.statusLabel.toLowerCase()}.` : `Empieza por ${attention[0]!.explanation.headline.toLowerCase()}.`,
    workspace.metrics.humanDecisionRequired ? `${workspace.metrics.humanDecisionRequired} ${workspace.metrics.humanDecisionRequired === 1 ? "asunto necesita" : "asuntos necesitan"} tu decisión.` : "Ningún asunto requiere una decisión humana.",
  ];
  return Object.freeze({status: "answered" as const, message: message(snapshotIdentity, "attention-answer", "agent", "answer", text, highlights, referencesFor(attention, workspace))});
}

function blockedResponse(decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel, snapshotIdentity: string): AgentConversationResponse {
  const blocked = selectBlockedDecisionSupport(decisions);
  if (!blocked.length) return Object.freeze({
    status: "answered" as const,
    message: message(snapshotIdentity, "blocked-answer", "agent", "answer", "No hay asuntos bloqueados ahora mismo."),
  });
  const highlights = blocked.slice(0, 3).map((decision) => {
    const item = workspaceItem(workspace, decision.id);
    const title = item?.title ?? decision.explanation.headline;
    const missing = item?.blockedBy ?? decision.missingInformation[0]?.summary ?? decision.humanDecision.explanation;
    return missing ? `${title}. Falta resolver: ${missing}` : `${title}.`;
  });
  return Object.freeze({
    status: "answered" as const,
    message: message(snapshotIdentity, "blocked-answer", "agent", "answer", `${blocked.length === 1 ? "Hay un asunto bloqueado" : `Hay ${blocked.length} asuntos bloqueados`} antes de que el flujo pueda continuar.`, highlights, referencesFor(blocked, workspace)),
  });
}

function recommendationsResponse(decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel, snapshotIdentity: string): AgentConversationResponse {
  const recommendations = selectDecisionSupportByAttention(decisions).filter((decision) => decision.preferredOption !== null && (decision.decisionState === "clear_recommendation" || decision.decisionState === "recommendation_with_caveats"));
  if (!recommendations.length) return Object.freeze({
    status: "answered" as const,
    message: message(snapshotIdentity, "recommendations-answer", "agent", "answer", "No hay recomendaciones disponibles con la evidencia actual."),
  });
  const clear = recommendations.filter((decision) => decision.decisionState === "clear_recommendation").length;
  const reserved = recommendations.length - clear;
  const parts = [
    clear ? `${clear} ${clear === 1 ? "es clara" : "son claras"}` : null,
    reserved ? `${reserved} ${reserved === 1 ? "requiere revisión" : "requieren revisión"}` : null,
  ].filter((part): part is string => Boolean(part));
  const highlights = recommendations.slice(0, 3).map((decision) => {
    const item = workspaceItem(workspace, decision.id);
    const source = item?.sourceLabel ?? "Laboratorio";
    return `${source}: ${decision.preferredOption!.label}. ${decision.explanation.summary}`;
  });
  return Object.freeze({
    status: "answered" as const,
    message: message(snapshotIdentity, "recommendations-answer", "agent", "answer", `Tengo ${recommendations.length} ${recommendations.length === 1 ? "recomendación" : "recomendaciones"}: ${parts.join(" y ")}.`, highlights, referencesFor(recommendations, workspace)),
  });
}

export function respondToConversationPrompt(
  promptId: string,
  decisions: readonly AgentDecisionSupport[],
  workspace: AgentWorkspaceModel,
): AgentConversationResponse {
  const snapshotIdentity = stableIdentity(decisions);
  if (!isAgentConversationPromptId(promptId)) return Object.freeze({
    status: "unsupported" as const,
    message: message(snapshotIdentity, "unsupported-answer", "agent", "system_notice", UNSUPPORTED_TEXT),
  });
  if (promptId === "attention") return attentionResponse(decisions, workspace, snapshotIdentity);
  if (promptId === "blocked") return blockedResponse(decisions, workspace, snapshotIdentity);
  return recommendationsResponse(decisions, workspace, snapshotIdentity);
}

function initialMessage(decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel, snapshotIdentity: string): AgentConversationMessage {
  const stale = decisions.some((decision) => decision.freshness.status === "stale");
  const text = workspace.status === "empty"
    ? "He revisado el laboratorio. No hay nada que requiera tu atención ahora mismo."
    : `He revisado el laboratorio. ${workspace.summary}`;
  return message(snapshotIdentity, "initial", "agent", "summary", stale ? `${text} El análisis puede estar desactualizado.` : text);
}

export function buildAgentConversationModel(decisions: readonly AgentDecisionSupport[], workspace: AgentWorkspaceModel): AgentConversationModel {
  const snapshotIdentity = stableIdentity(decisions);
  return Object.freeze({
    snapshotIdentity,
    initialMessage: initialMessage(decisions, workspace, snapshotIdentity),
    presets: Object.freeze(AGENT_CONVERSATION_PROMPTS.map((prompt) => Object.freeze({...prompt, response: respondToConversationPrompt(prompt.id, decisions, workspace)}))),
    workspaceStatus: workspace.status,
    ephemeral: true as const,
    boundary: Object.freeze({readOnly: true as const, sourceOfTruth: false as const, executes: false as const, persists: false as const, plans: false as const, createsAuthority: false as const, mutatesReview: false as const}),
  });
}

export function buildAgentConversationTurn(model: AgentConversationModel, promptId: AgentConversationPromptId): AgentConversationTurn {
  const preset = model.presets.find((candidate) => candidate.id === promptId)!;
  const baseId = `agent-conversation:${stableIdPart(model.snapshotIdentity)}:${promptId}`;
  return Object.freeze({
    id: `${baseId}:turn`,
    promptId,
    operatorMessage: message(model.snapshotIdentity, `${promptId}:operator`, "operator", "question", preset.label),
    agentMessage: preset.response.message,
  });
}

export const agentConversationResponderSecurity = Object.freeze({pure: true, deterministic: true, readOnly: true, sourceOfTruth: false, createsStore: false, persists: false, fetches: false, writes: false, executes: false, plans: false, createsAuthority: false, mutatesReview: false, invokesAu7: false, invokesAu8: false, llm: false, openAi: false, streaming: false} as const);
