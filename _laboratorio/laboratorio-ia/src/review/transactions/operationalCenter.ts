import {getExternalNewsResumeSnapshot} from "../resume/externalNews";
import type {ReviewCase, ReviewJsonObject, ReviewJsonValue} from "../types";
import {
  buildUniversalExecutionPlan,
  computeUniversalFingerprint,
  getRegisteredReviewExecutor,
  listRegisteredReviewExecutors,
  type ExecutionResult,
  type PostExecutionValidation,
  type RegisteredReviewExecutor,
  type ReviewExecutorRegistration,
  type UniversalExecutionPlan,
  type UniversalReviewInput,
} from "../universal";
import {
  authorizeExternalNewsResume,
  buildExternalNewsControlSimulationContext,
  buildExternalNewsUniversalReviewInput,
  buildPreparedExternalNewsResumeUniversalPlan,
  buildTransversalInteractiveRecoveryEnvironment,
  createGlobalResolutionProducerRuntime,
  extractFighterCreationUniversalPlan,
  prepareExternalNewsResume,
  recoverGlobalResolutionCheckpoint,
  replaceProjectedFighterReference,
  simulateGlobalResolutionPlan,
  type GlobalResolutionPlan,
  type ResolvedEditorialReference,
} from "../globalResolution";
import {getReviewCase} from "../store/reviewStore";
import {buildTransactionOperationalView, orchestrateTransaction, type TransactionIncident, type TransactionOperationalView, type TransactionOrchestrationMode, type TransactionOrchestrationResult, type TransactionOrchestrationRuntime} from "./orchestrator";
import {buildUniversalTransactionPlan, createTransactionBuildContextFromRegistries} from "./buildUniversalTransactionPlan";
import {createTransactionCheckpointExtension, persistTransactionCheckpointExtension} from "./persistence";
import {createReviewStoreTransactionCheckpointApplication, createTransactionExecutionAuthorization, createTransactionExecutionRuntime} from "./executor";
import {recordTransactionPaused, recordTransactionResumed} from "./lifecycle";
import {recoverPersistedTransaction} from "./persistedRecovery";
import type {TransactionCheckpointApplication, TransactionCheckpointPersistence, TransactionExecutionAuthorization, TransactionStep, UniversalTransactionPlan} from "./types";

export type TransactionCenterState = "planned" | "ready" | "executing" | "paused" | "blocked" | "reconciliation_required" | "compensation_required" | "completed" | "failed" | "stale";
export type TransactionCenterStepView = Readonly<{stepId: string; capability: string; state: TransactionStep["state"]; risk: TransactionStep["risk"]; mode: TransactionStep["mode"]; authorization: TransactionStep["authorization"]; dependencies: readonly string[]; ready: boolean}>;
export type TransactionCenterView = Readonly<{
  recovery: "absent" | "valid" | "invalid" | "stale" | "completed" | "reconciliation_required" | "compensation_required";
  state: TransactionCenterState;
  reasons: readonly string[];
  transaction?: UniversalTransactionPlan;
  operational?: TransactionOperationalView;
  steps: readonly TransactionCenterStepView[];
  globalCheckpointFingerprint?: string;
  transactionCheckpointFingerprint?: string;
  canStart: boolean;
  canExecuteNext: boolean;
  canExecuteSafeBatch: boolean;
  canPause: boolean;
  canResume: boolean;
  canRegenerate: boolean;
  canOpenReconciliation: boolean;
  canOpenCompensation: boolean;
  payloadsExposed: false;
}>;

export type TransactionCenterBuild = Readonly<{transaction: UniversalTransactionPlan; executors: readonly RegisteredReviewExecutor[]; sourcePlan: GlobalResolutionPlan}>;
export type TransactionCenterDependencies = Readonly<{executors?: readonly RegisteredReviewExecutor[]; checkpointApplication?: TransactionCheckpointApplication; now?: () => string}>;

