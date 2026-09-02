import type {AgentDecisionAttentionPriority, AgentDecisionSupport} from "./types";

const ATTENTION_RANK: Readonly<Record<AgentDecisionAttentionPriority, number>> = Object.freeze({critical_attention: 0, high_attention: 1, normal_attention: 2, low_attention: 3, no_attention: 4});
const stable = (items: readonly AgentDecisionSupport[]): readonly AgentDecisionSupport[] => Object.freeze([...items].sort((left, right) => ATTENTION_RANK[left.priority] - ATTENTION_RANK[right.priority] || left.id.localeCompare(right.id)));

export function selectDecisionSupportByAttention(items: readonly AgentDecisionSupport[]): readonly AgentDecisionSupport[] {
  return stable(items);
}

export function selectDecisionSupportBySource(items: readonly AgentDecisionSupport[], source: string): readonly AgentDecisionSupport[] {
  return stable(items.filter((item) => item.subject.source === source));
}

export function selectDecisionSupportRequiringHuman(items: readonly AgentDecisionSupport[]): readonly AgentDecisionSupport[] {
  return stable(items.filter((item) => item.humanDecision.status === "required"));
}

export function selectBlockedDecisionSupport(items: readonly AgentDecisionSupport[]): readonly AgentDecisionSupport[] {
  return stable(items.filter((item) => item.decisionState === "blocked_by_contradiction" || item.decisionState === "blocked_by_missing_information"));
}

export function selectContradictoryDecisionSupport(items: readonly AgentDecisionSupport[]): readonly AgentDecisionSupport[] {
  return stable(items.filter((item) => item.contradictions.length > 0));
}

export function selectClearDecisionSupport(items: readonly AgentDecisionSupport[]): readonly AgentDecisionSupport[] {
  return stable(items.filter((item) => item.decisionState === "clear_recommendation"));
}

export const decisionSupportSelectorsSecurity = Object.freeze({pure: true, deterministic: true, presentationPriorityOnly: true, plans: false, executes: false, persists: false, mutates: false} as const);
