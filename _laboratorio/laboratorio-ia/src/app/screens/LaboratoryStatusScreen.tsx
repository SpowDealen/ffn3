import type {ReactElement} from "react";
import type {AgentDecisionSupport} from "../../agent/context/decisions";
import type {AgentStructuredProposal} from "../../agent/context/proposals";
import {buildAgentConversationModel} from "../../agent/conversation";
import {AgentWorkspace, buildAgentWorkspaceModel, type AgentWorkspaceLoadState} from "../../agent/workspace";
import GlobalStatusSummary from "../../status/GlobalStatusSummary";
import {LABORATORY_ROUTES} from "../laboratoryRoutes";

export default function LaboratoryStatusScreen({onNavigate, agentDecisions = Object.freeze([]), agentProposals = Object.freeze([]), agentLoadState = "ready", agentReviewSearch = ""}: {onNavigate: (path: string) => void; agentDecisions?: readonly AgentDecisionSupport[]; agentProposals?: readonly AgentStructuredProposal[]; agentLoadState?: AgentWorkspaceLoadState; agentReviewSearch?: string}): ReactElement {
  const agentWorkspace = buildAgentWorkspaceModel(agentDecisions, {reviewSearch: agentReviewSearch});
  const currentCaseId = new URLSearchParams(agentReviewSearch).get("case");
  const agentConversation = buildAgentConversationModel(agentDecisions, agentWorkspace, {currentCaseId, proposals: agentProposals});
  return <><AgentWorkspace model={agentWorkspace} conversation={agentConversation} loadState={agentLoadState} onNavigate={onNavigate} /><GlobalStatusSummary onNavigate={onNavigate} /><section className="laboratory-quick-links" aria-labelledby="quick-links-title"><h2 id="quick-links-title">Accesos rápidos</h2><div>{LABORATORY_ROUTES.filter((route) => route.id !== "status").map((route) => <a key={route.id} href={route.path} onClick={(event) => {event.preventDefault(); onNavigate(route.path);}}><strong>{route.title}</strong><span>{route.description}</span></a>)}</div></section></>;
}
