import {isSerializableReviewValue} from "../../cases/validateResolution";
import type {ReviewCase, ReviewJsonObject, ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint, type UniversalPlanExecution} from "../../universal";
import {findSensitiveKeys} from "../../universal/security";
import type {GlobalResolutionCapability} from "../capabilities";
import type {GlobalResolutionSimulationResult} from "../simulateGlobalResolutionPlan";
import type {GlobalResolutionPlan} from "../types";
import {fingerprintGlobalResolutionCase, fingerprintGlobalResolutionCheckpoint, fingerprintGlobalResolutionSnapshot} from "./fingerprints";
import {deserializeGlobalResolutionPlan, deserializeResolutionGraph, serializeGlobalResolutionPlan, serializeResolutionGraph, validateSerializedGlobalResolutionPlan, validateSerializedResolutionGraph, type CheckpointParseResult} from "./serialization";
import type {GlobalResolutionCheckpoint, GlobalResolutionCheckpointHistoryEntry, GlobalResolutionCheckpointPhase, SerializedExecutionOperationSummary, SerializedExecutionSummary, SerializedExecutorRequirement, SerializedReferenceResolutionSummary, SerializedResumeSummary, SerializedSimulationSummary} from "./types";
import type {ProducerCheckpointBinding} from "../producers/types";

const PHASES = new Set<GlobalResolutionCheckpointPhase>(["planned", "simulated", "partially_executed", "ready_to_resume", "completed", "blocked", "failed", "reconciliation_required"]);
const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const fingerprint = (value: unknown): value is string => typeof value === "string" && /^sha256-v1:[a-z0-9]+$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const unique = (values: readonly string[]) => [...new Set(values)].sort();
const nowDefault = () => new Date().toISOString();

function compactReconciliation(output: ReviewJsonObject | undefined): SerializedExecutionOperationSummary["reconciliation"] {
  const raw = object(output?.reconciliation) ? output.reconciliation : output;
  if (!raw) return undefined;
  const result = {
    reason: typeof raw.reason === "string" ? raw.reason : undefined,
    identityKey: typeof raw.identityKey === "string" ? raw.identityKey : undefined,
    entityId: typeof raw.entityId === "string" ? raw.entityId : undefined,
    possibleDraftId: typeof raw.possibleDraftId === "string" ? raw.possibleDraftId : undefined,
    payloadFingerprint: typeof raw.payloadFingerprint === "string" ? raw.payloadFingerprint : undefined,
  };
  return Object.values(result).some(Boolean) ? result : undefined;
}

export function summarizeGlobalResolutionSimulation(simulation: GlobalResolutionSimulationResult, generatedAt: string): SerializedSimulationSummary {
  const simulatedOperationIds = unique(simulation.nodeResults.filter((result) => result.status === "simulated").map((result) => result.nodeId));
  const blockedOperationIds = unique(simulation.nodeResults.filter((result) => result.status !== "simulated").map((result) => result.nodeId));
  const blockerCodes = unique(simulation.blockers.map((blocker) => blocker.code));
  const semantic = {inputFingerprint: simulation.intentFingerprint, simulatedOperationIds, blockedOperationIds, blockerCodes, finalReadiness: simulation.simulatable ? "ready" as const : "blocked" as const};
  return {generatedAt, ...semantic, resultFingerprint: computeUniversalFingerprint(semantic as unknown as ReviewJsonValue)};
}

