import {normalizeConversationInput} from "./normalize";
import type {AgentConversationContext, AgentConversationExplainabilityItem, AgentConversationModel, AgentConversationReferenceResolution, AgentConversationRoute} from "./types";

function result(
  status: AgentConversationReferenceResolution["status"],
  reason: AgentConversationReferenceResolution["reason"],
  item: AgentConversationExplainabilityItem | null,
  candidates: readonly AgentConversationExplainabilityItem[] = [],
): AgentConversationReferenceResolution {
  return Object.freeze({status, reason, item, candidates: Object.freeze([...candidates])});
}

function validate(item: AgentConversationExplainabilityItem, reason: AgentConversationReferenceResolution["reason"]): AgentConversationReferenceResolution {
  return item.freshness === "fresh" ? result("resolved", reason, item, [item]) : result("stale", "stale_reference", null, [item]);
}

function candidatesByIds(model: AgentConversationModel, ids: readonly string[]): readonly AgentConversationExplainabilityItem[] {
  return Object.freeze(ids.map((id) => model.explainabilityItems.find((item) => item.decisionSupportId === id)).filter((item): item is AgentConversationExplainabilityItem => Boolean(item)));
}

function explicitCandidates(model: AgentConversationModel, route: AgentConversationRoute): readonly AgentConversationExplainabilityItem[] {
  const normalized = route.normalizedInput;
  const exact = model.explainabilityItems.filter((item) => {
    const identifiers = [item.decisionSupportId, item.proposalId, item.reviewCaseId].filter((value): value is string => Boolean(value));
    return identifiers.some((id) => normalized.includes(normalizeConversationInput(id)));
  });
  if (exact.length) return Object.freeze(exact);
  const labels = model.explainabilityItems.filter((item) => {
    const label = normalizeConversationInput(item.label);
    return label.length >= 5 && normalized.includes(label);
  });
  if (labels.length) return Object.freeze(labels);
  const source = /\bufc\b/.test(normalized) ? "ufc" : /\b(?:one|one championship)\b/.test(normalized) ? "one" : /\b(?:bkfc|bare knuckle)\b/.test(normalized) ? "bkfc" : null;
  return Object.freeze(source ? model.explainabilityItems.filter((item) => item.source?.toLowerCase() === source) : []);
}

function intentReference(route: AgentConversationRoute): "context" | "previous" | "ambiguous" | "recommendation" {
  return "reference" in route.intent ? route.intent.reference : "context";
}

export function resolveAgentConversationReference(model: AgentConversationModel, context: AgentConversationContext, route: AgentConversationRoute): AgentConversationReferenceResolution {
  if (context.snapshotIdentity !== model.snapshotIdentity) return result("missing", "snapshot_changed", null);

  if (model.currentCaseId) {
    const currentCase = model.explainabilityItems.find((item) => item.reviewCaseId === model.currentCaseId);
    return currentCase ? validate(currentCase, "current_case") : result("missing", "missing_reference", null);
  }

  const explicit = explicitCandidates(model, route);
  if (explicit.length === 1) return validate(explicit[0]!, "explicit_reference");
  if (explicit.length > 1) return result("ambiguous", "multiple_candidates", null, explicit);

  const hint = intentReference(route);
  if (hint === "previous" && context.previousReferencedIds.length) {
    const previous = candidatesByIds(model, context.previousReferencedIds);
    if (previous.length === 1) return validate(previous[0]!, "last_reference");
    if (previous.length > 1) return result("ambiguous", "multiple_candidates", null, previous);
  }
  if (hint === "ambiguous") {
    const ambiguous = model.explainabilityItems.filter((item) => item.ambiguities.length > 0 && item.freshness === "fresh");
    if (ambiguous.length === 1) return validate(ambiguous[0]!, "unique_ambiguous");
    if (ambiguous.length > 1) return result("ambiguous", "multiple_candidates", null, ambiguous);
  }

  const last = candidatesByIds(model, context.lastReferencedIds);
  if (last.length === 1) return validate(last[0]!, "last_reference");
  if (last.length > 1) return result("ambiguous", "multiple_candidates", null, last);

  if (context.focusedDecisionSupportId) {
    const focused = model.explainabilityItems.find((item) => item.decisionSupportId === context.focusedDecisionSupportId);
    if (focused) return validate(focused, "focused_reference");
  }

  const uniqueAmbiguous = model.explainabilityItems.filter((item) => item.ambiguities.length > 0 && item.freshness === "fresh");
  if (uniqueAmbiguous.length === 1) return validate(uniqueAmbiguous[0]!, "unique_ambiguous");
  if (uniqueAmbiguous.length > 1) return result("ambiguous", "multiple_candidates", null, uniqueAmbiguous);
  return result("missing", "missing_reference", null);
}

export const agentConversationReferenceResolverSecurity = Object.freeze({pure: true, deterministic: true, revalidatesSnapshot: true, revalidatesFreshness: true, guesses: false, sourceOfTruth: false, persists: false, executes: false, writes: false} as const);
