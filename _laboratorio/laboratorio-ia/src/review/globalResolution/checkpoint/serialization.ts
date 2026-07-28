import {isSerializableReviewValue} from "../../cases/validateResolution";
import {validateEntityOperation} from "../../entityOperations";
import {validateResolutionGraph, type ResolutionGraph} from "../../resolutionGraph";
import {findSensitiveKeys} from "../../universal/security";
import {capabilityForOperation, type GlobalResolutionCapability} from "../capabilities";
import type {GlobalResolutionPlan} from "../types";
import {validateGlobalResolutionPlan} from "../validateGlobalResolutionPlan";
import {fingerprintSerializedResolutionGraph} from "./fingerprints";
import type {SerializedExecutorRequirement, SerializedGlobalResolutionPlan, SerializedResolutionGraph, SerializedResolutionNode, SerializedResolutionNodeResult} from "./types";

export type CheckpointParseResult<T> = {ok: true; value: T} | {ok: false; reasons: string[]};

const SUPPORT = new Set(["contract_only", "simulatable", "executable"]);
const NODE_STATES = new Set(["pending", "ready", "simulated", "executing", "succeeded", "blocked", "failed", "compensated", "reconciliation_required", "skipped"]);
const GRAPH_STATES = new Set(["draft", "invalid", "ready", "simulated", "executing", "succeeded", "blocked", "failed", "reconciliation_required"]);
const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const fingerprint = (value: unknown): value is string => typeof value === "string" && /^sha256-v1:[a-z0-9]+$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const unique = (values: readonly string[]) => [...new Set(values)].sort();

function summarizeNodeResult(result: ResolutionGraph["nodes"][number]["result"]): SerializedResolutionNodeResult | undefined {
  if (!result) return undefined;
  const output = object(result.output) ? result.output : undefined;
  const outcome = typeof output?.outcome === "string" ? output.outcome : undefined;
  const references = (result.references ?? []).filter((reference) => text(reference.type) && text(reference.id)).map((reference) => ({type: reference.type, id: reference.id}));
  return references.length || outcome ? {references, outcome} : undefined;
}

export function serializeGlobalResolutionPlan(input: {plan: GlobalResolutionPlan; capabilities: readonly GlobalResolutionCapability[]; executors?: readonly SerializedExecutorRequirement[]}): SerializedGlobalResolutionPlan {
  const validation = validateGlobalResolutionPlan(input.plan);
  if (!validation.valid) throw new Error(`global_resolution_plan_not_serializable:${validation.errors.map((error) => error.code).join(",")}`);
  const catalog = new Map(input.capabilities.map((capability) => [capability.id, capability]));
  const requiredCapabilities = unique(input.plan.requiredCapabilities);
  const effectiveCapabilities = unique(input.plan.operations.flatMap((operation) => {
    const capability = capabilityForOperation(operation);
    return capability ? [capability] : [];
  }));
  const capabilityRequirements = effectiveCapabilities.map((id) => {
    const capability = catalog.get(id);
    if (!capability || !SUPPORT.has(capability.support)) throw new Error(`global_resolution_checkpoint_capability_unknown:${id}`);
    return {id, support: capability.support};
  });
  for (const operation of input.plan.operations) {
    const capability = capabilityForOperation(operation);
    if (capability && !catalog.has(capability)) throw new Error(`global_resolution_checkpoint_capability_unknown:${capability}`);
  }
  const executorRequirements = [...(input.executors ?? [])]
    .filter((executor) => effectiveCapabilities.includes(executor.capability))
    .map((executor) => ({...executor}))
    .sort((left, right) => `${left.capability}:${left.executorId}`.localeCompare(`${right.capability}:${right.executorId}`));
  const serialized: SerializedGlobalResolutionPlan = {
    schemaVersion: 1,
    planId: input.plan.id,
    caseId: input.plan.caseId,
    caseVersion: input.plan.caseVersion,
    producer: input.plan.producer,
    originalOperation: input.plan.originalOperation,
    operations: clone(input.plan.operations),
    status: input.plan.status,
    structurallyValid: input.plan.structurallyValid,
    executable: input.plan.executable,
    blockers: clone(input.plan.blockers),
    warnings: clone(input.plan.warnings),
    assumptions: clone(input.plan.assumptions),
    policy: clone(input.plan.policy),
    requiredCapabilities,
    capabilityRequirements,
    executorRequirements,
    planFingerprint: input.plan.fingerprint,
    idempotencyKey: input.plan.idempotencyKey,
  };
  const checked = validateSerializedGlobalResolutionPlan(serialized, input.capabilities, input.plan.caseId, input.plan.caseVersion, input.plan.producer);
  if (!checked.ok) throw new Error(`global_resolution_plan_serialization_invalid:${checked.reasons.join(",")}`);
  return clone(serialized);
}