const nowDefault = () => new Date().toISOString();
const object = (value: unknown): value is ReviewJsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isResume = (operation: GlobalResolutionPlan["operations"][number]) => object(operation.payload) && operation.payload.scope === "resume";
const logicalOperation = (operation: GlobalResolutionPlan["operations"][number]) => operation.kind === "reuse_entity" || operation.kind === "validate_entity" && !isResume(operation);

function logicalExecutor(capability: string): RegisteredReviewExecutor {
  const executorId = `transaction.logical.${computeUniversalFingerprint(capability as unknown as ReviewJsonValue).slice(-16)}`;
  const manifest = {executorId, version: 1, capability, scope: "transaction_logical", supportedEffects: ["block_operation" as const], supportedEntityTypes: ["*"], risk: "none" as const};
  const manifestFingerprint = computeUniversalFingerprint(manifest as unknown as ReviewJsonValue);
  const registration: ReviewExecutorRegistration = {
    ...manifest,
    canExecute(plan, indexes) { return plan.requiredCapabilities.includes(capability) && indexes.length === 1 && plan.effects[indexes[0]]?.type === "block_operation"; },
    async simulate(_plan, _state, indexes) { return {executorId, executorVersion: 1, executorManifestFingerprint: manifestFingerprint, capability, status: "safe", effectIndexes: indexes, changes: [], warnings: [], blockingReasons: [], errors: []}; },
    async execute(_plan, state, indexes, options): Promise<ExecutionResult> {
      const reused = object(state) && state.outcome === "reused_existing";
      return {executorId, executorVersion: 1, executorManifestFingerprint: manifestFingerprint, capability, status: "succeeded", effectIndexes: indexes, idempotencyKey: options.idempotencyKey, references: [], output: {outcome: reused ? "reused_existing" : "validated"}};
    },
    async validateExecution(plan, execution): Promise<PostExecutionValidation> { return {valid: execution.status === "succeeded", planFingerprint: plan.planFingerprint, executorId, executionIdempotencyKey: execution.idempotencyKey, checkedPostconditionIds: plan.postconditions.map((item) => item.id), checkedEffectIndexes: execution.effectIndexes, errors: [], warnings: [], validatedAt: nowDefault()}; },
  };
  return Object.freeze({registration, manifest, manifestFingerprint});
}

function sourcePlan(reviewCase: ReviewCase): {plan?: GlobalResolutionPlan; status: "absent" | "valid" | "stale" | "invalid"; reasons: readonly string[]} {
  const checkpoint = reviewCase.globalResolution;
  if (!checkpoint) return {status: "absent", reasons: ["global_resolution_checkpoint_absent"]};
  const recovered = recoverGlobalResolutionCheckpoint(reviewCase, buildTransversalInteractiveRecoveryEnvironment(checkpoint));
  if (recovered.status !== "valid") return {status: recovered.status, reasons: recovered.status === "absent" ? ["global_resolution_checkpoint_absent"] : recovered.reasons};
  return {status: "valid", plan: recovered.plan, reasons: []};
}

function executorInventory(plan: GlobalResolutionPlan, supplied?: readonly RegisteredReviewExecutor[]): readonly RegisteredReviewExecutor[] {
  const real = [...(supplied ?? listRegisteredReviewExecutors())];
  const logical = new Map<string, RegisteredReviewExecutor>();
  for (const operation of plan.operations) {
    const capability = operation.requiredCapability ?? "";
    if (capability && logicalOperation(operation) && !real.some((executor) => executor.manifest.capability === capability)) logical.set(capability, logicalExecutor(capability));
  }
  return Object.freeze([...real, ...logical.values()].sort((left, right) => left.manifest.executorId.localeCompare(right.manifest.executorId)));
}

export function buildReviewCenterTransaction(reviewCase: ReviewCase, dependencies: TransactionCenterDependencies = {}): Readonly<{ok: true; value: TransactionCenterBuild}> | Readonly<{ok: false; status: "absent" | "stale" | "invalid"; reasons: readonly string[]}> {
  const source = sourcePlan(reviewCase);
  if (!source.plan) return {ok: false, status: source.status === "valid" ? "invalid" : source.status, reasons: source.reasons};
  const runtime = createGlobalResolutionProducerRuntime();
  const executors = executorInventory(source.plan, dependencies.executors);
  const context = createTransactionBuildContextFromRegistries({plan: source.plan, producerRegistry: runtime.producers, executors, checkpoint: reviewCase.globalResolution, now: dependencies.now});
  const built = buildUniversalTransactionPlan(source.plan, context);
  return built.ok ? {ok: true, value: {transaction: built.value, executors, sourcePlan: source.plan}} : {ok: false, status: "invalid", reasons: built.reasons};
}

