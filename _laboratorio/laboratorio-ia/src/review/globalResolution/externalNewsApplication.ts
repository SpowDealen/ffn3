import {getExternalNewsResumeSnapshot} from "../resume/externalNews";
import {getReviewCase} from "../store/reviewStore";
import type {ReviewCase, ReviewJsonObject, ReviewJsonValue} from "../types";
import {
  buildUniversalExecutionPlan,
  computeUniversalFingerprint,
  executeUniversalExecutionPlan,
  getRegisteredReviewExecutor,
  simulateUniversalExecutionPlan,
  type UniversalPlanExecution,
  type UniversalReviewInput,
} from "../universal";
import {buildGlobalResolutionPlan} from "./buildGlobalResolutionPlan";
import {capabilityForOperation} from "./capabilities";
import {
  buildCurrentGlobalResolutionCatalog,
  createCheckpointAfterPlanning,
  markCheckpointExecutionStarted,
  persistGlobalResolutionLifecycleResult,
  recordCheckpointAfterExecution,
  recordCheckpointAfterPlanning,
  recordCheckpointAfterReferenceResolution,
  recordCheckpointAfterResumeExecution,
  recordCheckpointAfterResumePreparation,
  recordCheckpointAfterSimulation,
  recoverCurrentGlobalResolution,
  summarizeGlobalResolutionSimulation,
  updateCheckpointAfterPureValidation,
  type GlobalResolutionCheckpoint,
  type GlobalResolutionCheckpointPersistence,
  type GlobalResolutionCurrentCatalog,
  type GlobalResolutionLifecycleResult,
  type IntegratedGlobalResolutionRecovery,
} from "./checkpoint";
import {
  authorizeExternalNewsResume,
  buildPreparedExternalNewsResumeUniversalPlan,
  type ExternalNewsResumeAdapterResult,
  type ExternalNewsResumeAuthorization,
} from "./externalNewsResumeExecutor";
import {extractFighterCreationUniversalPlan} from "./fighterCreationExecutor";
import {
  prepareExternalNewsResume as prepareResumeDomain,
  replaceProjectedFighterReference,
  type PreparedExternalNewsResume,
  type ReplaceProjectedReferenceResult,
  type ResolvedEditorialReference,
} from "./fighterReferenceResolution";
import {simulateGlobalResolutionPlan, type GlobalResolutionSimulationContext, type GlobalResolutionSimulationResult} from "./simulateGlobalResolutionPlan";
import type {GlobalResolutionPlanningEvidence, PreparedEntityPlanningInput} from "./types";
import {buildExternalNewsUniversalReviewInput, externalNewsRuntimeManifests} from "./externalNewsRuntime";

type Clock = () => string;
type BaseDependencies = {
  persistence?: GlobalResolutionCheckpointPersistence;
  catalog?: () => GlobalResolutionCurrentCatalog;
  now?: Clock;
};

export type ExternalNewsPlanningInput = {
  preparedEntities: readonly PreparedEntityPlanningInput[];
  evidence: readonly GlobalResolutionPlanningEvidence[];
  finalEntityType?: "noticia";
};

export type ExternalNewsApplicationRecovery = IntegratedGlobalResolutionRecovery & {
  caseId: string;
  checkpointStatus: IntegratedGlobalResolutionRecovery["recovery"]["status"];
  nextReadyOperationIds: string[];
  completed: boolean;
  reconciliationRequired: boolean;
  authorizationRequired: boolean;
};

export type ExternalNewsInitializationResult =
  | {status: "initialized" | "already_initialized"; recovery: ExternalNewsApplicationRecovery; lifecycle?: GlobalResolutionLifecycleResult<import("./types").GlobalResolutionPlan>}
  | {status: "checkpoint_conflict" | "checkpoint_failed" | "case_invalid" | "producer_mismatch" | "planning_blocked" | "regeneration_required"; reasons: string[]; recovery?: ExternalNewsApplicationRecovery};

export type ExternalNewsSimulationApplicationResult =
  | {status: "simulated" | "already_simulated"; simulation: GlobalResolutionSimulationResult; lifecycle: GlobalResolutionLifecycleResult<GlobalResolutionSimulationResult>; recovery: ExternalNewsApplicationRecovery}
  | {status: "absent" | "stale" | "invalid" | "blocked" | "reconciliation_required" | "already_resumed" | "producer_mismatch"; reasons: string[]; recovery: ExternalNewsApplicationRecovery};

export type ExternalNewsOperationResult =
  | {status: "succeeded" | "reused_existing" | "reconciliation_required" | "failed" | "blocked"; operationId: string; execution?: UniversalPlanExecution; replacement?: ReplaceProjectedReferenceResult; lifecycle?: GlobalResolutionLifecycleResult<UniversalPlanExecution | ReplaceProjectedReferenceResult>; recovery: ExternalNewsApplicationRecovery}
  | {status: "case_invalid" | "producer_mismatch" | "checkpoint_stale" | "checkpoint_invalid" | "checkpoint_conflict" | "checkpoint_failed" | "operation_unknown" | "operation_not_ready" | "dependency_missing" | "authorization_required" | "already_resumed"; operationId: string; reasons: string[]; recovery?: ExternalNewsApplicationRecovery};

