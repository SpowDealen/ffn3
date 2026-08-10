import type {
  AutonomousSupervisedLoopCheckpoint,
  AutonomousSupervisedLoopPhase,
  AutonomousSupervisedLoopStopReason,
} from "../../globalResolution/checkpoint";
import type {TransactionAuthorizationPolicy, TransactionOrchestrationMode, TransactionRisk, TransactionStepMode} from "../../transactions";
import type {AutonomousEditorialStrategyFacadeInput, AutonomousEditorialStrategyFacadeResult} from "../strategy";

export const AUTONOMOUS_SUPERVISED_LOOP_VERSION = "1.0.0" as const;

export type AutonomousInvestigationIntent =
  | "inspect_sanity"
  | "inspect_source"
  | "search_candidates"
  | "compare_entities"
  | "wait_for_evidence"
  | "request_human";

export type AutonomousLoopObservation = Readonly<{
  facadeInput: AutonomousEditorialStrategyFacadeInput;
  evidenceFingerprint: string;
  checkpointFingerprint: string;
  blockerCodes: readonly string[];
}>;

export type AutonomousLoopReadyTransactionStep = Readonly<{
  stepId: string;
  capability: string;
  mode: TransactionStepMode;
  risk: TransactionRisk;
  authorization: TransactionAuthorizationPolicy;
}>;

export type AutonomousLoopTransactionHandoff = Readonly<{
  status: "ready" | "completed" | "unnecessary" | "stale" | "blocked" | "reconciliation_required" | "compensation_required";
  strategyFingerprint: string;
  transactionFingerprint?: string;
  checkpointFingerprint: string;
  transactionState?: string;
  readySteps: readonly AutonomousLoopReadyTransactionStep[];
  pendingMandatoryStepIds: readonly string[];
  authorizationRequired: readonly string[];
  reconciliationRequired: readonly string[];
  compensationRequired: readonly string[];
  blockerCodes: readonly string[];
}>;

export type AutonomousLoopAu7Execution = Readonly<{
  status: "completed" | "paused" | "blocked" | "already_completed";
  stopReason: string;
  transactionFingerprint: string;
  transactionState: string;
  executions: readonly Readonly<{
    stepId: string;
    status: string;
    executorInvoked: boolean;
    reconciliationRequired: boolean;
  }>[];
  blockerCodes: readonly string[];
  authorizationRequired: readonly string[];
  reconciliationRequired: readonly string[];
  compensationRequired: readonly string[];
}>;

export type AutonomousLoopTransactionHandoffAdapter = Readonly<{
  prepareOrReuse(input: {caseId: string; strategy: AutonomousEditorialStrategyFacadeResult["strategy"]; signal?: AbortSignal}): Promise<AutonomousLoopTransactionHandoff> | AutonomousLoopTransactionHandoff;
  run(input: {
    caseId: string;
    strategyFingerprint: string;
    transactionFingerprint: string;
    checkpointFingerprint: string;
    mode: TransactionOrchestrationMode;
    stepId?: string;
    stepIds?: readonly string[];
    maxSteps: number;
    signal?: AbortSignal;
  }): Promise<AutonomousLoopAu7Execution> | AutonomousLoopAu7Execution;
}>;

export type AutonomousInvestigationAdapter = Readonly<{
  intent: AutonomousInvestigationIntent;
  capability: string;
  readOnly: true;
  autonomy: "autonomous_safe";
  run(input: {caseId: string; evidenceFingerprint: string; signal?: AbortSignal}): Promise<Readonly<{status: "observed" | "unchanged" | "blocked" | "cancelled"; evidenceFingerprint?: string; reasonCodes: readonly string[]}>> | Readonly<{status: "observed" | "unchanged" | "blocked" | "cancelled"; evidenceFingerprint?: string; reasonCodes: readonly string[]}>;
}>;

