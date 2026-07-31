import {validatePreparedEntity, type CreateEditorialEntityExecutor} from "../materialization";
import {buildUniversalExecutionPlan, computeUniversalFingerprint, getRegisteredReviewExecutor, type ExecutionResult, type PostExecutionValidation, type ReviewEffect, type ReviewExecutorRegistration, type SimulationResult, type UniversalExecutionPlan, type UniversalReviewInput} from "../universal";
import {capabilityForOperation} from "./capabilities";
import {validateGlobalResolutionPlan} from "./validateGlobalResolutionPlan";
import type {GlobalResolutionPlan} from "./types";
import type {GlobalResolutionSimulationResult} from "./simulateGlobalResolutionPlan";
import type {ReviewJsonObject, ReviewJsonValue} from "../types";
import {validateFighterIdentityGuardAuthorization, validateFighterIdentityGuardToken, type FighterIdentityGuardAuthorization} from "./identityGuard";

export type FighterCreationVerification = {id: string; entityType: "luchador"; name: string; identityKey: string; disciplineId: string; organizationId: string; payload: ReviewJsonObject};
export type FighterCreationInspector = (entityId: string, signal: AbortSignal) => Promise<FighterCreationVerification | undefined>;
export type FighterCreationExecutorDependencies = {entityCreationExecutor: CreateEditorialEntityExecutor; inspectCreatedEntity?: FighterCreationInspector; now?: () => string};
export type FighterCreationOutcome = "created" | "reused_existing" | "blocked" | "failed" | "reconciliation_required";
export type FighterCreationExecutionSummary = {operationId: string; planId: string; idempotencyKey: string; entityType: "luchador"; identityKey?: string; entityId?: string; outcome: FighterCreationOutcome; pendingFlow: "reference_replacement_and_resume"; warnings: string[]; reconciliation?: {reason: string; identityKey: string; entityId?: string}; completedAt: string};

type FighterCreationEffectPayload = {draft: ReviewJsonObject; globalPlanId: string; globalPlanFingerprint: string; globalOperationId: string; globalOperationIdempotencyKey: string; identityGuardAuthorization: FighterIdentityGuardAuthorization};
const object = (value: unknown): value is ReviewJsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const projected = (value: unknown): boolean => typeof value === "string" ? value.startsWith("projected:") : Array.isArray(value) ? value.some(projected) : object(value) ? Object.values(value).some(projected) : false;
const nowDefault = () => new Date().toISOString();
const fighterPayload = (effect: ReviewEffect | undefined): FighterCreationEffectPayload | undefined => {
  if (!effect || effect.type !== "create_entity" || effect.entityType !== "luchador" || !object(effect.payload)) return undefined;
  const value = effect.payload as Partial<FighterCreationEffectPayload>;
  return object(value.draft) && [value.globalPlanId, value.globalPlanFingerprint, value.globalOperationId, value.globalOperationIdempotencyKey].every((item) => typeof item === "string" && Boolean(item.trim())) ? value as FighterCreationEffectPayload : undefined;
};
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "fighter_creation_failed";
const deterministicFailure = (message: string) => /(?:validation|invalid|400|404|409|422|forbidden|unauthori[sz]ed)/i.test(message);

export function fighterCreationEntityIdempotencyKey(identityKey: string, payload: ReviewJsonObject): string {
  return `fighter-entity:${identityKey}:${computeUniversalFingerprint(payload as ReviewJsonValue)}`;
}