function restoredSteps(transaction: UniversalTransactionPlan, reviewCase: ReviewCase): TransactionCenterStepView[] {
  const stored = new Map(reviewCase.globalResolution?.transaction?.steps.map((step) => [step.stepId, step.state]) ?? []);
  const completed = new Set(["succeeded", "reused", "compensated", "skipped"]);
  return transaction.steps.map((step) => {
    const state = stored.get(step.stepId) ?? step.state;
    const dependenciesComplete = step.dependencies.every((id) => completed.has(stored.get(id) ?? transaction.steps.find((candidate) => candidate.stepId === id)?.state ?? "pending"));
    return Object.freeze({stepId: step.stepId, capability: step.capability, state, risk: step.risk, mode: step.mode, authorization: step.authorization, dependencies: Object.freeze([...step.dependencies]), ready: state === "ready" && dependenciesComplete});
  });
}

function centerState(view: TransactionOperationalView, operatorState: "active" | "paused" | undefined): TransactionCenterState {
  if (operatorState === "paused") return "paused";
  if (view.reconciliationRequired.length) return "reconciliation_required";
  if (view.compensationRequired.length) return "compensation_required";
  if (view.state === "completed") return "completed";
  if (["failed", "compensation_failed", "partially_compensated", "partially_succeeded"].includes(view.state)) return "failed";
  if (view.state === "executing") return "executing";
  if (view.state === "blocked" || view.incidents.some((item) => item.severity === "blocking" || item.severity === "critical")) return "blocked";
  return view.nextReadySteps.length ? "ready" : "planned";
}

export function recoverReviewCenterTransaction(reviewCase: ReviewCase, dependencies: TransactionCenterDependencies = {}, incidents: readonly TransactionIncident[] = []): TransactionCenterView {
  const built = buildReviewCenterTransaction(reviewCase, dependencies);
  if (!built.ok) return {recovery: built.status, state: built.status === "stale" ? "stale" : built.status === "absent" ? "planned" : "blocked", reasons: built.reasons, steps: [], globalCheckpointFingerprint: reviewCase.globalResolution?.checkpointFingerprint, canStart: false, canExecuteNext: false, canExecuteSafeBatch: false, canPause: false, canResume: false, canRegenerate: built.status === "stale" || built.status === "invalid", canOpenReconciliation: false, canOpenCompensation: false, payloadsExposed: false};
  const {transaction} = built.value;
  const checkpoint = reviewCase.globalResolution?.transaction;
  if (!checkpoint) return {recovery: "absent", state: transaction.blockers.length ? "blocked" : "planned", reasons: transaction.blockers.map((item) => item.code), transaction, steps: restoredSteps(transaction, reviewCase), globalCheckpointFingerprint: reviewCase.globalResolution?.checkpointFingerprint, canStart: transaction.blockers.length === 0, canExecuteNext: false, canExecuteSafeBatch: false, canPause: false, canResume: false, canRegenerate: false, canOpenReconciliation: false, canOpenCompensation: false, payloadsExposed: false};
  const recovered = recoverPersistedTransaction({reviewCase, transaction});
  if (recovered.status === "invalid" || recovered.status === "stale") return {recovery: recovered.status, state: recovered.status === "stale" ? "stale" : "blocked", reasons: recovered.reasons, transaction, steps: restoredSteps(transaction, reviewCase), globalCheckpointFingerprint: reviewCase.globalResolution?.checkpointFingerprint, transactionCheckpointFingerprint: checkpoint.checkpointFingerprint, canStart: false, canExecuteNext: false, canExecuteSafeBatch: false, canPause: false, canResume: false, canRegenerate: true, canOpenReconciliation: false, canOpenCompensation: false, payloadsExposed: false};
  if (recovered.status === "absent") throw new Error("transaction_recovery_inconsistent");
  if (!("transaction" in recovered) || !("checkpoint" in recovered)) throw new Error("transaction_recovery_unavailable");
  const operational = buildTransactionOperationalView({transaction: recovered.transaction, checkpoint: recovered.checkpoint, incidents, now: dependencies.now});
  const state = centerState(operational, recovered.checkpoint.operatorState);
  const safeReady = operational.nextReadySteps.filter((step) => recovered.transaction.steps.find((item) => item.stepId === step.stepId)?.authorization === "none").filter((step) => ["low", "medium"].includes(step.risk));
  return {recovery: recovered.status, state, reasons: [], transaction: recovered.transaction, operational, steps: restoredSteps(recovered.transaction, reviewCase), globalCheckpointFingerprint: reviewCase.globalResolution?.checkpointFingerprint, transactionCheckpointFingerprint: recovered.checkpoint.checkpointFingerprint, canStart: false, canExecuteNext: state === "ready", canExecuteSafeBatch: state === "ready" && safeReady.length > 1, canPause: ["ready", "planned"].includes(state), canResume: state === "paused", canRegenerate: false, canOpenReconciliation: operational.reconciliationRequired.length > 0, canOpenCompensation: operational.compensationRequired.length > 0, payloadsExposed: false};
}

