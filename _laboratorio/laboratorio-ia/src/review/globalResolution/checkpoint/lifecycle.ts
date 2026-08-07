import {deriveResolutionNodeReadiness, type ResolutionGraph, type ResolutionNode} from "../../resolutionGraph";
import type {ReviewCase, ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint, type UniversalPlanExecution} from "../../universal";
import {capabilityForOperation, type GlobalResolutionCapability} from "../capabilities";
import type {ExternalNewsResumeAdapterResult} from "../externalNewsResumeExecutor";
import type {PreparedExternalNewsResume, ReplaceProjectedReferenceResult, ResolvedEditorialReference} from "../fighterReferenceResolution";
import type {GlobalResolutionSimulationResult} from "../simulateGlobalResolutionPlan";
import type {GlobalResolutionPlan} from "../types";
import {validateFighterIdentityGuardEvidence, type FighterIdentityGuardAuthorization} from "../identityGuard";
import {identityCreationGuardForCreation, validateIdentityCreationAuthorization, validateIdentityCreationPreflight, type IdentityCreationPreflight} from "../identityCreationGuard";
import {createGlobalResolutionCheckpoint, evolveGlobalResolutionCheckpoint, summarizeGlobalResolutionExecution, summarizeGlobalResolutionSimulation} from "./checkpoint";
import type {GlobalResolutionCurrentCatalog} from "./catalog";
import {deserializeResolutionGraph} from "./serialization";
import type {
  GlobalResolutionCheckpoint,
  GlobalResolutionCheckpointHistoryEntry,
  GlobalResolutionCheckpointHistoryKind,
  GlobalResolutionCheckpointPhase,
  SerializedExecutionOperationSummary,
  SerializedExecutionSummary,
  SerializedReferenceResolutionSummary,
  SerializedResumeSummary,
} from "./types";

type LifecycleBase = {
  reviewCase: ReviewCase;
  plan: GlobalResolutionPlan;
  catalog: GlobalResolutionCurrentCatalog;
  now?: () => string;
};

export type CheckpointReconciliationProjection =
  | {kind: "resume"}
  | {kind: "reference_resolution"; entityType: string};

const clone = <T>(value: T): T => structuredClone(value);
const nowDefault = () => new Date().toISOString();
const successful = (node: ResolutionNode): boolean => node.state === "succeeded" || node.state === "compensated" || node.state === "skipped" && Boolean(node.dependencyPolicy?.acceptedStates.includes("skipped"));
const unique = (values: readonly string[]) => [...new Set(values)].sort();

function assertCatalog(catalog: GlobalResolutionCurrentCatalog, producer: string): void {
  if (!catalog.valid) throw new Error(`global_resolution_catalog_invalid:${catalog.errors.join(",")}`);
  if (!catalog.producers.some((entry) => entry.producer === producer)) throw new Error(`global_resolution_producer_unavailable:${producer}`);
}

function capabilities(catalog: GlobalResolutionCurrentCatalog): GlobalResolutionCapability[] {
  return catalog.capabilities.map((capability) => ({
    id: capability.id,
    support: capability.support,
    operationKinds: [...capability.operationKinds],
    description: "Current lifecycle catalog",
  }));
}

function executors(catalog: GlobalResolutionCurrentCatalog) {
  return catalog.executors.map(({capability, executorId, version, manifestFingerprint}) => ({capability, executorId, version, manifestFingerprint}));
}

function producerManifest(catalog: GlobalResolutionCurrentCatalog, producerId: string) {
  return catalog.producers.find((producer) => producer.producer === producerId)?.manifest;
}

function event(kind: GlobalResolutionCheckpointHistoryKind, status: string, occurredAt: string, identity: string, operationId?: string): GlobalResolutionCheckpointHistoryEntry {
  return {id: `global-resolution-history:${kind}:${identity}`, kind, operationId, status, occurredAt};
}

export function appendGlobalResolutionCheckpointHistory(history: readonly GlobalResolutionCheckpointHistoryEntry[], entry: GlobalResolutionCheckpointHistoryEntry): GlobalResolutionCheckpointHistoryEntry[] {
  if (history.some((current) => current.id === entry.id)) return clone([...history]);
  return [...history.map(clone), clone(entry)]
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id))
    .slice(-50);
}

function graphFrom(checkpoint: GlobalResolutionCheckpoint): ResolutionGraph {
  const restored = deserializeResolutionGraph(checkpoint.graph, checkpoint.plan, checkpoint.createdAt);
  if (!restored.ok) throw new Error(`global_resolution_checkpoint_graph_invalid:${restored.reasons.join(",")}`);
  return restored.value;
}

function unlock(graph: ResolutionGraph): ResolutionGraph {
  const working = clone(graph);
  for (const node of working.nodes) {
    if (node.state === "ready" && !deriveResolutionNodeReadiness(working, node).ready) node.state = "pending";
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of working.nodes) {
      if (node.state !== "pending") continue;
      const ready = deriveResolutionNodeReadiness(working, node).ready;
      if (ready) {
        node.state = "ready";
        changed = true;
      }
    }
  }
  return working;
}

function graphState(graph: ResolutionGraph, preferred?: ResolutionGraph["state"]): ResolutionGraph["state"] {
  if (graph.nodes.some((node) => node.state === "reconciliation_required")) return "reconciliation_required";
  if (graph.nodes.some((node) => node.state === "failed")) return "failed";
  if (graph.nodes.some((node) => node.state === "blocked")) return "blocked";
  const resume = graph.nodes.find((node) => node.isResumeNode);
  if (resume?.state === "succeeded" && graph.nodes.every((node) => !node.requiredForCompletion || successful(node))) return "succeeded";
  if (!resume && graph.nodes.length > 0 && graph.nodes.every((node) => !node.requiredForCompletion || successful(node))) return "succeeded";
  if (graph.nodes.some((node) => node.state === "executing")) return "executing";
  if (preferred === "simulated") return "simulated";
  if (graph.nodes.some((node) => node.state === "ready")) return "ready";
  return "draft";
}