export function extractFighterCreationUniversalPlan(input: {plan: GlobalResolutionPlan; simulation: GlobalResolutionSimulationResult; reviewInput: UniversalReviewInput; identityGuardAuthorization?: FighterIdentityGuardAuthorization; now?: () => string}): {ok: true; operationId: string; universalPlan: UniversalExecutionPlan} | {ok: false; reason: string} {
  const validation = validateGlobalResolutionPlan(input.plan);
  if (!validation.valid || !input.plan.structurallyValid) return {ok: false, reason: "global_plan_invalid"};
  if (input.simulation.intentFingerprint !== input.plan.fingerprint || !input.simulation.simulatable) return {ok: false, reason: "simulation_not_safe"};
  const operation = input.plan.operations.find((item) => item.kind === "create_entity" && item.entityType === "luchador" && capabilityForOperation(item) === "create:luchador");
  if (!operation || input.plan.blockers.some((blocker) => blocker.operationId === operation.id && blocker.severity === "blocking")) return {ok: false, reason: "fighter_creation_blocked"};
  const node = input.simulation.nodeResults.find((item) => item.input.operationId === operation.id);
  if (!node || node.status !== "simulated" || node.decision !== "create_candidate" || projected(operation.payload)) return {ok: false, reason: "fighter_creation_not_simulated"};
  if (!object(operation.payload)) return {ok: false, reason: "fighter_creation_payload_invalid"};
  const guard = validateFighterIdentityGuardAuthorization(input.identityGuardAuthorization, {plan: input.plan, creationOperationId: operation.id, now: input.now});
  if (!guard.valid) return {ok: false, reason: `fighter_identity_guard_${guard.reasonCode}`};
  const identityGuardAuthorization = input.identityGuardAuthorization!;
  const prepared = validatePreparedEntity({issueId: operation.id, entityType: "fighter", draft: operation.payload});
  if (!prepared.valid || !prepared.entity) return {ok: false, reason: "fighter_creation_prevalidation_failed"};
  const effect: ReviewEffect = {id: operation.id, type: "create_entity", entityType: "luchador", payload: {draft: operation.payload, globalPlanId: input.plan.id, globalPlanFingerprint: input.plan.fingerprint, globalOperationId: operation.id, globalOperationIdempotencyKey: operation.idempotencyKey, identityGuardAuthorization: identityGuardAuthorization as unknown as ReviewJsonValue}};
  const reviewInput: UniversalReviewInput = {...input.reviewInput, entity: {type: "luchador", id: prepared.entity.identityKey}};
  return {ok: true, operationId: operation.id, universalPlan: buildUniversalExecutionPlan({reviewCase: {id: input.plan.caseId, version: input.plan.caseVersion, subject: {type: "luchador"}, context: {}}, reviewInput, effects: [effect], preconditions: [{id: `pre:${operation.id}:schema`, kind: "schema_valid", description: "Luchador preparado y sin referencias proyectadas.", required: true}, {id: `pre:${operation.id}:identity`, kind: "no_ambiguity", description: "resolve_identity:fighter autorizó exactamente esta creación.", required: true}], postconditions: [{id: `post:${operation.id}:created`, kind: "fighter_created", description: "El luchador autorizado se persistió o queda reconciliación explícita.", required: true, effectIndexes: [0]}], requiredCapabilities: ["create:luchador"], now: input.now})};
}

function prevalidate(plan: UniversalExecutionPlan, indexes: number[], now: string): {effect: ReviewEffect; payload: FighterCreationEffectPayload; entity: NonNullable<ReturnType<typeof validatePreparedEntity>["entity"]>} | {error: string} {
  if (plan.entityType !== "luchador" || plan.requiredCapabilities.includes("create:luchador") === false || indexes.length !== 1) return {error: "fighter_creation_plan_contract_invalid"};
  const effect = plan.effects[indexes[0]]; const payload = fighterPayload(effect);
  if (!payload || projected(payload.draft)) return {error: "fighter_creation_payload_invalid_or_projected"};
  if (!object(payload.identityGuardAuthorization)) return {error: "identity_guard_missing"};
  if (payload.identityGuardAuthorization.decision !== "create_new") return {error: "identity_not_create_new"};
  if (!validateFighterIdentityGuardToken(payload.identityGuardAuthorization, {creationOperationId: payload.globalOperationId, planFingerprint: payload.globalPlanFingerprint, caseId: plan.caseId, caseVersion: plan.caseVersion, producer: plan.producerId, creationPayload: payload.draft, now})) return {error: Date.parse(payload.identityGuardAuthorization.expiresAt) <= Date.parse(now) ? "identity_authorization_expired" : "identity_authorization_mismatch"};
  const checked = validatePreparedEntity({issueId: payload.globalOperationId, entityType: "fighter", draft: payload.draft});
  return checked.valid && checked.entity ? {effect, payload, entity: checked.entity} : {error: checked.errors.join(" ") || "fighter_creation_prevalidation_failed"};
}

