import type {ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint} from "../../universal";
import {evaluateAutonomousEditorialGovernance} from "../autonomy";
import {buildAutonomousResolutionStrategy} from "./engine";
import type {AutonomousEditorialStrategyFacadeInput, AutonomousEditorialStrategyFacadeResult} from "./types";

/** Fachada pura B1 → B2 → B3 → B4. No expone ni invoca ejecutores. */
export function evaluateAutonomousEditorialResolutionStrategy(input: AutonomousEditorialStrategyFacadeInput): AutonomousEditorialStrategyFacadeResult {
  const governance = evaluateAutonomousEditorialGovernance({decisionInput: input.decisionInput, autonomy: input.autonomy});
  const strategy = buildAutonomousResolutionStrategy({
    ...input.strategy,
    caseId: input.decisionInput.case.caseId,
    caseVersion: input.decisionInput.case.caseVersion,
    decision: governance.decision,
    sufficiency: governance.sufficiency,
    autonomy: governance.autonomy,
    inspection: input.strategy.inspection ?? input.decisionInput.inspection,
    identities: input.strategy.identities ?? input.decisionInput.identities ?? input.autonomy.identities,
    resolution: input.strategy.resolution ?? input.decisionInput.resolution ?? input.autonomy.resolution,
    transaction: input.strategy.transaction ?? input.autonomy.transaction,
    transactionView: input.strategy.transactionView ?? input.decisionInput.transaction ?? input.autonomy.transactionView,
    reconciliation: input.strategy.reconciliation ?? input.autonomy.reconciliation,
  });
  const semantic = {
    decisionFingerprint: governance.decision.decisionFingerprint,
    sufficiencyFingerprint: governance.sufficiency.evaluationFingerprint,
    autonomyFingerprint: governance.autonomy.policyFingerprint,
    strategyFingerprint: strategy.strategyFingerprint,
    executionAllowed: false as const,
    launchesTransactions: false as const,
    writes: false as const,
  };
  return Object.freeze({...governance, strategy, fingerprint: computeUniversalFingerprint(semantic as unknown as ReviewJsonValue), executionAllowed: false, launchesTransactions: false, writes: false});
}