function withState(graph: ResolutionGraph, preferred?: ResolutionGraph["state"], updatedAt?: string): ResolutionGraph {
  const unlocked = unlock(graph);
  return {...unlocked, state: graphState(unlocked, preferred), updatedAt};
}

function phaseFor(graph: ResolutionGraph, fallback: GlobalResolutionCheckpointPhase): GlobalResolutionCheckpointPhase {
  if (graph.state === "reconciliation_required") return "reconciliation_required";
  if (graph.state === "failed") return "failed";
  if (graph.state === "blocked") return "blocked";
  const resume = graph.nodes.find((node) => node.isResumeNode);
  if (resume?.state === "succeeded" && graph.state === "succeeded") return "completed";
  if (!resume && graph.state === "succeeded") return "completed";
  if (resume?.state === "ready") return "ready_to_resume";
  if (graph.nodes.some((node) => successful(node))) return "partially_executed";
  return fallback;
}

function evolve(input: LifecycleBase & {
  checkpoint: GlobalResolutionCheckpoint;
  graph: ResolutionGraph;
  phase: GlobalResolutionCheckpointPhase;
  history: readonly GlobalResolutionCheckpointHistoryEntry[];
  simulation?: GlobalResolutionCheckpoint["simulation"];
  execution?: GlobalResolutionCheckpoint["execution"];
  referenceResolution?: SerializedReferenceResolutionSummary;
  identityGuard?: GlobalResolutionCheckpoint["identityGuard"];
  resume?: SerializedResumeSummary;
}): GlobalResolutionCheckpoint {
  assertCatalog(input.catalog, input.plan.producer);
  return evolveGlobalResolutionCheckpoint({
    checkpoint: input.checkpoint,
    reviewCase: input.reviewCase,
    plan: input.plan,
    graph: input.graph,
    capabilities: capabilities(input.catalog),
    executors: executors(input.catalog),
    producerManifest: input.checkpoint.producerManifest,
    phase: input.phase,
    simulation: input.simulation,
    execution: input.execution,
    referenceResolution: input.referenceResolution,
    identityGuard: input.identityGuard ?? input.checkpoint.identityGuard,
    resume: input.resume,
    history: input.history,
    now: input.now,
  });
}

export function createCheckpointAfterPlanning(input: LifecycleBase): GlobalResolutionCheckpoint {
  assertCatalog(input.catalog, input.plan.producer);
  const occurredAt = (input.now ?? nowDefault)();
  return createGlobalResolutionCheckpoint({
    reviewCase: input.reviewCase,
    plan: input.plan,
    capabilities: capabilities(input.catalog),
    executors: executors(input.catalog),
    producerManifest: producerManifest(input.catalog, input.plan.producer),
    phase: "planned",
    history: [event("planned", "planned", occurredAt, input.plan.fingerprint)],
    now: () => occurredAt,
  });
}

function projectSimulationGraph(checkpoint: GlobalResolutionCheckpoint, simulation: GlobalResolutionSimulationResult, catalog: GlobalResolutionCurrentCatalog, updatedAt: string): ResolutionGraph {
  const graph = graphFrom(checkpoint);
  const support = new Map(catalog.capabilities.map((capability) => [capability.id, capability.support]));
  for (const result of simulation.nodeResults) {
    const node = graph.nodes.find((candidate) => candidate.id === result.nodeId || candidate.operation.id === result.nodeId);
    if (!node) throw new Error(`global_resolution_simulation_operation_missing:${result.nodeId}`);
    if (result.status === "blocked" || result.status === "contract_only") {
      node.state = "blocked";
      const blocker = result.blockers[0];
      node.error = {code: blocker?.code ?? "simulation_blocked", message: blocker?.message ?? result.explanation, retryable: true};
    }
  }
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const result of simulation.nodeResults) {
      const node = graph.nodes.find((candidate) => candidate.id === result.nodeId || candidate.operation.id === result.nodeId);
      if (!node || !["pending", "ready"].includes(node.state) || result.status !== "simulated") continue;
      const capability = capabilityForOperation(node.operation);
      const dependenciesSucceeded = node.dependencyIds.every((dependencyId) => {
        const dependency = graph.nodes.find((candidate) => candidate.id === dependencyId);
        return Boolean(dependency && successful(dependency));
      });
      if (capability && capability !== "resolve_identity:fighter" && support.get(capability) !== "executable" && dependenciesSucceeded) {
        node.state = "succeeded";
        node.result = {output: {outcome: result.decision ?? "simulated"}};
        progressed = true;
      }
    }
  }
  return withState(graph, simulation.simulatable ? "simulated" : undefined, updatedAt);
}

export function updateCheckpointAfterSimulation(input: LifecycleBase & {
  checkpoint: GlobalResolutionCheckpoint;
  simulation: GlobalResolutionSimulationResult;
}): GlobalResolutionCheckpoint {
  if (input.simulation.planId !== input.plan.id || input.simulation.intentFingerprint !== input.plan.fingerprint) throw new Error("global_resolution_simulation_binding_mismatch");
  const occurredAt = (input.now ?? nowDefault)();
  const simulation = summarizeGlobalResolutionSimulation(input.simulation, occurredAt);
  if (input.checkpoint.simulation?.resultFingerprint === simulation.resultFingerprint) return clone(input.checkpoint);
  const graph = projectSimulationGraph(input.checkpoint, input.simulation, input.catalog, occurredAt);
  const resumeReady = graph.nodes.some((node) => node.isResumeNode && node.state === "ready");
  const phase: GlobalResolutionCheckpointPhase = input.simulation.simulatable ? resumeReady ? "ready_to_resume" : "simulated" : "blocked";
  const history = appendGlobalResolutionCheckpointHistory(input.checkpoint.history, event("simulated", phase, occurredAt, simulation.resultFingerprint));
  return evolve({...input, graph, phase, simulation, execution: input.checkpoint.execution, referenceResolution: input.checkpoint.referenceResolution, resume: input.checkpoint.resume, history});
}

