import {normalizeConversationInput} from "./normalize";
import type {AgentConversationIntent, AgentConversationRoute, AgentConversationSource} from "./types";

const ACTION_WORDS = /\b(?:hazlo|haz|resuelvelo|resuelve|aplicalo|aplica|continua|publica|guardalo|guarda|apruebalo|aprueba)\b/;
const NAVIGATION = /\b(?:abre este caso|llevame a revision|ir a revision|abre revision|abrir revision)\b/;
const CURRENT_CASE = /\b(?:explicame este caso|que pasa con este caso|explica este caso)\b/;
const AMBIGUOUS = /\b(?:ensename la dudosa|muestrame la ambigua|cual necesita mi decision|caso ambiguo|caso dudoso)\b/;
const BLOCKED = /\b(?:que esta bloqueado|que no puede continuar|que esta parado|bloqueos?)\b/;
const RECOMMENDATIONS = /\b(?:que recomiendas|que harias|que opcion recomiendas|recomendaciones?)\b/;
const ATTENTION = /\b(?:que necesita mi atencion|que tengo pendiente|que debo mirar|que requiere revision|prioridades?)\b/;
const RECENT = /\b(?:que ha pasado|que cambio|que novedades hay|novedades|cambios recientes)\b/;

const SOURCE_ALIASES: ReadonlyArray<Readonly<{source: AgentConversationSource; pattern: RegExp}>> = Object.freeze([
  Object.freeze({source: "ufc", pattern: /\bufc\b/}),
  Object.freeze({source: "one", pattern: /\b(?:one|one championship)\b/}),
  Object.freeze({source: "bkfc", pattern: /\b(?:bkfc|bare knuckle)\b/}),
]);

function sourceFrom(normalized: string): AgentConversationSource | null {
  return SOURCE_ALIASES.find((alias) => alias.pattern.test(normalized))?.source ?? null;
}

function intentFor(normalized: string, currentCaseId: string | null): AgentConversationIntent {
  const source = sourceFrom(normalized);
  if (ACTION_WORDS.test(normalized)) return Object.freeze({type: "action_guard", source});
  if (NAVIGATION.test(normalized)) return Object.freeze({type: "navigate_review", caseId: currentCaseId});
  if (source) return Object.freeze({type: "review_source", source});
  if (CURRENT_CASE.test(normalized)) return Object.freeze({type: "explain_current_case", caseId: currentCaseId});
  if (AMBIGUOUS.test(normalized)) return Object.freeze({type: "show_ambiguous"});
  if (BLOCKED.test(normalized)) return Object.freeze({type: "blocked"});
  if (RECOMMENDATIONS.test(normalized)) return Object.freeze({type: "recommendations"});
  if (ATTENTION.test(normalized)) return Object.freeze({type: "attention"});
  if (RECENT.test(normalized)) return Object.freeze({type: "recent_changes"});
  return Object.freeze({type: "unsupported", reason: normalized ? "unknown" : "empty"});
}

export function routeAgentConversationIntent(
  input: string,
  context: Readonly<{currentCaseId?: string | null}> = {},
): AgentConversationRoute {
  const normalizedInput = normalizeConversationInput(input);
  return Object.freeze({
    input: input.trim(),
    normalizedInput,
    intent: intentFor(normalizedInput, context.currentCaseId?.trim() || null),
    readOnly: true as const,
  });
}

export const AGENT_CONVERSATION_INTENT_PRIORITY = Object.freeze([
  "action_guard",
  "navigate_review",
  "review_source",
  "explain_current_case",
  "show_ambiguous",
  "blocked",
  "recommendations",
  "attention",
  "recent_changes",
  "unsupported",
] as const);

export const agentConversationRouterSecurity = Object.freeze({
  pure: true,
  deterministic: true,
  readOnly: true,
  fuzzy: false,
  planner: false,
  executor: false,
  authority: false,
  fetches: false,
  writes: false,
  mutatesReview: false,
} as const);
