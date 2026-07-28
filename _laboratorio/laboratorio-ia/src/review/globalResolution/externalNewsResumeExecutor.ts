import {executeExternalNewsResume, type ExternalNewsResumeExecutor, type ExternalNewsResumePreview} from "../resume/externalNews";
import {getReviewCase} from "../store/reviewStore";
import type {ResolutionGraph} from "../resolutionGraph";
import {isSerializableReviewValue} from "../cases/validateResolution";
import type {ReviewJsonObject, ReviewJsonValue} from "../types";
import {buildUniversalExecutionPlan, getRegisteredReviewExecutor, type ExecutionResult, type PostExecutionValidation, type ReviewExecutorRegistration, type SimulationResult, type UniversalExecutionPlan, type UniversalReviewInput} from "../universal";
import {fingerprintPreparedExternalNewsResume, type PreparedExternalNewsResume} from "./fighterReferenceResolution";

export type ExternalNewsResumeAuthorization = {caseId: string; caseVersion: number; planId: string; planFingerprint: string; previewFingerprint: string; confirmed: true; confirmedAt: string};
export type ExternalNewsResumeOutcome = "resumed" | "already_resumed" | "blocked" | "failed" | "reconciliation_required";
export type ExternalNewsResumeAdapterResult = {caseId: string; caseVersion: number; planId: string; operationId: string; idempotencyKey: string; producer: "external_news"; outcome: ExternalNewsResumeOutcome; previewFingerprint: string; planFingerprint: string; draftId?: string; documentId?: string; references: PreparedExternalNewsResume["appliedReferences"]; projectedGraph: ResolutionGraph; warnings: string[]; error?: {code: string; message: string; retryable: boolean}; reconciliation?: ReviewJsonObject; completedAt: string};
export type ExternalNewsResumeExecutorDependencies = {executor: ExternalNewsResumeExecutor; now?: () => string};

const object = (value: unknown): value is ReviewJsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const projected = (value: unknown): boolean => typeof value === "string" ? value.startsWith("projected:") : Array.isArray(value) ? value.some(projected) : object(value) ? Object.values(value).some(projected) : false;
const nowDefault = () => new Date().toISOString();
const uncertain = (message: string) => /(?:timeout|timed out|connection|network|corrupt|missing.*id)/i.test(message);

export function authorizeExternalNewsResume(prepared: PreparedExternalNewsResume, confirmedAt: string): ExternalNewsResumeAuthorization | undefined {
  if (preparedContractError(prepared) || !text(confirmedAt)) return undefined;
  return {caseId: prepared.caseId, caseVersion: prepared.caseVersion, planId: prepared.planId, planFingerprint: prepared.planFingerprint, previewFingerprint: prepared.previewFingerprint, confirmed: true, confirmedAt};
}

function projectGraph(prepared: PreparedExternalNewsResume, state: "succeeded" | "failed" | "reconciliation_required"): ResolutionGraph {
  const nodes = prepared.projectedGraph.nodes.map((node) => node.isResumeNode ? {...node, state, ...(state === "succeeded" ? {result: {output: {outcome: "resumed"}}} : {error: {code: `resume_${state}`, message: `Resume ${state}`, retryable: state !== "reconciliation_required"}})} : {...node});
  return {...prepared.projectedGraph, nodes, state};
}

function previewFor(prepared: PreparedExternalNewsResume): ExternalNewsResumePreview {
  const application = {caseId: prepared.caseId, originalPayload: prepared.payload, resultingPayload: prepared.payload, applied: [], metadata: [], skipped: [], failed: [], warnings: [], preparedEntities: [], generatedAt: prepared.generatedAt};
  return {caseId: prepared.caseId, status: "ready", originalPayload: prepared.payload, resultingPayload: prepared.payload, application, validation: prepared.validation, changes: [], unresolvedIssueIds: [], preparedEntities: [], canResume: true, reasons: [], generatedAt: prepared.generatedAt};
}