export function markCheckpointExecutionStarted(input: LifecycleBase & {
  checkpoint: GlobalResolutionCheckpoint;
  operationId: string;
  idempotencyKey: string;
  startedAt: string;
  resume?: boolean;
}): GlobalResolutionCheckpoint {
  const kind: GlobalResolutionCheckpointHistoryKind = input.resume ? "resume_started" : "execution_started";
  const historyEntry = event(kind, "executing", input.startedAt, input.idempotencyKey, input.operationId);
  if (input.checkpoint.history.some((entry) => entry.id === historyEntry.id)) return clone(input.checkpoint);
  const graph = graphFrom(input.checkpoint);
  const node = graph.nodes.find((candidate) => candidate.operation.id === input.operationId);
  if (!node || node.state !== "ready" || Boolean(input.resume) !== node.isResumeNode) throw new Error("global_resolution_execution_start_not_ready");
  if (node.operation.kind === "create_entity") {
    const guard = validateIdentityCreationAuthorization(input.checkpoint.identityGuard, {plan: input.plan, creationOperationId: node.operation.id});
    const prefix = node.operation.entityType === "luchador" ? "fighter_identity_guard_required" : "identity_guard_required";
    if (!guard.valid) throw new Error(`${prefix}:${guard.reasonCode}`);
  }
  node.state = "executing";
  const projected = withState(graph, undefined, input.startedAt);
  const history = appendGlobalResolutionCheckpointHistory(input.checkpoint.history, historyEntry);
  return evolve({...input, graph: projected, phase: "partially_executed", simulation: input.checkpoint.simulation, execution: input.checkpoint.execution, referenceResolution: input.checkpoint.referenceResolution, resume: input.checkpoint.resume, history});
}

function executionStatus(operations: readonly SerializedExecutionOperationSummary[], fallback: SerializedExecutionSummary["status"]): SerializedExecutionSummary["status"] {
  if (operations.some((operation) => operation.status === "reconciliation_required")) return "reconciliation_required";
  if (operations.some((operation) => operation.status === "failed")) return "failed";
  if (operations.some((operation) => operation.status === "blocked")) return "blocked";
  if (operations.length && operations.every((operation) => operation.status === "succeeded")) return "succeeded";
  return fallback;
}

function mergeExecution(previous: SerializedExecutionSummary | undefined, current: SerializedExecutionSummary): SerializedExecutionSummary {
  const values = new Map<string, SerializedExecutionOperationSummary>();
  for (const operation of previous?.operations ?? []) values.set(`${operation.operationId}:${operation.idempotencyKey}`, clone(operation));
  for (const operation of current.operations) values.set(`${operation.operationId}:${operation.idempotencyKey}`, clone(operation));
  const operations = [...values.values()].sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.operationId.localeCompare(right.operationId));
  const status = executionStatus(operations, current.status);
  const semantic = {planFingerprint: current.planFingerprint, simulationFingerprint: current.simulationFingerprint, status, operations: operations.map(({startedAt: _startedAt, completedAt: _completedAt, ...operation}) => operation)};
  return {
    ...semantic,
    operations,
    startedAt: previous?.startedAt && previous.startedAt < current.startedAt ? previous.startedAt : current.startedAt,
    completedAt: current.completedAt,
    resultFingerprint: computeUniversalFingerprint(semantic as unknown as ReviewJsonValue),
  };
}

function applyExecutionToGraph(graph: ResolutionGraph, summary: SerializedExecutionSummary, occurredAt: string): ResolutionGraph {
  for (const operation of summary.operations) {
    const node = graph.nodes.find((candidate) => candidate.operation.id === operation.operationId);
    if (!node) throw new Error(`global_resolution_execution_operation_missing:${operation.operationId}`);
    if (!["ready", "executing"].includes(node.state)) throw new Error(`global_resolution_execution_operation_not_ready:${operation.operationId}:${node.state}`);
    node.state = operation.status;
    node.result = operation.status === "succeeded" ? {
      references: operation.documentId ? [{type: node.operation.entityType, id: operation.documentId}] : [],
      output: operation.outcome ? {outcome: operation.outcome} : undefined,
    } : undefined;
    node.error = operation.error ? {...operation.error} : undefined;
  }
  return withState(graph, undefined, occurredAt);
}

