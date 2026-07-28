import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  createGlobalResolutionCheckpoint,
  deserializeGlobalResolutionPlan,
  deserializeResolutionGraph,
  fingerprintGlobalResolutionCheckpoint,
  fingerprintSerializedResolutionGraph,
  pilotCapabilityRegistry,
  recoverGlobalResolutionCheckpoint,
  serializeGlobalResolutionPlan,
  serializeResolutionGraph,
  simulateGlobalResolutionPlan,
  summarizeGlobalResolutionExecution,
  summarizeGlobalResolutionSimulation,
  validateGlobalResolutionCheckpoint,
  validateSerializedGlobalResolutionPlan,
  validateSerializedResolutionGraph,
  type GlobalResolutionCheckpoint,
  type GlobalResolutionRecoveryEnvironment,
  type SerializedResolutionGraph,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {buildGlobalResolutionPlan, type GlobalResolutionPlan, type PreparedEntityPlanningInput} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import type {OperationEvidence} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import type {ResolutionGraph} from "../_laboratorio/laboratorio-ia/src/review/resolutionGraph";
import {clearGlobalResolutionCheckpoint, getReviewCase, setGlobalResolutionCheckpoint, setReviewCaseRepositoryForTests, updateGlobalResolutionCheckpoint} from "../_laboratorio/laboratorio-ia/src/review/store/reviewStore";
import {migrateReviewCases} from "../_laboratorio/laboratorio-ia/src/review/store/migrations";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";
import type {UniversalPlanExecution} from "../_laboratorio/laboratorio-ia/src/review/universal";

const now = "2026-07-28T10:00:00.000Z";
const later = "2026-07-28T10:01:00.000Z";
const evidence: OperationEvidence[] = [{id: "evidence:au3", kind: "controlled", source: "test", confidence: .99, limitations: []}];
const capabilities = pilotCapabilityRegistry.list();
const executors = [
  {capability: "create:luchador", executorId: "global-resolution.create-luchador.v1", version: 1, manifestFingerprint: "sha256-v1:create"},
  {capability: "resume:external_news", executorId: "global-resolution.resume-external-news.v1", version: 1, manifestFingerprint: "sha256-v1:resume"},
];
const environment: GlobalResolutionRecoveryEnvironment = {capabilities: capabilities.map(({id, support}) => ({id, support})), executors};

class MemoryRepository {
  constructor(private cases: ReviewCase[] = []) {}
  load(): ReviewCase[] { return structuredClone(this.cases); }
  save(cases: readonly ReviewCase[]): void { this.cases = structuredClone([...cases]); }
  snapshot(): ReviewCase[] { return structuredClone(this.cases); }
}

function reviewCase(version = 1): ReviewCase {
  return {
    schemaVersion: 1,
    id: "case:au3:checkpoint",
    dedupeKey: "case:au3:checkpoint",
    module: "external.news",
    title: "AU3 checkpoint",
    status: "open",
    priority: "high",
    subject: {type: "external_news", id: "news:au3"},
    issues: [{id: "issue:fighter", kind: "missing_entity", valueKind: "fighter", fieldPath: "fighter", label: "Fighter", message: "Missing fighter", required: true, blocking: true}],
    resolutions: [{type: "create_entity", issueId: "issue:fighter", entityType: "fighter", draft: {name: "Ada Fighter", disciplineId: "discipline:boxing", organizationIds: ["organization:test"], identityKey: "fighter:ada"}}],
    context: {
      producer: "external_news",
      operation: "create_draft",
      sourceId: "source:au3",
      sourceName: "Controlled",
      sourceUrl: "https://example.test/au3",
      externalItemId: "news:au3",
      canonicalUrl: "https://example.test/au3",
      title: "AU3 checkpoint",
      createdAt: now,
      payloadSnapshot: {id: "news:au3", title: "AU3 checkpoint", excerpt: "Resumen", bodyText: "Contenido suficientemente largo y controlado.", canonicalUrl: "https://example.test/au3", publishedAt: now, image: {url: "https://example.test/image.jpg"}},
      analysisSnapshot: {analysis: {relevancia: "alta", disciplinaPrincipal: "Boxeo"}, resolved: {disciplina: {id: "discipline:boxing"}, organizacion: null, evento: null, luchadoresPrincipales: [], luchadoresSecundarios: []}},
    },
    createdAt: now,
    updatedAt: now,
    version,
    resumeAttempts: 0,
  };
}