export type ExternalNewsResumePreparationResult =
  | {status: "ready_to_resume" | "blocked"; prepared: PreparedExternalNewsResume; lifecycle: GlobalResolutionLifecycleResult<PreparedExternalNewsResume>; recovery: ExternalNewsApplicationRecovery}
  | {status: "case_invalid" | "producer_mismatch" | "checkpoint_stale" | "checkpoint_invalid" | "reference_missing" | "already_resumed"; reasons: string[]; recovery?: ExternalNewsApplicationRecovery};

export type ExternalNewsGlobalResumeAuthorization = {
  caseId: string;
  caseVersion: number;
  checkpointFingerprint: string;
  planId: string;
  planFingerprint: string;
  operationId: string;
  previewFingerprint: string;
  payloadFingerprint: string;
  confirmed: true;
  intent: "resume_external_news";
  confirmedAt: string;
  expiresAt: string;
  resumeAuthorization: ExternalNewsResumeAuthorization;
};

export type ExternalNewsGlobalResumeResult =
  | {status: "resumed" | "already_resumed" | "resume_failed" | "reconciliation_required"; domainResult: ExternalNewsResumeAdapterResult; checkpoint: GlobalResolutionLifecycleResult<ExternalNewsResumeAdapterResult>["checkpoint"]; canContinue: boolean; reconciliationRequired: boolean; recovery?: ExternalNewsApplicationRecovery}
  | {status: "authorization_invalid" | "checkpoint_conflict" | "checkpoint_failed" | "checkpoint_stale" | "checkpoint_invalid" | "case_invalid"; reasons: string[]; recovery?: ExternalNewsApplicationRecovery};

const activeOperations = new Map<string, Promise<ExternalNewsOperationResult>>();
const activeResumes = new Map<string, Promise<ExternalNewsGlobalResumeResult>>();
const nowDefault = () => new Date().toISOString();
const object = (value: unknown): value is ReviewJsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const catalogOf = (dependencies: BaseDependencies) => (dependencies.catalog ?? buildCurrentGlobalResolutionCatalog)();
async function loadCase(caseId: string, dependencies: BaseDependencies): Promise<ReviewCase | undefined> {
  return dependencies.persistence?.get(caseId) ?? getReviewCase(caseId);
}

function recoveryView(reviewCase: ReviewCase, catalog: GlobalResolutionCurrentCatalog): ExternalNewsApplicationRecovery {
  const integrated = recoverCurrentGlobalResolution(reviewCase, catalog);
  const valid = integrated.recovery.status === "valid" ? integrated.recovery : undefined;
  return {
    ...integrated,
    caseId: reviewCase.id,
    checkpointStatus: integrated.recovery.status,
    nextReadyOperationIds: valid?.continuation.nextReadyOperationIds ?? [],
    completed: valid?.checkpoint.phase === "completed",
    reconciliationRequired: valid?.checkpoint.phase === "reconciliation_required",
    authorizationRequired: Boolean(valid?.continuation.canResumeProducer),
  };
}

function producerError(reviewCase: ReviewCase): string | undefined {
  if (reviewCase.context.producer !== "external_news") return "producer_mismatch";
  const snapshot = getExternalNewsResumeSnapshot(reviewCase.context);
  if (!snapshot.complete || !snapshot.snapshot) return `snapshot_invalid:${snapshot.missingFields.join(",")}`;
  return undefined;
}

function persistenceStatus(status: GlobalResolutionLifecycleResult<unknown>["checkpoint"]["status"]): "checkpoint_conflict" | "checkpoint_failed" {
  return status === "conflict" ? "checkpoint_conflict" : "checkpoint_failed";
}

export async function recoverExternalNewsGlobalResolution(caseId: string, dependencies: BaseDependencies = {}): Promise<ExternalNewsApplicationRecovery> {
  const reviewCase = await loadCase(caseId, dependencies);
  const catalog = catalogOf(dependencies);
  if (!reviewCase) {
    const absent: ReviewCase = {schemaVersion: 1, id: caseId, dedupeKey: caseId, module: "external.news", title: caseId, status: "open", priority: "normal", subject: {type: "external_news"}, issues: [], resolutions: [], context: {producer: "external_news"}, createdAt: "", updatedAt: "", version: 1, resumeAttempts: 0};
    return {...recoveryView(absent, catalog), reasons: ["review_case_missing"]};
  }
  return recoveryView(reviewCase, catalog);
}