export function initializeReviewCenterTransaction(reviewCase: ReviewCase, dependencies: TransactionCenterDependencies & {regenerate?: boolean} = {}): Readonly<{status: "initialized" | "already_initialized" | "blocked" | "conflict"; reasons: readonly string[]; transaction?: UniversalTransactionPlan; persistence?: TransactionCheckpointPersistence}> {
  const built = buildReviewCenterTransaction(reviewCase, dependencies);
  if (!built.ok) return {status: "blocked", reasons: built.reasons};
  if (reviewCase.globalResolution?.transaction && !dependencies.regenerate) return reviewCase.globalResolution.transaction.transactionFingerprint === built.value.transaction.transactionFingerprint ? {status: "already_initialized", reasons: [], transaction: built.value.transaction} : {status: "blocked", reasons: ["transaction_regeneration_required"], transaction: built.value.transaction};
  if (!reviewCase.globalResolution || built.value.transaction.blockers.length) return {status: "blocked", reasons: built.value.transaction.blockers.map((item) => item.code), transaction: built.value.transaction};
  try {
    const checkpoint = createTransactionCheckpointExtension({transaction: built.value.transaction, checkpoint: reviewCase.globalResolution, now: dependencies.now});
    const persistence = persistTransactionCheckpointExtension({reviewCase, transaction: built.value.transaction, checkpoint, expectedCheckpointFingerprint: reviewCase.globalResolution.checkpointFingerprint, expectedCaseVersion: reviewCase.version});
    return persistence.persisted ? {status: "initialized", reasons: [], transaction: built.value.transaction, persistence} : {status: persistence.conflict ? "conflict" : "blocked", reasons: persistence.reasons ?? ["transaction_checkpoint_not_persisted"], transaction: built.value.transaction, persistence};
  } catch (error) { return {status: "blocked", reasons: [error instanceof Error ? error.message : "transaction_initialization_failed"], transaction: built.value.transaction}; }
}

export async function setReviewCenterTransactionPaused(input: {reviewCase: ReviewCase; transaction: UniversalTransactionPlan; paused: boolean; checkpointApplication?: TransactionCheckpointApplication}): Promise<TransactionCheckpointPersistence> {
  const application = input.checkpointApplication ?? createReviewStoreTransactionCheckpointApplication();
  const snapshot = application.load(input.reviewCase.id, input.transaction);
  if (!snapshot) return {persisted: false, conflict: false, reasons: ["transaction_checkpoint_absent"]};
  const state = input.paused ? recordTransactionPaused({transaction: input.transaction, checkpoint: snapshot.checkpoint}) : recordTransactionResumed({transaction: input.transaction, checkpoint: snapshot.checkpoint});
  if (state.checkpoint.checkpointFingerprint === snapshot.checkpoint.checkpointFingerprint) return {persisted: true, conflict: false, checkpointFingerprint: snapshot.globalCheckpointFingerprint};
  return application.persist({caseId: input.reviewCase.id, transaction: state.transaction, checkpoint: state.checkpoint, expectedGlobalCheckpointFingerprint: snapshot.globalCheckpointFingerprint});
}