export function summarizeGlobalResolutionExecution(execution: UniversalPlanExecution, options: {attempt?: number; operationIdsByEffectIndex?: Readonly<Record<number, string>>; checkpointPlanFingerprint?: string} = {}): SerializedExecutionSummary {
  const attempt = options.attempt ?? 1;
  const operations = execution.results.map((result): SerializedExecutionOperationSummary => {
    const output = object(result.output) ? result.output as ReviewJsonObject : undefined;
    const operationId = typeof output?.operationId === "string"
      ? output.operationId
      : result.effectIndexes.map((index) => options.operationIdsByEffectIndex?.[index]).find(text) ?? `universal-effect:${result.effectIndexes.join("-")}`;
    const documentId = result.references.find((reference) => text(reference.id))?.id;
    const outcome = typeof output?.outcome === "string" ? output.outcome : undefined;
    return {
      operationId,
      capability: result.capability,
      status: result.status,
      attempt,
      idempotencyKey: result.idempotencyKey,
      documentId,
      outcome,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      error: result.error ? {...result.error} : undefined,
      reconciliation: result.status === "reconciliation_required" ? compactReconciliation(output) : undefined,
    };
  });
  const planFingerprint = options.checkpointPlanFingerprint ?? execution.planFingerprint;
  const semantic = {planFingerprint, simulationFingerprint: execution.simulationFingerprint, status: execution.status, operations: operations.map(({startedAt: _startedAt, completedAt: _completedAt, ...operation}) => operation)};
  return {...semantic, operations, startedAt: execution.startedAt, completedAt: execution.completedAt, resultFingerprint: computeUniversalFingerprint(semantic as unknown as ReviewJsonValue)};
}

export function createGlobalResolutionCheckpoint(input: {
  reviewCase: ReviewCase;
  plan: GlobalResolutionPlan;
  graph?: import("../../resolutionGraph").ResolutionGraph;
  capabilities: readonly GlobalResolutionCapability[];
  executors?: readonly SerializedExecutorRequirement[];
  producerManifest?: ProducerCheckpointBinding;
  phase: GlobalResolutionCheckpointPhase;
  simulation?: SerializedSimulationSummary;
  execution?: SerializedExecutionSummary;
  referenceResolution?: SerializedReferenceResolutionSummary;
  identityGuard?: GlobalResolutionCheckpoint["identityGuard"];
  resume?: SerializedResumeSummary;
  history?: readonly GlobalResolutionCheckpointHistoryEntry[];
  now?: () => string;
}): GlobalResolutionCheckpoint {
  if (input.reviewCase.id !== input.plan.caseId || input.reviewCase.version !== input.plan.caseVersion) throw new Error("global_resolution_checkpoint_case_plan_mismatch");
  const graph = input.graph ?? input.plan.graph;
  const createdAt = (input.now ?? nowDefault)();
  const plan = serializeGlobalResolutionPlan({plan: input.plan, capabilities: input.capabilities, executors: input.executors});
  const serializedGraph = serializeResolutionGraph(graph, input.plan);
  const base: Omit<GlobalResolutionCheckpoint, "id" | "checkpointFingerprint" | "createdAt" | "updatedAt"> = {
    schemaVersion: 1,
    caseId: input.reviewCase.id,
    caseVersion: input.plan.caseVersion,
    storedAtCaseVersion: input.reviewCase.version,
    producer: input.plan.producer,
    producerManifest: input.producerManifest ? clone(input.producerManifest) : undefined,
    plan,
    graph: serializedGraph,
    planFingerprint: input.plan.fingerprint,
    graphFingerprint: serializedGraph.fingerprint,
    caseFingerprint: fingerprintGlobalResolutionCase(input.reviewCase),
    snapshotFingerprint: fingerprintGlobalResolutionSnapshot(input.reviewCase),
    phase: input.phase,
    simulation: input.simulation ? clone(input.simulation) : undefined,
    execution: input.execution ? clone(input.execution) : undefined,
    referenceResolution: input.referenceResolution ? clone(input.referenceResolution) : undefined,
    identityGuard: input.identityGuard ? clone(input.identityGuard) : undefined,
    resume: input.resume ? clone(input.resume) : undefined,
    history: clone([...(input.history ?? [])].slice(-50)),
  };
  const checkpointFingerprint = fingerprintGlobalResolutionCheckpoint(base);
  const checkpoint: GlobalResolutionCheckpoint = {...base, id: `global-resolution-checkpoint:${input.reviewCase.id}:${checkpointFingerprint.slice(-16)}`, checkpointFingerprint, createdAt, updatedAt: createdAt};
  const checked = validateGlobalResolutionCheckpoint(checkpoint);
  if (!checked.ok) throw new Error(`global_resolution_checkpoint_invalid:${checked.reasons.join(",")}`);
  return clone(checkpoint);
}