export async function initializeExternalNewsGlobalResolution(input: {
  caseId: string;
  planning: ExternalNewsPlanningInput;
  regenerateStale?: boolean;
  dependencies?: BaseDependencies;
}): Promise<ExternalNewsInitializationResult> {
  const dependencies = input.dependencies ?? {};
  const reviewCase = await loadCase(input.caseId, dependencies);
  if (!reviewCase) return {status: "case_invalid", reasons: ["review_case_missing"]};
  const invalidProducer = producerError(reviewCase);
  if (invalidProducer) return {status: invalidProducer === "producer_mismatch" ? "producer_mismatch" : "case_invalid", reasons: [invalidProducer]};
  const catalog = catalogOf(dependencies);
  const existing = recoveryView(reviewCase, catalog);
  if (reviewCase.globalResolution) {
    if (existing.recovery.status === "valid") return {status: "already_initialized", recovery: existing};
    if (!input.regenerateStale) return {status: "regeneration_required", reasons: existing.reasons.length ? existing.reasons : [existing.recovery.status], recovery: existing};
  }
  const built = buildGlobalResolutionPlan({
    reviewCase,
    preparedEntities: input.planning.preparedEntities,
    evidence: input.planning.evidence,
    finalEntityType: input.planning.finalEntityType ?? "noticia",
    policy: {availableCapabilities: externalNewsRuntimeManifests.map((manifest) => manifest.capability)},
    now: dependencies.now,
  });
  if (!built.ok || !built.plan.structurallyValid) return {status: "planning_blocked", reasons: (built.ok ? built.plan.blockers : built.issues).map((item) => `${item.code}:${item.message}`)};
  if (!catalog.valid || !catalog.producers.some((producer) => producer.producer === "external_news")) return {status: "case_invalid", reasons: [...catalog.errors, "external_news_runtime_unavailable"]};
  const lifecycle = reviewCase.globalResolution
    ? persistGlobalResolutionLifecycleResult({domainResult: built.plan, reviewCase, checkpoint: createCheckpointAfterPlanning({reviewCase, plan: built.plan, catalog, now: dependencies.now}), mode: "update", persistence: dependencies.persistence, now: dependencies.now})
    : recordCheckpointAfterPlanning({reviewCase, plan: built.plan, catalog, persistence: dependencies.persistence, now: dependencies.now});
  if (lifecycle.checkpoint.status !== "persisted") return {status: persistenceStatus(lifecycle.checkpoint.status), reasons: [lifecycle.checkpoint.status === "conflict" ? lifecycle.checkpoint.reason : lifecycle.checkpoint.status === "failed" ? lifecycle.checkpoint.error.message : lifecycle.checkpoint.reason]};
  const current = await loadCase(input.caseId, dependencies);
  if (!current) return {status: "checkpoint_failed", reasons: ["review_case_missing_after_initialization"]};
  return {status: "initialized", lifecycle, recovery: recoveryView(current, catalog)};
}

function rejectRecovery(reviewCase: ReviewCase, recovery: ExternalNewsApplicationRecovery): {status: "absent" | "stale" | "invalid" | "reconciliation_required" | "already_resumed" | "producer_mismatch"; reasons: string[]; recovery: ExternalNewsApplicationRecovery} | undefined {
  if (reviewCase.context.producer !== "external_news") return {status: "producer_mismatch", reasons: ["producer_mismatch"], recovery};
  if (["resuming", "resumed"].includes(reviewCase.status) || reviewCase.resumeExecution?.status === "succeeded") return {status: "already_resumed", reasons: ["case_already_resumed"], recovery};
  if (recovery.recovery.status === "absent") return {status: "absent", reasons: ["checkpoint_absent"], recovery};
  if (recovery.recovery.status === "stale") return {status: "stale", reasons: recovery.recovery.reasons, recovery};
  if (recovery.recovery.status === "invalid") return {status: "invalid", reasons: recovery.recovery.reasons, recovery};
  if (recovery.reconciliationRequired) return {status: "reconciliation_required", reasons: ["checkpoint_reconciliation_required"], recovery};
  return undefined;
}

export async function simulateExternalNewsGlobalResolution(input: {
  caseId: string;
  context: GlobalResolutionSimulationContext;
  dependencies?: BaseDependencies;
}): Promise<ExternalNewsSimulationApplicationResult> {
  const dependencies = input.dependencies ?? {};
  const reviewCase = await loadCase(input.caseId, dependencies);
  if (!reviewCase) {
    const recovery = await recoverExternalNewsGlobalResolution(input.caseId, dependencies);
    return {status: "absent", reasons: ["review_case_missing"], recovery};
  }
  const catalog = catalogOf(dependencies);
  const recovery = recoveryView(reviewCase, catalog);
  const rejected = rejectRecovery(reviewCase, recovery);
  if (rejected) return rejected;
  if (recovery.recovery.status !== "valid") return {status: "invalid", reasons: ["checkpoint_invalid"], recovery};
  const simulation = simulateGlobalResolutionPlan(recovery.recovery.plan, {...input.context, reviewCase});
  if (!simulation.simulatable) return {status: "blocked", reasons: simulation.blockers.map((item) => `${item.code}:${item.message}`), recovery};
  const same = recovery.recovery.checkpoint.simulation?.resultFingerprint === summarizeGlobalResolutionSimulation(simulation, (dependencies.now ?? nowDefault)()).resultFingerprint;
  const lifecycle = recordCheckpointAfterSimulation({reviewCase, plan: recovery.recovery.plan, catalog, checkpoint: recovery.recovery.checkpoint, simulation, persistence: dependencies.persistence, now: dependencies.now});
  const current = await loadCase(input.caseId, dependencies) ?? reviewCase;
  return {status: same ? "already_simulated" : "simulated", simulation, lifecycle, recovery: recoveryView(current, catalog)};
}