function prepared(): PreparedEntityPlanningInput {
  return {issueId: "issue:fighter", entityType: "fighter", draft: {name: "Ada Fighter", disciplineId: "discipline:boxing", organizationIds: ["organization:test"], identityKey: "fighter:ada"}, identityKey: "fighter:ada", valid: true, evidence};
}

function planFor(reviewCaseValue = reviewCase()): GlobalResolutionPlan {
  const built = buildGlobalResolutionPlan({reviewCase: reviewCaseValue, preparedEntities: [prepared()], evidence: evidence.map((item) => ({...item, issueId: "issue:fighter"})), finalEntityType: "noticia", now: () => now});
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("fixture_plan_failed");
  return built.plan;
}

function checkpointFor(caseValue = reviewCase(), graph?: ResolutionGraph, phase: GlobalResolutionCheckpoint["phase"] = "planned"): GlobalResolutionCheckpoint {
  const plan = planFor(caseValue);
  return createGlobalResolutionCheckpoint({reviewCase: caseValue, plan, graph, capabilities, executors, phase, history: [{id: "history:planned", kind: "planned", status: "ready", occurredAt: now}], now: () => now});
}

function recomputeCheckpoint(value: GlobalResolutionCheckpoint): GlobalResolutionCheckpoint {
  const {id: _id, checkpointFingerprint: _fingerprint, createdAt, updatedAt, ...base} = value;
  const checkpointFingerprint = fingerprintGlobalResolutionCheckpoint(base);
  return {...base, id: `global-resolution-checkpoint:${value.caseId}:${checkpointFingerprint.slice(-16)}`, checkpointFingerprint, createdAt, updatedAt};
}

function recomputeGraph(value: SerializedResolutionGraph): SerializedResolutionGraph {
  const {fingerprint: _fingerprint, ...base} = value;
  return {...value, fingerprint: fingerprintSerializedResolutionGraph(base)};
}

function graphWithState(plan: GlobalResolutionPlan, target: "ready" | "reconciliation_required"): ResolutionGraph {
  const createNode = plan.graph.nodes.find((node) => node.operation.kind === "create_entity" && node.operation.entityType === "luchador");
  assert.ok(createNode);
  const dependencies = new Set<string>();
  const collectDependencies = (nodeId: string): void => {
    const node = plan.graph.nodes.find((candidate) => candidate.id === nodeId);
    for (const dependencyId of node?.dependencyIds ?? []) if (!dependencies.has(dependencyId)) {
      dependencies.add(dependencyId);
      collectDependencies(dependencyId);
    }
  };
  collectDependencies(createNode!.id);
  const nodes = plan.graph.nodes.map((node) => {
    if (node.id === createNode?.id) return {...node, state: target};
    if (dependencies.has(node.id)) return {...node, state: "succeeded" as const};
    return {...node, state: "pending" as const};
  });
  return {...plan.graph, nodes, state: target === "reconciliation_required" ? "reconciliation_required" : "ready"};
}

