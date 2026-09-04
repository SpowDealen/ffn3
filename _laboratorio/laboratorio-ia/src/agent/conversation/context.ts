import type {AgentConversationContext, AgentConversationMessage, AgentConversationModel, AgentConversationRoute} from "./types";

export function createAgentConversationContext(model: AgentConversationModel): AgentConversationContext {
  return Object.freeze({
    snapshotIdentity: model.snapshotIdentity,
    currentCaseId: model.currentCaseId,
    focusedDecisionSupportId: null,
    focusedProposalId: null,
    previousReferencedIds: Object.freeze([]),
    lastReferencedIds: Object.freeze([]),
    lastIntentType: null,
  });
}

export function updateAgentConversationContext(
  model: AgentConversationModel,
  current: AgentConversationContext,
  route: AgentConversationRoute,
  agentMessage: AgentConversationMessage,
): AgentConversationContext {
  const compatible = current.snapshotIdentity === model.snapshotIdentity ? current : createAgentConversationContext(model);
  const referenced = agentMessage.metadata.referencedDecisionSupportIds.filter((id) => model.explainabilityItems.some((item) => item.decisionSupportId === id));
  if (!referenced.length) return Object.freeze({...compatible, lastIntentType: route.intent.type});
  const focused = referenced.length === 1 ? model.explainabilityItems.find((item) => item.decisionSupportId === referenced[0]) : undefined;
  return Object.freeze({
    snapshotIdentity: model.snapshotIdentity,
    currentCaseId: model.currentCaseId,
    focusedDecisionSupportId: focused?.decisionSupportId ?? null,
    focusedProposalId: focused?.proposalId ?? null,
    previousReferencedIds: Object.freeze([...compatible.lastReferencedIds]),
    lastReferencedIds: Object.freeze([...referenced]),
    lastIntentType: route.intent.type,
  });
}

export const agentConversationContextSecurity = Object.freeze({ephemeral: true, idsOnly: true, sourceOfTruth: false, createsStore: false, persists: false, executes: false, writes: false} as const);