export function updateCheckpointAfterExecution(input: LifecycleBase & {
  checkpoint: GlobalResolutionCheckpoint;
  execution: UniversalPlanExecution;
  operationIdsByEffectIndex?: Readonly<Record<number, string>>;
}): GlobalResolutionCheckpoint {
  for (const result of input.execution.results) {
    const output = result.output && typeof result.output === "object" && !Array.isArray(result.output) ? result.output : undefined;
    const reportedOperationId = output && typeof output.operationId === "string" ? output.operationId : undefined;
    const operationIds = [...new Set([
      ...(reportedOperationId ? [reportedOperationId] : []),
      ...result.effectIndexes.map((index) => input.operationIdsByEffectIndex?.[index]).filter((value): value is string => Boolean(value)),
    ])];
    for (const operationId of operationIds) {
      const operation = input.plan.operations.find((candidate) => candidate.id === operationId);
      if (operation?.kind === "create_entity") {
        const guard = validateIdentityCreationAuthorization(input.checkpoint.identityGuard, {plan: input.plan, creationOperationId: operationId});
        const prefix = operation.entityType === "luchador" ? "fighter_identity_guard_required" : "identity_guard_required";
        if (!guard.valid) throw new Error(`${prefix}:${guard.reasonCode}`);
      }
    }
  }
  const existingKeys = new Set(input.checkpoint.execution?.operations.map((operation) => operation.idempotencyKey) ?? []);
  const repeated = input.execution.results.length > 0 && input.execution.results.every((result) => existingKeys.has(result.idempotencyKey));
  if (repeated) return clone(input.checkpoint);
  const occurredAt = input.execution.completedAt;
  const previousAttempt = Math.max(0, ...(input.checkpoint.execution?.operations.map((operation) => operation.attempt) ?? []));
  const summary = summarizeGlobalResolutionExecution(input.execution, {
    attempt: previousAttempt + 1,
    operationIdsByEffectIndex: input.operationIdsByEffectIndex,
    checkpointPlanFingerprint: input.plan.fingerprint,
  });
  const graph = applyExecutionToGraph(graphFrom(input.checkpoint), summary, occurredAt);
  const phase = input.execution.status === "cancelled" ? "failed" : phaseFor(graph, input.execution.status === "blocked" ? "blocked" : input.execution.status === "failed" ? "failed" : "partially_executed");
  const kind = phase === "reconciliation_required" ? "reconciliation_required" : input.execution.status === "succeeded" ? "execution_succeeded" : "execution_failed";
  const history = appendGlobalResolutionCheckpointHistory(input.checkpoint.history, event(kind, input.execution.status, occurredAt, summary.resultFingerprint, summary.operations[0]?.operationId));
  return evolve({...input, graph, phase, simulation: input.checkpoint.simulation, execution: mergeExecution(input.checkpoint.execution, summary), referenceResolution: input.checkpoint.referenceResolution, resume: input.checkpoint.resume, history});
}

export function updateCheckpointAfterReferenceResolution(input: LifecycleBase & {
  checkpoint: GlobalResolutionCheckpoint;
  reference: ResolvedEditorialReference;
  replacement: ReplaceProjectedReferenceResult;
}): GlobalResolutionCheckpoint {
  if (!input.replacement.ok) throw new Error(`global_resolution_reference_resolution_invalid:${input.replacement.blocker.code}`);
  if (input.reference.documentId.startsWith("projected:") || !input.reference.validated || input.reference.sourceOperationId !== input.replacement.reference.sourceOperationId) throw new Error("global_resolution_reference_not_real");
  if (input.checkpoint.referenceResolution?.payloadFingerprint === input.replacement.fingerprint) return clone(input.checkpoint);
  const occurredAt = (input.now ?? nowDefault)();
  const graph = graphFrom(input.checkpoint);
  const source = graph.nodes.find((node) => node.operation.id === input.reference.sourceOperationId);
  if (!source) throw new Error("global_resolution_reference_source_missing");
  source.state = "succeeded";
  source.result = {references: [{type: input.reference.entityType, id: input.reference.documentId}], output: {outcome: input.reference.sourceResult}};
  const replacement = graph.nodes.find((node) => node.operation.kind === "replace_reference" && node.dependencyIds.includes(source.id));
  if (!replacement) throw new Error("global_resolution_reference_replacement_missing");
  replacement.state = "succeeded";
  replacement.result = {references: [{type: input.reference.entityType, id: input.reference.documentId}], output: {outcome: input.replacement.status}};
  const projected = withState(graph, undefined, occurredAt);
  const referenceResolution: SerializedReferenceResolutionSummary = {
    operationId: source.operation.id,
    replacementOperationId: replacement.operation.id,
    entityType: input.reference.entityType,
    documentId: input.reference.documentId,
    identityKey: input.reference.identityKey,
    outcome: input.reference.sourceResult,
    payloadFingerprint: input.replacement.fingerprint,
    snapshotFingerprint: input.checkpoint.snapshotFingerprint,
    resolvedAt: occurredAt,
  };
  const phase = phaseFor(projected, "partially_executed");
  const history = appendGlobalResolutionCheckpointHistory(input.checkpoint.history, event("reference_resolved", input.replacement.status, occurredAt, input.replacement.fingerprint, source.operation.id));
  return evolve({...input, graph: projected, phase, simulation: input.checkpoint.simulation, execution: input.checkpoint.execution, referenceResolution, resume: input.checkpoint.resume, history});
}

export function updateCheckpointAfterPureValidation(input: LifecycleBase & {
  checkpoint: GlobalResolutionCheckpoint;
  simulation: GlobalResolutionSimulationResult;
  operationId: string;
}): GlobalResolutionCheckpoint {
  if (input.simulation.planId !== input.plan.id || input.simulation.intentFingerprint !== input.plan.fingerprint) throw new Error("global_resolution_simulation_binding_mismatch");
  const graph = graphFrom(input.checkpoint);
  const node = graph.nodes.find((candidate) => candidate.operation.id === input.operationId);
  const result = input.simulation.nodeResults.find((candidate) => candidate.input.operationId === input.operationId || candidate.nodeId === node?.id);
  const capability = node ? capabilityForOperation(node.operation) : undefined;
  const support = capability ? input.catalog.capabilities.find((candidate) => candidate.id === capability)?.support : undefined;
  if (!node || node.isResumeNode || node.operation.kind !== "validate_entity" || support !== "simulatable") throw new Error("global_resolution_pure_validation_not_supported");
  if (node.state === "succeeded") return clone(input.checkpoint);
  if (node.state !== "ready" || !deriveResolutionNodeReadiness(graph, node).ready) throw new Error("global_resolution_pure_validation_not_ready");
  if (!result || result.status !== "simulated" || result.blockers.length) throw new Error(`global_resolution_pure_validation_blocked:${result?.blockers[0]?.code ?? "simulation_missing"}`);
  const occurredAt = (input.now ?? nowDefault)();
  node.state = "succeeded";
  node.result = {output: {outcome: result.decision ?? "validated"}};
  const projected = withState(graph, undefined, occurredAt);
  const phase = phaseFor(projected, "partially_executed");
  const identity = computeUniversalFingerprint({operationId: input.operationId, result: result.output ?? null} as unknown as ReviewJsonValue);
  const history = appendGlobalResolutionCheckpointHistory(input.checkpoint.history, event("checkpoint_updated", "pure_validation_succeeded", occurredAt, identity, input.operationId));
  return evolve({...input, graph: projected, phase, simulation: input.checkpoint.simulation, execution: input.checkpoint.execution, referenceResolution: input.checkpoint.referenceResolution, resume: input.checkpoint.resume, history});
}