function testSerialization(): void {
  const caseValue = reviewCase();
  const plan = planFor(caseValue);
  const serializedPlan = serializeGlobalResolutionPlan({plan, capabilities, executors});
  const serializedGraph = serializeResolutionGraph(plan.graph, plan);
  const graph = deserializeResolutionGraph(serializedGraph, serializedPlan, now);
  assert.equal(graph.ok, true);
  if (!graph.ok) return;
  const restoredPlan = deserializeGlobalResolutionPlan(serializedPlan, graph.value, now, capabilities);
  assert.equal(restoredPlan.ok, true);
  if (!restoredPlan.ok) return;
  assert.deepEqual(serializeGlobalResolutionPlan({plan: restoredPlan.value, capabilities, executors}), serializedPlan);
  assert.deepEqual(serializeResolutionGraph(graph.value, restoredPlan.value), serializedGraph);
  const repeated = checkpointFor(caseValue);
  assert.deepEqual(repeated, checkpointFor(caseValue));
  const graphA = recomputeGraph({...serializedGraph, metadata: {z: 1, a: 2}});
  const graphB = recomputeGraph({...serializedGraph, metadata: {a: 2, z: 1}});
  assert.equal(graphA.fingerprint, graphB.fingerprint);
  const resultGraph: ResolutionGraph = {...plan.graph, nodes: plan.graph.nodes.map((node, index) => index === 0 ? {...node, result: {references: [{type: "luchador", id: "fighter:1"}], output: {outcome: "created", authorization: "must-not-persist", payload: {titulo: "duplicated"}}}} : node)};
  const compact = serializeResolutionGraph(resultGraph, plan);
  assert.equal(JSON.stringify(compact).includes("must-not-persist"), false);
  assert.equal(JSON.stringify(compact).includes("duplicated"), false);
  assert.equal(JSON.stringify(compact).includes("\"authorization\""), false);
}

function testInvalidPlanAndGraph(): void {
  const plan = planFor();
  const serializedPlan = serializeGlobalResolutionPlan({plan, capabilities, executors});
  const duplicate = {...serializedPlan, operations: [...serializedPlan.operations, serializedPlan.operations[0]]};
  assert.equal(validateSerializedGlobalResolutionPlan(duplicate, capabilities).ok, false);
  const missingDependency = structuredClone(serializedPlan); missingDependency.operations[0].dependencyIds = ["missing"];
  assert.equal(validateSerializedGlobalResolutionPlan(missingDependency, capabilities).ok, false);
  const missingFingerprint = {...serializedPlan, planFingerprint: ""};
  assert.equal(validateSerializedGlobalResolutionPlan(missingFingerprint, capabilities).ok, false);
  const wrongProducer = {...serializedPlan, producer: "other"};
  assert.equal(validateSerializedGlobalResolutionPlan(wrongProducer, capabilities, plan.caseId, plan.caseVersion, plan.producer).ok, false);
  const unknownCapability = structuredClone(serializedPlan); unknownCapability.capabilityRequirements[0].id = "unknown:capability";
  assert.equal(validateSerializedGlobalResolutionPlan(unknownCapability, capabilities).ok, false);

  const graph = serializeResolutionGraph(plan.graph, plan);
  assert.equal(validateSerializedResolutionGraph({...graph, nodes: [...graph.nodes, graph.nodes[0]]}, serializedPlan).ok, false);
  const brokenEdge = structuredClone(graph); brokenEdge.nodes[0].dependencyIds = ["missing"];
  Object.assign(brokenEdge, recomputeGraph(brokenEdge));
  assert.equal(validateSerializedResolutionGraph(brokenEdge, serializedPlan).ok, false);
  const cycle = structuredClone(graph); cycle.nodes[0].dependencyIds = [cycle.nodes.at(-1)!.id]; cycle.nodes.at(-1)!.dependencyIds = [cycle.nodes[0].id];
  Object.assign(cycle, recomputeGraph(cycle));
  assert.equal(validateSerializedResolutionGraph(cycle, serializedPlan).ok, false);
  const unknownState = structuredClone(graph) as unknown as SerializedResolutionGraph; unknownState.nodes[0].state = "unknown" as never;
  assert.equal(validateSerializedResolutionGraph(unknownState, serializedPlan).ok, false);
  const incoherentReady = structuredClone(graph); const dependent = incoherentReady.nodes.find((node) => node.dependencyIds.length > 0)!; dependent.state = "ready"; incoherentReady.state = "ready";
  Object.assign(incoherentReady, recomputeGraph(incoherentReady));
  assert.equal(validateSerializedResolutionGraph(incoherentReady, serializedPlan).ok, false);
  const missingOperation = structuredClone(graph); missingOperation.nodes[0].operationId = "missing";
  Object.assign(missingOperation, recomputeGraph(missingOperation));
  assert.equal(validateSerializedResolutionGraph(missingOperation, serializedPlan).ok, false);
  assert.equal(validateSerializedResolutionGraph({...graph, fingerprint: "sha256-v1:wrong"}, serializedPlan).ok, false);
}

