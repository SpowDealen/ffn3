import {deriveResolutionNodeReadiness} from "../../resolutionGraph";
import type {ReviewCase} from "../../types";
import {capabilityForOperation, type GlobalResolutionCapability} from "../capabilities";
import {fingerprintGlobalResolutionCase, fingerprintGlobalResolutionSnapshot} from "./fingerprints";
import {deserializeGlobalResolutionPlan, deserializeResolutionGraph} from "./serialization";
import {validateGlobalResolutionCheckpoint} from "./checkpoint";
import type {GlobalResolutionCheckpoint, GlobalResolutionContinuation, GlobalResolutionRecoveryEnvironment, GlobalResolutionRecoveryResult, SerializedCapabilityRequirement} from "./types";

const unique = (values: readonly string[]) => [...new Set(values)].sort();

function capabilityCatalog(environment: GlobalResolutionRecoveryEnvironment): GlobalResolutionCapability[] {
  return environment.capabilities.map((capability) => ({id: capability.id, support: capability.support, operationKinds: ["find_entity", "create_entity", "update_entity", "reuse_entity", "merge_entities", "replace_reference", "remove_reference", "repair_relationship", "set_metadata", "replace_image", "validate_entity"], description: "Recovery environment"}));
}

function sameCapability(left: SerializedCapabilityRequirement, right: SerializedCapabilityRequirement | undefined): boolean {
  return Boolean(right && left.id === right.id && left.support === right.support);
}

function environmentStaleReasons(checkpoint: GlobalResolutionCheckpoint, environment: GlobalResolutionRecoveryEnvironment): string[] {
  const reasons: string[] = [];
  const capabilities = new Map(environment.capabilities.map((capability) => [capability.id, capability]));
  for (const required of checkpoint.plan.capabilityRequirements) {
    const current = capabilities.get(required.id);
    if (!current) reasons.push(`capability_missing:${required.id}`);
    else if (!sameCapability(required, current)) reasons.push(`capability_changed:${required.id}`);
  }
  const executors = new Map(environment.executors.map((executor) => [`${executor.capability}:${executor.executorId}`, executor]));
  for (const required of checkpoint.plan.executorRequirements) {
    const current = executors.get(`${required.capability}:${required.executorId}`);
    if (!current) reasons.push(`executor_missing:${required.executorId}`);
    else if (current.version !== required.version || current.manifestFingerprint !== required.manifestFingerprint) reasons.push(`executor_changed:${required.executorId}`);
  }
  return reasons;
}

function deriveContinuation(checkpoint: GlobalResolutionCheckpoint, graph: import("../../resolutionGraph").ResolutionGraph, environment: GlobalResolutionRecoveryEnvironment): GlobalResolutionContinuation {
  const capabilityMap = new Map(environment.capabilities.map((capability) => [capability.id, capability]));
  const executorCapabilities = new Set(environment.executors.map((executor) => executor.capability));
  const reconciliationOperationIds = unique(graph.nodes.filter((node) => node.state === "reconciliation_required").map((node) => node.operation.id));
  const completedOperationIds = unique(graph.nodes.filter((node) => ["succeeded", "skipped", "compensated"].includes(node.state)).map((node) => node.operation.id));
  const blockedOperationIds = unique(graph.nodes.filter((node) => ["blocked", "failed"].includes(node.state)).map((node) => node.operation.id));
  const nextReadyOperationIds = unique(graph.nodes.filter((node) => deriveResolutionNodeReadiness(graph, node).ready).map((node) => node.operation.id));
  const nextOperations = graph.nodes.filter((node) => nextReadyOperationIds.includes(node.operation.id));
  const activeExecutionPhase = ["planned", "simulated", "partially_executed", "ready_to_resume"].includes(checkpoint.phase);
  const canSimulate = reconciliationOperationIds.length === 0 && checkpoint.phase !== "completed" && checkpoint.plan.structurallyValid && checkpoint.plan.capabilityRequirements.every(({id}) => {
    const support = capabilityMap.get(id)?.support;
    return support === "simulatable" || support === "executable";
  });
  const executableNext = nextOperations.filter((node) => {
    const capability = capabilityForOperation(node.operation);
    return Boolean(capability && capabilityMap.get(capability)?.support === "executable" && executorCapabilities.has(capability));
  });
  const resumeNode = nextOperations.find((node) => node.isResumeNode);
  const resumeCapability = resumeNode ? capabilityForOperation(resumeNode.operation) : undefined;
  const canResumeProducer = reconciliationOperationIds.length === 0 && checkpoint.phase === "ready_to_resume" && Boolean(resumeNode && resumeCapability && capabilityMap.get(resumeCapability)?.support === "executable" && executorCapabilities.has(resumeCapability));
  const canExecute = reconciliationOperationIds.length === 0 && activeExecutionPhase && executableNext.length > 0;
  return {nextReadyOperationIds, blockedOperationIds, completedOperationIds, reconciliationOperationIds, canSimulate, canExecute, canResumeProducer, requiresAuthorization: canExecute || canResumeProducer};
}

export function recoverGlobalResolutionCheckpoint(reviewCase: ReviewCase, environment: GlobalResolutionRecoveryEnvironment): GlobalResolutionRecoveryResult {
  if (!reviewCase.globalResolution) return {status: "absent"};
  const checked = validateGlobalResolutionCheckpoint(reviewCase.globalResolution);
  if (!checked.ok) return {status: "invalid", reasons: checked.reasons};
  const checkpoint = checked.value;
  const staleReasons: string[] = [];
  if (checkpoint.caseId !== reviewCase.id) staleReasons.push("case_id_changed");
  if (checkpoint.storedAtCaseVersion !== reviewCase.version) staleReasons.push("case_version_changed");
  if (checkpoint.producer !== reviewCase.context.producer) staleReasons.push("producer_changed");
  if (checkpoint.caseFingerprint !== fingerprintGlobalResolutionCase(reviewCase)) staleReasons.push("case_fingerprint_changed");
  if (checkpoint.snapshotFingerprint !== fingerprintGlobalResolutionSnapshot(reviewCase)) staleReasons.push("snapshot_fingerprint_changed");
  const caseAlreadyResumed = ["resuming", "resumed"].includes(reviewCase.status) || reviewCase.resumeExecution?.status === "succeeded";
  if (caseAlreadyResumed && checkpoint.phase !== "completed") staleReasons.push("case_already_resumed");
  staleReasons.push(...environmentStaleReasons(checkpoint, environment));
  if (checkpoint.graph.nodes.some((node) => node.state === "executing")) staleReasons.push("execution_interrupted_after_reload");
  if (staleReasons.length) return {status: "stale", checkpoint, reasons: unique(staleReasons)};
  const catalog = capabilityCatalog(environment);
  const graph = deserializeResolutionGraph(checkpoint.graph, checkpoint.plan, checkpoint.createdAt);
  if (!graph.ok) return {status: "invalid", reasons: graph.reasons};
  const plan = deserializeGlobalResolutionPlan(checkpoint.plan, graph.value, checkpoint.createdAt, catalog);
  if (!plan.ok) return {status: "invalid", reasons: plan.reasons};
  return {status: "valid", checkpoint, graph: graph.value, plan: plan.value, continuation: deriveContinuation(checkpoint, graph.value, environment)};
}