export function validateSerializedGlobalResolutionPlan(value: unknown, capabilities?: readonly GlobalResolutionCapability[], expectedCaseId?: string, expectedCaseVersion?: number, expectedProducer?: string): CheckpointParseResult<SerializedGlobalResolutionPlan> {
  const reasons: string[] = [];
  if (!object(value) || value.schemaVersion !== 1) return {ok: false, reasons: ["serialized_plan_schema_invalid"]};
  if (!text(value.planId) || !text(value.caseId) || !Number.isInteger(value.caseVersion) || !text(value.producer) || !text(value.originalOperation) || !fingerprint(value.planFingerprint) || !text(value.idempotencyKey)) reasons.push("serialized_plan_header_invalid");
  if (expectedCaseId && value.caseId !== expectedCaseId) reasons.push("serialized_plan_case_mismatch");
  if (expectedCaseVersion !== undefined && value.caseVersion !== expectedCaseVersion) reasons.push("serialized_plan_case_version_mismatch");
  if (expectedProducer && value.producer !== expectedProducer) reasons.push("serialized_plan_producer_mismatch");
  if (!Array.isArray(value.operations) || !Array.isArray(value.requiredCapabilities) || !Array.isArray(value.capabilityRequirements) || !Array.isArray(value.executorRequirements) || !Array.isArray(value.blockers) || !Array.isArray(value.warnings) || !Array.isArray(value.assumptions) || !object(value.policy)) reasons.push("serialized_plan_shape_invalid");
  if (reasons.length || !Array.isArray(value.operations) || !Array.isArray(value.requiredCapabilities) || !Array.isArray(value.capabilityRequirements) || !Array.isArray(value.executorRequirements)) return {ok: false, reasons};
  const operationIds = new Set<string>();
  const operationKeys = new Set<string>();
  for (const operation of value.operations) {
    const checked = validateEntityOperation(operation);
    if (!checked.valid) reasons.push("serialized_plan_operation_invalid");
    if (!object(operation) || !text(operation.id)) reasons.push("serialized_plan_operation_id_missing");
    else {
      if (operationIds.has(operation.id)) reasons.push("serialized_plan_operation_id_duplicate");
      operationIds.add(operation.id);
      if (typeof operation.idempotencyKey === "string") {
        if (operationKeys.has(operation.idempotencyKey)) reasons.push("serialized_plan_operation_idempotency_duplicate");
        operationKeys.add(operation.idempotencyKey);
      }
    }
  }
  for (const operation of value.operations) if (object(operation) && Array.isArray(operation.dependencyIds)) for (const dependencyId of operation.dependencyIds) if (typeof dependencyId !== "string" || !operationIds.has(dependencyId)) reasons.push("serialized_plan_dependency_missing");
  const capabilityIds = value.requiredCapabilities.filter(text);
  if (capabilityIds.length !== value.requiredCapabilities.length || unique(capabilityIds).length !== capabilityIds.length) reasons.push("serialized_plan_capabilities_invalid");
  const storedCapabilities = new Map<string, string>();
  for (const requirement of value.capabilityRequirements) {
    if (!object(requirement) || !text(requirement.id) || !SUPPORT.has(String(requirement.support))) reasons.push("serialized_plan_capability_requirement_invalid");
    else {
      if (storedCapabilities.has(requirement.id)) reasons.push("serialized_plan_capability_requirement_duplicate");
      storedCapabilities.set(requirement.id, String(requirement.support));
    }
  }
  const effectiveCapabilities = unique(value.operations.flatMap((operation) => {
    if (!validateEntityOperation(operation).valid) return [];
    const capability = capabilityForOperation(operation as import("../../entityOperations").EntityOperation);
    return capability ? [capability] : [];
  }));
  if (effectiveCapabilities.some((id) => !storedCapabilities.has(id)) || [...storedCapabilities].some(([id]) => !effectiveCapabilities.includes(id))) reasons.push("serialized_plan_capability_inventory_mismatch");
  if (capabilities) {
    const catalog = new Map(capabilities.map((capability) => [capability.id, capability]));
    for (const [id] of storedCapabilities) if (!catalog.has(id)) reasons.push("serialized_plan_capability_unknown");
    for (const operation of value.operations) {
      const capability = validateEntityOperation(operation).valid ? capabilityForOperation(operation as import("../../entityOperations").EntityOperation) : undefined;
      if (capability && !catalog.has(capability)) reasons.push("serialized_plan_operation_capability_unknown");
    }
  }
  for (const executor of value.executorRequirements) if (!object(executor) || !text(executor.capability) || !text(executor.executorId) || !Number.isInteger(executor.version) || Number(executor.version) < 1 || !fingerprint(executor.manifestFingerprint) || !effectiveCapabilities.includes(executor.capability)) reasons.push("serialized_plan_executor_requirement_invalid");
  if (!isSerializableReviewValue(value) || findSensitiveKeys(value).length) reasons.push("serialized_plan_not_safe");
  return reasons.length ? {ok: false, reasons: unique(reasons)} : {ok: true, value: clone(value as unknown as SerializedGlobalResolutionPlan)};
}

