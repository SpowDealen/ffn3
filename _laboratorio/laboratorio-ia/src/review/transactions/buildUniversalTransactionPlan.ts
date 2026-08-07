import {topologicalSortResolutionGraph} from "../resolutionGraph";
import type {ReviewJsonValue} from "../types";
import {computeUniversalFingerprint, type RegisteredReviewExecutor} from "../universal";
import {capabilityForOperation, type GlobalResolutionPlan} from "../globalResolution";
import type {GlobalResolutionCheckpoint} from "../globalResolution/checkpoint";
import {fingerprintGlobalResolutionCheckpointSource} from "../globalResolution/checkpoint/fingerprints";
import type {GlobalResolutionProducerRegistry} from "../globalResolution/producers";
import {validateGlobalResolutionPlan} from "../globalResolution/validateGlobalResolutionPlan";
import {deriveTransactionPhase} from "./stateMachine";
import {
  UNIVERSAL_TRANSACTION_SCHEMA_VERSION,
  type BuildUniversalTransactionResult,
  type TransactionAuthorizationPolicy,
  type TransactionBlocker,
  type TransactionBuildContext,
  type TransactionCompensationPolicy,
  type TransactionOperationBinding,
  type TransactionPolicies,
  type TransactionReconciliationPolicy,
  type TransactionRetryPolicy,
  type TransactionRisk,
  type TransactionStep,
  type TransactionStepMode,
  type TransactionStepState,
  type UniversalTransactionPlan,
} from "./types";

const nowDefault = () => new Date().toISOString();

const DEFAULT_POLICIES: TransactionPolicies = Object.freeze({
  atomicity: "logical",
  consistency: "domain_enforced",
  isolation: "optimistic_fingerprint",
  durability: "checkpoint_based",
  allowAutomaticExecution: false,
  allowAutomaticRetry: false,
  allowAutomaticCompensation: false,
  maximumRisk: "high",
  historyLimit: 100,
});

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function isResume(operation: GlobalResolutionPlan["operations"][number]): boolean {
  return record(operation.payload)?.scope === "resume";
}

function defaultMode(operation: GlobalResolutionPlan["operations"][number]): TransactionStepMode {
  if (isResume(operation)) return "external_effect";
  if (["find_entity", "reuse_entity", "validate_entity"].includes(operation.kind)) return "read_only";
  if (["replace_reference", "set_metadata"].includes(operation.kind)) return "pure_transform";
  return "external_effect";
}

function defaultRisk(operation: GlobalResolutionPlan["operations"][number], mode: TransactionStepMode): TransactionRisk {
  if (mode !== "external_effect") return "low";
  if (operation.risk === "critical") return "destructive";
  if (operation.risk === "high") return "high";
  return operation.risk === "medium" ? "medium" : "low";
}

function stateFromGraph(node: GlobalResolutionPlan["graph"]["nodes"][number]): TransactionStepState {
  if (node.state === "simulated") return "pending";
  if (node.state === "succeeded" && node.operation.kind === "reuse_entity") return "reused";
  return node.state;
}

function blocker(code: TransactionBlocker["code"], operationId: string | undefined, message: string): TransactionBlocker {
  return {code, stepId: operationId, operationId, message};
}

function semanticStep(step: TransactionStep) {
  return Object.fromEntries(Object.entries(step).filter(([key]) => key !== "state"));
}

function semanticTransaction(input: {caseId: string; caseVersion: number; sourcePlanFingerprint: string; producer?: UniversalTransactionPlan["producer"]; steps: readonly TransactionStep[]; policies: TransactionPolicies; blockers: readonly TransactionBlocker[]; contextBinding: UniversalTransactionPlan["contextBinding"]}) {
  return {...input, steps: input.steps.map(semanticStep), blockers: [...input.blockers].sort((left, right) => `${left.code}:${left.operationId ?? ""}`.localeCompare(`${right.code}:${right.operationId ?? ""}`))};
}

function externalPolicyBlockers(operation: GlobalResolutionPlan["operations"][number], binding: TransactionOperationBinding | undefined, mode: TransactionStepMode, risk: TransactionRisk, guardFingerprint: string | undefined): TransactionBlocker[] {
  if (mode !== "external_effect") return [];
  const out: TransactionBlocker[] = [];
  if (!binding) return [blocker("unsupported_step", operation.id, `La operación ${operation.id} no tiene política transaccional registrada.`)];
  if (!binding.executorId || !binding.executorVersion || !binding.executorManifestFingerprint) out.push(blocker("execution_binding_missing", operation.id, `El efecto externo ${operation.id} no tiene executor binding completo.`));
  if (!binding.mode || !binding.risk || !binding.authorization || !binding.retry || !binding.compensation) out.push(blocker("transaction_policy_missing", operation.id, `El efecto externo ${operation.id} no declara todas sus políticas.`));
  if (!binding.reconciliation || binding.reconciliation === "not_required") out.push(blocker("reconciliation_policy_missing", operation.id, `El efecto externo ${operation.id} no declara reconciliación segura.`));
  if (risk === "destructive") out.push(blocker("destructive_step_unsupported", operation.id, `AU7 B1 no admite efectos destructivos: ${operation.id}.`));
  if (operation.kind === "create_entity" && !guardFingerprint) out.push(blocker("creation_guard_missing", operation.id, `La creación ${operation.id} no conserva el fingerprint del Creation Guard.`));
  return out;
}