function referenceFromCheckpoint(checkpoint: GlobalResolutionCheckpoint, operationId: string): ResolvedEditorialReference | undefined {
  const operation = checkpoint.plan.operations.find((candidate) => candidate.id === operationId);
  const summary = checkpoint.execution?.operations.filter((candidate) => candidate.operationId === operationId && candidate.status === "succeeded").at(-1);
  const identityKey = typeof operation?.target?.identityKey === "string" ? operation.target.identityKey : object(operation?.payload) && typeof operation.payload.identityKey === "string" ? operation.payload.identityKey : "";
  if (!operation || operation.kind !== "create_entity" || operation.entityType !== "luchador" || !summary?.documentId || summary.documentId.startsWith("projected:") || !identityKey || !["created", "reused_existing"].includes(summary.outcome ?? "")) return undefined;
  return {entityType: "luchador", documentId: summary.documentId, reference: {_type: "reference", _ref: summary.documentId}, sourceOperationId: operationId, sourceResult: summary.outcome as "created" | "reused_existing", identityKey, validated: true};
}

function replacementInput(reviewCase: ReviewCase, reference: ResolvedEditorialReference): {payload: ReviewJsonObject; expectedInputFingerprint: string} | undefined {
  const snapshot = getExternalNewsResumeSnapshot(reviewCase.context).snapshot;
  if (!snapshot) return undefined;
  const payload = structuredClone(snapshot.payload);
  const current = Array.isArray(payload.luchadoresRelacionados) ? payload.luchadoresRelacionados.filter((item): item is string => typeof item === "string") : [];
  const marker = `projected:luchador:${reference.sourceOperationId}`;
  payload.luchadoresRelacionados = current.includes(reference.documentId) ? current : [...new Set([...current, marker])];
  return {payload, expectedInputFingerprint: computeUniversalFingerprint(payload as unknown as ReviewJsonValue)};
}

function operationError(status: ExternalNewsOperationResult["status"], operationId: string, reasons: string[], recovery?: ExternalNewsApplicationRecovery): ExternalNewsOperationResult {
  return {status: status as "case_invalid", operationId, reasons, recovery};
}

