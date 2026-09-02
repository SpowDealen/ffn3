import type {ReactElement} from "react";
import type {AgentDecisionSupport} from "../../agent/context/decisions";
import {buildAgentConversationModel} from "../../agent/conversation";
import {AgentWorkspace, buildAgentWorkspaceModel, type AgentWorkspaceLoadState} from "../../agent/workspace";
import GlobalStatusSummary from "../../status/GlobalStatusSummary";
import {LABORATORY_ROUTES} from "../laboratoryRoutes";

export default function LaboratoryStatusScreen({onNavigate, agentDecisions = Object.freeze([]), agentLoadState = "ready", agentReviewSearch = ""}: {onNavigate: (path: string) => void; agentDecisions?: readonly AgentDecisionSupport[]; agentLoadState?: AgentWorkspaceLoadState; agentReviewSearch?: string}): ReactElement {
  const agentWorkspace = buildAgentWorkspaceModel(agentDecisions, {reviewSearch: agentReviewSearch});
  const agentConversation = buildAgentConversationModel(agentDecisions, agentWorkspace);
  return <><AgentWorkspace model={agentWorkspace} conversation={agentConversation} loadState={agentLoadState} onNavigate={onNavigate} /><GlobalStatusSummary onNavigate={onNavigate} /><section className="laboratory-quick-links" aria-labelledby="quick-links-title"><h2 id="quick-links-title">Accesos rápidos</h2><div>{LABORATORY_ROUTES.filter((route) => route.id !== "status").map((route) => <a key={route.id} href={route.path} onClick={(event) => {event.preventDefault(); onNavigate(route.path);}}><strong>{route.title}</strong><span>{route.description}</span></a>)}</div></section></>;
}