export function retargetGlobalResolutionCheckpoint(checkpoint: GlobalResolutionCheckpoint, reviewCase: ReviewCase, now: string): GlobalResolutionCheckpoint {
  if (checkpoint.caseId !== reviewCase.id) throw new Error("global_resolution_checkpoint_case_mismatch");
  const base: Omit<GlobalResolutionCheckpoint, "id" | "checkpointFingerprint" | "createdAt" | "updatedAt"> = {
    schemaVersion: 1,
    caseId: checkpoint.caseId,
    caseVersion: checkpoint.caseVersion,
    storedAtCaseVersion: reviewCase.version,
    producer: checkpoint.producer,
    producerManifest: checkpoint.producerManifest ? clone(checkpoint.producerManifest) : undefined,
    plan: clone(checkpoint.plan),
    graph: clone(checkpoint.graph),
    planFingerprint: checkpoint.planFingerprint,
    graphFingerprint: checkpoint.graphFingerprint,
    caseFingerprint: fingerprintGlobalResolutionCase(reviewCase),
    snapshotFingerprint: fingerprintGlobalResolutionSnapshot(reviewCase),
    phase: checkpoint.phase,
    simulation: checkpoint.simulation ? clone(checkpoint.simulation) : undefined,
    execution: checkpoint.execution ? clone(checkpoint.execution) : undefined,
    referenceResolution: checkpoint.referenceResolution ? clone(checkpoint.referenceResolution) : undefined,
    identityGuard: checkpoint.identityGuard ? clone(checkpoint.identityGuard) : undefined,
    resume: checkpoint.resume ? clone(checkpoint.resume) : undefined,
    history: clone(checkpoint.history.slice(-50)),
  };
  const checkpointFingerprint = fingerprintGlobalResolutionCheckpoint(base);
  return {...base, id: `global-resolution-checkpoint:${reviewCase.id}:${checkpointFingerprint.slice(-16)}`, checkpointFingerprint, createdAt: checkpoint.createdAt, updatedAt: now};
}

export function evolveGlobalResolutionCheckpoint(input: {
  checkpoint: GlobalResolutionCheckpoint;
  reviewCase: ReviewCase;
  plan: GlobalResolutionPlan;
  graph: import("../../resolutionGraph").ResolutionGraph;
  capabilities: readonly GlobalResolutionCapability[];
  executors?: readonly SerializedExecutorRequirement[];
  producerManifest?: ProducerCheckpointBinding;
  phase: GlobalResolutionCheckpointPhase;
  simulation?: SerializedSimulationSummary;
  execution?: SerializedExecutionSummary;
  referenceResolution?: SerializedReferenceResolutionSummary;
  identityGuard?: GlobalResolutionCheckpoint["identityGuard"];
  resume?: SerializedResumeSummary;
  history: readonly GlobalResolutionCheckpointHistoryEntry[];
  now?: () => string;
}): GlobalResolutionCheckpoint {
  const checkedCurrent = validateGlobalResolutionCheckpoint(input.checkpoint);
  if (!checkedCurrent.ok) throw new Error(`global_resolution_checkpoint_invalid:${checkedCurrent.reasons.join(",")}`);
  if (input.reviewCase.id !== input.checkpoint.caseId || input.plan.caseId !== input.checkpoint.caseId || input.plan.caseVersion !== input.checkpoint.caseVersion || input.plan.fingerprint !== input.checkpoint.planFingerprint) throw new Error("global_resolution_checkpoint_evolution_binding_mismatch");
  if (input.reviewCase.version < input.checkpoint.caseVersion) throw new Error("global_resolution_checkpoint_evolution_case_version_invalid");
  const updatedAt = (input.now ?? nowDefault)();
  const plan = serializeGlobalResolutionPlan({plan: input.plan, capabilities: input.capabilities, executors: input.executors});
  const graph = serializeResolutionGraph(input.graph, input.plan);
  const base: Omit<GlobalResolutionCheckpoint, "id" | "checkpointFingerprint" | "createdAt" | "updatedAt"> = {
    schemaVersion: 1,
    caseId: input.checkpoint.caseId,
    caseVersion: input.checkpoint.caseVersion,
    storedAtCaseVersion: input.reviewCase.version,
    producer: input.checkpoint.producer,
    producerManifest: input.producerManifest ? clone(input.producerManifest) : input.checkpoint.producerManifest ? clone(input.checkpoint.producerManifest) : undefined,
    plan,
    graph,
    planFingerprint: input.checkpoint.planFingerprint,
    graphFingerprint: graph.fingerprint,
    caseFingerprint: fingerprintGlobalResolutionCase(input.reviewCase),
    snapshotFingerprint: fingerprintGlobalResolutionSnapshot(input.reviewCase),
    phase: input.phase,
    simulation: input.simulation ? clone(input.simulation) : undefined,
    execution: input.execution ? clone(input.execution) : undefined,
    referenceResolution: input.referenceResolution ? clone(input.referenceResolution) : undefined,
    identityGuard: input.identityGuard ? clone(input.identityGuard) : undefined,
    resume: input.resume ? clone(input.resume) : undefined,
    history: clone([...input.history].slice(-50)),
  };
  const checkpointFingerprint = fingerprintGlobalResolutionCheckpoint(base);
  const next: GlobalResolutionCheckpoint = {...base, id: `global-resolution-checkpoint:${input.reviewCase.id}:${checkpointFingerprint.slice(-16)}`, checkpointFingerprint, createdAt: input.checkpoint.createdAt, updatedAt};
  const checked = validateGlobalResolutionCheckpoint(next);
  if (!checked.ok) throw new Error(`global_resolution_checkpoint_evolution_invalid:${checked.reasons.join(",")}`);
  return checked.value;
}

