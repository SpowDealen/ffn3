import {getExternalNewsResumeSnapshot} from "../resume/externalNews";
import type {ReviewCase, ReviewJsonObject, ReviewJsonValue} from "../types";
import {
  buildResumeContract,
  computeSnapshotFingerprint,
  computeUniversalFingerprint,
  getRegisteredReviewExecutor,
  registerReviewExecutor,
  registerReviewProducer,
  type ExecutionResult,
  type PostExecutionValidation,
  type ReviewExecutorRegistration,
  type ReviewProducerRegistration,
  type SimulationResult,
  type UniversalExecutionPlan,
  type UniversalReviewInput,
} from "../universal";
import {createExternalNewsResumeUniversalExecutor, type ExternalNewsResumeExecutorDependencies} from "./externalNewsResumeExecutor";
import {createFighterCreationUniversalExecutor, type FighterCreationExecutorDependencies} from "./fighterCreationExecutor";
import {replaceProjectedFighterReference, type ReplaceProjectedReferenceResult, type ResolvedEditorialReference} from "./fighterReferenceResolution";
import {
  GlobalResolutionInspectionService,
  GlobalResolutionInspectorRegistry,
  createSanityExternalNewsEffectInspector,
  inspectionEvidenceToReconciliationEvidence,
  type GlobalResolutionInspectionCaseReader,
  type GlobalResolutionInspectionEvidence,
  type SanityExternalNewsReadExecutor,
} from "./inspection";
import {createExternalNewsReconciliationContractRegistry, UniversalReconciliationInspectionEngine} from "./reconciliation";
import {createGlobalResolutionProducerRuntime, EXTERNAL_NEWS_PRODUCER_ID, externalNewsProducerManifest, FIGHTER_SOURCE_PRODUCER_IDS, type FighterSourceProducerId, type GlobalResolutionProducerRegistry} from "./producers";

export type ExternalNewsRuntimeManifest = {
  identity: string;
  capability: "create:luchador" | "replace_reference:noticia:luchador" | "validate:noticia" | "resume:external_news";
  support: "simulatable" | "executable";
  operationKind: "create_entity" | "replace_reference" | "validate_entity";
  compatibleProducers: ["external_news"];
  executorId?: string;
  executorVersion?: number;
  contractVersion: 1;
  requirements: string[];
  postconditions: string[];
};

const externalNewsLegacyCapabilityOrder = ["create:luchador", "replace_reference:noticia:luchador", "validate:noticia", "resume:external_news"] as const;
export const externalNewsRuntimeManifests: readonly ExternalNewsRuntimeManifest[] = Object.freeze(externalNewsLegacyCapabilityOrder.map((capabilityId): ExternalNewsRuntimeManifest => {
  const capability = externalNewsProducerManifest.capabilities.find((candidate) => candidate.capabilityId === capabilityId)!;
  const executor = externalNewsProducerManifest.adapters.find((adapter) => adapter.adapterKind === "executor" && adapter.capabilityIds?.includes(capabilityId));
  const universal = externalNewsProducerManifest.capabilities.find((candidate) => candidate.capabilityId === capabilityId)!;
  return {
    identity: `${externalNewsProducerManifest.producerId}:${capabilityId}:v${capability.capabilityVersion.split(".")[0]}`,
    capability: capabilityId,
    support: capability.modes.includes("execute") ? "executable" : "simulatable",
    operationKind: capability.operationKinds[0] as ExternalNewsRuntimeManifest["operationKind"],
    compatibleProducers: [EXTERNAL_NEWS_PRODUCER_ID],
    executorId: executor?.adapterId,
    executorVersion: executor ? 1 : undefined,
    contractVersion: 1,
    requirements: [...universal.requiredContext],
    postconditions: [...(externalNewsUniversalEvidence(capabilityId))],
  };
}));

function externalNewsUniversalEvidence(capabilityId: string): string[] {
  if (capabilityId === "create:luchador") return ["real_document_id", "identity_validated"];
  if (capabilityId === "replace_reference:noticia:luchador") return ["projected_reference_removed", "payload_fingerprint_recomputed"];
  if (capabilityId === "resume:external_news") return ["draft_saved", "resume_postvalidated"];
  return ["external_news_payload_valid"];
}

const object = (value: unknown): value is ReviewJsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nowDefault = () => new Date().toISOString();

