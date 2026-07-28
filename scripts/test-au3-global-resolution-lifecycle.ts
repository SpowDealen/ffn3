import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  appendGlobalResolutionCheckpointHistory,
  buildCurrentGlobalResolutionCatalog,
  buildGlobalResolutionPlan,
  createCheckpointAfterPlanning,
  extractResolvedFighterReference,
  markCheckpointExecutionStarted,
  markCheckpointReconciliationRequired,
  pilotCapabilityRegistry,
  prepareExternalNewsResume,
  recordCheckpointAfterExecution,
  recordCheckpointAfterPlanning,
  recordCheckpointAfterReferenceResolution,
  recordCheckpointAfterResumeExecution,
  recordCheckpointAfterResumePreparation,
  recordCheckpointAfterSimulation,
  recoverCurrentGlobalResolution,
  replaceProjectedFighterReference,
  simulateGlobalResolutionPlan,
  updateCheckpointAfterExecution,
  updateCheckpointAfterReferenceResolution,
  updateCheckpointAfterResumeExecution,
  updateCheckpointAfterResumePreparation,
  updateCheckpointAfterSimulation,
  validateGlobalResolutionCheckpoint,
  type ExternalNewsResumeAdapterResult,
  type GlobalResolutionCheckpoint,
  type GlobalResolutionCheckpointPersistence,
  type GlobalResolutionCurrentCatalog,
  type GlobalResolutionPlan,
  type PreparedEntityPlanningInput,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import type {OperationEvidence} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import {getExternalNewsResumeSnapshot} from "../_laboratorio/laboratorio-ia/src/review/resume/externalNews";
