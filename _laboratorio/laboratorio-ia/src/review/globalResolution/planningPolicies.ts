import type {GlobalResolutionPlanningPolicy} from "./types";

export const DEFAULT_GLOBAL_RESOLUTION_PLANNING_POLICY: Readonly<GlobalResolutionPlanningPolicy> = Object.freeze({
  minimumCreateConfidence: .9,
  minimumReuseConfidence: .95,
  ambiguity: "block",
  allowSkipOperation: false,
  allowOptionalDependencySkip: false,
  allowSkippedDependencyForResume: false,
  maximumRisk: "medium",
  requireAllNodesForResume: true,
  unsupportedOperation: "block",
  insufficientInformation: "block",
  availableCapabilities: [],
});

export function resolveGlobalResolutionPlanningPolicy(policy: Partial<GlobalResolutionPlanningPolicy> = {}): GlobalResolutionPlanningPolicy {
  return {...DEFAULT_GLOBAL_RESOLUTION_PLANNING_POLICY, ...policy, availableCapabilities: [...new Set(policy.availableCapabilities ?? DEFAULT_GLOBAL_RESOLUTION_PLANNING_POLICY.availableCapabilities)].sort()};
}

export const riskRank = (risk: GlobalResolutionPlanningPolicy["maximumRisk"]): number => ["none", "low", "medium", "high", "critical"].indexOf(risk);