async function executeOperationInternal(input: {
  caseId: string;
  expectedCaseVersion: number;
  expectedCheckpointFingerprint: string;
  operationId: string;
  simulationContext: GlobalResolutionSimulationContext;
  reviewInput?: UniversalReviewInput;
  idempotencyContext: string;
  signal?: AbortSignal;
  authorized?: boolean;
  dependencies?: BaseDependencies;
}): Promise<ExternalNewsOperationResult> {
  const dependencies = input.dependencies ?? {};
  let reviewCase = await loadCase(input.caseId, dependencies);
  if (!reviewCase) return operationError("case_invalid", input.operationId, ["review_case_missing"]);
  if (reviewCase.context.producer !== "external_news") return operationError("producer_mismatch", input.operationId, ["producer_mismatch"]);
  if (reviewCase.version !== input.expectedCaseVersion) return operationError("checkpoint_conflict", input.operationId, ["case_version_changed"]);
  if (["resuming", "resumed"].includes(reviewCase.status) || reviewCase.resumeExecution?.status === "succeeded") return operationError("already_resumed", input.operationId, ["case_already_resumed"]);
  const catalog = catalogOf(dependencies);
  let recovery = recoveryView(reviewCase, catalog);
  if (recovery.recovery.status !== "valid") return operationError(recovery.recovery.status === "stale" ? "checkpoint_stale" : "checkpoint_invalid", input.operationId, recovery.reasons, recovery);
  const validRecovery = recovery.recovery;
  if (recovery.recovery.checkpoint.checkpointFingerprint !== input.expectedCheckpointFingerprint) return operationError("checkpoint_conflict", input.operationId, ["checkpoint_fingerprint_changed"], recovery);
  if (recovery.reconciliationRequired) return operationError("operation_not_ready", input.operationId, ["checkpoint_reconciliation_required"], recovery);
  const node = recovery.recovery.graph.nodes.find((candidate) => candidate.operation.id === input.operationId);
  if (!node) return operationError("operation_unknown", input.operationId, ["operation_unknown"], recovery);
  if (node.isResumeNode) return operationError("authorization_required", input.operationId, ["use_authorize_and_resume"], recovery);
  if (node.state !== "ready") return operationError("operation_not_ready", input.operationId, [`operation_state:${node.state}`], recovery);
  const capability = capabilityForOperation(node.operation);
  if (capability === "validate:noticia") {
    const simulation = simulateGlobalResolutionPlan(recovery.recovery.plan, {...input.simulationContext, reviewCase});
    try {
      const checkpoint = updateCheckpointAfterPureValidation({reviewCase, plan: recovery.recovery.plan, catalog, checkpoint: recovery.recovery.checkpoint, simulation, operationId: input.operationId, now: dependencies.now});
      const lifecycle = persistGlobalResolutionLifecycleResult({domainResult: {ok: true, payload: {}} as ReplaceProjectedReferenceResult, reviewCase, checkpoint, mode: "update", persistence: dependencies.persistence, now: dependencies.now});
      const current = await loadCase(input.caseId, dependencies) ?? reviewCase;
      return {status: lifecycle.checkpoint.status === "persisted" ? "succeeded" : persistenceStatus(lifecycle.checkpoint.status), operationId: input.operationId, lifecycle: lifecycle as GlobalResolutionLifecycleResult<ReplaceProjectedReferenceResult>, recovery: recoveryView(current, catalog)} as ExternalNewsOperationResult;
    } catch (error) {
      return operationError("blocked", input.operationId, [error instanceof Error ? error.message : "validation_failed"], recovery);
    }
  }
  if (!input.authorized) return operationError("authorization_required", input.operationId, ["explicit_operation_authorization_required"], recovery);
  const executorRequirement = recovery.recovery.checkpoint.plan.executorRequirements.find((candidate) => candidate.capability === capability);
  const registered = executorRequirement ? getRegisteredReviewExecutor(executorRequirement.executorId) : undefined;
  if (!executorRequirement || !registered || registered.manifest.version !== executorRequirement.version || registered.manifestFingerprint !== executorRequirement.manifestFingerprint) return operationError("dependency_missing", input.operationId, ["executor_missing_or_changed"], recovery);
  const startedAt = (dependencies.now ?? nowDefault)();
  const startedCheckpoint = markCheckpointExecutionStarted({reviewCase, plan: recovery.recovery.plan, catalog, checkpoint: recovery.recovery.checkpoint, operationId: input.operationId, idempotencyKey: `${input.idempotencyContext}:${node.operation.idempotencyKey}`, startedAt, now: () => startedAt});
  const startPersistence = persistGlobalResolutionLifecycleResult({domainResult: input.operationId, reviewCase, checkpoint: startedCheckpoint, mode: "update", persistence: dependencies.persistence, now: () => startedAt});
  if (startPersistence.checkpoint.status !== "persisted") return operationError(persistenceStatus(startPersistence.checkpoint.status), input.operationId, ["execution_start_checkpoint_not_persisted"], recovery);
  const executionCheckpoint = startPersistence.checkpoint.value;
  reviewCase = await loadCase(input.caseId, dependencies) ?? reviewCase;

  let universalPlan;
  let state: ReviewJsonValue;
  if (capability === "create:luchador") {
    const simulation = simulateGlobalResolutionPlan(validRecovery.plan, {...input.simulationContext, reviewCase});
    const extracted = extractFighterCreationUniversalPlan({plan: validRecovery.plan, simulation, reviewInput: input.reviewInput ?? buildExternalNewsUniversalReviewInput(reviewCase), now: dependencies.now});
    if (!extracted.ok || extracted.operationId !== input.operationId) return operationError("blocked", input.operationId, [extracted.ok ? "operation_id_changed" : extracted.reason], recovery);
    universalPlan = extracted.universalPlan;
    state = {caseId: reviewCase.id, operationId: input.operationId, idempotencyContext: input.idempotencyContext};
  } else if (capability === "replace_reference:noticia:luchador") {
    const sourceOperationId = node.operation.dependencyIds.find((candidate) => validRecovery.plan.operations.some((operation) => operation.id === candidate));
    const reference = sourceOperationId ? referenceFromCheckpoint(executionCheckpoint, sourceOperationId) : undefined;
    const reconstructed = reference ? replacementInput(reviewCase, reference) : undefined;
    if (!reference || !reconstructed) return operationError("dependency_missing", input.operationId, ["real_reference_missing"], recovery);
    const reviewInput = input.reviewInput ?? buildExternalNewsUniversalReviewInput(reviewCase);
    universalPlan = buildUniversalExecutionPlan({reviewCase, reviewInput, effects: [{id: input.operationId, type: "replace_reference", path: "luchadoresRelacionados", referenceId: reference.documentId, executorSelector: {executorId: executorRequirement.executorId}}], preconditions: [{id: "real_reference", kind: "reference_real", description: "La referencia real coincide con la identidad planificada.", required: true}], postconditions: [{id: "projected_reference_removed", kind: "reference_replaced", description: "La referencia proyectada desapareció.", required: true, effectIndexes: [0]}], requiredCapabilities: [capability], now: dependencies.now});
    state = {...reconstructed, reference, sourceOperationId, caseId: reviewCase.id, caseVersion: reviewCase.version, planFingerprint: validRecovery.plan.fingerprint} as unknown as ReviewJsonValue;
  } else return operationError("operation_not_ready", input.operationId, [`unsupported_explicit_capability:${capability ?? "unknown"}`], recovery);

  const universalSimulation = await simulateUniversalExecutionPlan(universalPlan, state, {signal: input.signal, now: dependencies.now});
  const execution = await executeUniversalExecutionPlan(universalPlan, state, universalSimulation, {signal: input.signal, now: dependencies.now, policy: {allowedRiskLevels: ["none", "low", "medium"], allowedCapabilities: [capability]}});
  if (capability === "replace_reference:noticia:luchador") {
    const output = execution.results[0]?.output;
    const replacement = object(output) ? output as unknown as ReplaceProjectedReferenceResult : undefined;
    const sourceOperationId = node.operation.dependencyIds.find((candidate) => validRecovery.plan.operations.some((operation) => operation.id === candidate));
    const reference = sourceOperationId ? referenceFromCheckpoint(executionCheckpoint, sourceOperationId) : undefined;
    if (!replacement?.ok || !reference || execution.status !== "succeeded") return {status: execution.status === "reconciliation_required" ? "reconciliation_required" : execution.status === "failed" ? "failed" : "blocked", operationId: input.operationId, execution, replacement, recovery};
    const lifecycle = recordCheckpointAfterReferenceResolution({reviewCase, plan: validRecovery.plan, catalog, checkpoint: executionCheckpoint, reference, replacement, persistence: dependencies.persistence, now: dependencies.now});
    const current = await loadCase(input.caseId, dependencies) ?? reviewCase;
    return {status: lifecycle.checkpoint.status === "persisted" ? "succeeded" : persistenceStatus(lifecycle.checkpoint.status), operationId: input.operationId, execution, replacement, lifecycle: lifecycle as GlobalResolutionLifecycleResult<ReplaceProjectedReferenceResult>, recovery: recoveryView(current, catalog)} as ExternalNewsOperationResult;
  }
  const lifecycle = recordCheckpointAfterExecution({reviewCase, plan: validRecovery.plan, catalog, checkpoint: executionCheckpoint, execution, operationIdsByEffectIndex: {0: input.operationId}, persistence: dependencies.persistence, now: dependencies.now});
  const current = await loadCase(input.caseId, dependencies) ?? reviewCase;
  const outcome = execution.results[0]?.output;
  const externalOutcome = object(outcome) && outcome.outcome === "reused_existing" ? "reused_existing" : execution.status === "succeeded" ? "succeeded" : execution.status === "reconciliation_required" ? "reconciliation_required" : execution.status === "failed" ? "failed" : "blocked";
  return {status: lifecycle.checkpoint.status === "persisted" ? externalOutcome : persistenceStatus(lifecycle.checkpoint.status), operationId: input.operationId, execution, lifecycle, recovery: recoveryView(current, catalog)} as ExternalNewsOperationResult;
}