import {getReviewCase, setReviewCaseRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/store/reviewStore";
import type {ReviewCase, ReviewJsonObject, ReviewJsonValue} from "../_laboratorio/laboratorio-ia/src/review/types";
import {
  computeUniversalFingerprint,
  listRegisteredReviewExecutors,
  registerReviewExecutor,
  registerReviewProducer,
  type ReviewEffect,
  type ReviewExecutorRegistration,
  type UniversalPlanExecution,
} from "../_laboratorio/laboratorio-ia/src/review/universal";

const time = {
  planned: "2026-07-28T12:00:00.000Z",
  simulated: "2026-07-28T12:01:00.000Z",
  executionStarted: "2026-07-28T12:01:30.000Z",
  executed: "2026-07-28T12:02:00.000Z",
  referenced: "2026-07-28T12:03:00.000Z",
  prepared: "2026-07-28T12:04:00.000Z",
  resumeStarted: "2026-07-28T12:04:30.000Z",
  resumed: "2026-07-28T12:05:00.000Z",
};
const identityKey = "fighter:ada-lifecycle";
const evidence: OperationEvidence[] = [{id: "evidence:au3:lifecycle", kind: "controlled", source: "test", confidence: .99, limitations: []}];

class MemoryRepository {
  constructor(private cases: ReviewCase[] = []) {}
  load(): ReviewCase[] { return structuredClone(this.cases); }
  save(cases: readonly ReviewCase[]): void { this.cases = structuredClone([...cases]); }
}

function caseWithMarker(marker: string): ReviewCase {
  return {
    schemaVersion: 1,
    id: "case:au3:lifecycle",
    dedupeKey: "case:au3:lifecycle",
    module: "external.news",
    title: "AU3 lifecycle",
    status: "open",
    priority: "high",
    subject: {type: "external_news", id: "news:au3:lifecycle"},
    issues: [{id: "issue:fighter", kind: "missing_entity", valueKind: "fighter", fieldPath: "fighter", label: "Fighter", message: "Missing fighter", required: true, blocking: true}],
    resolutions: [{type: "create_entity", issueId: "issue:fighter", entityType: "fighter", draft: {entityType: "fighter", name: "Ada Lifecycle", identityKey, disciplineId: "discipline:boxing", organizationIds: ["organization:test"], sourceEvidence: [{source: "test"}]}}],
    context: {
      producer: "external_news",
      operation: "create_draft",
      sourceId: "source:au3:lifecycle",
      sourceName: "Controlled",
      sourceUrl: "https://example.test/lifecycle",
      externalItemId: "news:au3:lifecycle",
      canonicalUrl: "https://example.test/lifecycle",
      title: "AU3 lifecycle",
      createdAt: time.planned,
      payloadSnapshot: {id: "news:au3:lifecycle", title: "AU3 lifecycle", excerpt: "Resumen", bodyText: "Contenido suficientemente largo y controlado.", canonicalUrl: "https://example.test/lifecycle", publishedAt: time.planned, image: {url: "https://example.test/image.jpg"}},
      analysisSnapshot: {analysis: {relevancia: "alta", disciplinaPrincipal: "Boxeo"}, resolved: {disciplina: {id: "discipline:boxing"}, organizacion: {id: "organization:test"}, evento: null, luchadoresPrincipales: [{id: marker}], luchadoresSecundarios: []}},
    },
    createdAt: time.planned,
    updatedAt: time.planned,
    version: 1,
    resumeAttempts: 0,
  };
}

function preparedEntity(): PreparedEntityPlanningInput {
  return {
    issueId: "issue:fighter",
    entityType: "fighter",
    draft: {entityType: "fighter", name: "Ada Lifecycle", identityKey, disciplineId: "discipline:boxing", organizationIds: ["organization:test"], sourceEvidence: [{source: "test"}]},
    identityKey,
    valid: true,
    evidence,
  };
}

function buildFixture(): {reviewCase: ReviewCase; plan: GlobalResolutionPlan; createOperationId: string} {
  const provisional = caseWithMarker("projected:luchador:placeholder");
  const first = buildGlobalResolutionPlan({reviewCase: provisional, preparedEntities: [preparedEntity()], evidence: evidence.map((item) => ({...item, issueId: "issue:fighter"})), finalEntityType: "noticia", now: () => time.planned});
  assert.equal(first.ok, true);
  if (!first.ok) throw new Error("first_plan_failed");
  const create = first.plan.operations.find((operation) => operation.kind === "create_entity" && operation.entityType === "luchador");
  assert.ok(create);
  const reviewCase = caseWithMarker(`projected:luchador:${create!.id}`);
  const rebuilt = buildGlobalResolutionPlan({reviewCase, preparedEntities: [preparedEntity()], evidence: evidence.map((item) => ({...item, issueId: "issue:fighter"})), finalEntityType: "noticia", now: () => time.planned});
  assert.equal(rebuilt.ok, true);
  if (!rebuilt.ok) throw new Error("rebuilt_plan_failed");
  return {reviewCase, plan: rebuilt.plan, createOperationId: create!.id};
}

function dummyExecutor(executorId: string, capability: string, effect: ReviewEffect["type"]): ReviewExecutorRegistration {
  return {
    executorId,
    version: 1,
    capability,
    scope: `scope:${capability}`,
    supportedEffects: [effect],
    supportedEntityTypes: ["*"],
    risk: "low",
    canExecute: () => false,
    async simulate(_plan, _state, indexes) {
      const binding = listRegisteredReviewExecutors().find((entry) => entry.manifest.executorId === executorId)!;
      return {executorId, executorVersion: 1, executorManifestFingerprint: binding.manifestFingerprint, capability, status: "blocked", effectIndexes: indexes, changes: [], warnings: [], blockingReasons: ["not_executed_in_catalog_test"], errors: []};
    },
    async execute(_plan, _state, indexes, options) {
      const binding = listRegisteredReviewExecutors().find((entry) => entry.manifest.executorId === executorId)!;
      return {executorId, executorVersion: 1, executorManifestFingerprint: binding.manifestFingerprint, capability, status: "blocked", effectIndexes: indexes, idempotencyKey: options.idempotencyKey, references: [], error: {code: "not_executed", message: "not_executed", retryable: false}};
    },
    async validateExecution(plan, result) {
      return {valid: false, planFingerprint: plan.planFingerprint, executorId, executionIdempotencyKey: result.idempotencyKey, checkedPostconditionIds: [], checkedEffectIndexes: [], errors: [{code: "not_executed", message: "not_executed"}], warnings: [], validatedAt: time.planned};
    },
  };
}

function registerCatalog(): {catalog: GlobalResolutionCurrentCatalog; cleanup: () => void} {
  const unregister = [
    registerReviewExecutor(dummyExecutor("au3.create", "create:luchador", "create_entity")),
    registerReviewExecutor(dummyExecutor("au3.replace", "replace_reference:noticia:luchador", "replace_reference")),
    registerReviewExecutor(dummyExecutor("au3.resume", "resume:external_news", "set_field")),
    registerReviewProducer({
      producerId: "external_news",
      version: 1,
      supportedEntityTypes: ["noticia"],
      supportedOperations: ["create_draft"],
      buildReviewInput() { throw new Error("catalog_does_not_execute_producer"); },
      async rebuildCurrentState() { throw new Error("catalog_does_not_execute_producer"); },
      validateSnapshot() { return {valid: true, errors: [], warnings: []}; },
    }),
  ];
  return {catalog: buildCurrentGlobalResolutionCatalog(), cleanup: () => [...unregister].reverse().forEach((remove) => remove())};
}

function simulation(fixture: ReturnType<typeof buildFixture>) {
  const snapshot = getExternalNewsResumeSnapshot(fixture.reviewCase.context);
  assert.ok(snapshot.snapshot);
  return simulateGlobalResolutionPlan(fixture.plan, {
    reviewCase: fixture.reviewCase,
    preparedEntities: [{issueId: "issue:fighter", entityType: "fighter", draft: preparedEntity().draft}],
    fighterCandidates: [],
    newsPayload: snapshot.snapshot!.payload,
    producerContracts: [{producer: "external_news", supportsSimulation: true, allowsProjectedReferences: true}],
  });
}

function creationExecution(operationId: string, outcome: "created" | "reused_existing" = "created", status: "succeeded" | "failed" | "reconciliation_required" = "succeeded"): UniversalPlanExecution {
  const idempotencyKey = `execute:${operationId}:${outcome}:${status}`;
  const entityId = status === "succeeded" ? "fighter:real" : undefined;
  const output: ReviewJsonObject = {operationId, entityType: "luchador", identityKey, entityId: entityId ?? null, outcome: status === "succeeded" ? outcome : status};
  if (status === "reconciliation_required") output.reconciliation = {reason: "timeout", identityKey};
  return {
    schemaVersion: 1,
    planId: "universal:au3:lifecycle",
    planFingerprint: "sha256-v1:universal",
    simulationFingerprint: "sha256-v1:universalsimulation",
    stateFingerprint: "sha256-v1:state",
    status,
    allocations: [],
    results: [{
      executorId: "au3.create",
      executorVersion: 1,
      executorManifestFingerprint: "sha256-v1:executor",
      capability: "create:luchador",
      status,
      effectIndexes: [0],
      idempotencyKey,
      references: entityId ? [{type: "luchador", id: entityId}] : [],
      output,
      error: status === "succeeded" ? undefined : {code: status, message: status, retryable: status === "reconciliation_required"},
    }],
    validations: status === "succeeded" ? [{valid: true, planFingerprint: "sha256-v1:universal", executorId: "au3.create", executionIdempotencyKey: idempotencyKey, checkedPostconditionIds: ["post"], checkedEffectIndexes: [0], errors: [], warnings: [], validatedAt: time.executed}] : [],
    compensations: [],
    startedAt: time.executed,
    completedAt: time.executed,
  };
}

function resolvedReference(execution: UniversalPlanExecution, operationId: string) {
  const resolved = extractResolvedFighterReference({execution, expectedOperationId: operationId, expectedIdentityKey: identityKey});
  assert.equal(resolved.ok, true);
  if (!resolved.ok) throw new Error("reference_not_resolved");
  return resolved.reference;
}

function resumeResult(checkpoint: GlobalResolutionCheckpoint, outcome: ExternalNewsResumeAdapterResult["outcome"], completedAt = time.resumed): ExternalNewsResumeAdapterResult {
  const graph = structuredClone(checkpoint.resume ? checkpoint.graph : checkpoint.graph);
  const projectedGraph: ExternalNewsResumeAdapterResult["projectedGraph"] = {
    schemaVersion: 1 as const,
    id: graph.graphId,
    caseId: graph.caseId,
    caseVersion: graph.caseVersion,
    producerId: graph.producer,
    originalOperation: graph.originalOperation,
    nodes: graph.nodes.map((serialized) => {
      const operation = checkpoint.plan.operations.find((candidate) => candidate.id === serialized.operationId)!;
      const state = serialized.operationId === checkpoint.resume?.operationId
        ? outcome === "resumed" || outcome === "already_resumed" ? "succeeded" as const : outcome === "reconciliation_required" ? "reconciliation_required" as const : "failed" as const
        : serialized.state;
      return {...serialized, operation, evidence: operation.evidence, risk: operation.risk, confidence: operation.confidence, preconditions: operation.preconditions, postconditions: operation.postconditions, state};
    }),
    state: outcome === "resumed" || outcome === "already_resumed" ? "succeeded" as const : outcome === "reconciliation_required" ? "reconciliation_required" as const : "failed" as const,
    fingerprint: graph.intentFingerprint as ExternalNewsResumeAdapterResult["projectedGraph"]["fingerprint"],
    idempotencyKey: graph.idempotencyKey,
    createdAt: checkpoint.createdAt,
    metadata: graph.metadata,
  };
  return {
    caseId: checkpoint.caseId,
    caseVersion: checkpoint.storedAtCaseVersion,
    planId: checkpoint.plan.planId,
    operationId: checkpoint.graph.originalOperation,
    idempotencyKey: `resume:${checkpoint.resume?.previewFingerprint}:${outcome}`,
    producer: "external_news",
    outcome,
    previewFingerprint: checkpoint.resume?.previewFingerprint ?? "",
    planFingerprint: checkpoint.planFingerprint,
    draftId: outcome === "resumed" || outcome === "already_resumed" ? "draft:au3:lifecycle" : undefined,
    references: [],
    projectedGraph,
    warnings: [],
    error: outcome === "failed" || outcome === "reconciliation_required" ? {code: outcome, message: outcome, retryable: outcome === "reconciliation_required"} : undefined,
    reconciliation: outcome === "reconciliation_required" ? {reason: "timeout", payloadFingerprint: checkpoint.resume?.payloadFingerprint ?? ""} : undefined,
    completedAt,
  };
}

function projectThroughPreparation(fixture: ReturnType<typeof buildFixture>, catalog: GlobalResolutionCurrentCatalog) {
  const planned = createCheckpointAfterPlanning({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, now: () => time.planned});
  const simulationResult = simulation(fixture);
  assert.equal(simulationResult.simulatable, true, JSON.stringify(simulationResult.nodeResults.map((result) => ({nodeId: result.nodeId, capability: result.capability, status: result.status, blockers: result.blockers.map((blocker) => blocker.code)}))));
  const simulated = updateCheckpointAfterSimulation({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: planned, simulation: simulationResult, now: () => time.simulated});
  const started = markCheckpointExecutionStarted({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: simulated, operationId: fixture.createOperationId, idempotencyKey: `start:${fixture.createOperationId}`, startedAt: time.executionStarted});
  const execution = creationExecution(fixture.createOperationId);
  const executed = updateCheckpointAfterExecution({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: started, execution, now: () => time.executed});
  const reference = resolvedReference(execution, fixture.createOperationId);
  const snapshot = getExternalNewsResumeSnapshot(fixture.reviewCase.context);
  assert.ok(snapshot.snapshot);
  const payload = snapshot.snapshot!.payload;
  const replacement = replaceProjectedFighterReference({payload, reference, sourceOperationId: fixture.createOperationId, caseId: fixture.reviewCase.id, caseVersion: fixture.reviewCase.version, planFingerprint: fixture.plan.fingerprint, expectedPlanFingerprint: fixture.plan.fingerprint, expectedInputFingerprint: computeUniversalFingerprint(payload as unknown as ReviewJsonValue)});
  assert.equal(replacement.ok, true);
  if (!replacement.ok) throw new Error("replacement_failed");
  const referenced = updateCheckpointAfterReferenceResolution({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: executed, reference, replacement, now: () => time.referenced});
  const prepared = prepareExternalNewsResume({reviewCase: fixture.reviewCase, plan: fixture.plan, replacement, references: [reference], expectedCaseVersion: fixture.reviewCase.version, expectedPlanFingerprint: fixture.plan.fingerprint, now: () => time.prepared});
  assert.equal(prepared.ready, true, prepared.blockers.map((blocker) => blocker.message).join(" "));
  const ready = updateCheckpointAfterResumePreparation({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: referenced, prepared, now: () => time.prepared});
  return {planned, simulated, started, execution, executed, reference, replacement, referenced, prepared, ready};
}

function testLifecycle(catalog: GlobalResolutionCurrentCatalog): void {
  const fixture = buildFixture();
  const flow = projectThroughPreparation(fixture, catalog);
  assert.equal(flow.planned.phase, "planned");
  assert.equal(flow.planned.history[0].kind, "planned");
  assert.equal(flow.simulated.phase, "simulated");
  assert.ok(flow.simulated.simulation);
  assert.equal(updateCheckpointAfterSimulation({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: flow.simulated, simulation: simulation(fixture), now: () => time.simulated}).checkpointFingerprint, flow.simulated.checkpointFingerprint);
  const blockedSimulation = simulateGlobalResolutionPlan(fixture.plan, {
    reviewCase: fixture.reviewCase,
    preparedEntities: [],
    fighterCandidates: [],
    producerContracts: [{producer: "external_news", supportsSimulation: true, allowsProjectedReferences: true}],
  });
  const blockedAfterSimulation = updateCheckpointAfterSimulation({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: flow.planned, simulation: blockedSimulation, now: () => time.simulated});
  assert.equal(blockedAfterSimulation.phase, "blocked");
  assert.equal(flow.executed.phase, "partially_executed");
  assert.equal(flow.started.history.at(-1)?.kind, "execution_started");
  assert.equal(markCheckpointExecutionStarted({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: flow.started, operationId: fixture.createOperationId, idempotencyKey: `start:${fixture.createOperationId}`, startedAt: time.executionStarted}).history.length, flow.started.history.length);
  assert.equal(flow.executed.execution?.operations[0].outcome, "created");
  assert.equal(updateCheckpointAfterExecution({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: flow.executed, execution: flow.execution}).history.length, flow.executed.history.length);
  const reused = updateCheckpointAfterExecution({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: flow.simulated, execution: creationExecution(fixture.createOperationId, "reused_existing")});
  assert.equal(reused.execution?.operations[0].outcome, "reused_existing");
  const creationFailed = updateCheckpointAfterExecution({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: flow.simulated, execution: creationExecution(fixture.createOperationId, "created", "failed")});
  assert.equal(creationFailed.phase, "failed");
  const creationUncertain = updateCheckpointAfterExecution({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: flow.simulated, execution: creationExecution(fixture.createOperationId, "created", "reconciliation_required")});
  assert.equal(creationUncertain.phase, "reconciliation_required");
  assert.equal(flow.referenced.referenceResolution?.documentId, "fighter:real");
  assert.equal(updateCheckpointAfterReferenceResolution({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: flow.referenced, reference: flow.reference, replacement: flow.replacement}).history.length, flow.referenced.history.length);
  assert.equal("payload" in flow.referenced.referenceResolution!, false);
  assert.equal(flow.referenced.graph.nodes.some((node) => JSON.stringify(node.result ?? {}).includes("\"payload\"")), false);
  assert.equal(flow.ready.phase, "ready_to_resume");
  assert.equal(flow.ready.resume?.validation.valid, true);
  assert.equal(JSON.stringify(flow.ready.resume).includes("authorization"), false);
  assert.equal(updateCheckpointAfterResumePreparation({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: flow.ready, prepared: flow.prepared}).history.length, flow.ready.history.length);

  const completedResult = resumeResult(flow.ready, "resumed");
  const resumedCase: ReviewCase = {...fixture.reviewCase, status: "resumed", version: 2, updatedAt: time.resumed, resumedAt: time.resumed, resumeAttempts: 1, resumeExecution: {status: "succeeded", attemptCount: 1, startedAt: time.resumed, completedAt: time.resumed, draftId: "draft:au3:lifecycle"}, globalResolution: flow.ready};
  const resumeStarted = markCheckpointExecutionStarted({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: flow.ready, operationId: flow.ready.resume!.operationId, idempotencyKey: `resume-start:${flow.ready.resume!.previewFingerprint}`, startedAt: time.resumeStarted, resume: true});
  assert.equal(resumeStarted.history.at(-1)?.kind, "resume_started");
  const completed = updateCheckpointAfterResumeExecution({reviewCase: resumedCase, plan: fixture.plan, catalog, checkpoint: resumeStarted, result: completedResult});
  assert.equal(completed.phase, "completed");
  assert.equal(completed.resume?.postValidationPassed, true);
  assert.equal(completed.graph.nodes.find((node) => node.operationId === completed.resume?.operationId)?.state, "succeeded");
  assert.equal(updateCheckpointAfterResumeExecution({reviewCase: resumedCase, plan: fixture.plan, catalog, checkpoint: completed, result: completedResult}).history.length, completed.history.length);

  const already = updateCheckpointAfterResumeExecution({reviewCase: resumedCase, plan: fixture.plan, catalog, checkpoint: flow.ready, result: resumeResult(flow.ready, "already_resumed")});
  assert.equal(already.phase, "completed");
  const failed = updateCheckpointAfterResumeExecution({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: flow.ready, result: resumeResult(flow.ready, "failed")});
  assert.equal(failed.phase, "failed");
  const uncertain = updateCheckpointAfterResumeExecution({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: flow.ready, result: resumeResult(flow.ready, "reconciliation_required")});
  assert.equal(uncertain.phase, "reconciliation_required");
  assert.equal(uncertain.graph.nodes.some((node) => node.state === "reconciliation_required"), true);
  assert.throws(() => updateCheckpointAfterResumeExecution({reviewCase: resumedCase, plan: fixture.plan, catalog, checkpoint: flow.ready, result: {...completedResult, previewFingerprint: "sha256-v1:stale"}}), /binding_mismatch/);

  const reconciliation = markCheckpointReconciliationRequired({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, checkpoint: flow.executed, operationId: fixture.createOperationId, reason: "uncertain"});
  assert.equal(reconciliation.phase, "reconciliation_required");
  assert.equal(reconciliation.history.at(-1)?.kind, "reconciliation_required");
  assert.equal(validateGlobalResolutionCheckpoint(completed).ok, true);
}

function testPersistence(catalog: GlobalResolutionCurrentCatalog): void {
  const fixture = buildFixture();
  const repository = new MemoryRepository([fixture.reviewCase]);
  const restore = setReviewCaseRepositoryForTests(repository);
  try {
    const planned = recordCheckpointAfterPlanning({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, now: () => time.planned});
    assert.equal(planned.checkpoint.status, "persisted");
    const afterPlanning = getReviewCase(fixture.reviewCase.id)!;
    assert.equal(afterPlanning.version, fixture.reviewCase.version, "Persistir observabilidad no cambia la versión semántica.");
    assert.ok(afterPlanning.globalResolution);
    const simulatedResult = simulation(fixture);
    const simulated = recordCheckpointAfterSimulation({reviewCase: afterPlanning, plan: fixture.plan, catalog, checkpoint: afterPlanning.globalResolution!, simulation: simulatedResult, now: () => time.simulated});
    assert.equal(simulated.checkpoint.status, "persisted");
    const afterSimulation = getReviewCase(fixture.reviewCase.id)!;
    const beforeDomainExecution = structuredClone(afterSimulation);
    const execution = creationExecution(fixture.createOperationId);
    const executed = recordCheckpointAfterExecution({reviewCase: afterSimulation, plan: fixture.plan, catalog, checkpoint: afterSimulation.globalResolution!, execution, now: () => time.executed});
    assert.equal(executed.checkpoint.status, "persisted");

    const current = getReviewCase(fixture.reviewCase.id)!;
    const conflictPersistence: GlobalResolutionCheckpointPersistence = {
      get: () => ({...current, version: current.version + 1}),
      set: () => undefined,
      update: () => undefined,
    };
    const conflict = recordCheckpointAfterSimulation({reviewCase: current, plan: fixture.plan, catalog, checkpoint: current.globalResolution!, simulation: simulatedResult, persistence: conflictPersistence});
    assert.equal(conflict.checkpoint.status, "conflict");
    assert.equal(conflict.canContinue, false);

    const failingPersistence: GlobalResolutionCheckpointPersistence = {
      get: () => beforeDomainExecution,
      set: () => { throw new Error("disk unavailable"); },
      update: () => { throw new Error("disk unavailable"); },
    };
    const domainSucceeded = recordCheckpointAfterExecution({reviewCase: beforeDomainExecution, plan: fixture.plan, catalog, checkpoint: beforeDomainExecution.globalResolution!, execution: creationExecution(fixture.createOperationId, "reused_existing"), persistence: failingPersistence});
    assert.equal(domainSucceeded.domainResult.status, "succeeded");
    assert.equal(domainSucceeded.checkpoint.status, "failed");
    assert.equal(domainSucceeded.regenerationRequired, true);
  } finally {
    restore();
  }
}

function testCatalogAndRecovery(catalog: GlobalResolutionCurrentCatalog): void {
  assert.equal(catalog.valid, true, catalog.errors.join(","));
  assert.equal(JSON.stringify(catalog).includes("canExecute"), false);
  assert.equal(JSON.stringify(catalog).includes("authorization"), false);
  const registered = listRegisteredReviewExecutors();
  const duplicateCapability = buildCurrentGlobalResolutionCatalog({capabilities: [...pilotCapabilityRegistry.list(), pilotCapabilityRegistry.list()[0]], executors: registered});
  assert.equal(duplicateCapability.errors.some((error) => error.startsWith("capability_duplicate:")), true);
  const ambiguous = buildCurrentGlobalResolutionCatalog({executors: [...registered, registered[0]]});
  assert.equal(ambiguous.errors.some((error) => error.startsWith("executor_ambiguous:")), true);
  const missingExecutor = buildCurrentGlobalResolutionCatalog({executors: []});
  assert.equal(missingExecutor.errors.some((error) => error.startsWith("executable_without_executor:")), true);
  const invalidManifest = buildCurrentGlobalResolutionCatalog({executors: [{...registered[0], manifest: {...registered[0].manifest, version: 0}}]});
  assert.equal(invalidManifest.errors.some((error) => error.startsWith("executor_manifest_invalid:")), true);

  const fixture = buildFixture();
  assert.equal(recoverCurrentGlobalResolution(fixture.reviewCase, catalog).recovery.status, "absent");
  const planned = createCheckpointAfterPlanning({reviewCase: fixture.reviewCase, plan: fixture.plan, catalog, now: () => time.planned});
  const persisted: ReviewCase = {...fixture.reviewCase, globalResolution: planned};
  const valid = recoverCurrentGlobalResolution(persisted, catalog);
  assert.equal(valid.recovery.status, "valid");
  assert.equal(valid.regenerationRequired, false);
  const stale = recoverCurrentGlobalResolution({...persisted, version: 2}, catalog);
  assert.equal(stale.recovery.status, "stale");
  assert.equal(stale.executionAllowed, false);
  const corrupt = structuredClone(planned); corrupt.graph.nodes.push(corrupt.graph.nodes[0]);
  const invalid = recoverCurrentGlobalResolution({...persisted, globalResolution: corrupt}, catalog);
  assert.equal(invalid.recovery.status, "invalid");
  assert.equal(invalid.regenerationRequired, true);
  const noProducer = buildCurrentGlobalResolutionCatalog({producers: []});
  const environmentBlocked = recoverCurrentGlobalResolution(persisted, noProducer);
  assert.equal(environmentBlocked.executionAllowed, false);
  assert.equal(environmentBlocked.reasons.some((reason) => reason.startsWith("producer_missing:")), true);

  const flow = projectThroughPreparation(fixture, catalog);
  const readyRecovery = recoverCurrentGlobalResolution({...fixture.reviewCase, globalResolution: flow.ready}, catalog);
  assert.equal(readyRecovery.recovery.status, "valid");
  assert.equal(readyRecovery.requiresAuthorization, true);
  const resumedCase: ReviewCase = {...fixture.reviewCase, status: "resumed", version: 2, updatedAt: time.resumed, resumedAt: time.resumed, resumeAttempts: 1, resumeExecution: {status: "succeeded", attemptCount: 1, draftId: "draft:au3:lifecycle"}, globalResolution: flow.ready};
  const completed = updateCheckpointAfterResumeExecution({reviewCase: resumedCase, plan: fixture.plan, catalog, checkpoint: flow.ready, result: resumeResult(flow.ready, "resumed")});
  const completedRecovery = recoverCurrentGlobalResolution({...resumedCase, globalResolution: completed}, catalog);
  assert.equal(completedRecovery.recovery.status, "valid");
  assert.equal(completedRecovery.executionAllowed, false);
}

function testHistoryAndSecurity(catalog: GlobalResolutionCurrentCatalog): void {
  let history: GlobalResolutionCheckpoint["history"] = [];
  for (let index = 0; index < 55; index += 1) {
    history = appendGlobalResolutionCheckpointHistory(history, {id: `history:${index}`, kind: "checkpoint_updated", status: String(index), occurredAt: new Date(Date.UTC(2026, 6, 28, 13, 0, index)).toISOString()});
  }
  assert.equal(history.length, 50);
  const repeated = appendGlobalResolutionCheckpointHistory(history, history.at(-1)!);
  assert.deepEqual(repeated, history);
  assert.deepEqual([...history].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id)), history);
  assert.doesNotMatch(JSON.stringify(history), /payload|authorization|token|secret|stack/i);

  const source = [
    "catalog.ts",
    "lifecycle.ts",
    "application.ts",
  ].map((file) => readFileSync(resolve(process.cwd(), `_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint/${file}`), "utf8")).join("\n");
  assert.doesNotMatch(source, /from\s+["']react|fetch\s*\(|@sanity|localStorage|saveDraft\s*\(|createEntity\s*\(|authorizeExternalNewsResume\s*\(/);
  assert.equal(source.includes("executeUniversalExecutionPlan("), false);
  assert.equal(source.includes("executePreparedExternalNewsResume("), false);
  assert.equal(catalog.capabilities.length, pilotCapabilityRegistry.list().length);
}

function main(): void {
  const {catalog, cleanup} = registerCatalog();
  try {
    testLifecycle(catalog);
    testPersistence(catalog);
    testCatalogAndRecovery(catalog);
    testHistoryAndSecurity(catalog);
    console.log("AU3 global resolution lifecycle tests: OK");
  } finally {
    cleanup();
  }
}

main();