function preparedContractError(prepared: PreparedExternalNewsResume): string | undefined {
  if (!prepared.ready || prepared.blockers.length || !prepared.validation.valid) return "prepared_resume_not_ready";
  if (prepared.producer !== "external_news" || !text(prepared.operation) || projected(prepared.payload)) return "prepared_resume_contract_invalid";
  if (prepared.projectedGraph.caseId !== prepared.caseId || prepared.projectedGraph.caseVersion !== prepared.caseVersion || prepared.projectedGraph.producerId !== prepared.producer || prepared.projectedGraph.originalOperation !== prepared.operation || prepared.projectedGraph.state !== "ready") return "prepared_resume_graph_invalid";
  const resumeNodes = prepared.projectedGraph.nodes.filter((node) => node.isResumeNode);
  if (resumeNodes.length !== 1 || resumeNodes[0].state !== "ready") return "prepared_resume_graph_invalid";
  const fighterIds = Array.isArray(prepared.payload.luchadoresRelacionados) ? prepared.payload.luchadoresRelacionados : [];
  if (!prepared.appliedReferences.length || prepared.appliedReferences.some((reference) => reference.entityType !== "luchador" || !reference.validated || !text(reference.documentId) || reference.documentId.startsWith("projected:") || reference.reference._type !== "reference" || reference.reference._ref !== reference.documentId || !fighterIds.includes(reference.documentId) || prepared.projectedGraph.nodes.find((node) => node.id === reference.sourceOperationId)?.state !== "succeeded")) return "prepared_resume_reference_invalid";
  const expectedFingerprint = fingerprintPreparedExternalNewsResume(prepared);
  if (prepared.previewFingerprint !== expectedFingerprint) return "prepared_resume_fingerprint_mismatch";
  return undefined;
}

function authorizationError(prepared: PreparedExternalNewsResume, authorization: ExternalNewsResumeAuthorization): string | undefined {
  if (!authorization.confirmed || !text(authorization.confirmedAt) || authorization.caseId !== prepared.caseId || authorization.caseVersion !== prepared.caseVersion || authorization.planId !== prepared.planId || authorization.planFingerprint !== prepared.planFingerprint || authorization.previewFingerprint !== prepared.previewFingerprint) return "resume_authorization_stale";
  return undefined;
}

function universalPlanError(plan: UniversalExecutionPlan, prepared: PreparedExternalNewsResume, indexes: number[]): string | undefined {
  if (plan.caseId !== prepared.caseId || plan.caseVersion !== prepared.caseVersion || !plan.requiredCapabilities.includes("resume:external_news") || indexes.length !== 1) return "resume_universal_plan_mismatch";
  const effect = plan.effects[indexes[0]];
  if (!effect || effect.type !== "set_field" || effect.path !== "resumeExternalNews" || !object(effect.value) || effect.value.planId !== prepared.planId || effect.value.previewFingerprint !== prepared.previewFingerprint) return "resume_universal_plan_mismatch";
  return undefined;
}

function precondition(prepared: PreparedExternalNewsResume, authorization: ExternalNewsResumeAuthorization): string | undefined {
  const contractError = preparedContractError(prepared) ?? authorizationError(prepared, authorization);
  if (contractError) return contractError;
  const current = getReviewCase(prepared.caseId);
  if (!current) return "resume_case_stale";
  if (["resumed", "resuming"].includes(current.status) || current.resumeExecution?.status === "succeeded") return current.status === "resumed" || current.resumeExecution?.status === "succeeded" ? "already_resumed" : "already_resuming";
  if (current.version !== prepared.caseVersion) return "resume_case_stale";
  return undefined;
}