export type AutonomousInvestigationAdapterRegistry = Readonly<{
  get(intent: AutonomousInvestigationIntent): AutonomousInvestigationAdapter | undefined;
}>;

export type AutonomousLoopCheckpointPersistence = Readonly<{
  persisted: boolean;
  conflict: boolean;
  checkpointFingerprint?: string;
  reasonCodes: readonly string[];
}>;

export type AutonomousLoopCheckpointSnapshot = Readonly<{
  globalCheckpointFingerprint: string;
  loop?: AutonomousSupervisedLoopCheckpoint;
}>;

export type AutonomousLoopCheckpointApplication = Readonly<{
  load(caseId: string): Promise<AutonomousLoopCheckpointSnapshot | undefined> | AutonomousLoopCheckpointSnapshot | undefined;
  persist(input: {caseId: string; checkpoint: AutonomousSupervisedLoopCheckpoint; expectedGlobalCheckpointFingerprint: string}): Promise<AutonomousLoopCheckpointPersistence> | AutonomousLoopCheckpointPersistence;
}>;

export type AutonomousSupervisedLoopRuntime = Readonly<{
  observe(input: {caseId: string; signal?: AbortSignal}): Promise<AutonomousLoopObservation> | AutonomousLoopObservation;
  transactionHandoff: AutonomousLoopTransactionHandoffAdapter;
  investigationAdapters: AutonomousInvestigationAdapterRegistry;
  checkpointApplication: AutonomousLoopCheckpointApplication;
}>;

export type RunAutonomousSupervisedLoopInput = Readonly<{
  caseId: string;
  intent: "start" | "continue";
  maxIterations: number;
  runtime: AutonomousSupervisedLoopRuntime;
  signal?: AbortSignal;
}>;

export type AutonomousLoopIterationSummary = Readonly<{
  iteration: number;
  phase: AutonomousSupervisedLoopPhase;
  action: "none" | "investigation" | "au7_single_step" | "au7_safe_batch" | "au7_supervised_run";
  investigationIntent?: AutonomousInvestigationIntent;
  transactionMode?: TransactionOrchestrationMode;
  stopReason?: AutonomousSupervisedLoopStopReason;
  effectConfirmed: boolean;
  stateFingerprint: string;
}>;

export type AutonomousSupervisedLoopResult = Readonly<{
  schemaVersion: typeof AUTONOMOUS_SUPERVISED_LOOP_VERSION;
  loopId: string;
  loopFingerprint: string;
  phase: AutonomousSupervisedLoopPhase;
  stopReason?: AutonomousSupervisedLoopStopReason;
  iteration: number;
  checkpoint?: AutonomousSupervisedLoopCheckpoint;
  governance?: AutonomousEditorialStrategyFacadeResult;
  iterations: readonly AutonomousLoopIterationSummary[];
  joinedExistingRun: boolean;
  explicitContinuationRequired: boolean;
  autoResumed: false;
  directExecutorCalls: false;
  automaticReconciliation: false;
  automaticCompensation: false;
  persistedAuthorization: false;
  editorialWritesOutsideAu7: false;
  checkpointWritesViaAu3: true;
}>;

export type AutonomousLoopRecoveryResult = Readonly<{
  status: "absent" | "valid" | "stale" | "invalid" | "terminal";
  checkpoint?: AutonomousSupervisedLoopCheckpoint;
  reasons: readonly string[];
  canAutoResume: false;
  explicitContinuationRequired: boolean;
}>;

export const autonomousSupervisedLoopSecurity = Object.freeze({
  fullyAutonomous: false,
  directExecutorCalls: false,
  editorialWritesOutsideAu7: false,
  checkpointWritesViaAu3: true,
  automaticReconciliation: false,
  automaticCompensation: false,
  automaticAuthorization: false,
  persistsAuthorization: false,
  persistsPayloads: false,
  autoResumeOnRecovery: false,
  arbitraryNetworkAccess: false,
} as const);