export function buildExternalNewsUniversalReviewInput(reviewCase: ReviewCase): UniversalReviewInput {
  const snapshotResult = getExternalNewsResumeSnapshot(reviewCase.context);
  if (!snapshotResult.complete || !snapshotResult.snapshot) throw new Error(`external_news_snapshot_invalid:${snapshotResult.missingFields.join(",")}`);
  const operationId = snapshotResult.snapshot.operation;
  const snapshot = snapshotResult.snapshot as unknown as ReviewJsonObject;
  return {
    schemaVersion: 1,
    logicalKey: reviewCase.dedupeKey,
    producerId: "external_news",
    operationId,
    operationType: operationId === "create_draft" ? "create" : operationId,
    module: reviewCase.module,
    entity: {type: "noticia", id: reviewCase.subject.id, label: reviewCase.subject.label},
    issueFamily: "missing_reference",
    issueCode: reviewCase.issues[0]?.kind ?? "external_news_review",
    priority: reviewCase.priority,
    title: reviewCase.title,
    source: reviewCase.source,
    snapshot,
    issues: structuredClone(reviewCase.issues),
    evidence: [],
    constraints: [],
    resume: buildResumeContract({producerId: "external_news", operationId, operationType: operationId === "create_draft" ? "create" : operationId, checkpoint: "review_case", snapshotVersion: 1, snapshot, requiredCapabilities: [], idempotencyKey: `external-news:${reviewCase.id}:${reviewCase.version}`}),
    legacy: {reviewCaseId: reviewCase.id, reviewCaseVersion: reviewCase.version},
  };
}

export function createExternalNewsUniversalProducer(): ReviewProducerRegistration {
  return {
    producerId: "external_news",
    version: 1,
    supportedEntityTypes: ["noticia"],
    supportedOperations: ["analyze", "prepare", "resolve", "create_draft"],
    buildReviewInput(context) {
      if (!object(context) || !object(context.reviewCase)) throw new Error("external_news_review_case_context_required");
      return buildExternalNewsUniversalReviewInput(context.reviewCase as unknown as ReviewCase);
    },
    async rebuildCurrentState(reviewCase, _resume, _signal) {
      const snapshotResult = getExternalNewsResumeSnapshot(reviewCase.context);
      if (!snapshotResult.complete || !snapshotResult.snapshot) throw new Error(`external_news_snapshot_invalid:${snapshotResult.missingFields.join(",")}`);
      const state = snapshotResult.snapshot as unknown as ReviewJsonValue;
      return {state, fingerprint: computeSnapshotFingerprint(state), rebuiltAt: nowDefault()};
    },
    validateSnapshot(snapshot) {
      if (!object(snapshot) || snapshot.producer !== "external_news" || !object(snapshot.payload) || !object(snapshot.source)) return {valid: false, errors: [{code: "external_news_snapshot_invalid", message: "El snapshot external_news está incompleto."}], warnings: []};
      return {valid: true, errors: [], warnings: []};
    },
  };
}

export function createFighterSourceUniversalProducer(producerId: FighterSourceProducerId): ReviewProducerRegistration {
  const snapshot = (reviewCase: ReviewCase): ReviewJsonObject => {
    const value = reviewCase.context.payloadSnapshot;
    if (!object(value)) throw new Error("fighter_resolution_snapshot_invalid");
    return structuredClone(value);
  };
  return {
    producerId,
    version: 1,
    supportedEntityTypes: ["luchador"],
    supportedOperations: ["request_fighter_resolution"],
    buildReviewInput(context) {
      if (!object(context) || !object(context.reviewCase)) throw new Error("fighter_resolution_review_case_context_required");
      const reviewCase = context.reviewCase as unknown as ReviewCase;
      const state = snapshot(reviewCase);
      return {
        schemaVersion: 1,
        logicalKey: reviewCase.dedupeKey,
        producerId,
        operationId: "request_fighter_resolution",
        operationType: "create",
        module: reviewCase.module,
        entity: {type: "luchador", id: reviewCase.subject.id, label: reviewCase.subject.label},
        issueFamily: "missing_required_data",
        issueCode: reviewCase.issues[0]?.kind ?? "fighter_resolution",
        priority: reviewCase.priority,
        title: reviewCase.title,
        source: reviewCase.source,
        snapshot: state,
        issues: structuredClone(reviewCase.issues),
        evidence: [],
        constraints: [{id: "identity_guard_required", kind: "authorization", description: "La creación requiere una autorización create_new vigente del guard de identidad.", required: true}],
        resume: buildResumeContract({producerId, operationId: "request_fighter_resolution", operationType: "create", checkpoint: "review_case", snapshotVersion: 1, snapshot: state, requiredCapabilities: ["resolve_identity:fighter", "create:luchador"], idempotencyKey: reviewCase.dedupeKey}),
        legacy: {reviewCaseId: reviewCase.id, reviewCaseVersion: reviewCase.version},
      };
    },
    async rebuildCurrentState(reviewCase) {
      const state = snapshot(reviewCase);
      return {state, fingerprint: computeSnapshotFingerprint(state), rebuiltAt: nowDefault()};
    },
    validateSnapshot(value) {
      return object(value) && typeof value.requestId === "string" && object(value.identity) && object(value.creation)
        ? {valid: true, errors: [], warnings: []}
        : {valid: false, errors: [{code: "fighter_resolution_snapshot_invalid", message: "El snapshot fighter está incompleto."}], warnings: []};
    },
  };
}