export async function executePreparedExternalNewsResume(input: {prepared: PreparedExternalNewsResume; authorization: ExternalNewsResumeAuthorization; dependencies: ExternalNewsResumeExecutorDependencies}): Promise<ExternalNewsResumeAdapterResult> {
  const completedAt = (input.dependencies.now ?? nowDefault)(); const idempotencyKey = `au2-resume:${input.prepared.caseId}:${input.prepared.caseVersion}:${input.prepared.planFingerprint}:${input.prepared.previewFingerprint}`;
  const blocked = precondition(input.prepared, input.authorization); const base = {caseId: input.prepared.caseId, caseVersion: input.prepared.caseVersion, planId: input.prepared.planId, operationId: input.prepared.operation, idempotencyKey, producer: "external_news" as const, previewFingerprint: input.prepared.previewFingerprint, planFingerprint: input.prepared.planFingerprint, references: input.prepared.appliedReferences, completedAt};
  if (blocked === "already_resumed") { const current = getReviewCase(input.prepared.caseId); return {...base, outcome: "already_resumed", draftId: current?.resumeExecution?.draftId, documentId: current?.resumeExecution?.documentId, projectedGraph: projectGraph(input.prepared, "succeeded"), warnings: []}; }
  if (blocked) return {...base, outcome: "blocked", projectedGraph: projectGraph(input.prepared, "failed"), warnings: [blocked], error: {code: blocked, message: blocked, retryable: false}};
  let builtOutput: ReviewJsonObject | undefined;
  const executor: ExternalNewsResumeExecutor = {...input.dependencies.executor, async buildOutput(form) { const output = await input.dependencies.executor.buildOutput(form); if (!object(output) || output._type !== "noticia" || projected(output)) throw new Error("external_news_output_invalid"); builtOutput = output; return output; }};
  const result = await executeExternalNewsResume({caseId: input.prepared.caseId, executor, options: {expectedCaseVersion: input.prepared.caseVersion, expectedPreviewFingerprint: input.prepared.previewFingerprint, preparedPreview: previewFor(input.prepared), preparedPreviewFingerprint: input.prepared.previewFingerprint, now: input.dependencies.now}});
  if (result.status === "succeeded" || result.status === "already_resumed") {
    const valid = Boolean((result.draftId || result.documentId) && builtOutput && !projected(builtOutput));
    if (!valid) return {...base, outcome: "reconciliation_required", draftId: result.draftId, documentId: result.documentId, projectedGraph: projectGraph(input.prepared, "reconciliation_required"), warnings: ["post_resume_validation_failed"], reconciliation: {title: input.prepared.payload.titulo ?? "", sourceUrl: input.prepared.payload.fuenteUrl ?? "", idempotencyKey, payloadFingerprint: input.prepared.previewFingerprint}};
    return {...base, outcome: result.status === "already_resumed" ? "already_resumed" : "resumed", draftId: result.draftId, documentId: result.documentId, projectedGraph: projectGraph(input.prepared, "succeeded"), warnings: []};
  }
  const message = result.message || result.status; const requiresReconciliation = result.status === "draft_saved_state_failed" || uncertain(message);
  return {...base, outcome: requiresReconciliation ? "reconciliation_required" : "failed", draftId: result.draftId, documentId: result.documentId, projectedGraph: projectGraph(input.prepared, requiresReconciliation ? "reconciliation_required" : "failed"), warnings: [], error: {code: result.status, message, retryable: requiresReconciliation}, ...(requiresReconciliation ? {reconciliation: {title: input.prepared.payload.titulo ?? "", sourceUrl: input.prepared.payload.fuenteUrl ?? "", idempotencyKey, payloadFingerprint: input.prepared.previewFingerprint, possibleDraftId: result.draftId ?? result.documentId ?? null}} : {})};
}

type ResumeState = {prepared: PreparedExternalNewsResume; authorization: ExternalNewsResumeAuthorization};
function stateOf(value: ReviewJsonValue): ResumeState | undefined {
  if (!object(value) || !object(value.prepared) || !object(value.authorization) || !isSerializableReviewValue(value)) return undefined;
  const prepared = value.prepared;
  const authorization = value.authorization;
  if (!text(prepared.caseId) || !Number.isInteger(prepared.caseVersion) || !text(prepared.planId) || !text(prepared.planFingerprint) || !text(prepared.snapshotFingerprint) || !text(prepared.previewFingerprint) || prepared.producer !== "external_news" || !text(prepared.operation) || !object(prepared.payload) || !Array.isArray(prepared.appliedReferences) || !object(prepared.validation) || typeof prepared.validation.valid !== "boolean" || !object(prepared.projectedGraph) || !Array.isArray(prepared.projectedGraph.nodes) || typeof prepared.ready !== "boolean" || !Array.isArray(prepared.blockers) || !text(prepared.generatedAt)) return undefined;
  if (!text(authorization.caseId) || !Number.isInteger(authorization.caseVersion) || !text(authorization.planId) || !text(authorization.planFingerprint) || !text(authorization.previewFingerprint) || authorization.confirmed !== true || !text(authorization.confirmedAt)) return undefined;
  return {prepared: prepared as unknown as PreparedExternalNewsResume, authorization: authorization as unknown as ExternalNewsResumeAuthorization};
}

export function buildPreparedExternalNewsResumeUniversalPlan(input: {prepared: PreparedExternalNewsResume; reviewInput: UniversalReviewInput; now?: () => string}): UniversalExecutionPlan {
  return buildUniversalExecutionPlan({reviewCase: {id: input.prepared.caseId, version: input.prepared.caseVersion, subject: {type: "noticia"}, context: {}}, reviewInput: input.reviewInput, effects: [{id: `resume:${input.prepared.planId}`, type: "set_field", path: "resumeExternalNews", value: {kind: "prepared_external_news_resume", planId: input.prepared.planId, previewFingerprint: input.prepared.previewFingerprint}}], preconditions: [{id: "prepared_resume", kind: "custom", description: "PreparedExternalNewsResume vigente y autorizado.", required: true}], postconditions: [{id: "resume_saved", kind: "resume_completed", description: "El borrador fue guardado y validado.", required: true, effectIndexes: [0]}], requiredCapabilities: ["resume:external_news"], now: input.now});
}