export function updateCheckpointAfterFighterIdentityGuard(input: LifecycleBase & {
  checkpoint: GlobalResolutionCheckpoint;
  authorization: FighterIdentityGuardAuthorization;
}): GlobalResolutionCheckpoint {
  const authorization = input.authorization;
  const checked = validateFighterIdentityGuardEvidence(authorization, {plan: input.plan, creationOperationId: authorization.creationOperationId});
  if (!checked.valid) throw new Error(`fighter_identity_guard_invalid:${checked.reasonCode}`);
  if (input.checkpoint.identityGuard && "authorizationFingerprint" in input.checkpoint.identityGuard && input.checkpoint.identityGuard.authorizationFingerprint === authorization.authorizationFingerprint) return clone(input.checkpoint);
  const graph = graphFrom(input.checkpoint);
  const guard = graph.nodes.find((node) => node.operation.id === authorization.guardOperationId);
  const create = graph.nodes.find((node) => node.operation.id === authorization.creationOperationId);
  if (!guard || !create || !create.dependencyIds.includes(guard.id) || !["ready", "pending"].includes(guard.state)) throw new Error("fighter_identity_guard_graph_invalid");
  const occurredAt = authorization.authorizedAt;
  if (authorization.decision === "create_new") {
    if (authorization.discoveryStatus !== "complete") throw new Error("fighter_identity_guard_discovery_incomplete");
    guard.state = "succeeded";
    guard.result = {output: {outcome: "create_new", authorizationFingerprint: authorization.authorizationFingerprint}};
  } else if (authorization.decision === "reuse_existing" && authorization.resolvedEntityId) {
    guard.state = "succeeded";
    guard.result = {references: [{type: "luchador", id: authorization.resolvedEntityId}], output: {outcome: "reuse_existing", authorizationFingerprint: authorization.authorizationFingerprint}};
    create.state = "succeeded";
    create.result = {references: [{type: "luchador", id: authorization.resolvedEntityId}], output: {outcome: "reused_existing"}};
  } else {
    guard.state = "blocked";
    guard.error = {code: authorization.reasonCode, message: "La identidad del luchador no permite crear.", retryable: authorization.reasonCode !== "existing_identity"};
    create.state = "blocked";
    create.error = {code: authorization.reasonCode, message: "Creación bloqueada por el guard de identidad.", retryable: authorization.reasonCode !== "existing_identity"};
  }
  const projected = withState(graph, undefined, occurredAt);
  const phase = phaseFor(projected, authorization.decision === "create_new" ? "partially_executed" : "blocked");
  const history = appendGlobalResolutionCheckpointHistory(input.checkpoint.history, event("checkpoint_updated", authorization.reasonCode, occurredAt, authorization.authorizationFingerprint, guard.operation.id));
  return evolve({...input, graph: projected, phase, simulation: input.checkpoint.simulation, execution: input.checkpoint.execution, referenceResolution: input.checkpoint.referenceResolution, identityGuard: authorization, resume: input.checkpoint.resume, history});
}

/** Projects a compact AU6 preflight into the graph. Reuse and create remain mutually exclusive. */
export function updateCheckpointAfterIdentityCreationPreflight(input: LifecycleBase & {
  checkpoint: GlobalResolutionCheckpoint;
  preflight: IdentityCreationPreflight;
}): GlobalResolutionCheckpoint {
  const checked = validateIdentityCreationPreflight(input.preflight, {plan: input.plan, creationOperationId: input.preflight.operationId});
  if (!checked.valid && input.preflight.state !== checked.reasonCode) throw new Error(`identity_creation_preflight_invalid:${checked.reasonCode}`);
  if (input.checkpoint.identityGuard && "guardFingerprint" in input.checkpoint.identityGuard && input.checkpoint.identityGuard.guardFingerprint === input.preflight.guardFingerprint) return clone(input.checkpoint);
  const graph = graphFrom(input.checkpoint);
  const guardOperation = identityCreationGuardForCreation(input.plan.operations, input.preflight.operationId);
  const guard = guardOperation && graph.nodes.find((node) => node.operation.id === guardOperation.id);
  const create = graph.nodes.find((node) => node.operation.id === input.preflight.operationId);
  if (!guard || !create || !create.dependencyIds.includes(guard.id) || !["ready", "pending"].includes(guard.state)) throw new Error("identity_creation_preflight_graph_invalid");
  const occurredAt = input.preflight.authorizedAt;
  if (input.preflight.state === "safe_to_create") {
    guard.state = "succeeded";
    guard.result = {output: {outcome: "create_new", guardFingerprint: input.preflight.guardFingerprint}};
  } else if (input.preflight.state === "safe_to_reuse" && input.preflight.resolution.candidateId) {
    guard.state = "succeeded";
    guard.result = {references: [{type: create.operation.entityType, id: input.preflight.resolution.candidateId}], output: {outcome: "reuse_existing", guardFingerprint: input.preflight.guardFingerprint}};
    create.state = "succeeded";
    create.result = {references: [{type: create.operation.entityType, id: input.preflight.resolution.candidateId}], output: {outcome: "reused_existing"}};
  } else {
    guard.state = "blocked";
    guard.error = {code: input.preflight.state, message: "La identidad no permite crear.", retryable: true};
    create.state = "blocked";
    create.error = {code: input.preflight.state, message: "Creación bloqueada por identity preflight.", retryable: true};
  }
  const projected = withState(graph, undefined, occurredAt);
  const phase = phaseFor(projected, input.preflight.state === "safe_to_create" ? "partially_executed" : "blocked");
  const history = appendGlobalResolutionCheckpointHistory(input.checkpoint.history, event("checkpoint_updated", input.preflight.state, occurredAt, input.preflight.guardFingerprint, guard.operation.id));
  return evolve({...input, graph: projected, phase, simulation: input.checkpoint.simulation, execution: input.checkpoint.execution, referenceResolution: input.checkpoint.referenceResolution, identityGuard: input.preflight, resume: input.checkpoint.resume, history});
}