function genericReviewInput(reviewCase: ReviewCase, capability: string): UniversalReviewInput {
  const snapshot = {caseId: reviewCase.id, caseVersion: reviewCase.version};
  const producerId = String(reviewCase.context.producer ?? "review_center");
  const operationId = String(reviewCase.context.operation ?? "transaction");
  return {schemaVersion: 1, logicalKey: reviewCase.dedupeKey, producerId, operationId, operationType: "transaction", module: reviewCase.module, entity: {type: reviewCase.subject.type, id: reviewCase.subject.id, label: reviewCase.subject.label}, issueFamily: "validation_failure", issueCode: "transaction_step", priority: reviewCase.priority, title: reviewCase.title, source: reviewCase.source, snapshot, issues: [], evidence: [], constraints: [], resume: {schemaVersion: 1, producerId, operationId, operationType: "transaction", checkpoint: "review_case", snapshotVersion: 1, snapshotFingerprint: computeUniversalFingerprint(snapshot as unknown as ReviewJsonValue), requiredCapabilities: [capability], idempotencyKey: `transaction:${reviewCase.id}`}};
}

function referenceFor(input: {reviewCase: ReviewCase; transaction: UniversalTransactionPlan; step: TransactionStep; checkpoint: NonNullable<ReviewCase["globalResolution"]>["transaction"]}): ResolvedEditorialReference | undefined {
  const sourceStepId = input.step.dependencies.find((id) => input.checkpoint?.steps.find((candidate) => candidate.stepId === id)?.references.length);
  const source = sourceStepId ? input.checkpoint?.steps.find((candidate) => candidate.stepId === sourceStepId) : undefined;
  const reference = source?.references[0];
  const operation = input.reviewCase.globalResolution?.plan.operations.find((candidate) => candidate.id === sourceStepId);
  const identityKey = typeof operation?.target?.identityKey === "string" ? operation.target.identityKey : object(operation?.payload) && typeof operation.payload.identityKey === "string" ? operation.payload.identityKey : sourceStepId ?? "resolved";
  return reference?.id && !reference.id.startsWith("projected:") && sourceStepId ? {entityType: "luchador", documentId: reference.id, reference: {_type: "reference", _ref: reference.id}, sourceOperationId: sourceStepId, sourceResult: source?.result?.status === "reused_existing" ? "reused_existing" : "created", identityKey, validated: true} : undefined;
}

function replacementFor(reviewCase: ReviewCase, transaction: UniversalTransactionPlan, step: TransactionStep, checkpoint: NonNullable<ReviewCase["globalResolution"]>["transaction"]) {
  const reference = checkpoint ? referenceFor({reviewCase, transaction, step, checkpoint}) : undefined;
  const snapshot = getExternalNewsResumeSnapshot(reviewCase.context).snapshot;
  if (!reference || !snapshot) return undefined;
  const payload = structuredClone(snapshot.payload);
  const fighters = Array.isArray(payload.luchadoresRelacionados) ? payload.luchadoresRelacionados.filter((item): item is string => typeof item === "string") : [];
  const marker = `projected:luchador:${reference.sourceOperationId}`;
  payload.luchadoresRelacionados = fighters.includes(reference.documentId) ? fighters : [...new Set([...fighters, marker])];
  const replacement = replaceProjectedFighterReference({payload, reference, sourceOperationId: reference.sourceOperationId, caseId: reviewCase.id, caseVersion: reviewCase.version, planFingerprint: transaction.sourcePlanFingerprint, expectedPlanFingerprint: transaction.sourcePlanFingerprint, expectedInputFingerprint: computeUniversalFingerprint(payload as unknown as ReviewJsonValue)});
  return replacement.ok ? {reference, replacement} : undefined;
}