export function createExternalNewsResumeUniversalExecutor(dependencies: ExternalNewsResumeExecutorDependencies): ReviewExecutorRegistration {
  const executorId = "global-resolution.resume-external-news.v1"; const manifest = () => getRegisteredReviewExecutor(executorId)?.manifestFingerprint ?? "sha256-v1:unregistered";
  const output = (_plan: UniversalExecutionPlan, indexes: number[], key: string, status: ExecutionResult["status"], value: ExternalNewsResumeAdapterResult): ExecutionResult => { const referenceId = value.draftId ?? value.documentId; return {executorId, executorVersion: 1, executorManifestFingerprint: manifest(), capability: "resume:external_news", status, effectIndexes: indexes, idempotencyKey: key, references: referenceId ? [{type: "noticia", id: referenceId}] : [], output: value as unknown as ReviewJsonValue, error: value.error}; };
  return {executorId, version: 1, capability: "resume:external_news", scope: "external_news", supportedEffects: ["set_field"], supportedEntityTypes: ["noticia"], risk: "medium",
    canExecute(plan, indexes) { return plan.requiredCapabilities.includes("resume:external_news") && indexes.length === 1 && plan.effects[indexes[0]]?.type === "set_field"; },
    async simulate(plan, state, indexes): Promise<SimulationResult> { const resume = stateOf(state); const reason = !resume ? "resume_state_invalid" : preparedContractError(resume.prepared) ?? authorizationError(resume.prepared, resume.authorization) ?? universalPlanError(plan, resume.prepared, indexes); const safe = !reason; return {executorId, executorVersion: 1, executorManifestFingerprint: manifest(), capability: "resume:external_news", status: safe ? "safe" : "blocked", effectIndexes: indexes, changes: safe ? [{resume: "external_news"}] : [], warnings: [], blockingReasons: reason ? [reason] : [], errors: []}; },
    async execute(plan, state, indexes, options) { const resume = stateOf(state); const mismatch = resume ? universalPlanError(plan, resume.prepared, indexes) : "resume_state_missing"; if (!resume || mismatch) { const reason = mismatch ?? "resume_state_missing"; const value: ExternalNewsResumeAdapterResult = {caseId: plan.caseId, caseVersion: plan.caseVersion, planId: plan.id, operationId: plan.operationId, idempotencyKey: options.idempotencyKey, producer: "external_news", outcome: "blocked", previewFingerprint: "", planFingerprint: plan.planFingerprint, references: [], projectedGraph: {schemaVersion: 1, id: "invalid", caseId: plan.caseId, caseVersion: plan.caseVersion, producerId: "external_news", originalOperation: plan.operationId, nodes: [], state: "failed", fingerprint: "sha256-v1:invalid", idempotencyKey: "invalid", createdAt: "", metadata: {}}, warnings: [reason], completedAt: (dependencies.now ?? nowDefault)(), error: {code: reason, message: reason, retryable: false}}; return output(plan, indexes, options.idempotencyKey, "blocked", value); } const value = await executePreparedExternalNewsResume({prepared: resume.prepared, authorization: resume.authorization, dependencies}); return output(plan, indexes, options.idempotencyKey, value.outcome === "resumed" || value.outcome === "already_resumed" ? "succeeded" : value.outcome === "blocked" ? "blocked" : value.outcome === "reconciliation_required" ? "reconciliation_required" : "failed", value); },
    async validateExecution(plan, result, _signal): Promise<PostExecutionValidation> { const value = object(result.output) ? result.output : undefined; const outcome = value?.outcome; const referenceId = typeof value?.draftId === "string" ? value.draftId : typeof value?.documentId === "string" ? value.documentId : ""; const projectedGraph = object(value?.projectedGraph) ? value.projectedGraph : undefined; const valid = result.status === "succeeded" && (outcome === "resumed" || outcome === "already_resumed") && Boolean(referenceId) && projectedGraph?.state === "succeeded"; return {valid, planFingerprint: plan.planFingerprint, executorId, executionIdempotencyKey: result.idempotencyKey, checkedPostconditionIds: plan.postconditions.map((item) => item.id), checkedEffectIndexes: result.effectIndexes, errors: valid ? [] : [{code: "resume_postvalidation_failed", message: "La reanudación no confirmó un borrador válido."}], warnings: [], validatedAt: (dependencies.now ?? nowDefault)()}; },
  };
}