function resumeSummary(prepared: PreparedExternalNewsResume): SerializedResumeSummary {
  const operationId = prepared.projectedGraph.nodes.find((node) => node.isResumeNode)?.operation.id ?? prepared.operation;
  return {
    operationId,
    planId: prepared.planId,
    planFingerprint: prepared.planFingerprint,
    previewFingerprint: prepared.previewFingerprint,
    payloadFingerprint: computeUniversalFingerprint(prepared.payload as unknown as ReviewJsonValue),
    snapshotFingerprint: prepared.snapshotFingerprint,
    referenceIds: unique(prepared.appliedReferences.map((reference) => reference.documentId)),
    validation: {valid: prepared.validation.valid, blockerCodes: unique(prepared.blockers.map((blocker) => blocker.code))},
    preparedAt: prepared.generatedAt,
  };
}

export function updateCheckpointAfterResumePreparation(input: LifecycleBase & {
  checkpoint: GlobalResolutionCheckpoint;
  prepared: PreparedExternalNewsResume;
}): GlobalResolutionCheckpoint {
  if (input.prepared.caseId !== input.reviewCase.id || input.prepared.caseVersion !== input.reviewCase.version || input.prepared.planId !== input.plan.id || input.prepared.planFingerprint !== input.plan.fingerprint || input.prepared.snapshotFingerprint !== input.checkpoint.snapshotFingerprint) throw new Error("global_resolution_resume_preparation_binding_mismatch");
  const resume = resumeSummary(input.prepared);
  if (input.checkpoint.resume?.previewFingerprint === resume.previewFingerprint) return clone(input.checkpoint);
  const graph = clone(input.prepared.projectedGraph);
  const phase: GlobalResolutionCheckpointPhase = input.prepared.ready && input.prepared.validation.valid ? "ready_to_resume" : "blocked";
  const occurredAt = input.prepared.generatedAt;
  const history = appendGlobalResolutionCheckpointHistory(input.checkpoint.history, event("resume_prepared", phase, occurredAt, resume.previewFingerprint, resume.operationId));
  return evolve({...input, graph, phase, simulation: input.checkpoint.simulation, execution: input.checkpoint.execution, referenceResolution: input.checkpoint.referenceResolution, resume, history});
}

function resumeOperation(result: ExternalNewsResumeAdapterResult, operationId: string, capability: string, attempt: number): SerializedExecutionOperationSummary {
  const status = result.outcome === "resumed" || result.outcome === "already_resumed" ? "succeeded" : result.outcome === "blocked" ? "blocked" : result.outcome === "reconciliation_required" ? "reconciliation_required" : "failed";
  return {
    operationId,
    capability,
    status,
    attempt,
    idempotencyKey: result.idempotencyKey,
    documentId: result.draftId ?? result.documentId,
    outcome: result.outcome,
    startedAt: result.completedAt,
    completedAt: result.completedAt,
    error: result.error,
    reconciliation: result.outcome === "reconciliation_required" ? {
      reason: typeof result.reconciliation?.reason === "string" ? result.reconciliation.reason : result.error?.message,
      possibleDraftId: result.draftId ?? result.documentId,
      payloadFingerprint: typeof result.reconciliation?.payloadFingerprint === "string" ? result.reconciliation.payloadFingerprint : undefined,
    } : undefined,
  };
}

