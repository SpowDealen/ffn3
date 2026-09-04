import {normalizeConversationInput} from "./normalize";
import type {AgentConversationIntent, AgentConversationRoute, AgentConversationSource} from "./types";

const ACTION_WORDS = /^(?:entonces\s+)?(?:hazlo|haz|resuelvelo|resuelve|aplicalo|aplica|continua|publica|guardalo|guarda|apruebalo|aprueba)\b/;
const NAVIGATION = /\b(?:abre este caso|llevame a revision|ir a revision|abre revision|abrir revision)\b/;
const WHY_RECOMMENDED = /\b(?:por que recomiendas esa|por que esa opcion|por que la recomiendas)\b/;
const EVIDENCE = /\b(?:que evidencia tienes|en que te basas|que datos apoyan eso|que datos lo apoyan)\b/;
const ALTERNATIVES = /\b(?:que alternativas hay|que otras opciones tengo|cuales son las alternativas)\b/;
const MISSING_INFORMATION = /\b(?:que falta|que necesitas saber|que informacion falta)\b/;
const EXPECTED_NEXT = /\b(?:que pasaria despues|que ocurriria si se aprueba|que viene luego|que pasaria si lo hago)\b/;
const WHY = /\b(?:por que|por que dices eso|por que esta bloqueado)\b/;
const EXPLAIN_REFERENCE = /\b(?:explicame esa|explicame ese|explicame la anterior|explicame el anterior|explicame la dudosa|explicame la ambigua|explicame esa recomendacion)\b/;
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

function referenceHint(normalized: string): "context" | "previous" | "ambiguous" | "recommendation" {
  if (/\b(?:dudosa|ambigua)\b/.test(normalized)) return "ambiguous";
  if (/\b(?:anterior)\b/.test(normalized)) return "previous";
  if (/\b(?:recomendacion|esa opcion)\b/.test(normalized)) return "recommendation";
  return "context";
}

function intentFor(normalized: string, currentCaseId: string | null): AgentConversationIntent {
  const source = sourceFrom(normalized);
  if (ACTION_WORDS.test(normalized)) return Object.freeze({type: "action_guard", source});
  if (NAVIGATION.test(normalized)) return Object.freeze({type: "navigate_review", caseId: currentCaseId});
  if (WHY_RECOMMENDED.test(normalized)) return Object.freeze({type: "why_recommended", reference: referenceHint(normalized)});
  if (EVIDENCE.test(normalized)) return Object.freeze({type: "evidence", reference: referenceHint(normalized)});
  if (ALTERNATIVES.test(normalized)) return Object.freeze({type: "alternatives", reference: referenceHint(normalized)});
  if (MISSING_INFORMATION.test(normalized)) return Object.freeze({type: "missing_information", reference: referenceHint(normalized)});
  if (EXPECTED_NEXT.test(normalized)) return Object.freeze({type: "expected_next", reference: referenceHint(normalized)});
  if (EXPLAIN_REFERENCE.test(normalized)) return Object.freeze({type: "explain_reference", reference: referenceHint(normalized)});
  if (WHY.test(normalized)) return Object.freeze({type: "why", reference: referenceHint(normalized)});
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
  "why_recommended",
  "evidence",
  "alternatives",
  "missing_information",
  "expected_next",
  "explain_reference",
  "why",
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