function testSummaries(): void {
  const caseValue = reviewCase();
  const plan = planFor(caseValue);
  const simulation = simulateGlobalResolutionPlan(plan, {
    reviewCase: caseValue,
    preparedEntities: [{issueId: "issue:fighter", entityType: "fighter", draft: prepared().draft}],
    fighterCandidates: [],
    newsPayload: {titulo: "AU3 checkpoint", contenido: "Contenido suficientemente largo y controlado.", fuenteUrl: "https://example.test/au3", fechaPublicacion: now, disciplina: "discipline:boxing", organizacionRelacionada: "", eventoRelacionado: "", luchadoresRelacionados: [], imagenPrincipal: "https://example.test/image.jpg"},
    producerContracts: [{producer: "external_news", supportsSimulation: true, allowsProjectedReferences: true}],
  });
  const simulationA = summarizeGlobalResolutionSimulation(simulation, now);
  const simulationB = summarizeGlobalResolutionSimulation(simulation, later);
  assert.equal(simulationA.resultFingerprint, simulationB.resultFingerprint);
  assert.notEqual(simulationA.generatedAt, simulationB.generatedAt);
  const simulatedCheckpoint = createGlobalResolutionCheckpoint({reviewCase: caseValue, plan, capabilities, executors, phase: "simulated", simulation: simulationA, now: () => now});
  assert.equal(validateGlobalResolutionCheckpoint(simulatedCheckpoint).ok, true);

  const createOperation = plan.operations.find((operation) => operation.kind === "create_entity" && operation.entityType === "luchador")!;
  const execution: UniversalPlanExecution = {
    schemaVersion: 1,
    planId: plan.id,
    planFingerprint: plan.fingerprint as UniversalPlanExecution["planFingerprint"],
    simulationFingerprint: "sha256-v1:simulation",
    stateFingerprint: "sha256-v1:state",
    status: "reconciliation_required",
    allocations: [],
    results: [{executorId: "global-resolution.create-luchador.v1", executorVersion: 1, executorManifestFingerprint: "sha256-v1:create", capability: "create:luchador", status: "reconciliation_required", effectIndexes: [0], idempotencyKey: "execution:au3", references: [], output: {operationId: createOperation.id, outcome: "reconciliation_required", reconciliation: {reason: "timeout", identityKey: "fighter:ada"}, payload: {titulo: "must-not-persist"}}}],
    validations: [],
    compensations: [],
    startedAt: now,
    completedAt: later,
  };
  const executionA = summarizeGlobalResolutionExecution(execution);
  const executionB = summarizeGlobalResolutionExecution({...execution, startedAt: later, completedAt: "2026-07-28T10:02:00.000Z"});
  assert.equal(executionA.resultFingerprint, executionB.resultFingerprint);
  assert.equal(JSON.stringify(executionA).includes("must-not-persist"), false);
  assert.equal(executionA.operations[0].reconciliation?.reason, "timeout");
}