type ReferenceExecutorState = {
  payload: ReviewJsonObject;
  reference: ResolvedEditorialReference;
  sourceOperationId: string;
  caseId: string;
  caseVersion: number;
  planFingerprint: string;
  expectedInputFingerprint: string;
};

function referenceState(value: ReviewJsonValue): ReferenceExecutorState | undefined {
  if (!object(value) || !object(value.payload) || !object(value.reference)) return undefined;
  const reference = value.reference;
  if (typeof value.sourceOperationId !== "string" || typeof value.caseId !== "string" || !Number.isInteger(value.caseVersion) || typeof value.planFingerprint !== "string" || typeof value.expectedInputFingerprint !== "string") return undefined;
  if (reference.entityType !== "luchador" || typeof reference.documentId !== "string" || reference.documentId.startsWith("projected:") || typeof reference.identityKey !== "string" || reference.validated !== true || !object(reference.reference)) return undefined;
  return value as unknown as ReferenceExecutorState;
}

export function createExternalNewsReferenceUniversalExecutor(now: () => string = nowDefault): ReviewExecutorRegistration {
  const executorId = "global-resolution.replace-external-news-fighter-reference.v1";
  const manifestFingerprint = () => getRegisteredReviewExecutor(executorId)?.manifestFingerprint ?? "sha256-v1:unregistered";
  const result = (_plan: UniversalExecutionPlan, indexes: number[], key: string, status: ExecutionResult["status"], replacement?: ReplaceProjectedReferenceResult, error?: ExecutionResult["error"]): ExecutionResult => ({
    executorId,
    executorVersion: 1,
    executorManifestFingerprint: manifestFingerprint(),
    capability: "replace_reference:noticia:luchador",
    status,
    effectIndexes: indexes,
    idempotencyKey: key,
    references: replacement?.ok ? [{type: "luchador", id: replacement.reference.documentId}] : [],
    output: replacement as unknown as ReviewJsonValue,
    error,
  });
  return {
    executorId,
    version: 1,
    capability: "replace_reference:noticia:luchador",
    scope: "external_news",
    supportedEffects: ["replace_reference"],
    supportedEntityTypes: ["noticia"],
    risk: "none",
    canExecute(plan, indexes) { return indexes.length === 1 && plan.effects[indexes[0]]?.type === "replace_reference"; },
    async simulate(_plan, state, indexes): Promise<SimulationResult> {
      const input = referenceState(state);
      const replacement = input ? replaceProjectedFighterReference({...input, expectedPlanFingerprint: input.planFingerprint}) : undefined;
      const safe = Boolean(replacement?.ok);
      return {executorId, executorVersion: 1, executorManifestFingerprint: manifestFingerprint(), capability: "replace_reference:noticia:luchador", status: safe ? "safe" : "blocked", effectIndexes: indexes, changes: safe ? [{payloadFingerprint: (replacement as Extract<ReplaceProjectedReferenceResult, {ok: true}>).fingerprint}] : [], warnings: [], blockingReasons: safe ? [] : [replacement && !replacement.ok ? replacement.blocker.code : "reference_state_invalid"], errors: []};
    },
    async execute(plan, state, indexes, options) {
      const input = referenceState(state);
      if (!input) return result(plan, indexes, options.idempotencyKey, "blocked", undefined, {code: "reference_state_invalid", message: "El estado de referencia no es válido.", retryable: false});
      const replacement = replaceProjectedFighterReference({...input, expectedPlanFingerprint: input.planFingerprint});
      return replacement.ok ? result(plan, indexes, options.idempotencyKey, "succeeded", replacement) : result(plan, indexes, options.idempotencyKey, "blocked", replacement, {code: replacement.blocker.code, message: replacement.blocker.message, retryable: false});
    },
    async validateExecution(plan, execution): Promise<PostExecutionValidation> {
      const replacement = object(execution.output) ? execution.output as unknown as ReplaceProjectedReferenceResult : undefined;
      const valid = execution.status === "succeeded" && Boolean(replacement?.ok);
      return {valid, planFingerprint: plan.planFingerprint, executorId, executionIdempotencyKey: execution.idempotencyKey, checkedPostconditionIds: valid ? plan.postconditions.map((item) => item.id) : [], checkedEffectIndexes: valid ? execution.effectIndexes : [], errors: valid ? [] : [{code: "reference_postvalidation_failed", message: "La referencia no superó la validación posterior."}], warnings: [], evidence: valid && replacement?.ok ? {payloadFingerprint: replacement.fingerprint} : undefined, validatedAt: now()};
    },
  };
}