export function serializeResolutionGraph(graph: ResolutionGraph, plan: GlobalResolutionPlan): SerializedResolutionGraph {
  const validation = validateResolutionGraph(graph);
  if (!validation.valid) throw new Error(`resolution_graph_not_serializable:${validation.errors.map((error) => error.code).join(",")}`);
  if (graph.caseId !== plan.caseId || graph.caseVersion !== plan.caseVersion || graph.producerId !== plan.producer) throw new Error("resolution_graph_plan_mismatch");
  const nodes: SerializedResolutionNode[] = graph.nodes.map((node) => ({
    id: node.id,
    operationId: node.operation.id,
    dependencyIds: [...node.dependencyIds],
    state: node.state,
    idempotencyKey: node.idempotencyKey,
    isResumeNode: node.isResumeNode,
    requiredForCompletion: node.requiredForCompletion,
    dependencyPolicy: node.dependencyPolicy ? clone(node.dependencyPolicy) : undefined,
    result: summarizeNodeResult(node.result),
    error: node.error ? {...node.error} : undefined,
  }));
  const base: Omit<SerializedResolutionGraph, "fingerprint"> = {
    schemaVersion: 1,
    graphId: graph.id,
    planId: plan.id,
    caseId: graph.caseId,
    caseVersion: graph.caseVersion,
    producer: graph.producerId,
    originalOperation: graph.originalOperation,
    nodes,
    state: graph.state,
    intentFingerprint: graph.fingerprint,
    idempotencyKey: graph.idempotencyKey,
    metadata: clone(graph.metadata),
  };
  return {...base, fingerprint: fingerprintSerializedResolutionGraph(base)};
}