export function executeExternalNewsResolutionOperation(input: Parameters<typeof executeOperationInternal>[0]): Promise<ExternalNewsOperationResult> {
  const key = `${input.caseId}:${input.expectedCaseVersion}:${input.expectedCheckpointFingerprint}:${input.operationId}:${input.idempotencyContext}`;
  const running = activeOperations.get(key);
  if (running) return running;
  const promise = executeOperationInternal(input).finally(() => activeOperations.delete(key));
  activeOperations.set(key, promise);
  return promise;
}

function reconstructReferenceAndReplacement(reviewCase: ReviewCase, checkpoint: GlobalResolutionCheckpoint): {reference: ResolvedEditorialReference; replacement: Extract<ReplaceProjectedReferenceResult, {ok: true}>; expectedInputFingerprint: string} | undefined {
  const referenceSummary = checkpoint.referenceResolution;
  if (!referenceSummary) return undefined;
  const reference: ResolvedEditorialReference = {entityType: "luchador", documentId: referenceSummary.documentId, reference: {_type: "reference", _ref: referenceSummary.documentId}, sourceOperationId: referenceSummary.operationId, sourceResult: referenceSummary.outcome, identityKey: referenceSummary.identityKey, validated: true};
  const reconstructed = replacementInput(reviewCase, reference);
  if (!reconstructed) return undefined;
  const replacement = replaceProjectedFighterReference({payload: reconstructed.payload, reference, sourceOperationId: reference.sourceOperationId, caseId: reviewCase.id, caseVersion: reviewCase.version, planFingerprint: checkpoint.planFingerprint, expectedPlanFingerprint: checkpoint.planFingerprint, expectedInputFingerprint: reconstructed.expectedInputFingerprint});
  return replacement.ok ? {reference, replacement, expectedInputFingerprint: reconstructed.expectedInputFingerprint} : undefined;
}