export function validateGlobalResolutionCheckpoint(value: unknown): CheckpointParseResult<GlobalResolutionCheckpoint> {
  const reasons: string[] = [];
  if (!object(value) || value.schemaVersion !== 1) return {ok: false, reasons: ["global_resolution_checkpoint_schema_invalid"]};
  if (!text(value.id) || !text(value.caseId) || !Number.isInteger(value.caseVersion) || !Number.isInteger(value.storedAtCaseVersion) || Number(value.storedAtCaseVersion) < Number(value.caseVersion) || !text(value.producer) || !fingerprint(value.planFingerprint) || !fingerprint(value.graphFingerprint) || !fingerprint(value.caseFingerprint) || !fingerprint(value.checkpointFingerprint) || value.snapshotFingerprint !== undefined && !fingerprint(value.snapshotFingerprint) || !text(value.createdAt) || !text(value.updatedAt) || !PHASES.has(value.phase as GlobalResolutionCheckpointPhase) || !Array.isArray(value.history)) reasons.push("global_resolution_checkpoint_header_invalid");
  if (value.producerManifest !== undefined && (!object(value.producerManifest) || !text(value.producerManifest.producerId) || !text(value.producerManifest.producerVersion) || !text(value.producerManifest.manifestVersion) || !fingerprint(value.producerManifest.manifestFingerprint) || !Array.isArray(value.producerManifest.capabilityVersions) || !Array.isArray(value.producerManifest.adapterIds))) reasons.push("global_resolution_checkpoint_producer_manifest_invalid");
  else if (object(value.producerManifest)) {
    const capabilityVersions = value.producerManifest.capabilityVersions;
    const adapterIds = value.producerManifest.adapterIds;
    if (value.producerManifest.producerId !== value.producer
      || !Array.isArray(capabilityVersions)
      || capabilityVersions.some((entry) => !object(entry) || !text(entry.capabilityId) || !text(entry.capabilityVersion))
      || !Array.isArray(adapterIds)
      || adapterIds.some((entry) => !text(entry))
      || new Set(adapterIds).size !== adapterIds.length) reasons.push("global_resolution_checkpoint_producer_manifest_binding_invalid");
  }
  const plan = validateSerializedGlobalResolutionPlan(value.plan, undefined, typeof value.caseId === "string" ? value.caseId : undefined, typeof value.caseVersion === "number" ? value.caseVersion : undefined, typeof value.producer === "string" ? value.producer : undefined);
  if (!plan.ok) reasons.push(...plan.reasons);
  if (plan.ok) {
    const graph = validateSerializedResolutionGraph(value.graph, plan.value);
    if (!graph.ok) reasons.push(...graph.reasons);
    else {
      if (value.planFingerprint !== plan.value.planFingerprint) reasons.push("global_resolution_checkpoint_plan_fingerprint_mismatch");
      if (value.graphFingerprint !== graph.value.fingerprint) reasons.push("global_resolution_checkpoint_graph_fingerprint_mismatch");
      const restoredGraph = deserializeResolutionGraph(graph.value, plan.value, String(value.createdAt));
      if (!restoredGraph.ok) reasons.push(...restoredGraph.reasons);
      else {
        const restoredPlan = deserializeGlobalResolutionPlan(plan.value, restoredGraph.value, String(value.createdAt));
        if (!restoredPlan.ok) reasons.push(...restoredPlan.reasons);
      }
    }
  }
  if (value.simulation !== undefined) {
    if (!object(value.simulation) || !text(value.simulation.generatedAt) || !fingerprint(value.simulation.inputFingerprint) || !Array.isArray(value.simulation.simulatedOperationIds) || !Array.isArray(value.simulation.blockedOperationIds) || !Array.isArray(value.simulation.blockerCodes) || !["ready", "blocked"].includes(String(value.simulation.finalReadiness)) || !fingerprint(value.simulation.resultFingerprint)) reasons.push("global_resolution_checkpoint_simulation_invalid");
    else {
      const semantic = {inputFingerprint: value.simulation.inputFingerprint, simulatedOperationIds: value.simulation.simulatedOperationIds, blockedOperationIds: value.simulation.blockedOperationIds, blockerCodes: value.simulation.blockerCodes, finalReadiness: value.simulation.finalReadiness};
      if (computeUniversalFingerprint(semantic as unknown as ReviewJsonValue) !== value.simulation.resultFingerprint || value.simulation.inputFingerprint !== value.planFingerprint) reasons.push("global_resolution_checkpoint_simulation_fingerprint_mismatch");
    }
  }
  if (value.execution !== undefined) {
    if (!object(value.execution) || !fingerprint(value.execution.planFingerprint) || !fingerprint(value.execution.simulationFingerprint) || !Array.isArray(value.execution.operations) || !text(value.execution.startedAt) || !text(value.execution.completedAt) || !fingerprint(value.execution.resultFingerprint) || !["succeeded", "blocked", "failed", "reconciliation_required", "cancelled"].includes(String(value.execution.status))) reasons.push("global_resolution_checkpoint_execution_invalid");
    else {
      const operationIds = plan.ok ? new Set(plan.value.operations.map((operation) => operation.id)) : new Set<string>();
      for (const operation of value.execution.operations) if (!object(operation) || !text(operation.operationId) || !operationIds.has(operation.operationId) || !text(operation.capability) || !["succeeded", "blocked", "failed", "reconciliation_required"].includes(String(operation.status)) || !Number.isInteger(operation.attempt) || Number(operation.attempt) < 1 || !text(operation.idempotencyKey) || !text(operation.startedAt) || !text(operation.completedAt)) reasons.push("global_resolution_checkpoint_execution_operation_invalid");
      const semanticOperations = value.execution.operations.map((operation) => object(operation) ? Object.fromEntries(Object.entries(operation).filter(([key]) => key !== "startedAt" && key !== "completedAt")) : operation);
      const semantic = {planFingerprint: value.execution.planFingerprint, simulationFingerprint: value.execution.simulationFingerprint, status: value.execution.status, operations: semanticOperations};
      if (computeUniversalFingerprint(semantic as unknown as ReviewJsonValue) !== value.execution.resultFingerprint || value.execution.planFingerprint !== value.planFingerprint) reasons.push("global_resolution_checkpoint_execution_fingerprint_mismatch");
    }
  }
  if (value.referenceResolution !== undefined) {
    const reference = value.referenceResolution;
    if (!object(reference) || !text(reference.operationId) || reference.replacementOperationId !== undefined && !text(reference.replacementOperationId) || !text(reference.entityType) || !text(reference.documentId) || String(reference.documentId).startsWith("projected:") || !text(reference.identityKey) || !["created", "reused_existing"].includes(String(reference.outcome)) || !fingerprint(reference.payloadFingerprint) || reference.snapshotFingerprint !== undefined && !fingerprint(reference.snapshotFingerprint) || !text(reference.resolvedAt)) reasons.push("global_resolution_checkpoint_reference_resolution_invalid");
  }
  if (value.identityGuard !== undefined) {
    const guard = value.identityGuard;
    const preflight = object(guard) && guard.version === "1.0.0" && "guardFingerprint" in guard;
    if (preflight) {
      if (!text(guard.operationId) || !fingerprint(guard.operationFingerprint) || !["fighter", "event", "organization", "weight_category"].includes(String(guard.entityType))
        || !fingerprint(guard.identityFingerprint) || !object(guard.discovery) || !["complete", "partial", "truncated", "unavailable", "cancelled"].includes(String(guard.discovery.status)) || !fingerprint(guard.discovery.resultFingerprint) || typeof guard.discovery.completeEnoughForCreation !== "boolean"
        || !object(guard.resolution) || !["reuse", "probable_match", "ambiguous", "create_new", "conflicting_identity", "insufficient_evidence", "unsupported"].includes(String(guard.resolution.status)) || !fingerprint(guard.resolution.resolutionFingerprint)
        || !["reuse_existing", "create_new", "blocked"].includes(String(guard.decision)) || !text(guard.state) || !Array.isArray(guard.blockers) || !Array.isArray(guard.warnings) || !fingerprint(guard.contextFingerprint) || !fingerprint(guard.guardFingerprint)
        || !object(guard.provenance) || !text(guard.provenance.producer) || !text(guard.provenance.caseId) || !Number.isInteger(guard.provenance.caseVersion) || !text(guard.provenance.discoveryAdapter)
        || !text(guard.authorizedAt) || !text(guard.expiresAt) || Date.parse(String(guard.authorizedAt)) >= Date.parse(String(guard.expiresAt))
        || guard.provenance.caseId !== value.caseId || guard.provenance.caseVersion !== value.caseVersion || guard.provenance.producer !== value.producer) reasons.push("global_resolution_checkpoint_identity_preflight_invalid");
    } else if (!object(guard) || guard.authorizationVersion !== "1.0.0" || guard.capability !== "resolve_identity:fighter"
      || !text(guard.guardOperationId) || !text(guard.creationOperationId) || !fingerprint(guard.planFingerprint)
      || !text(guard.caseId) || !Number.isInteger(guard.caseVersion) || !text(guard.producer) || !text(guard.source)
      || !["create_new", "reuse_existing", "ambiguous", "blocked"].includes(String(guard.decision))
      || !text(guard.reasonCode) || !fingerprint(guard.identityFingerprint) || !fingerprint(guard.creationPayloadFingerprint) || !fingerprint(guard.requestFingerprint)
      || !["complete", "partial", "truncated", "unavailable", "cancelled"].includes(String(guard.discoveryStatus))
      || !fingerprint(guard.discoveryResultFingerprint) || !Array.isArray(guard.candidateIds)
      || !Array.isArray(guard.strategyIds) || !Array.isArray(guard.warningCodes)
      || !fingerprint(guard.contextFingerprint) || !text(guard.authorizedAt) || !text(guard.expiresAt) || Date.parse(String(guard.authorizedAt)) >= Date.parse(String(guard.expiresAt)) || !fingerprint(guard.authorizationFingerprint)
      || guard.entityType !== undefined && guard.entityType !== "fighter"
      || guard.schemaType !== undefined && guard.schemaType !== "luchador"
      || guard.createCapability !== undefined && guard.createCapability !== "create:luchador"
      || guard.rulesVersion !== undefined && guard.rulesVersion !== "1.0.0"
      || guard.planId !== undefined && (!plan.ok || guard.planId !== plan.value.planId)
      || guard.nonce !== undefined && !text(guard.nonce)
      || guard.planFingerprint !== value.planFingerprint || guard.caseId !== value.caseId || guard.caseVersion !== value.caseVersion
      || guard.producer !== value.producer) reasons.push("global_resolution_checkpoint_identity_guard_invalid");
  }
  if (value.resume !== undefined) {
    const resume = value.resume;
    if (!object(resume) || !text(resume.operationId) || !text(resume.planId) || !fingerprint(resume.planFingerprint) || !fingerprint(resume.previewFingerprint) || !fingerprint(resume.payloadFingerprint) || !fingerprint(resume.snapshotFingerprint) || !Array.isArray(resume.referenceIds) || resume.referenceIds.some((id) => !text(id) || id.startsWith("projected:")) || !object(resume.validation) || typeof resume.validation.valid !== "boolean" || !Array.isArray(resume.validation.blockerCodes) || !text(resume.preparedAt) || resume.outcome !== undefined && !["resumed", "already_resumed", "blocked", "failed", "reconciliation_required"].includes(String(resume.outcome)) || resume.completedAt !== undefined && !text(resume.completedAt)) reasons.push("global_resolution_checkpoint_resume_invalid");
    else if (!plan.ok || resume.planId !== plan.value.planId || resume.planFingerprint !== value.planFingerprint || resume.snapshotFingerprint !== value.snapshotFingerprint) reasons.push("global_resolution_checkpoint_resume_binding_mismatch");
  }
  if (Array.isArray(value.history)) {
    const history = value.history;
    const historyKinds = ["planned", "simulated", "execution_started", "execution_succeeded", "execution_failed", "reference_resolved", "resume_prepared", "resume_started", "resume_completed", "reconciliation_required", "checkpoint_conflict", "checkpoint_recovered", "checkpoint_stale", "checkpoint_updated", "reconciliation_started", "reconciliation_evidence_collected", "reconciliation_confirmed_succeeded", "reconciliation_confirmed_not_applied", "reconciliation_conflicting", "reconciliation_insufficient", "reconciliation_applied", "reconciliation_already_applied"];
    const normalizedTimestamps = history.every((entry) => object(entry) && text(entry.occurredAt) && !Number.isNaN(Date.parse(entry.occurredAt)) && new Date(entry.occurredAt).toISOString() === entry.occurredAt);
    const chronological = history.every((entry, index) => index === 0 || !object(entry) || !object(history[index - 1]) || String(history[index - 1].occurredAt).localeCompare(String(entry.occurredAt)) <= 0);
    if (history.length > 50 || new Set(history.map((entry) => object(entry) ? entry.id : "")).size !== history.length || history.some((entry) => !object(entry) || !text(entry.id) || !historyKinds.includes(String(entry.kind)) || !text(entry.status) || !text(entry.occurredAt)) || !normalizedTimestamps || !chronological) reasons.push("global_resolution_checkpoint_history_invalid");
  }
  if (plan.ok && object(value.graph) && Array.isArray(value.graph.nodes)) {
    const hasReconciliation = value.graph.nodes.some((node) => object(node) && node.state === "reconciliation_required") || object(value.execution) && Array.isArray(value.execution.operations) && value.execution.operations.some((operation) => object(operation) && operation.status === "reconciliation_required");
    if (hasReconciliation && value.phase !== "reconciliation_required") reasons.push("global_resolution_checkpoint_reconciliation_phase_mismatch");
    if (value.phase === "reconciliation_required" && !hasReconciliation) reasons.push("global_resolution_checkpoint_reconciliation_missing");
    if (value.phase === "simulated" && value.simulation === undefined) reasons.push("global_resolution_checkpoint_simulation_missing");
    if (value.phase === "completed" && (value.graph.state !== "succeeded" || !object(value.execution) || value.execution.status !== "succeeded")) reasons.push("global_resolution_checkpoint_completion_invalid");
  }
  if (!isSerializableReviewValue(value) || findSensitiveKeys(value).length) reasons.push("global_resolution_checkpoint_not_safe");
  if (!reasons.length) {
    const checkpoint = value as unknown as GlobalResolutionCheckpoint;
    const {id: _id, checkpointFingerprint: _fingerprint, createdAt: _createdAt, updatedAt: _updatedAt, ...base} = checkpoint;
    const fingerprint = fingerprintGlobalResolutionCheckpoint(base);
    if (fingerprint !== checkpoint.checkpointFingerprint || checkpoint.id !== `global-resolution-checkpoint:${checkpoint.caseId}:${fingerprint.slice(-16)}`) reasons.push("global_resolution_checkpoint_fingerprint_mismatch");
  }
  return reasons.length ? {ok: false, reasons: unique(reasons)} : {ok: true, value: clone(value as unknown as GlobalResolutionCheckpoint)};
}