export function validateSerializedResolutionGraph(value: unknown, plan: SerializedGlobalResolutionPlan): CheckpointParseResult<SerializedResolutionGraph> {
  const reasons: string[] = [];
  if (!object(value) || value.schemaVersion !== 1) return {ok: false, reasons: ["serialized_graph_schema_invalid"]};
  if (!text(value.graphId) || value.planId !== plan.planId || value.caseId !== plan.caseId || value.caseVersion !== plan.caseVersion || value.producer !== plan.producer || value.originalOperation !== plan.originalOperation || !fingerprint(value.intentFingerprint) || !fingerprint(value.fingerprint) || !text(value.idempotencyKey) || !object(value.metadata)) reasons.push("serialized_graph_header_invalid");
  if (!GRAPH_STATES.has(String(value.state)) || value.state === "invalid" || !Array.isArray(value.nodes)) reasons.push("serialized_graph_shape_invalid");
  if (reasons.length || !Array.isArray(value.nodes)) return {ok: false, reasons};
  const rawNodes = value.nodes;
  const operationIds = new Set(plan.operations.map((operation) => operation.id));
  const nodeIds = new Set<string>();
  for (const node of rawNodes) {
    if (!object(node) || !text(node.id) || !text(node.operationId) || !Array.isArray(node.dependencyIds) || !NODE_STATES.has(String(node.state)) || !text(node.idempotencyKey) || typeof node.isResumeNode !== "boolean" || typeof node.requiredForCompletion !== "boolean") {
      reasons.push("serialized_graph_node_invalid");
      continue;
    }
    if (nodeIds.has(node.id)) reasons.push("serialized_graph_node_duplicate");
    nodeIds.add(node.id);
    if (!operationIds.has(node.operationId)) reasons.push("serialized_graph_operation_missing");
  }
  for (const node of rawNodes) if (object(node) && Array.isArray(node.dependencyIds)) for (const dependencyId of node.dependencyIds) if (typeof dependencyId !== "string" || !nodeIds.has(dependencyId)) reasons.push("serialized_graph_edge_missing");
  const nodesById = new Map(rawNodes.filter(object).map((node) => [String(node.id), node]));
  const dependencyCheckedStates = new Set(["ready", "simulated", "executing", "succeeded", "failed", "compensated", "reconciliation_required"]);
  for (const node of rawNodes) {
    if (!object(node) || !dependencyCheckedStates.has(String(node.state)) || !Array.isArray(node.dependencyIds)) continue;
    for (const dependencyId of node.dependencyIds) {
      const dependency = nodesById.get(String(dependencyId));
      const acceptsSkipped = object(node.dependencyPolicy) && Array.isArray(node.dependencyPolicy.acceptedStates) && node.dependencyPolicy.acceptedStates.includes("skipped");
      if (!dependency || dependency.state !== "succeeded" && !(dependency.state === "skipped" && acceptsSkipped)) reasons.push(`serialized_graph_dependency_state_incoherent:${String(node.id)}:${String(dependencyId)}:${String(dependency?.state ?? "missing")}`);
    }
  }
  const hasReconciliation = rawNodes.some((node) => object(node) && node.state === "reconciliation_required");
  const hasFailure = rawNodes.some((node) => object(node) && node.state === "failed");
  if (hasReconciliation && value.state !== "reconciliation_required" || !hasReconciliation && hasFailure && value.state !== "failed") reasons.push("serialized_graph_aggregate_state_incoherent");
  if (nodeIds.size !== operationIds.size || [...operationIds].some((id) => !rawNodes.some((node) => object(node) && node.operationId === id))) reasons.push("serialized_graph_operation_inventory_mismatch");
  if (!isSerializableReviewValue(value) || findSensitiveKeys(value).length) reasons.push("serialized_graph_not_safe");
  if (!reasons.length) {
    const full = value as unknown as SerializedResolutionGraph;
    const {fingerprint: _fingerprint, ...base} = full;
    if (full.fingerprint !== fingerprintSerializedResolutionGraph(base)) reasons.push("serialized_graph_fingerprint_mismatch");
  }
  if (reasons.length) return {ok: false, reasons: unique(reasons)};
  const deserialized = deserializeResolutionGraph(value as unknown as SerializedResolutionGraph, plan, "1970-01-01T00:00:00.000Z", false);
  if (!deserialized.ok) return deserialized;
  return {ok: true, value: clone(value as unknown as SerializedResolutionGraph)};
}