export async function prepareExternalNewsGlobalResume(input: {caseId: string; expectedCaseVersion: number; expectedCheckpointFingerprint: string; dependencies?: BaseDependencies}): Promise<ExternalNewsResumePreparationResult> {
  const dependencies = input.dependencies ?? {};
  const reviewCase = await loadCase(input.caseId, dependencies);
  if (!reviewCase) return {status: "case_invalid", reasons: ["review_case_missing"]};
  if (reviewCase.context.producer !== "external_news") return {status: "producer_mismatch", reasons: ["producer_mismatch"]};
  if (["resuming", "resumed"].includes(reviewCase.status) || reviewCase.resumeExecution?.status === "succeeded") return {status: "already_resumed", reasons: ["case_already_resumed"]};
  const catalog = catalogOf(dependencies);
  const recovery = recoveryView(reviewCase, catalog);
  if (reviewCase.version !== input.expectedCaseVersion || recovery.recovery.status !== "valid" || recovery.recovery.checkpoint.checkpointFingerprint !== input.expectedCheckpointFingerprint) return {status: recovery.recovery.status === "stale" ? "checkpoint_stale" : "checkpoint_invalid", reasons: recovery.reasons.length ? recovery.reasons : ["checkpoint_binding_mismatch"], recovery};
  const values = reconstructReferenceAndReplacement(reviewCase, recovery.recovery.checkpoint);
  if (!values) return {status: "reference_missing", reasons: ["reference_resolution_missing"], recovery};
  const prepared = prepareResumeDomain({reviewCase, plan: recovery.recovery.plan, replacement: values.replacement, references: [values.reference], expectedCaseVersion: reviewCase.version, expectedPlanFingerprint: recovery.recovery.plan.fingerprint, expectedSnapshotFingerprint: recovery.recovery.checkpoint.snapshotFingerprint, expectedReplacementInputFingerprint: values.expectedInputFingerprint, now: dependencies.now});
  const lifecycle = recordCheckpointAfterResumePreparation({reviewCase, plan: recovery.recovery.plan, catalog, checkpoint: recovery.recovery.checkpoint, prepared, persistence: dependencies.persistence, now: dependencies.now});
  const current = await loadCase(input.caseId, dependencies) ?? reviewCase;
  return {status: prepared.ready && lifecycle.checkpoint.status === "persisted" ? "ready_to_resume" : "blocked", prepared, lifecycle, recovery: recoveryView(current, catalog)};
}

export function authorizeExternalNewsGlobalResume(input: {prepared: PreparedExternalNewsResume; checkpoint: GlobalResolutionCheckpoint; operationId: string; confirmedAt: string; validityMs?: number}): ExternalNewsGlobalResumeAuthorization | undefined {
  const resumeAuthorization = authorizeExternalNewsResume(input.prepared, input.confirmedAt);
  const resumeNode = input.prepared.projectedGraph.nodes.find((node) => node.isResumeNode);
  if (!resumeAuthorization || !resumeNode || resumeNode.operation.id !== input.operationId || input.checkpoint.resume?.previewFingerprint !== input.prepared.previewFingerprint || input.checkpoint.phase !== "ready_to_resume") return undefined;
  const confirmed = Date.parse(input.confirmedAt);
  if (!Number.isFinite(confirmed)) return undefined;
  return {
    caseId: input.prepared.caseId,
    caseVersion: input.prepared.caseVersion,
    checkpointFingerprint: input.checkpoint.checkpointFingerprint,
    planId: input.prepared.planId,
    planFingerprint: input.prepared.planFingerprint,
    operationId: input.operationId,
    previewFingerprint: input.prepared.previewFingerprint,
    payloadFingerprint: computeUniversalFingerprint(input.prepared.payload as unknown as ReviewJsonValue),
    confirmed: true,
    intent: "resume_external_news",
    confirmedAt: input.confirmedAt,
    expiresAt: new Date(confirmed + (input.validityMs ?? 5 * 60_000)).toISOString(),
    resumeAuthorization,
  };
}

function authorizationValid(authorization: ExternalNewsGlobalResumeAuthorization, prepared: PreparedExternalNewsResume, checkpoint: GlobalResolutionCheckpoint, now: string): boolean {
  const resumeNode = prepared.projectedGraph.nodes.find((node) => node.isResumeNode);
  return authorization.confirmed && authorization.intent === "resume_external_news" && Date.parse(now) <= Date.parse(authorization.expiresAt) && authorization.caseId === prepared.caseId && authorization.caseVersion === prepared.caseVersion && authorization.checkpointFingerprint === checkpoint.checkpointFingerprint && authorization.planId === prepared.planId && authorization.planFingerprint === prepared.planFingerprint && authorization.operationId === resumeNode?.operation.id && authorization.previewFingerprint === prepared.previewFingerprint && authorization.payloadFingerprint === computeUniversalFingerprint(prepared.payload as unknown as ReviewJsonValue);
}

