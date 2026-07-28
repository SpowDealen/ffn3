import type {ReviewCase} from "../../types";
import {getReviewCase, setGlobalResolutionCheckpoint, updateGlobalResolutionCheckpoint} from "../../store/reviewStore";
import type {GlobalResolutionPlan} from "../types";
import type {ExternalNewsResumeAdapterResult} from "../externalNewsResumeExecutor";
import type {PreparedExternalNewsResume, ReplaceProjectedReferenceResult, ResolvedEditorialReference} from "../fighterReferenceResolution";
import type {GlobalResolutionSimulationResult} from "../simulateGlobalResolutionPlan";
import type {UniversalPlanExecution} from "../../universal";
import {fingerprintGlobalResolutionCase} from "./fingerprints";
import {recoverGlobalResolutionCheckpoint} from "./recovery";
import {buildCurrentGlobalResolutionCatalog, type GlobalResolutionCurrentCatalog} from "./catalog";
import {
  createCheckpointAfterPlanning,
  updateCheckpointAfterExecution,
  updateCheckpointAfterReferenceResolution,
  updateCheckpointAfterResumeExecution,
  updateCheckpointAfterResumePreparation,
  updateCheckpointAfterSimulation,
} from "./lifecycle";
import type {GlobalResolutionCheckpoint, GlobalResolutionRecoveryResult} from "./types";

export type GlobalResolutionCheckpointPersistence = {
  get(caseId: string): ReviewCase | undefined;
  set(caseId: string, expectedVersion: number, checkpoint: GlobalResolutionCheckpoint, now: Date): ReviewCase | undefined;
  update(caseId: string, expectedVersion: number, checkpoint: GlobalResolutionCheckpoint, now: Date, expectedCheckpointFingerprint?: string): ReviewCase | undefined;
};

export type GlobalResolutionCheckpointPersistenceResult =
  | {status: "persisted"; value: GlobalResolutionCheckpoint; storedAtCaseVersion: number}
  | {status: "conflict"; reason: string; recoveryRequired: true}
  | {status: "failed"; error: {code: string; message: string}; recoveryRequired: true}
  | {status: "skipped"; reason: string; recoveryRequired: boolean};

export type GlobalResolutionLifecycleResult<T> = {
  domainResult: T;
  checkpoint: GlobalResolutionCheckpointPersistenceResult;
  canContinue: boolean;
  regenerationRequired: boolean;
};

export type IntegratedGlobalResolutionRecovery = {
  catalog: GlobalResolutionCurrentCatalog;
  recovery: GlobalResolutionRecoveryResult;
  regenerationRequired: boolean;
  requiresAuthorization: boolean;
  executionAllowed: boolean;
  reasons: string[];
};

const defaultPersistence: GlobalResolutionCheckpointPersistence = {
  get: getReviewCase,
  set: (caseId, expectedVersion, checkpoint, now) => setGlobalResolutionCheckpoint(caseId, expectedVersion, checkpoint, now),
  update: (caseId, expectedVersion, checkpoint, now, expectedCheckpointFingerprint) => updateGlobalResolutionCheckpoint(caseId, expectedVersion, () => checkpoint, now, expectedCheckpointFingerprint),
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "checkpoint_persistence_failed";
}

function conflictMessage(message: string): boolean {
  return /versión|version|obsoleto|stale|cambió|changed|conflict/i.test(message);
}

export function persistGlobalResolutionLifecycleResult<T>(input: {
  domainResult: T;
  reviewCase: ReviewCase;
  checkpoint: GlobalResolutionCheckpoint;
  mode: "set" | "update";
  domainOperationOccurred?: boolean;
  persistence?: GlobalResolutionCheckpointPersistence;
  now?: () => string;
}): GlobalResolutionLifecycleResult<T> {
  const persistence = input.persistence ?? defaultPersistence;
  const current = persistence.get(input.reviewCase.id);
  if (!current) return {domainResult: input.domainResult, checkpoint: {status: "skipped", reason: "review_case_missing", recoveryRequired: Boolean(input.domainOperationOccurred)}, canContinue: !input.domainOperationOccurred, regenerationRequired: Boolean(input.domainOperationOccurred)};
  if (current.version !== input.reviewCase.version || fingerprintGlobalResolutionCase(current) !== fingerprintGlobalResolutionCase(input.reviewCase)) {
    return {domainResult: input.domainResult, checkpoint: {status: "conflict", reason: "review_case_changed_before_checkpoint_persistence", recoveryRequired: true}, canContinue: false, regenerationRequired: true};
  }
  try {
    const now = new Date((input.now ?? (() => new Date().toISOString()))());
    const stored = input.mode === "set"
      ? persistence.set(current.id, current.version, input.checkpoint, now)
      : persistence.update(current.id, current.version, input.checkpoint, now, input.reviewCase.globalResolution?.checkpointFingerprint);
    if (!stored?.globalResolution) return {domainResult: input.domainResult, checkpoint: {status: "failed", error: {code: "checkpoint_not_persisted", message: "El store no devolvió el checkpoint persistido."}, recoveryRequired: true}, canContinue: false, regenerationRequired: true};
    return {domainResult: input.domainResult, checkpoint: {status: "persisted", value: stored.globalResolution, storedAtCaseVersion: stored.version}, canContinue: true, regenerationRequired: false};
  } catch (error) {
    const message = errorMessage(error);
    const checkpoint: GlobalResolutionCheckpointPersistenceResult = conflictMessage(message)
      ? {status: "conflict", reason: message, recoveryRequired: true}
      : {status: "failed", error: {code: "checkpoint_persistence_failed", message}, recoveryRequired: true};
    return {domainResult: input.domainResult, checkpoint, canContinue: false, regenerationRequired: true};
  }
}