export function deserializeResolutionGraph(serialized: SerializedResolutionGraph, plan: SerializedGlobalResolutionPlan, createdAt: string, validateSerialized = true): CheckpointParseResult<ResolutionGraph> {
  if (validateSerialized) {
    const checked = validateSerializedResolutionGraph(serialized, plan);
    if (!checked.ok) return checked;
  }
  const operations = new Map(plan.operations.map((operation) => [operation.id, operation]));
  const nodes: ResolutionGraph["nodes"] = [];
  for (const node of serialized.nodes) {
    const operation = operations.get(node.operationId);
    if (!operation) return {ok: false, reasons: ["serialized_graph_operation_missing"]};
    nodes.push({
      id: node.id,
      operation: clone(operation),
      dependencyIds: [...node.dependencyIds],
      state: node.state,
      evidence: clone(operation.evidence),
      risk: operation.risk,
      confidence: operation.confidence,
      preconditions: clone(operation.preconditions),
      postconditions: clone(operation.postconditions),
      result: node.result ? {references: clone(node.result.references), output: node.result.outcome ? {outcome: node.result.outcome} : undefined} : undefined,
      error: node.error ? {...node.error} : undefined,
      idempotencyKey: node.idempotencyKey,
      isResumeNode: node.isResumeNode,
      requiredForCompletion: node.requiredForCompletion,
      dependencyPolicy: node.dependencyPolicy ? clone(node.dependencyPolicy) : undefined,
    });
  }
  const graph: ResolutionGraph = {schemaVersion: 1, id: serialized.graphId, caseId: serialized.caseId, caseVersion: serialized.caseVersion, producerId: serialized.producer, originalOperation: serialized.originalOperation, nodes, state: serialized.state, fingerprint: serialized.intentFingerprint as ResolutionGraph["fingerprint"], idempotencyKey: serialized.idempotencyKey, createdAt, metadata: clone(serialized.metadata)};
  const validation = validateResolutionGraph(graph);
  return validation.valid ? {ok: true, value: graph} : {ok: false, reasons: unique(validation.errors.map((error) => `serialized_graph_${error.code}`))};
}

export function deserializeGlobalResolutionPlan(serialized: SerializedGlobalResolutionPlan, graph: ResolutionGraph, createdAt: string, capabilities?: readonly GlobalResolutionCapability[]): CheckpointParseResult<GlobalResolutionPlan> {
  const checked = validateSerializedGlobalResolutionPlan(serialized, capabilities, graph.caseId, graph.caseVersion, graph.producerId);
  if (!checked.ok) return checked;
  const plan: GlobalResolutionPlan = {
    schemaVersion: 1,
    id: serialized.planId,
    caseId: serialized.caseId,
    caseVersion: serialized.caseVersion,
    producer: serialized.producer,
    originalOperation: serialized.originalOperation,
    operations: clone(serialized.operations),
    graph,
    status: serialized.status,
    structurallyValid: serialized.structurallyValid,
    executable: serialized.executable,
    blockers: clone(serialized.blockers),
    warnings: clone(serialized.warnings),
    assumptions: clone(serialized.assumptions),
    policy: clone(serialized.policy),
    fingerprint: serialized.planFingerprint,
    idempotencyKey: serialized.idempotencyKey,
    createdAt,
    requiredCapabilities: [...serialized.requiredCapabilities],
  };
  const validation = validateGlobalResolutionPlan(plan);
  return validation.valid ? {ok: true, value: plan} : {ok: false, reasons: unique(validation.errors.map((error) => `serialized_plan_${error.code}`))};
}