export function createFighterCreationUniversalExecutor(dependencies: FighterCreationExecutorDependencies): ReviewExecutorRegistration {
  const now = dependencies.now ?? nowDefault;
  const summaries = new Map<string, FighterCreationExecutionSummary>();
  const manifestFingerprint = () => getRegisteredReviewExecutor("global-resolution.create-luchador.v1")?.manifestFingerprint ?? "sha256-v1:unregistered";
  const result = (_plan: UniversalExecutionPlan, indexes: number[], idempotencyKey: string, status: ExecutionResult["status"], summary: FighterCreationExecutionSummary, error?: ExecutionResult["error"]): ExecutionResult => ({executorId: "global-resolution.create-luchador.v1", executorVersion: 1, executorManifestFingerprint: manifestFingerprint(), capability: "create:luchador", status, effectIndexes: indexes, idempotencyKey, references: summary.entityId ? [{type: "luchador", id: summary.entityId}] : [], output: summary as unknown as ReviewJsonValue, error});
  return {
    executorId: "global-resolution.create-luchador.v1", version: 1, capability: "create:luchador", scope: "global_resolution", supportedEffects: ["create_entity"], supportedEntityTypes: ["luchador"], risk: "medium",
    canExecute(plan, indexes) { return "error" in prevalidate(plan, indexes, now()) === false; },
    async simulate(plan, _state, indexes): Promise<SimulationResult> { const checked = prevalidate(plan, indexes, now()); return {executorId: "global-resolution.create-luchador.v1", executorVersion: 1, executorManifestFingerprint: manifestFingerprint(), capability: "create:luchador", status: "error" in checked ? "blocked" : "safe", effectIndexes: indexes, changes: "error" in checked ? [] : [{operationId: checked.payload.globalOperationId, outcome: "authorized_creation"}], warnings: [], blockingReasons: "error" in checked ? [checked.error] : [], errors: []}; },
    async execute(plan, _state, indexes, options) {
      const completedAt = now(); const checked = prevalidate(plan, indexes, completedAt);
      if ("error" in checked) { const summary: FighterCreationExecutionSummary = {operationId: "unknown", planId: plan.id, idempotencyKey: options.idempotencyKey, entityType: "luchador", outcome: "blocked", pendingFlow: "reference_replacement_and_resume", warnings: [checked.error], completedAt}; return result(plan, indexes, options.idempotencyKey, "blocked", summary, {code: "fighter_creation_blocked", message: checked.error, retryable: false}); }
  const {payload, entity} = checked; const summaryBase = {operationId: payload.globalOperationId, planId: plan.id, idempotencyKey: options.idempotencyKey, entityType: "luchador" as const, identityKey: entity.identityKey, pendingFlow: "reference_replacement_and_resume" as const, completedAt};
      try {
        const created = await dependencies.entityCreationExecutor.createEntity({entityType: "fighter", payload: entity.sanityPayload, idempotencyKey: fighterCreationEntityIdempotencyKey(entity.identityKey, entity.sanityPayload), identityAuthorization: payload.identityGuardAuthorization, authorityContext: {globalPlanId: payload.globalPlanId, globalPlanFingerprint: payload.globalPlanFingerprint, globalOperationId: payload.globalOperationId, globalOperationIdempotencyKey: payload.globalOperationIdempotencyKey, caseId: plan.caseId, caseVersion: plan.caseVersion, producer: plan.producerId, sourcePayload: payload.draft}});
        if (!created.success || created.alreadyExisted) { const reasonCode = created.alreadyExisted ? "persistence_conflict" : created.reasonCode ?? "fighter_creation_failed"; const message = created.error ?? reasonCode; const conflict = reasonCode === "persistence_conflict"; const uncertain = !conflict && !deterministicFailure(message); const summary: FighterCreationExecutionSummary = {...summaryBase, outcome: uncertain ? "reconciliation_required" : "failed", warnings: [reasonCode], reconciliation: uncertain ? {reason: message, identityKey: entity.identityKey} : undefined}; return result(plan, indexes, options.idempotencyKey, uncertain ? "reconciliation_required" : "failed", summary, {code: uncertain ? "fighter_creation_uncertain" : reasonCode, message, retryable: uncertain}); }
        const entityId = created.entityId; const outcome: FighterCreationOutcome = "created";
        if (!entityId || entityId.startsWith("projected:")) { const summary: FighterCreationExecutionSummary = {...summaryBase, entityId, outcome: "reconciliation_required", warnings: ["entity_id_missing_or_projected"], reconciliation: {reason: "entity_id_missing_or_projected", identityKey: entity.identityKey, entityId}}; return result(plan, indexes, options.idempotencyKey, "reconciliation_required", summary, {code: "fighter_creation_uncertain", message: "La creación no devolvió un ID real verificable.", retryable: false}); }
        if (dependencies.inspectCreatedEntity) { const verified = await dependencies.inspectCreatedEntity(entityId, options.signal); const expectedOrganization = object(entity.sanityPayload.organizacion) && typeof entity.sanityPayload.organizacion._ref === "string" ? entity.sanityPayload.organizacion._ref : ""; if (!verified || verified.id !== entityId || verified.entityType !== "luchador" || verified.name !== entity.name || verified.identityKey !== entity.identityKey || verified.disciplineId !== entity.disciplineId || !expectedOrganization || verified.organizationId !== expectedOrganization) { const summary: FighterCreationExecutionSummary = {...summaryBase, entityId, outcome: "reconciliation_required", warnings: ["post_creation_verification_failed"], reconciliation: {reason: "post_creation_verification_failed", identityKey: entity.identityKey, entityId}}; summaries.set(options.idempotencyKey, summary); return result(plan, indexes, options.idempotencyKey, "reconciliation_required", summary, {code: "post_creation_verification_failed", message: "El documento requiere reconciliación manual.", retryable: false}); } }
        const summary: FighterCreationExecutionSummary = {...summaryBase, entityId, outcome, warnings: dependencies.inspectCreatedEntity ? [] : ["post_creation_read_not_configured"]}; summaries.set(options.idempotencyKey, summary); return result(plan, indexes, options.idempotencyKey, "succeeded", summary);
      } catch (error) { const message = errorMessage(error); const summary: FighterCreationExecutionSummary = {...summaryBase, outcome: "reconciliation_required", warnings: [message], reconciliation: {reason: message, identityKey: entity.identityKey}}; return result(plan, indexes, options.idempotencyKey, "reconciliation_required", summary, {code: "fighter_creation_uncertain", message, retryable: true}); }
    },
    async validateExecution(plan, execution, _signal): Promise<PostExecutionValidation> { const summary = summaries.get(execution.idempotencyKey); const valid = execution.status === "succeeded" && Boolean(summary?.entityId) && !summary?.reconciliation; return {valid, planFingerprint: plan.planFingerprint, executorId: "global-resolution.create-luchador.v1", executionIdempotencyKey: execution.idempotencyKey, checkedPostconditionIds: plan.postconditions.filter((item) => item.effectIndexes.some((index) => execution.effectIndexes.includes(index))).map((item) => item.id), checkedEffectIndexes: execution.effectIndexes, errors: valid ? [] : [{code: "fighter_creation_postvalidation_failed", message: summary?.reconciliation?.reason ?? "fighter_creation_not_confirmed"}], warnings: (summary?.warnings ?? []).map((message) => ({code: "fighter_creation_warning", message})), validatedAt: now()}; },
  };
}