export function updateCheckpointAfterResumeExecution(input: LifecycleBase & {
  checkpoint: GlobalResolutionCheckpoint;
  result: ExternalNewsResumeAdapterResult;
}): GlobalResolutionCheckpoint {
  if (input.result.caseId !== input.reviewCase.id || input.result.planId !== input.plan.id || input.result.planFingerprint !== input.plan.fingerprint || input.result.previewFingerprint !== input.checkpoint.resume?.previewFingerprint) throw new Error("global_resolution_resume_result_binding_mismatch");
  if (input.checkpoint.execution?.operations.some((operation) => operation.idempotencyKey === input.result.idempotencyKey && operation.outcome === input.result.outcome)) return clone(input.checkpoint);
  if (input.result.caseVersion !== input.checkpoint.storedAtCaseVersion) throw new Error("global_resolution_resume_result_binding_mismatch");
  const resumeNode = input.result.projectedGraph.nodes.find((node) => node.isResumeNode);
  if (!resumeNode) throw new Error("global_resolution_resume_node_missing");
  const attempt = Math.max(0, ...(input.checkpoint.execution?.operations.map((operation) => operation.attempt) ?? [])) + 1;
  const operation = resumeOperation(input.result, resumeNode.operation.id, capabilityForOperation(resumeNode.operation) ?? resumeNode.operation.requiredCapability ?? "capability:unknown", attempt);
  const semantic = {planFingerprint: input.plan.fingerprint, simulationFingerprint: input.checkpoint.execution?.simulationFingerprint ?? input.checkpoint.simulation?.resultFingerprint ?? input.plan.fingerprint, status: executionStatus([operation], operation.status === "succeeded" ? "succeeded" : operation.status), operations: [{...operation, startedAt: undefined, completedAt: undefined}]};
  const current: SerializedExecutionSummary = {
    planFingerprint: semantic.planFingerprint,
    simulationFingerprint: semantic.simulationFingerprint,
    status: semantic.status,
    operations: [operation],
    startedAt: operation.startedAt,
    completedAt: operation.completedAt,
    resultFingerprint: computeUniversalFingerprint({planFingerprint: semantic.planFingerprint, simulationFingerprint: semantic.simulationFingerprint, status: semantic.status, operations: [Object.fromEntries(Object.entries(operation).filter(([key]) => key !== "startedAt" && key !== "completedAt"))]} as unknown as ReviewJsonValue),
  };
  const execution = mergeExecution(input.checkpoint.execution, current);
  const safeCompletion = ["resumed", "already_resumed"].includes(input.result.outcome) && input.result.projectedGraph.state === "succeeded" && Boolean(input.result.draftId ?? input.result.documentId);
  const phase: GlobalResolutionCheckpointPhase = input.result.outcome === "reconciliation_required" ? "reconciliation_required" : safeCompletion ? "completed" : input.result.outcome === "blocked" ? "blocked" : "failed";
  const graph = clone(input.result.projectedGraph);
  const previousResume = input.checkpoint.resume;
  if (!previousResume) throw new Error("global_resolution_resume_not_prepared");
  const resume: SerializedResumeSummary = {...previousResume, outcome: input.result.outcome, draftId: input.result.draftId, documentId: input.result.documentId, postValidationPassed: safeCompletion, completedAt: input.result.completedAt};
  const kind = phase === "completed" ? "resume_completed" : phase === "reconciliation_required" ? "reconciliation_required" : "execution_failed";
  const history = appendGlobalResolutionCheckpointHistory(input.checkpoint.history, event(kind, input.result.outcome, input.result.completedAt, `${input.result.idempotencyKey}:${input.result.outcome}`, resumeNode.operation.id));
  return evolve({...input, graph, phase, simulation: input.checkpoint.simulation, execution, referenceResolution: input.checkpoint.referenceResolution, resume, history});
}

export function markCheckpointStale(input: LifecycleBase & {checkpoint: GlobalResolutionCheckpoint; reasons: readonly string[]}): GlobalResolutionCheckpoint {
  const occurredAt = (input.now ?? nowDefault)();
  const identity = computeUniversalFingerprint(unique(input.reasons) as unknown as ReviewJsonValue);
  const history = appendGlobalResolutionCheckpointHistory(input.checkpoint.history, event("checkpoint_stale", unique(input.reasons).join(","), occurredAt, identity));
  return evolve({...input, graph: graphFrom(input.checkpoint), phase: "blocked", simulation: input.checkpoint.simulation, execution: input.checkpoint.execution, referenceResolution: input.checkpoint.referenceResolution, resume: input.checkpoint.resume, history});
}

export function markCheckpointReconciliationRequired(input: LifecycleBase & {checkpoint: GlobalResolutionCheckpoint; operationId: string; reason: string}): GlobalResolutionCheckpoint {
  const occurredAt = (input.now ?? nowDefault)();
  const graph = graphFrom(input.checkpoint);
  const node = graph.nodes.find((candidate) => candidate.operation.id === input.operationId);
  if (!node) throw new Error("global_resolution_reconciliation_operation_missing");
  node.state = "reconciliation_required";
  node.error = {code: "reconciliation_required", message: input.reason, retryable: false};
  const projected = withState(graph, undefined, occurredAt);
  const identity = computeUniversalFingerprint({operationId: input.operationId, reason: input.reason} as unknown as ReviewJsonValue);
  const history = appendGlobalResolutionCheckpointHistory(input.checkpoint.history, event("reconciliation_required", input.reason, occurredAt, identity, input.operationId));
  return evolve({...input, graph: projected, phase: "reconciliation_required", simulation: input.checkpoint.simulation, execution: input.checkpoint.execution, referenceResolution: input.checkpoint.referenceResolution, resume: input.checkpoint.resume, history});
}

