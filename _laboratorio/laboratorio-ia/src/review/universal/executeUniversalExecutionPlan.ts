import type { ReviewJsonValue } from "../types";
import {
  getRegisteredReviewExecutor,
  type RegisteredReviewExecutor,
} from "./executorRegistry";
import { computeSnapshotFingerprint } from "./fingerprints";
import type {
  CompensationResult,
  ExecutionResult,
  PostExecutionValidation,
  UniversalExecutionPlan,
  UniversalExecutionPolicy,
  UniversalPlanExecution,
  UniversalPlanSimulation,
} from "./types";
import { validateUniversalExecutionPlan } from "./validateUniversalExecutionPlan";
import { validateUniversalSimulation } from "./validateUniversalSimulation";
import {identityCreationGuardProfileForSchema, isIdentityCreationSupported, validateIdentityCreationPreflightToken, type IdentityCreationPreflight} from "../globalResolution/identityCreationGuard";
import {validateFighterIdentityGuardToken, type FighterIdentityGuardAuthorization} from "../globalResolution/identityGuard";
import type {ReviewJsonObject} from "../types";
import {
  validateCompensationResult,
  validateExecutionResult,
  validatePostExecutionValidation,
} from "./validateUniversalRuntimeResults";
const active = new Map<string, Promise<UniversalPlanExecution>>();
const defaultPolicy: UniversalExecutionPolicy = {
  allowedRiskLevels: ["none", "low", "medium"],
  approvedRiskLevels: [],
};
const nowDefault = () => new Date().toISOString();
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
function createEffectsAuthorized(plan: UniversalExecutionPlan, now: string): boolean {
  for (const effect of plan.effects) {
    if (effect.type !== "create_entity") continue;
    const profile = identityCreationGuardProfileForSchema(effect.entityType);
    if (!profile || !isIdentityCreationSupported(profile) || !record(effect.payload)) return false;
    const payload = effect.payload;
    if (!record(payload.draft) || typeof payload.globalPlanId !== "string" || typeof payload.globalPlanFingerprint !== "string" || typeof payload.globalOperationId !== "string") return false;
    if (profile.schemaType === "luchador" && record(payload.identityGuardAuthorization)) {
      const authorization = payload.identityGuardAuthorization as unknown as FighterIdentityGuardAuthorization;
      if (authorization.planId && authorization.planId !== payload.globalPlanId) return false;
      if (!validateFighterIdentityGuardToken(authorization, {creationOperationId: payload.globalOperationId, planFingerprint: payload.globalPlanFingerprint, caseId: authorization.caseId, caseVersion: authorization.caseVersion, producer: authorization.producer, creationPayload: payload.draft as ReviewJsonObject, now})) return false;
      continue;
    }
    if (!record(payload.identityCreationPreflight) || typeof payload.globalOperationFingerprint !== "string" || typeof payload.globalContextFingerprint !== "string") return false;
    if (!validateIdentityCreationPreflightToken(payload.identityCreationPreflight as unknown as IdentityCreationPreflight, {entityType: effect.entityType as import("../entityOperations").EntityOperationEntityType, operationId: payload.globalOperationId, operationFingerprint: payload.globalOperationFingerprint, contextFingerprint: payload.globalContextFingerprint, now})) return false;
  }
  return true;
}
function terminal(
  plan: UniversalExecutionPlan,
  sim: UniversalPlanSimulation,
  state: ReviewJsonValue,
  status: UniversalPlanExecution["status"],
  startedAt: string,
  completedAt: string,
  extra: Partial<UniversalPlanExecution> = {},
): UniversalPlanExecution {
  return {
    schemaVersion: 1,
    planId: plan.id,
    planFingerprint: plan.planFingerprint,
    simulationFingerprint: sim.simulationFingerprint,
    stateFingerprint: computeSnapshotFingerprint(state),
    status,
    allocations: sim.allocations,
    results: [],
    validations: [],
    compensations: [],
    startedAt,
    completedAt,
    ...extra,
  };
}
function allowed(
  binding: RegisteredReviewExecutor,
  policy: UniversalExecutionPolicy,
): boolean {
  if (!policy.allowedRiskLevels.includes(binding.manifest.risk)) return false;
  if (
    policy.allowedCapabilities &&
    !policy.allowedCapabilities.includes(binding.manifest.capability)
  )
    return false;
  if (
    binding.manifest.risk === "critical" &&
    !policy.approvedRiskLevels?.includes("critical")
  )
    return false;
  return true;
}
async function compensate(
  plan: UniversalExecutionPlan,
  completed: Array<{
    result: ExecutionResult;
    binding: RegisteredReviewExecutor;
  }>,
  signal: AbortSignal,
): Promise<CompensationResult[]> {
  const out: CompensationResult[] = [];
  for (const { result, binding } of [...completed].reverse()) {
    if (!binding.registration.compensate) {
      out.push({
        executorId: binding.manifest.executorId,
        executorVersion: binding.manifest.version,
        executorManifestFingerprint: binding.manifestFingerprint,
        status: "not_available",
        effectIndexes: result.effectIndexes,
        message: "compensation_not_available",
      });
      continue;
    }
    try {
      const c = await binding.registration.compensate(plan, result, signal);
      if (
        !validateCompensationResult(c).valid ||
        c.executorId !== binding.manifest.executorId ||
        c.executorVersion !== binding.manifest.version ||
        c.executorManifestFingerprint !== binding.manifestFingerprint
      )
        throw new Error("invalid_compensation_result");
      out.push(c);
    } catch (error) {
      out.push({
        executorId: binding.manifest.executorId,
        executorVersion: binding.manifest.version,
        executorManifestFingerprint: binding.manifestFingerprint,
        status: "failed",
        effectIndexes: result.effectIndexes,
        message: error instanceof Error ? error.message : "compensation_failed",
      });
    }
  }
  return out;
}
async function run(
  plan: UniversalExecutionPlan,
  state: ReviewJsonValue,
  simulation: UniversalPlanSimulation,
  options: {
    signal?: AbortSignal;
    now?: () => string;
    policy?: UniversalExecutionPolicy;
  },
): Promise<UniversalPlanExecution> {
  const now = options.now ?? nowDefault,
    startedAt = now(),
    signal = options.signal ?? new AbortController().signal,
    policy = options.policy ?? defaultPolicy;
  try {
    const pv = validateUniversalExecutionPlan(plan),
      sv = validateUniversalSimulation(simulation, plan, state);
    if (!pv.valid || !sv.valid || simulation.status !== "safe")
      return terminal(plan, simulation, state, "blocked", startedAt, now(), {
        error: {
          code: "unsafe_or_invalid_simulation",
          message: [...pv.errors, ...sv.errors].map((x) => x.code).join(","),
          retryable: false,
        },
      });
    if (!createEffectsAuthorized(plan, startedAt)) return terminal(plan, simulation, state, "blocked", startedAt, now(), {error: {code: "identity_guard_required", message: "create_entity_requires_bound_identity_authorization", retryable: false}});
    const bindings: RegisteredReviewExecutor[] = [];
    for (const allocation of simulation.allocations) {
      const b = getRegisteredReviewExecutor(allocation.executorId);
      if (
        !b ||
        b.manifest.version !== allocation.version ||
        b.manifestFingerprint !== allocation.executorManifestFingerprint ||
        b.manifest.capability !== allocation.capability ||
        !allowed(b, policy)
      )
        return terminal(plan, simulation, state, "blocked", startedAt, now(), {
          error: {
            code: b
              ? "executor_outside_policy_or_changed"
              : "executor_unavailable",
            message: allocation.executorId,
            retryable: true,
          },
        });
      bindings.push(b);
    }
    const results: ExecutionResult[] = [],
      validations: PostExecutionValidation[] = [],
      completed: Array<{
        result: ExecutionResult;
        binding: RegisteredReviewExecutor;
      }> = [];
    for (let i = 0; i < simulation.allocations.length; i += 1) {
      signal.throwIfAborted();
      const allocation = simulation.allocations[i],
        binding = bindings[i],
        key = `${plan.idempotencyKey}:${binding.manifest.executorId}:${i}`;
      let result: ExecutionResult;
      try {
        result = await binding.registration.execute(
          plan,
          state,
          [...allocation.effectIndexes],
          { idempotencyKey: key, signal },
        );
      } catch (error) {
        result = {
          executorId: binding.manifest.executorId,
          executorVersion: binding.manifest.version,
          executorManifestFingerprint: binding.manifestFingerprint,
          capability: binding.manifest.capability,
          status: "failed",
          effectIndexes: [...allocation.effectIndexes],
          idempotencyKey: key,
          references: [],
          error: {
            code: "executor_exception",
            message: error instanceof Error ? error.message : "executor_failed",
            retryable: true,
          },
        };
      }
      const rv = validateExecutionResult(result);
      if (
        !rv.valid ||
        result.executorId !== binding.manifest.executorId ||
        result.executorVersion !== binding.manifest.version ||
        result.executorManifestFingerprint !== binding.manifestFingerprint ||
        result.capability !== binding.manifest.capability ||
        result.idempotencyKey !== key ||
        JSON.stringify(result.effectIndexes) !==
          JSON.stringify(allocation.effectIndexes)
      )
        result = {
          ...result,
          status: "failed",
          error: {
            code: "invalid_execution_result",
            message: rv.errors.map((x) => x.code).join(","),
            retryable: false,
          },
        };
      results.push(result);
      if (result.status !== "succeeded") {
        const compensations = await compensate(plan, completed, signal);
        return terminal(
          plan,
          simulation,
          state,
          result.status === "reconciliation_required" ||
          compensations.some((x) => x.status !== "compensated")
            ? "reconciliation_required"
            : "failed",
          startedAt,
          now(),
          { results, validations, compensations },
        );
      }
      completed.push({ result, binding });
      let validation: PostExecutionValidation;
      try {
        validation = await binding.registration.validateExecution(
          plan,
          result,
          signal,
        );
      } catch (error) {
        validation = {
          valid: false,
          planFingerprint: plan.planFingerprint,
          executorId: binding.manifest.executorId,
          executionIdempotencyKey: key,
          checkedPostconditionIds: [],
          checkedEffectIndexes: [],
          errors: [
            {
              code: "postvalidation_exception",
              message:
                error instanceof Error
                  ? error.message
                  : "postvalidation_failed",
            },
          ],
          warnings: [],
          validatedAt: now(),
        };
      }
      const vv = validatePostExecutionValidation(validation, plan, result);
      if (!vv.valid || !validation.valid) {
        validations.push({
          ...validation,
          valid: false,
          errors: [...validation.errors, ...vv.errors],
        });
        const compensations = await compensate(plan, completed, signal);
        return terminal(
          plan,
          simulation,
          state,
          compensations.some((x) => x.status !== "compensated")
            ? "reconciliation_required"
            : "failed",
          startedAt,
          now(),
          { results, validations, compensations },
        );
      }
      validations.push(validation);
    }
    return terminal(plan, simulation, state, "succeeded", startedAt, now(), {
      results,
      validations,
    });
  } catch (error) {
    if (
      signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      return terminal(plan, simulation, state, "cancelled", startedAt, now(), {
        error: {
          code: "execution_cancelled",
          message: "execution_cancelled",
          retryable: true,
        },
      });
    throw error;
  }
}
export function executeUniversalExecutionPlan(
  plan: UniversalExecutionPlan,
  state: ReviewJsonValue,
  simulation: UniversalPlanSimulation,
  options: {
    signal?: AbortSignal;
    now?: () => string;
    policy?: UniversalExecutionPolicy;
  } = {},
): Promise<UniversalPlanExecution> {
  const key = `${plan.idempotencyKey}:${simulation.simulationFingerprint}`;
  const existing = active.get(key);
  if (existing) return existing;
  const execution = run(plan, state, simulation, options).finally(() =>
    active.delete(key),
  );
  active.set(key, execution);
  return execution;
}