function testStoreAndMigration(): ReviewCase {
  const initial = reviewCase();
  const repository = new MemoryRepository([initial]);
  const restore = setReviewCaseRepositoryForTests(repository);
  try {
    const checkpoint = checkpointFor(initial);
    const before = structuredClone(initial);
    const stored = setGlobalResolutionCheckpoint(initial.id, initial.version, checkpoint, new Date(now));
    assert.ok(stored?.globalResolution);
    assert.equal(stored?.version, initial.version);
    assert.deepEqual(initial, before);
    assert.equal(stored?.globalResolution?.storedAtCaseVersion, stored?.version);
    assert.equal(setGlobalResolutionCheckpoint(initial.id, initial.version, checkpoint)?.globalResolution?.checkpointFingerprint, stored?.globalResolution?.checkpointFingerprint);
    assert.throws(() => setGlobalResolutionCheckpoint(initial.id, initial.version + 1, checkpoint), /versión/i);
    assert.throws(() => setGlobalResolutionCheckpoint(initial.id, stored!.version, {...checkpoint, caseId: "other"}), /otro ReviewCase/i);
    assert.equal(setGlobalResolutionCheckpoint("missing", 1, checkpoint), undefined);
    const beforeCorruptUpdate = repository.snapshot();
    assert.throws(() => updateGlobalResolutionCheckpoint(initial.id, stored!.version, (current) => current ? {...current, graph: {...current.graph, nodes: [...current.graph.nodes, current.graph.nodes[0]]}} : undefined), /inválido/i);
    assert.deepEqual(repository.snapshot(), beforeCorruptUpdate);
    const updated = updateGlobalResolutionCheckpoint(initial.id, stored!.version, (current) => current ? recomputeCheckpoint({...current, phase: "blocked", history: [...current.history, {id: "history:simulated", kind: "checkpoint_updated", status: "blocked", occurredAt: later}], updatedAt: later}) : undefined, new Date(later));
    assert.equal(updated?.globalResolution?.phase, "blocked");
    assert.equal(updated?.globalResolution?.storedAtCaseVersion, updated?.version);
    const cleared = clearGlobalResolutionCheckpoint(initial.id, updated!.version, new Date(later));
    assert.equal(cleared?.globalResolution, undefined);
    assert.throws(() => clearGlobalResolutionCheckpoint(initial.id, updated!.version + 1), /versión/i);

    const old = reviewCase();
    const valid = {...old, globalResolution: checkpointFor(old)};
    const corrupt = {...old, id: "case:corrupt", globalResolution: {schemaVersion: 999, secret: "bad"}};
    const oldSnapshot = structuredClone(old);
    const migrated = migrateReviewCases([old, valid, corrupt]);
    assert.deepEqual(old, oldSnapshot);
    assert.equal(migrated.length, 3);
    assert.equal(migrated[0].globalResolution, undefined);
    assert.ok(migrated[1].globalResolution);
    assert.equal(migrated[2].id, "case:corrupt");
    assert.equal(migrated[2].globalResolution, undefined);
    assert.deepEqual(migrateReviewCases(migrated), migrated);
    repository.save([{...initial, title: "Semantic change", version: initial.version + 1}]);
    assert.throws(() => setGlobalResolutionCheckpoint(initial.id, initial.version + 1, checkpoint), /obsoleto/i);
    return stored!;
  } finally { restore(); }
}