export function applyCheckpointReconciliation(input: LifecycleBase & {
  checkpoint: GlobalResolutionCheckpoint;
  operationId: string;
  assessmentFingerprint: string;
  outcome: "confirmed_succeeded" | "confirmed_not_applied";
  capability: string;
  idempotencyKey: string;
  documentId?: string;
  identityKey?: string;
  operationOutcome?: string;
  payloadFingerprint?: string;
  projection?: CheckpointReconciliationProjection;
  provenance?: {
    inspectorId?: string;
    evidenceFingerprint?: string;
    assessmentFingerprint: string;
    appliedAction: "repair_checkpoint" | "enable_retry";
    reasonCodes: readonly string[];
  };
}): GlobalResolutionCheckpoint {
  const occurredAt = (input.now ?? nowDefault)();
  const graph = graphFrom(input.checkpoint);
  const node = graph.nodes.find((candidate) => candidate.operation.id === input.operationId);
  if (!node) throw new Error("global_resolution_reconciliation_operation_missing");
  if (input.outcome === "confirmed_succeeded" && node.state === "succeeded") return clone(input.checkpoint);
  if (input.outcome === "confirmed_not_applied" && node.state === "ready") return clone(input.checkpoint);
  if (!["reconciliation_required", "executing", "failed"].includes(node.state)) throw new Error("global_resolution_reconciliation_state_changed");

  const historyKind: GlobalResolutionCheckpointHistoryKind = input.outcome === "confirmed_succeeded"
    ? "reconciliation_confirmed_succeeded"
    : "reconciliation_confirmed_not_applied";
  let history = appendGlobalResolutionCheckpointHistory(input.checkpoint.history, event("reconciliation_started", "started", occurredAt, `${input.assessmentFingerprint}:started`, input.operationId));
  history = appendGlobalResolutionCheckpointHistory(history, event("reconciliation_evidence_collected", "evidence_collected", occurredAt, `${input.assessmentFingerprint}:evidence`, input.operationId));
  history = appendGlobalResolutionCheckpointHistory(history, event(historyKind, input.outcome, occurredAt, input.assessmentFingerprint, input.operationId));
  history = appendGlobalResolutionCheckpointHistory(history, event("reconciliation_applied", input.outcome, occurredAt, `${input.assessmentFingerprint}:applied`, input.operationId));
  if (input.provenance) history = history.map((entry) => ["reconciliation_evidence_collected", "reconciliation_applied"].includes(entry.kind) && entry.operationId === input.operationId ? {
    ...entry,
    inspectorId: input.provenance?.inspectorId,
    capability: input.capability,
    evidenceFingerprint: input.provenance?.evidenceFingerprint,
    assessmentFingerprint: input.provenance?.assessmentFingerprint,
    appliedAction: input.provenance?.appliedAction,
    reasonCodes: unique(input.provenance?.reasonCodes ?? []),
  } : entry);

  const execution = input.checkpoint.execution ? clone(input.checkpoint.execution) : undefined;
  const resume = input.checkpoint.resume ? clone(input.checkpoint.resume) : undefined;
  let referenceResolution = input.checkpoint.referenceResolution ? clone(input.checkpoint.referenceResolution) : undefined;

  if (input.outcome === "confirmed_succeeded") {
    if (!input.documentId || !input.operationOutcome) throw new Error("global_resolution_reconciliation_success_evidence_missing");
    node.state = "succeeded";
    node.error = undefined;
    node.result = {
      references: [{type: node.operation.entityType, id: input.documentId}],
      output: {outcome: input.operationOutcome},
    };
    if (execution) {
      const summary = execution.operations.find((item) => item.operationId === input.operationId && item.idempotencyKey === input.idempotencyKey)
        ?? execution.operations.find((item) => item.operationId === input.operationId);
      if (summary) {
        summary.status = "succeeded";
        summary.documentId = input.documentId;
        summary.outcome = input.operationOutcome;
        summary.error = undefined;
        summary.reconciliation = undefined;
        summary.completedAt = occurredAt;
      } else {
        execution.operations.push({
          operationId: input.operationId,
          capability: input.capability,
          status: "succeeded",
          attempt: Math.max(1, ...execution.operations.map((item) => item.attempt)),
          idempotencyKey: input.idempotencyKey,
          documentId: input.documentId,
          outcome: input.operationOutcome,
          startedAt: occurredAt,
          completedAt: occurredAt,
        });
      }
    }
    if (input.projection?.kind === "resume" && resume) {
      resume.outcome = input.operationOutcome === "already_resumed" ? "already_resumed" : "resumed";
      resume.draftId = input.documentId;
      resume.documentId = input.documentId;
      resume.postValidationPassed = true;
      resume.completedAt = occurredAt;
    }
    if (input.projection?.kind === "reference_resolution" && input.identityKey && input.payloadFingerprint) {
      referenceResolution = {
        operationId: input.operationId,
        entityType: input.projection.entityType,
        documentId: input.documentId,
        identityKey: input.identityKey,
        outcome: input.operationOutcome === "reused_existing" ? "reused_existing" : "created",
        payloadFingerprint: input.payloadFingerprint,
        snapshotFingerprint: input.checkpoint.snapshotFingerprint,
        resolvedAt: occurredAt,
      };
    }
  } else {
    node.state = "ready";
    node.error = undefined;
    node.result = undefined;
    if (execution) {
      const summary = [...execution.operations].reverse().find((item) => item.operationId === input.operationId);
      if (summary) {
        summary.status = "failed";
        summary.error = {code: "confirmed_not_applied", message: "La evidencia confirma que el efecto no se aplicó.", retryable: true};
        summary.reconciliation = undefined;
        summary.completedAt = occurredAt;
      }
    }
    if (input.projection?.kind === "resume" && resume) {
      resume.outcome = undefined;
      resume.draftId = undefined;
      resume.documentId = undefined;
      resume.postValidationPassed = undefined;
      resume.completedAt = undefined;
    }
  }

  if (execution) {
    const semantic = {
      planFingerprint: execution.planFingerprint,
      simulationFingerprint: execution.simulationFingerprint,
      status: input.outcome === "confirmed_succeeded" ? "succeeded" as const : "failed" as const,
      operations: execution.operations.map(({startedAt: _startedAt, completedAt: _completedAt, ...operation}) => operation),
    };
    execution.status = semantic.status;
    execution.completedAt = occurredAt;
    execution.resultFingerprint = computeUniversalFingerprint(semantic as unknown as ReviewJsonValue);
  }
  const projected = withState(graph, undefined, occurredAt);
  const phase = input.outcome === "confirmed_not_applied"
    ? phaseFor(projected, "partially_executed")
    : phaseFor(projected, "partially_executed");
  return evolve({...input, graph: projected, phase, simulation: input.checkpoint.simulation, execution, referenceResolution, resume, history});
}