export function registerExternalNewsGlobalResolutionRuntime(dependencies: {
  fighter: FighterCreationExecutorDependencies;
  resume: ExternalNewsResumeExecutorDependencies;
  now?: () => string;
}): () => void {
  const unregister = [
    registerReviewProducer(createExternalNewsUniversalProducer(), {replace: true}),
    ...FIGHTER_SOURCE_PRODUCER_IDS.map((producerId) => registerReviewProducer(createFighterSourceUniversalProducer(producerId), {replace: true})),
    registerReviewExecutor(createFighterCreationUniversalExecutor(dependencies.fighter), {replace: true}),
    registerReviewExecutor(createExternalNewsReferenceUniversalExecutor(dependencies.now), {replace: true}),
    registerReviewExecutor(createExternalNewsResumeUniversalExecutor(dependencies.resume), {replace: true}),
  ];
  return () => unregister.reverse().forEach((remove) => remove());
}

export type ExternalNewsInspectionRuntime = {
  registry: GlobalResolutionInspectorRegistry;
  service: GlobalResolutionInspectionService;
  inspector: ReturnType<typeof createSanityExternalNewsEffectInspector>;
  adaptEvidence: typeof inspectionEvidenceToReconciliationEvidence;
  reconciliationEngine: UniversalReconciliationInspectionEngine;
  producerRegistry: GlobalResolutionProducerRegistry;
  dispose: () => void;
};

export function createExternalNewsInspectionRuntime(dependencies: {
  reader: SanityExternalNewsReadExecutor;
  readCase: GlobalResolutionInspectionCaseReader;
  now?: () => string;
}): ExternalNewsInspectionRuntime {
  const registry = new GlobalResolutionInspectorRegistry();
  const inspector = createSanityExternalNewsEffectInspector({reader: dependencies.reader});
  const unregister = registry.register(inspector);
  const service = new GlobalResolutionInspectionService(registry, dependencies.readCase, dependencies.now);
  const producerRuntime = createGlobalResolutionProducerRuntime();
  const binding = producerRuntime.producers.resolveInspectorBinding(EXTERNAL_NEWS_PRODUCER_ID, "create:luchador", registry);
  if (binding.status !== "resolved") throw new Error(`external_news_inspector_binding_${binding.status}`);
  const reconciliationAdapter = producerRuntime.producers.resolveAdapter(EXTERNAL_NEWS_PRODUCER_ID, "reconciliation_contract", "create:luchador");
  if (reconciliationAdapter.status !== "resolved") throw new Error(`external_news_reconciliation_adapter_${reconciliationAdapter.status}`);
  return Object.freeze({
    registry,
    service,
    reconciliationEngine: new UniversalReconciliationInspectionEngine(service, dependencies.readCase, createExternalNewsReconciliationContractRegistry()),
    producerRegistry: producerRuntime.producers,
    inspector,
    adaptEvidence: (evidence: GlobalResolutionInspectionEvidence) => inspectionEvidenceToReconciliationEvidence(evidence),
    dispose: unregister,
  });
}

export function fingerprintExternalNewsRuntimeManifests(): string {
  return computeUniversalFingerprint(externalNewsRuntimeManifests as unknown as ReviewJsonValue);
}