async function resumeInternal(input: {caseId: string; prepared: PreparedExternalNewsResume; authorization: ExternalNewsGlobalResumeAuthorization; expectedCheckpointFingerprint: string; reviewInput?: UniversalReviewInput; idempotencyContext: string; signal?: AbortSignal; dependencies?: BaseDependencies}): Promise<ExternalNewsGlobalResumeResult> {
  const dependencies = input.dependencies ?? {};
  let reviewCase = await loadCase(input.caseId, dependencies);
  if (!reviewCase) return {status: "case_invalid", reasons: ["review_case_missing"]};
  const catalog = catalogOf(dependencies);
  let recovery = recoveryView(reviewCase, catalog);
  if (recovery.recovery.status !== "valid") return {status: recovery.recovery.status === "stale" ? "checkpoint_stale" : "checkpoint_invalid", reasons: recovery.reasons, recovery};
  const checkpoint = recovery.recovery.checkpoint;
  const now = (dependencies.now ?? nowDefault)();
  if (checkpoint.checkpointFingerprint !== input.expectedCheckpointFingerprint || !authorizationValid(input.authorization, input.prepared, checkpoint, now)) return {status: "authorization_invalid", reasons: ["resume_authorization_stale_or_invalid"], recovery};
  const resumeNode = recovery.recovery.graph.nodes.find((node) => node.isResumeNode);
  if (!resumeNode || resumeNode.state !== "ready") return {status: "checkpoint_invalid", reasons: ["resume_operation_not_ready"], recovery};
  const started = markCheckpointExecutionStarted({reviewCase, plan: recovery.recovery.plan, catalog, checkpoint, operationId: resumeNode.operation.id, idempotencyKey: `${input.idempotencyContext}:${resumeNode.operation.idempotencyKey}`, startedAt: now, resume: true, now: () => now});
  const startPersistence = persistGlobalResolutionLifecycleResult({domainResult: resumeNode.operation.id, reviewCase, checkpoint: started, mode: "update", persistence: dependencies.persistence, now: () => now});
  if (startPersistence.checkpoint.status !== "persisted") return {status: persistenceStatus(startPersistence.checkpoint.status), reasons: ["resume_start_checkpoint_not_persisted"], recovery};
  const executionCheckpoint = startPersistence.checkpoint.value;
  reviewCase = await loadCase(input.caseId, dependencies) ?? reviewCase;
  const universalPlan = buildPreparedExternalNewsResumeUniversalPlan({prepared: input.prepared, reviewInput: input.reviewInput ?? buildExternalNewsUniversalReviewInput(reviewCase), now: dependencies.now});
  const state = {prepared: input.prepared, authorization: input.authorization.resumeAuthorization} as unknown as ReviewJsonValue;
  const simulation = await simulateUniversalExecutionPlan(universalPlan, state, {signal: input.signal, now: dependencies.now});
  const execution = await executeUniversalExecutionPlan(universalPlan, state, simulation, {signal: input.signal, now: dependencies.now, policy: {allowedRiskLevels: ["medium"], allowedCapabilities: ["resume:external_news"]}});
  const output = execution.results[0]?.output;
  const domainResult = object(output) ? output as unknown as ExternalNewsResumeAdapterResult : undefined;
  if (!domainResult) return {status: "resume_failed", domainResult: {caseId: input.caseId, caseVersion: input.prepared.caseVersion, planId: input.prepared.planId, operationId: input.prepared.operation, idempotencyKey: universalPlan.idempotencyKey, producer: "external_news", outcome: "failed", previewFingerprint: input.prepared.previewFingerprint, planFingerprint: input.prepared.planFingerprint, references: input.prepared.appliedReferences, projectedGraph: input.prepared.projectedGraph, warnings: [], error: {code: "resume_universal_result_missing", message: "El executor universal no devolvió resultado.", retryable: false}, completedAt: (dependencies.now ?? nowDefault)()}, checkpoint: {status: "skipped", reason: "resume_domain_result_missing", recoveryRequired: false}, canContinue: false, reconciliationRequired: false};
  const currentAfterDomain = await loadCase(input.caseId, dependencies) ?? reviewCase;
  const lifecycle = recordCheckpointAfterResumeExecution({reviewCase: currentAfterDomain, plan: recovery.recovery.plan, catalog, checkpoint: executionCheckpoint, result: domainResult, persistence: dependencies.persistence, now: dependencies.now});
  const persistenceFailed = lifecycle.checkpoint.status !== "persisted";
  const realSucceeded = domainResult.outcome === "resumed" || domainResult.outcome === "already_resumed";
  const status: "resumed" | "already_resumed" | "resume_failed" | "reconciliation_required" = realSucceeded ? domainResult.outcome as "resumed" | "already_resumed" : domainResult.outcome === "reconciliation_required" ? "reconciliation_required" : "resume_failed";
  return {status, domainResult, checkpoint: lifecycle.checkpoint, canContinue: lifecycle.canContinue && !persistenceFailed, reconciliationRequired: domainResult.outcome === "reconciliation_required" || realSucceeded && persistenceFailed, recovery: persistenceFailed ? undefined : recoveryView(await loadCase(input.caseId, dependencies) ?? currentAfterDomain, catalog)};
}

export function authorizeAndResumeExternalNews(input: Parameters<typeof resumeInternal>[0]): Promise<ExternalNewsGlobalResumeResult> {
  const key = `${input.caseId}:${input.expectedCheckpointFingerprint}:${input.authorization.operationId}:${input.idempotencyContext}`;
  const running = activeResumes.get(key);
  if (running) return running;
  const promise = resumeInternal(input).finally(() => activeResumes.delete(key));
  activeResumes.set(key, promise);
  return promise;
}

export const externalNewsApplicationAudit = Object.freeze({
  autoExecution: false,
  importTimeEffects: false,
  persistedAuthorization: false,
  persistedEditorialPayload: false,
  realResumeImplementation: "executeExternalNewsResume",
  runtimeManifestFingerprint: computeUniversalFingerprint(externalNewsRuntimeManifests as unknown as ReviewJsonValue),
  evidence: ["ReviewCase.context.payloadSnapshot", "ReviewCase.context.analysisSnapshot", "ReviewCase.resolutions", "ReviewCase.resumeExecution"],
  notificationHint: "Operación realizada, checkpoint no persistido",
  forbiddenTestEffects: ["sanity", "fetch", "telegram"],
} as const);