function logicalPlan(reviewCase: ReviewCase, step: TransactionStep, now?: () => string): UniversalExecutionPlan {
  return buildUniversalExecutionPlan({reviewCase, reviewInput: genericReviewInput(reviewCase, step.capability), effects: [{id: step.stepId, type: "block_operation", reason: "logical_transaction_step"}], preconditions: [{id: "transaction_ready", kind: "checkpoint_valid", description: "El checkpoint y las dependencias siguen vigentes.", required: true}], postconditions: [{id: "logical_completed", kind: "logical_completion", description: "La decisión lógica quedó confirmada.", required: true, effectIndexes: [0]}], requiredCapabilities: [step.capability], now});
}

export function createReviewCenterTransactionRuntime(input: {reviewCase: ReviewCase; build: TransactionCenterBuild; authorizations?: readonly TransactionExecutionAuthorization[]; checkpointApplication?: TransactionCheckpointApplication; now?: () => string}): TransactionOrchestrationRuntime {
  const application = input.checkpointApplication ?? createReviewStoreTransactionCheckpointApplication();
  const local = new Map(input.build.executors.map((executor) => [executor.manifest.executorId, executor]));
  const execution = createTransactionExecutionRuntime({
    checkpointApplication: application,
    executorRegistry: {get: (id) => local.get(id) ?? getRegisteredReviewExecutor(id)},
    now: input.now,
    prepareStep({reviewCase, transaction, step, checkpoint}) {
      if (step.executorId?.startsWith("transaction.logical.")) return {valid: true, reasonCodes: [], plan: logicalPlan(reviewCase, step, input.now), state: {outcome: step.operationKind === "reuse_entity" ? "reused_existing" : "validated"} as ReviewJsonValue, effectIndexes: [0]};
      const global = reviewCase.globalResolution;
      if (!global || reviewCase.context.producer !== "external_news") return {valid: false, reasonCodes: ["transaction_producer_prepare_adapter_missing"]};
      if (step.capability === "create:luchador") {
        const simulation = simulateGlobalResolutionPlan(input.build.sourcePlan, {...buildExternalNewsControlSimulationContext(reviewCase), reviewCase});
        const identityGuardAuthorization = global.identityGuard && "authorizationFingerprint" in global.identityGuard ? global.identityGuard : undefined;
        const extracted = extractFighterCreationUniversalPlan({plan: input.build.sourcePlan, simulation, reviewInput: buildExternalNewsUniversalReviewInput(reviewCase), identityGuardAuthorization, now: input.now});
        return extracted.ok && extracted.operationId === step.operationId ? {valid: true, reasonCodes: [], plan: extracted.universalPlan, state: {caseId: reviewCase.id, operationId: step.operationId}, effectIndexes: [0], requiresEffectReference: true} : {valid: false, reasonCodes: [extracted.ok ? "transaction_operation_changed" : extracted.reason]};
      }
      const replacement = replacementFor(reviewCase, transaction, step, checkpoint);
      if (step.capability === "replace_reference:noticia:luchador" && replacement) {
        const plan = buildUniversalExecutionPlan({reviewCase, reviewInput: buildExternalNewsUniversalReviewInput(reviewCase), effects: [{id: step.operationId, type: "replace_reference", path: "luchadoresRelacionados", referenceId: replacement.reference.documentId, executorSelector: {executorId: step.executorId}}], preconditions: [{id: "real_reference", kind: "reference_real", description: "La referencia real coincide con la identidad planificada.", required: true}], postconditions: [{id: "projected_reference_removed", kind: "reference_replaced", description: "La referencia proyectada desapareció.", required: true, effectIndexes: [0]}], requiredCapabilities: [step.capability], now: input.now});
        return {valid: true, reasonCodes: [], plan, state: {...replacement.replacement, reference: replacement.reference, sourceOperationId: replacement.reference.sourceOperationId, caseId: reviewCase.id, caseVersion: reviewCase.version, planFingerprint: transaction.sourcePlanFingerprint} as unknown as ReviewJsonValue, effectIndexes: [0]};
      }
      if (step.capability === "resume:external_news" && replacement) {
        const prepared = prepareExternalNewsResume({reviewCase, plan: input.build.sourcePlan, replacement: replacement.replacement, references: [replacement.reference], expectedCaseVersion: reviewCase.version, expectedPlanFingerprint: input.build.sourcePlan.fingerprint, expectedSnapshotFingerprint: global.snapshotFingerprint, expectedReplacementInputFingerprint: replacement.replacement.inputFingerprint, now: input.now});
        const runtimeAuthorization = input.authorizations?.find((item) => item.stepId === step.stepId);
        const authorization = runtimeAuthorization ? authorizeExternalNewsResume(prepared, runtimeAuthorization.authorizedAt) : undefined;
        return prepared.ready && authorization ? {valid: true, reasonCodes: [], plan: buildPreparedExternalNewsResumeUniversalPlan({prepared, reviewInput: buildExternalNewsUniversalReviewInput(reviewCase), now: input.now}), state: {prepared, authorization} as unknown as ReviewJsonValue, effectIndexes: [0], requiresEffectReference: true} : {valid: false, reasonCodes: prepared.blockers.length ? prepared.blockers.map((item) => item.code) : ["resume_domain_authorization_missing"]};
      }
      return {valid: false, reasonCodes: ["transaction_step_prepare_adapter_missing"]};
    },
  });
  return Object.freeze({execution, now: input.now});
}

