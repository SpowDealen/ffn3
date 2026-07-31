import {buildCurrentGlobalResolutionCatalog, createCheckpointAfterPlanning} from "../globalResolution";
import {createGlobalResolutionProducerRuntime} from "../globalResolution/producers";
import {getReviewCase, registerCanonicalReviewCase, setGlobalResolutionCheckpoint} from "../store/reviewStore";
import type {FighterResolutionProposal, FighterResolutionRegistrationResult} from "./types";

export function registerFighterResolutionProposal(proposal: FighterResolutionProposal): FighterResolutionRegistrationResult {
  if (proposal.reviewCase.id !== proposal.plan.caseId || proposal.reviewCase.version !== proposal.plan.caseVersion || proposal.plan.producer !== proposal.request.producer) return {status: "blocked", caseId: proposal.reviewCase.id, operationId: proposal.creationOperationId, guardOperationId: proposal.guardOperationId, reasonCode: "fighter_resolution_binding_mismatch"};
  try {
    const registered = registerCanonicalReviewCase(proposal.reviewCase);
    const current = getReviewCase(proposal.reviewCase.id);
    if (!current) throw new Error("fighter_resolution_case_not_persisted");
    if (!current.globalResolution) {
      const runtime = createGlobalResolutionProducerRuntime();
      const catalog = buildCurrentGlobalResolutionCatalog({producerRegistry: runtime.producers});
      const checkpoint = createCheckpointAfterPlanning({reviewCase: current, plan: proposal.plan, catalog, now: () => proposal.request.requestedAt});
      const persisted = setGlobalResolutionCheckpoint(current.id, current.version, checkpoint, new Date(proposal.request.requestedAt));
      if (!persisted?.globalResolution) throw new Error("fighter_resolution_checkpoint_not_persisted");
    }
    return {status: registered.status, caseId: current.id, operationId: proposal.creationOperationId, guardOperationId: proposal.guardOperationId};
  } catch (error) {
    return {status: "blocked", caseId: proposal.reviewCase.id, operationId: proposal.creationOperationId, guardOperationId: proposal.guardOperationId, reasonCode: error instanceof Error ? error.message : "fighter_resolution_registration_failed"};
  }
}

export function registerFighterResolutionProposals(proposals: readonly FighterResolutionProposal[]): FighterResolutionRegistrationResult[] {
  return proposals.map(registerFighterResolutionProposal);
}