function rootReadiness(steps: readonly TransactionStep[], blockers: readonly TransactionBlocker[]): TransactionStep[] {
  const blocked = new Set(blockers.flatMap((item) => item.stepId ? [item.stepId] : []));
  return steps.map((step) => {
    if (blocked.has(step.stepId)) return Object.freeze({...step, state: "blocked" as const});
    if (step.state === "pending" && step.dependencies.length === 0) return Object.freeze({...step, state: "ready" as const});
    return step;
  });
}

export function buildUniversalTransactionPlan(plan: GlobalResolutionPlan, context: TransactionBuildContext): BuildUniversalTransactionResult {
  const validation = validateGlobalResolutionPlan(plan);
  if (!validation.valid) return {ok: false, reasons: validation.errors.map((item) => item.code)};
  const sorted = topologicalSortResolutionGraph(plan.graph);
  if (!sorted.valid) return {ok: false, reasons: sorted.errors.map((item) => item.code)};
  const operations = new Map(plan.operations.map((operation) => [operation.id, operation]));
  const nodes = new Map(plan.graph.nodes.map((node) => [node.operation.id, node]));
  const bindings = new Map(context.bindings.map((binding) => [binding.operationId, binding]));
  if (bindings.size !== context.bindings.length) return {ok: false, reasons: ["transaction_binding_duplicate"]};
  const blockers: TransactionBlocker[] = plan.blockers.map((item) => blocker("source_plan_invalid", item.operationId, item.message));
  const operationFingerprints: Record<string, string> = {};
  const creationGuardFingerprints = {...(context.creationGuardFingerprints ?? {})};
  const steps: TransactionStep[] = [];
  for (const operationId of sorted.nodeIds) {
    const operation = operations.get(operationId);
    const node = nodes.get(operationId);
    if (!operation || !node) return {ok: false, reasons: [`transaction_source_operation_missing:${operationId}`]};
    const binding = bindings.get(operation.id);
    const capability = binding?.capability ?? capabilityForOperation(operation) ?? operation.requiredCapability ?? "";
    if (!capability) blockers.push(blocker("unsupported_step", operation.id, `La operación ${operation.id} no declara capability.`));
    const mode = binding?.mode ?? defaultMode(operation);
    const risk = binding?.risk ?? defaultRisk(operation, mode);
    const authorization: TransactionAuthorizationPolicy = binding?.authorization ?? (mode === "external_effect" ? "human_required" : "none");
    const retry: TransactionRetryPolicy = binding?.retry ?? (mode === "external_effect" ? "never" : "safe_idempotent");
    const reconciliation: TransactionReconciliationPolicy = binding?.reconciliation ?? (mode === "external_effect" ? "required_before_retry" : "not_required");
    const compensation: TransactionCompensationPolicy = binding?.compensation ?? (mode === "pure_transform" ? "reversible_transform" : "none");
    const operationFingerprint = computeUniversalFingerprint(operation as unknown as ReviewJsonValue);
    operationFingerprints[operation.id] = operationFingerprint;
    blockers.push(...externalPolicyBlockers(operation, binding, mode, risk, creationGuardFingerprints[operation.id]));
    steps.push(Object.freeze({
      stepId: operation.id,
      operationId: operation.id,
      operationKind: operation.kind,
      capability: capability || "capability:unsupported",
      entityType: operation.entityType,
      dependencies: Object.freeze([...operation.dependencyIds].sort()),
      mode,
      risk,
      authorization,
      idempotencyKey: operation.idempotencyKey,
      compensation,
      compensatorId: binding?.compensatorId,
      retry,
      reconciliation,
      preExecutionValidationRequired: binding?.preExecutionValidationRequired ?? (mode === "external_effect" || operation.kind === "create_entity"),
      executorId: binding?.executorId,
      executorVersion: binding?.executorVersion,
      state: stateFromGraph(node),
      fingerprints: Object.freeze({operationFingerprint, executorManifestFingerprint: binding?.executorManifestFingerprint, creationGuardFingerprint: creationGuardFingerprints[operation.id]}),
    }));
  }
  const policies = Object.freeze({...DEFAULT_POLICIES, ...(context.policies ?? {}), allowAutomaticExecution: false as const, allowAutomaticRetry: false as const, allowAutomaticCompensation: false as const});
  const riskRank = (risk: TransactionRisk) => ["low", "medium", "high", "destructive"].indexOf(risk);
  for (const step of steps) if (riskRank(step.risk) > riskRank(policies.maximumRisk)) blockers.push(blocker("risk_policy_exceeded", step.operationId, `El riesgo ${step.risk} supera el máximo ${policies.maximumRisk}.`));
  const producer = context.producer ? Object.freeze({producerId: context.producer.producerId, producerVersion: context.producer.producerVersion, manifestVersion: context.producer.manifestVersion, manifestFingerprint: context.producer.manifestFingerprint}) : undefined;
  const contextBinding = Object.freeze({caseId: plan.caseId, caseVersion: plan.caseVersion, sourcePlanFingerprint: plan.fingerprint, sourceCheckpointFingerprint: context.sourceCheckpointFingerprint, producer, operationFingerprints: Object.freeze({...operationFingerprints}), creationGuardFingerprints: Object.freeze({...creationGuardFingerprints})});
  const readySteps = Object.freeze(rootReadiness(steps, blockers));
  const semantic = semanticTransaction({caseId: plan.caseId, caseVersion: plan.caseVersion, sourcePlanFingerprint: plan.fingerprint, producer, steps: readySteps, policies, blockers, contextBinding});
  const transactionFingerprint = computeUniversalFingerprint(semantic as unknown as ReviewJsonValue);
  const transaction: UniversalTransactionPlan = Object.freeze({schemaVersion: UNIVERSAL_TRANSACTION_SCHEMA_VERSION, transactionId: `transaction:${plan.caseId}:${transactionFingerprint.slice(-16)}`, caseId: plan.caseId, caseVersion: plan.caseVersion, sourcePlanFingerprint: plan.fingerprint, transactionFingerprint, transactionIdempotencyKey: `logical-transaction:${transactionFingerprint}`, producer, phase: deriveTransactionPhase(readySteps, blockers.length > 0), steps: readySteps, policies, blockers: Object.freeze([...blockers]), contextBinding, createdAt: (context.now ?? nowDefault)()});
  return {ok: true, value: transaction};
}

