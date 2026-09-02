import type {AgentStructuredProposal} from "./types";

const stable = (proposals: readonly AgentStructuredProposal[]): readonly AgentStructuredProposal[] => Object.freeze([...proposals].sort((left, right) => left.id.localeCompare(right.id)));

export function selectRecommendedProposals(proposals: readonly AgentStructuredProposal[]): readonly AgentStructuredProposal[] {
  return stable(proposals.filter((proposal) => proposal.recommendation !== null));
}

export function selectHumanDecisionRequiredProposals(proposals: readonly AgentStructuredProposal[]): readonly AgentStructuredProposal[] {
  return stable(proposals.filter((proposal) => proposal.humanDecision.status === "required"));
}

export function selectBlockedProposals(proposals: readonly AgentStructuredProposal[]): readonly AgentStructuredProposal[] {
  return stable(proposals.filter((proposal) => proposal.humanDecision.status === "blocked"));
}

export function selectProposalsBySource(proposals: readonly AgentStructuredProposal[], source: string): readonly AgentStructuredProposal[] {
  return stable(proposals.filter((proposal) => proposal.subject.source === source));
}

export const structuredProposalSelectorsSecurity = Object.freeze({pure: true, deterministic: true, executes: false, persists: false, mutates: false} as const);
