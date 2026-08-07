import type {EntityResolutionResult, UniversalEntityType} from "../../entityIdentity";
import type {GlobalResolutionCheckpoint} from "../../globalResolution/checkpoint";
import type {GlobalResolutionInspectionEvidence} from "../../globalResolution/inspection/types";
import type {GlobalResolutionReconciliationAssessment} from "../../globalResolution/reconciliation";
import type {TransversalResolutionPlan} from "../../globalResolution/transversalPlanning";
import type {ResolutionGraph} from "../../resolutionGraph";
import type {TransactionOperationalView} from "../../transactions/orchestrator";
import type {UniversalTransactionPlan} from "../../transactions/types";
import type {AutonomousEditorialDecision, AutonomousEditorialDecisionInput} from "../types";
import type {AutonomyLevel, AutonomyPolicyInput, AutonomyPolicyResult, AutonomySufficiencyDescriptor, AggregatedAutonomyRisk} from "../autonomy";

export const AUTONOMOUS_RESOLUTION_STRATEGY_VERSION = "1.0.0" as const;

export type AutonomousResolutionStrategyStepKind =
  | "investigate"
  | "inspect_sanity"
  | "inspect_source"
  | "search_candidates"
  | "compare_entities"
  | "reuse_entity"
  | "create_entity"
  | "repair_reference"
  | "validate"
  | "prepare_transaction"
  | "wait_authorization"
  | "wait_reconciliation"
  | "request_human"
  | "stop";

export type AutonomousResolutionStrategyPrecondition = Readonly<{
  code: string;
  description: string;
  satisfied: boolean;
}>;

export type AutonomousResolutionStrategyStep = Readonly<{
  id: string;
  kind: AutonomousResolutionStrategyStepKind;
  objective: string;
  dependencyIds: readonly string[];
  rationaleCodes: readonly string[];
  evidenceIds: readonly string[];
  preconditions: readonly AutonomousResolutionStrategyPrecondition[];
  risk: AggregatedAutonomyRisk;
  autonomy: AutonomyLevel;
  entityType?: UniversalEntityType;
  capability?: string;
  fingerprint: string;
}>;

export type AutonomousResolutionStrategyStatus = "ready" | "investigation_required" | "authorization_required" | "reconciliation_required" | "human_required" | "blocked";

export type AutonomousResolutionStrategyInput = Readonly<{
  caseId: string;
  caseVersion: number;
  producerId: string;
  originalOperation: string;
  generatedAt: string;
  decision: AutonomousEditorialDecision;
  sufficiency: AutonomySufficiencyDescriptor;
  autonomy: AutonomyPolicyResult;
  inspection?: readonly GlobalResolutionInspectionEvidence[];
  identities?: readonly EntityResolutionResult[];
  resolution?: TransversalResolutionPlan;
  checkpoint?: GlobalResolutionCheckpoint;
  transaction?: UniversalTransactionPlan;
  transactionView?: TransactionOperationalView;
  reconciliation?: readonly GlobalResolutionReconciliationAssessment[];
}>;

export type AutonomousResolutionStrategy = Readonly<{
  schemaVersion: typeof AUTONOMOUS_RESOLUTION_STRATEGY_VERSION;
  caseId: string;
  caseVersion: number;
  status: AutonomousResolutionStrategyStatus;
  decisionFingerprint: string;
  sufficiencyFingerprint: string;
  autonomyFingerprint: string;
  checkpointFingerprint?: string;
  sourceGraphFingerprint?: string;
  graph: ResolutionGraph;
  steps: readonly AutonomousResolutionStrategyStep[];
  orderedStepIds: readonly string[];
  layers: readonly (readonly string[])[];
  blockers: readonly string[];
  strategyFingerprint: string;
  executionAllowed: false;
  launchesTransactions: false;
  writes: false;
}>;

export type AutonomousEditorialStrategyFacadeInput = Readonly<{
  decisionInput: AutonomousEditorialDecisionInput;
  autonomy: Omit<AutonomyPolicyInput, "decision" | "sufficiency">;
  strategy: Omit<AutonomousResolutionStrategyInput, "caseId" | "caseVersion" | "decision" | "sufficiency" | "autonomy">;
}>;

export type AutonomousEditorialStrategyFacadeResult = Readonly<{
  decision: AutonomousEditorialDecision;
  sufficiency: AutonomySufficiencyDescriptor;
  autonomy: AutonomyPolicyResult;
  strategy: AutonomousResolutionStrategy;
  fingerprint: string;
  executionAllowed: false;
  launchesTransactions: false;
  writes: false;
}>;

export const autonomousResolutionStrategySecurity = Object.freeze({
  pure: true,
  reusesResolutionGraph: true,
  createsParallelPlanner: false,
  executesOperations: false,
  launchesTransactions: false,
  invokesExecutors: false,
  accessesSanity: false,
  persistsStrategy: false,
  writes: false,
  rawPayloads: false,
} as const);
