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

export const externalNewsRuntimeManifests: readonly ExternalNewsRuntimeManifest[] = Object.freeze([
  {identity: "external_news:create:luchador:v1", capability: "create:luchador", support: "executable", operationKind: "create_entity", compatibleProducers: ["external_news"], executorId: "global-resolution.create-luchador.v1", executorVersion: 1, contractVersion: 1, requirements: ["prepared_fighter_valid", "simulation_safe", "explicit_operation_id"], postconditions: ["real_document_id", "identity_validated"]},
  {identity: "external_news:replace_reference:noticia:luchador:v1", capability: "replace_reference:noticia:luchador", support: "executable", operationKind: "replace_reference", compatibleProducers: ["external_news"], executorId: "global-resolution.replace-external-news-fighter-reference.v1", executorVersion: 1, contractVersion: 1, requirements: ["real_fighter_reference", "identity_match", "payload_fingerprint"], postconditions: ["projected_reference_removed", "payload_fingerprint_recomputed"]},
  {identity: "external_news:validate:noticia:v1", capability: "validate:noticia", support: "simulatable", operationKind: "validate_entity", compatibleProducers: ["external_news"], contractVersion: 1, requirements: ["reconstructed_payload", "real_references"], postconditions: ["external_news_payload_valid"]},
  {identity: "external_news:resume:external_news:v1", capability: "resume:external_news", support: "executable", operationKind: "validate_entity", compatibleProducers: ["external_news"], executorId: "global-resolution.resume-external-news.v1", executorVersion: 1, contractVersion: 1, requirements: ["prepared_resume_ready", "explicit_ephemeral_authorization"], postconditions: ["draft_saved", "resume_postvalidated"]},
]);

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
    registerReviewExecutor(createFighterCreationUniversalExecutor(dependencies.fighter), {replace: true}),
    registerReviewExecutor(createExternalNewsReferenceUniversalExecutor(dependencies.now), {replace: true}),
    registerReviewExecutor(createExternalNewsResumeUniversalExecutor(dependencies.resume), {replace: true}),
  ];
  return () => unregister.reverse().forEach((remove) => remove());
}

export function fingerprintExternalNewsRuntimeManifests(): string {
  return computeUniversalFingerprint(externalNewsRuntimeManifests as unknown as ReviewJsonValue);
}