type IntegrationBase = {
  reviewCase: ReviewCase;
  plan: GlobalResolutionPlan;
  catalog: GlobalResolutionCurrentCatalog;
  persistence?: GlobalResolutionCheckpointPersistence;
  now?: () => string;
};

export function recordCheckpointAfterPlanning(input: IntegrationBase): GlobalResolutionLifecycleResult<GlobalResolutionPlan> {
  const checkpoint = createCheckpointAfterPlanning(input);
  return persistGlobalResolutionLifecycleResult({...input, domainResult: input.plan, checkpoint, mode: "set"});
}

export function recordCheckpointAfterSimulation(input: IntegrationBase & {
  checkpoint: GlobalResolutionCheckpoint;
  simulation: GlobalResolutionSimulationResult;
}): GlobalResolutionLifecycleResult<GlobalResolutionSimulationResult> {
  const checkpoint = updateCheckpointAfterSimulation(input);
  return persistGlobalResolutionLifecycleResult({...input, domainResult: input.simulation, checkpoint, mode: "update"});
}

export function recordCheckpointAfterExecution(input: IntegrationBase & {
  checkpoint: GlobalResolutionCheckpoint;
  execution: UniversalPlanExecution;
  operationIdsByEffectIndex?: Readonly<Record<number, string>>;
}): GlobalResolutionLifecycleResult<UniversalPlanExecution> {
  const checkpoint = updateCheckpointAfterExecution(input);
  return persistGlobalResolutionLifecycleResult({...input, domainResult: input.execution, checkpoint, mode: "update", domainOperationOccurred: input.execution.results.length > 0});
}

export function recordCheckpointAfterReferenceResolution(input: IntegrationBase & {
  checkpoint: GlobalResolutionCheckpoint;
  reference: ResolvedEditorialReference;
  replacement: ReplaceProjectedReferenceResult;
}): GlobalResolutionLifecycleResult<ReplaceProjectedReferenceResult> {
  const checkpoint = updateCheckpointAfterReferenceResolution(input);
  return persistGlobalResolutionLifecycleResult({...input, domainResult: input.replacement, checkpoint, mode: "update"});
}

export function recordCheckpointAfterResumePreparation(input: IntegrationBase & {
  checkpoint: GlobalResolutionCheckpoint;
  prepared: PreparedExternalNewsResume;
}): GlobalResolutionLifecycleResult<PreparedExternalNewsResume> {
  const checkpoint = updateCheckpointAfterResumePreparation(input);
  return persistGlobalResolutionLifecycleResult({...input, domainResult: input.prepared, checkpoint, mode: "update"});
}

export function recordCheckpointAfterResumeExecution(input: IntegrationBase & {
  checkpoint: GlobalResolutionCheckpoint;
  result: ExternalNewsResumeAdapterResult;
}): GlobalResolutionLifecycleResult<ExternalNewsResumeAdapterResult> {
  const checkpoint = updateCheckpointAfterResumeExecution(input);
  return persistGlobalResolutionLifecycleResult({...input, domainResult: input.result, checkpoint, mode: "update", domainOperationOccurred: ["resumed", "already_resumed", "reconciliation_required"].includes(input.result.outcome)});
}

export function recoverCurrentGlobalResolution(reviewCase: ReviewCase, catalog = buildCurrentGlobalResolutionCatalog()): IntegratedGlobalResolutionRecovery {
  const recovery = recoverGlobalResolutionCheckpoint(reviewCase, catalog.recoveryEnvironment);
  const producerAvailable = catalog.producers.some((producer) => producer.producer === reviewCase.context.producer);
  const catalogReasons = [...catalog.errors, ...(producerAvailable ? [] : [`producer_missing:${String(reviewCase.context.producer ?? "unknown")}`])];
  const valid = recovery.status === "valid" && catalog.valid && producerAvailable;
  const requiresAuthorization = recovery.status === "valid" ? recovery.continuation.requiresAuthorization : false;
  return {
    catalog,
    recovery,
    regenerationRequired: !valid,
    requiresAuthorization,
    executionAllowed: valid && recovery.status === "valid" && recovery.continuation.canExecute,
    reasons: [...catalogReasons, ...(recovery.status === "stale" || recovery.status === "invalid" ? recovery.reasons : [])],
  };
}