function transactionRisk(value: RegisteredReviewExecutor["manifest"]["risk"]): TransactionRisk {
  if (value === "critical") return "destructive";
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  return "low";
}

/** Builds manifests from existing registries only; no executor method is invoked. */
export function createTransactionBuildContextFromRegistries(input: {plan: GlobalResolutionPlan; producerRegistry: GlobalResolutionProducerRegistry; executors: readonly RegisteredReviewExecutor[]; checkpoint?: GlobalResolutionCheckpoint; now?: () => string}): TransactionBuildContext {
  const producer = input.checkpoint?.producerManifest ?? input.producerRegistry.checkpointBinding(input.plan.producer);
  const bindings = input.plan.operations.map((operation): TransactionOperationBinding => {
    const capability = capabilityForOperation(operation) ?? operation.requiredCapability ?? "";
    const candidates = input.executors.filter((executor) => executor.manifest.capability === capability);
    const executor = candidates.length === 1 ? candidates[0] : undefined;
    const capabilityManifest = input.producerRegistry.resolveCapability(input.plan.producer, operation);
    const mode = defaultMode(operation);
    return {
      operationId: operation.id,
      capability,
      mode,
      risk: executor ? transactionRisk(executor.manifest.risk) : defaultRisk(operation, mode),
      authorization: capabilityManifest?.requiresExplicitAuthorization ? "explicit" : mode === "external_effect" ? "human_required" : "none",
      retry: mode === "external_effect" ? capabilityManifest?.idempotencyPolicy === "required" && capabilityManifest.supportsReconciliation ? "after_reconciliation" : "explicit_only" : "safe_idempotent",
      reconciliation: mode === "external_effect" ? capabilityManifest?.supportsReconciliation ? "required_before_retry" : "not_required" : "not_required",
      compensation: mode === "external_effect" ? executor?.registration.compensate ? "explicit_compensator" : "manual_required" : mode === "pure_transform" ? "reversible_transform" : "none",
      compensatorId: executor?.registration.compensate ? `${executor.manifest.executorId}:compensate` : undefined,
      executorId: executor?.manifest.executorId,
      executorVersion: executor?.manifest.version,
      executorManifestFingerprint: executor?.manifestFingerprint,
      preExecutionValidationRequired: mode === "external_effect" || operation.kind === "create_entity",
    };
  });
  const creationGuardFingerprints: Record<string, string> = {};
  const guards = [...(input.checkpoint?.identityGuards ?? []), ...(input.checkpoint?.identityGuard ? [input.checkpoint.identityGuard] : [])];
  for (const guard of guards) {
    const operationId = "authorizationFingerprint" in guard ? guard.creationOperationId : guard.operationId;
    const guardFingerprint = "authorizationFingerprint" in guard ? guard.authorizationFingerprint : guard.guardFingerprint;
    const previous = creationGuardFingerprints[operationId];
    if (previous && previous !== guardFingerprint) throw new Error(`transaction_creation_guard_binding_conflict:${operationId}`);
    creationGuardFingerprints[operationId] = guardFingerprint;
  }
  return {sourceCheckpointFingerprint: input.checkpoint ? fingerprintGlobalResolutionCheckpointSource(input.checkpoint) : undefined, producer, bindings, creationGuardFingerprints, now: input.now};
}

export const universalTransactionSecurity = Object.freeze({writes: false, executes: false, invokesExecutors: false, persistsAuthorization: false, persistsPayloads: false, automaticRetry: false, automaticCompensation: false});
