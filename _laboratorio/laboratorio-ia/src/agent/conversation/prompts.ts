import type {AgentConversationPromptId} from "./types";

export const AGENT_CONVERSATION_PROMPTS: ReadonlyArray<Readonly<{id: AgentConversationPromptId; label: string}>> = Object.freeze([
  Object.freeze({id: "attention", label: "¿Qué necesita mi atención?"}),
  Object.freeze({id: "blocked", label: "¿Qué está bloqueado?"}),
  Object.freeze({id: "recommendations", label: "¿Qué recomiendas?"}),
]);

export function isAgentConversationPromptId(value: string): value is AgentConversationPromptId {
  return AGENT_CONVERSATION_PROMPTS.some((prompt) => prompt.id === value);
}

export const agentConversationPromptsSecurity = Object.freeze({closedSet: true, sharedRouter: true, freeText: true, actionIntents: false, executes: false, persists: false} as const);