export function authorizeReviewCenterTransactionStep(input: {reviewCase: ReviewCase; transaction: UniversalTransactionPlan; stepId: string; globalCheckpointFingerprint: string; now?: () => string; validityMs?: number}): TransactionExecutionAuthorization | undefined {
  const step = input.transaction.steps.find((candidate) => candidate.stepId === input.stepId);
  if (!step) return undefined;
  const authorizedAt = (input.now ?? nowDefault)();
  return createTransactionExecutionAuthorization({transactionFingerprint: input.transaction.transactionFingerprint, stepId: step.stepId, operationFingerprint: step.fingerprints.operationFingerprint, caseVersion: input.reviewCase.version, checkpointFingerprint: input.globalCheckpointFingerprint, authorizedAt, expiresAt: new Date(Date.parse(authorizedAt) + (input.validityMs ?? 5 * 60_000)).toISOString(), approvedByHuman: true});
}

export async function runReviewCenterTransaction(input: {reviewCase: ReviewCase; mode: TransactionOrchestrationMode; stepId?: string; stepIds?: readonly string[]; maxSteps?: number; authorizations?: readonly TransactionExecutionAuthorization[]; dependencies?: TransactionCenterDependencies; signal?: AbortSignal}): Promise<TransactionOrchestrationResult | Readonly<{status: "blocked"; reasons: readonly string[]}>> {
  const current = getReviewCase(input.reviewCase.id) ?? input.reviewCase;
  const build = buildReviewCenterTransaction(current, input.dependencies);
  if (!build.ok || !current.globalResolution?.transaction) return {status: "blocked", reasons: build.ok ? ["transaction_checkpoint_absent"] : build.reasons};
  const runtime = createReviewCenterTransactionRuntime({reviewCase: current, build: build.value, authorizations: input.authorizations, checkpointApplication: input.dependencies?.checkpointApplication, now: input.dependencies?.now});
  return orchestrateTransaction({caseId: current.id, transaction: build.value.transaction, expectedFingerprint: build.value.transaction.transactionFingerprint, expectedCheckpointFingerprint: current.globalResolution.checkpointFingerprint, mode: input.mode, stepId: input.stepId, stepIds: input.stepIds, maxSteps: input.maxSteps, runtime, runtimeAuthorizations: input.authorizations, signal: input.signal});
}

export const transactionOperationalCenterSecurity = Object.freeze({autoExecuteOnOpen: false, rawPayloads: false, secrets: false, persistedAuthorization: false, automaticReconciliation: false, automaticCompensation: false, automaticRegeneration: false});