function testRecovery(): void {
  const initial = reviewCase();
  assert.deepEqual(recoverGlobalResolutionCheckpoint(initial, environment), {status: "absent"});
  const checkpoint = checkpointFor(initial);
  const persisted: ReviewCase = {...initial, version: checkpoint.storedAtCaseVersion, updatedAt: later, globalResolution: checkpoint};
  const valid = recoverGlobalResolutionCheckpoint(persisted, environment);
  assert.equal(valid.status, "valid");
  if (valid.status === "valid") {
    assert.equal(valid.continuation.canSimulate, true);
    assert.equal(valid.continuation.requiresAuthorization, false);
    assert.ok(valid.continuation.nextReadyOperationIds.length > 0);
  }
  assert.equal(recoverGlobalResolutionCheckpoint({...persisted, version: persisted.version + 1}, environment).status, "stale");
  assert.equal(recoverGlobalResolutionCheckpoint({...persisted, context: {...persisted.context, title: "Changed snapshot"}}, environment).status, "stale");
  assert.equal(recoverGlobalResolutionCheckpoint(persisted, {...environment, capabilities: environment.capabilities.slice(1)}).status, "stale");
  assert.equal(recoverGlobalResolutionCheckpoint(persisted, {...environment, executors: environment.executors.map((executor) => executor.executorId.includes("create") ? {...executor, manifestFingerprint: "sha256-v1:changed"} : executor)}).status, "stale");
  assert.equal(recoverGlobalResolutionCheckpoint({...persisted, status: "resumed", resumeExecution: {status: "succeeded", attemptCount: 1, draftId: "draft:other"}}, environment).status, "stale");
  const structurallyInvalid = structuredClone(checkpoint); structurallyInvalid.graph.nodes.push(structurallyInvalid.graph.nodes[0]);
  assert.equal(recoverGlobalResolutionCheckpoint({...persisted, globalResolution: structurallyInvalid}, environment).status, "invalid");

  const executionPlan = planFor(initial);
  const readyGraph = graphWithState(executionPlan, "ready");
  const readyCheckpoint = createGlobalResolutionCheckpoint({reviewCase: initial, plan: executionPlan, graph: readyGraph, capabilities, executors, phase: "partially_executed", now: () => now});
  const readyCase: ReviewCase = {...initial, version: readyCheckpoint.storedAtCaseVersion, globalResolution: readyCheckpoint};
  const ready = recoverGlobalResolutionCheckpoint(readyCase, environment);
  assert.equal(ready.status, "valid");
  if (ready.status === "valid") {
    assert.equal(ready.continuation.canExecute, true);
    assert.equal(ready.continuation.requiresAuthorization, true);
  }

  const reconciliationGraph = graphWithState(executionPlan, "reconciliation_required");
  const reconciliationCheckpoint = createGlobalResolutionCheckpoint({reviewCase: initial, plan: executionPlan, graph: reconciliationGraph, capabilities, executors, phase: "reconciliation_required", now: () => now});
  const reconciliation = recoverGlobalResolutionCheckpoint({...initial, version: reconciliationCheckpoint.storedAtCaseVersion, globalResolution: reconciliationCheckpoint}, environment);
  assert.equal(reconciliation.status, "valid");
  if (reconciliation.status === "valid") {
    assert.equal(reconciliation.continuation.reconciliationOperationIds.length, 1);
    assert.equal(reconciliation.continuation.canExecute, false);
    assert.equal(reconciliation.continuation.canResumeProducer, false);
  }
}

function testSecurityBoundaries(): void {
  const root = process.cwd();
  const files = [
    "_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint/checkpoint.ts",
    "_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint/fingerprints.ts",
    "_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint/recovery.ts",
    "_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint/serialization.ts",
  ].map((file) => readFileSync(resolve(root, file), "utf8")).join("\n");
  assert.doesNotMatch(files, /from\s+["']react|fetch\s*\(|@sanity|localStorage|saveDraft|createEntity|executeExternalNewsResume|authorizeExternalNewsResume/);
  assert.doesNotMatch(JSON.stringify(checkpointFor()), /"authorization"|"token"|"secret"/i);
}

function main(): void {
  testSerialization();
  testInvalidPlanAndGraph();
  testSummaries();
  testStoreAndMigration();
  testRecovery();
  testSecurityBoundaries();
  assert.equal(validateGlobalResolutionCheckpoint(checkpointFor()).ok, true);
  console.log("AU3 global resolution checkpoint tests: OK");
}

main();
