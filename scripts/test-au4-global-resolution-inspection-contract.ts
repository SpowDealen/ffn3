import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  GlobalResolutionInspectionService,
  GlobalResolutionInspectorRegistry,
  assessReconciliation,
  createGlobalResolutionInspectionFixture,
  fingerprintGlobalResolutionInspectionOperation,
  globalResolutionInspectionSecurity,
  inspectionEvidenceToReconciliationEvidence,
  normalizeGlobalResolutionInspectionEvidence,
  selectCompatibleInspector,
  type GlobalResolutionEffectInspector,
  type GlobalResolutionInspectionEvidence,
  type GlobalResolutionInspectionRequest,
  type GlobalResolutionObservation,
  type GlobalResolutionReconciliationCase,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import type {EntityOperation} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import type {GlobalResolutionCheckpoint} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint";
import type {ReviewCase, ReviewJsonValue} from "../_laboratorio/laboratorio-ia/src/review/types";

const now = "2026-07-29T10:00:00.000Z";
const later = "2026-07-29T11:00:00.000Z";

function operation(): EntityOperation {
  return {
    id: "operation:inspect:create-fighter",
    kind: "create_entity",
    entityType: "luchador",
    target: {identityKey: "fighter:inspection"},
    payload: {name: "Inspection Fighter"},
    source: "global_resolution",
    evidence: [],
    confidence: .9,
    risk: "medium",
    preconditions: [],
    postconditions: [],
    dependencyIds: [],
    requiredCapability: "create:luchador",
    idempotencyKey: "operation:inspect:create-fighter",
    compensatable: false,
    explanation: "Fixture de inspección.",
  };
}

function checkpoint(op = operation()): GlobalResolutionCheckpoint {
  return {
    schemaVersion: 1,
    id: "checkpoint:inspection",
    caseId: "case:inspection",
    caseVersion: 1,
    storedAtCaseVersion: 1,
    producer: "external_news",
    plan: {
      schemaVersion: 1,
      planId: "plan:inspection",
      caseId: "case:inspection",
      caseVersion: 1,
      producer: "external_news",
      originalOperation: "create_draft",
      operations: [op],
      status: "ready",
      structurallyValid: true,
      executable: true,
      blockers: [],
      warnings: [],
      assumptions: [],
      policy: {minimumCreateConfidence: .8, minimumReuseConfidence: .8, ambiguity: "block", allowSkipOperation: false, allowOptionalDependencySkip: false, allowSkippedDependencyForResume: false, maximumRisk: "medium", requireAllNodesForResume: true, unsupportedOperation: "block", insufficientInformation: "block", availableCapabilities: ["create:luchador"]},
      requiredCapabilities: ["create:luchador"],
      capabilityRequirements: [{id: "create:luchador", support: "executable"}],
      executorRequirements: [],
      planFingerprint: "sha256-v1:planinspection",
      idempotencyKey: "plan:inspection",
    },
    graph: {
      schemaVersion: 1,
      graphId: "graph:inspection",
      planId: "plan:inspection",
      caseId: "case:inspection",
      caseVersion: 1,
      producer: "external_news",
      originalOperation: "create_draft",
      nodes: [{id: "node:inspection", operationId: op.id, dependencyIds: [], state: "reconciliation_required", idempotencyKey: op.idempotencyKey, isResumeNode: false, requiredForCompletion: true}],
      state: "reconciliation_required",
      intentFingerprint: "sha256-v1:intentinspection",
      fingerprint: "sha256-v1:graphinspection",
      idempotencyKey: "graph:inspection",
      metadata: {},
    },
    planFingerprint: "sha256-v1:planinspection",
    graphFingerprint: "sha256-v1:graphinspection",
    caseFingerprint: "sha256-v1:caseinspection",
    checkpointFingerprint: "sha256-v1:checkpointinspection",
    phase: "reconciliation_required",
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

function reviewCase(value = checkpoint()): ReviewCase {
  return {
    schemaVersion: 1,
    id: "case:inspection",
    dedupeKey: "case:inspection",
    module: "external.news",
    title: "Inspection",
    status: "open",
    priority: "high",
    subject: {type: "external_news"},
    issues: [],
    resolutions: [],
    context: {producer: "external_news"},
    createdAt: now,
    updatedAt: now,
    version: 1,
    resumeAttempts: 0,
    globalResolution: value,
  };
}

function request(overrides: Partial<GlobalResolutionInspectionRequest> = {}): GlobalResolutionInspectionRequest {
  const op = operation();
  return {
    caseId: "case:inspection",
    producer: "external_news",
    capability: "create:luchador",
    operationId: op.id,
    operationFingerprint: fingerprintGlobalResolutionInspectionOperation(op),
    checkpointFingerprint: "sha256-v1:checkpointinspection",
    caseVersion: 1,
    subject: {entityType: "luchador", expectedId: "fighter:real", identityKey: "fighter:inspection", expectedPayloadFingerprint: "sha256-v1:payloadinspection"},
    requestedAt: now,
    ...overrides,
  };
}

async function main(): Promise<void> {
  const registry = new GlobalResolutionInspectorRegistry();
  const observed = createGlobalResolutionInspectionFixture({mode: "entity-observed", producer: "external_news", capability: "create:luchador", specificity: 20});
  const unregister = registry.register(observed);
  assert.equal(registry.get(observed.id)?.id, observed.id);
  assert.equal(Object.isFrozen(registry.get(observed.id)), true);
  assert.deepEqual(registry.list().map((item) => item.id), [observed.id]);
  registry.register(observed);
  assert.equal(registry.list().length, 1);
  unregister();
  assert.equal(registry.list().length, 0);

  const generic = createGlobalResolutionInspectionFixture({mode: "entity-observed", id: "fixture:generic", producer: "external_news", specificity: 5});
  const specific = createGlobalResolutionInspectionFixture({mode: "entity-observed", id: "fixture:specific", producer: "external_news", capability: "create:luchador", specificity: 30});
  registry.register(generic);
  registry.register(specific);
  const selected = registry.select(request());
  assert.equal(selected.ok && selected.inspector.id, specific.id);
  const explicit = registry.select(request({inspectorId: generic.id}));
  assert.equal(explicit.ok && explicit.inspector.id, generic.id);
  const incompatibleExplicit = createGlobalResolutionInspectionFixture({mode: "entity-observed", id: "fixture:other", producer: "other"});
  registry.register(incompatibleExplicit);
  assert.deepEqual(registry.select(request({inspectorId: incompatibleExplicit.id})), {ok: false, code: "unsupported", reason: "producer_unsupported"});
  assert.equal(registry.select(request({inspectorId: "missing"})).ok, false);

  const tieOne = createGlobalResolutionInspectionFixture({mode: "entity-observed", id: "fixture:tie-a", specificity: 50});
  const tieTwo = createGlobalResolutionInspectionFixture({mode: "entity-observed", id: "fixture:tie-b", specificity: 50});
  assert.equal(selectCompatibleInspector([tieTwo, tieOne], request()).ok, false);
  const ambiguous = selectCompatibleInspector([tieTwo, tieOne], request());
  assert.equal(!ambiguous.ok && ambiguous.code, "inspector_ambiguous");

  const constrained = createGlobalResolutionInspectionFixture({mode: "entity-observed", producer: "external_news", capability: "create:luchador"});
  assert.deepEqual(constrained.supports(request({producer: "other"})), {supported: false, reason: "producer_unsupported"});
  assert.deepEqual(constrained.supports(request({capability: "resume:external_news"})), {supported: false, reason: "capability_unsupported"});
  assert.deepEqual(constrained.supports(request({subject: {}})), {supported: false, reason: "subject_incomplete"});
  const versionUnsupported: GlobalResolutionEffectInspector = {
    id: "fixture:version",
    version: "2",
    supports: () => ({supported: false, reason: "version_unsupported"}),
    inspect: async () => { throw new Error("not_called"); },
  };
  assert.deepEqual(versionUnsupported.supports(request()), {supported: false, reason: "version_unsupported"});

  const stored = reviewCase();
  const before = JSON.stringify(stored);
  let reads = 0;
  let inspections = 0;
  const serviceRegistry = new GlobalResolutionInspectorRegistry();
  serviceRegistry.register(createGlobalResolutionInspectionFixture({mode: "entity-observed", producer: "external_news", capability: "create:luchador", onInspect: () => { inspections += 1; }}));
  const service = new GlobalResolutionInspectionService(serviceRegistry, (caseId) => { reads += 1; return caseId === stored.id ? structuredClone(stored) : undefined; }, () => now);
  const invalid = await service.inspect(request({operationId: ""}));
  assert.equal(!invalid.ok && invalid.code, "invalid_request");
  const observedResult = await service.inspect(request());
  assert.equal(observedResult.ok, true);
  if (!observedResult.ok) throw new Error("inspection_not_observed");
  assert.equal(observedResult.evidence.status, "observed");
  assert.deepEqual(observedResult.evidence.observations, [{kind: "entity_exists", entityType: "luchador", entityId: "fighter:real", identityKey: "fighter:inspection", payloadFingerprint: "sha256-v1:payloadinspection"}]);
  assert.equal(JSON.stringify(stored), before);
  assert.equal(reads, 2);
  assert.equal(inspections, 1);
  const noInspector = await new GlobalResolutionInspectionService(new GlobalResolutionInspectorRegistry(), () => structuredClone(stored), () => now).inspect(request({inspectorId: "missing"}));
  assert.equal(!noInspector.ok && noInspector.code, "inspector_not_found");
  const tiedRegistry = new GlobalResolutionInspectorRegistry();
  tiedRegistry.register(tieOne);
  tiedRegistry.register(tieTwo);
  const tiedService = await new GlobalResolutionInspectionService(tiedRegistry, () => structuredClone(stored), () => now).inspect(request());
  assert.equal(!tiedService.ok && tiedService.code, "inspector_ambiguous");

  const missingRegistry = new GlobalResolutionInspectorRegistry();
  missingRegistry.register(createGlobalResolutionInspectionFixture({mode: "entity-missing"}));
  const missing = await new GlobalResolutionInspectionService(missingRegistry, () => structuredClone(stored), () => now).inspect(request());
  assert.equal(missing.ok && missing.evidence.status, "not_observed");
  const ambiguousRegistry = new GlobalResolutionInspectorRegistry();
  ambiguousRegistry.register(createGlobalResolutionInspectionFixture({mode: "ambiguous"}));
  const ambiguousResult = await new GlobalResolutionInspectionService(ambiguousRegistry, () => structuredClone(stored), () => now).inspect(request());
  assert.equal(ambiguousResult.ok && ambiguousResult.evidence.status, "ambiguous");
  if (ambiguousResult.ok) assert.deepEqual((ambiguousResult.evidence.observations[0] as Extract<GlobalResolutionObservation, {kind: "multiple_candidates"}>).candidateIds, ["candidate:a", "candidate:z"]);
  const unavailableRegistry = new GlobalResolutionInspectorRegistry();
  unavailableRegistry.register(createGlobalResolutionInspectionFixture({mode: "unavailable"}));
  const unavailable = await new GlobalResolutionInspectionService(unavailableRegistry, () => structuredClone(stored), () => now).inspect(request());
  assert.equal(unavailable.ok && unavailable.evidence.status, "unavailable");

  const throwingRegistry = new GlobalResolutionInspectorRegistry();
  throwingRegistry.register(createGlobalResolutionInspectionFixture({mode: "throwing"}));
  const thrown = await new GlobalResolutionInspectionService(throwingRegistry, () => structuredClone(stored), () => now).inspect(request());
  assert.deepEqual(thrown, {ok: false, code: "inspection_failed", message: "La inspección de sólo lectura no pudo completarse.", retryable: true});
  assert.equal(JSON.stringify(thrown).includes("secret"), false);

  let releaseSlow: (() => void) | undefined;
  const delayed = new Promise<void>((resolve) => { releaseSlow = resolve; });
  let slowReads = 0;
  const slowRegistry = new GlobalResolutionInspectorRegistry();
  slowRegistry.register(createGlobalResolutionInspectionFixture({mode: "slow", delay: () => delayed, onInspect: () => { slowReads += 1; }}));
  const slowService = new GlobalResolutionInspectionService(slowRegistry, () => structuredClone(stored), () => now);
  const controller = new AbortController();
  const slowOne = slowService.inspect(request(), {signal: controller.signal});
  const slowTwo = slowService.inspect(request(), {signal: controller.signal});
  assert.equal(slowOne, slowTwo);
  controller.abort();
  releaseSlow?.();
  assert.equal((await slowOne).ok, false);
  assert.equal(slowReads, 1);

  const rawInspector: Pick<GlobalResolutionEffectInspector, "id" | "version"> = {id: "fixture:normalize", version: "1"};
  const raw = {
    inspectorId: "wrong",
    inspectorVersion: "wrong",
    inspectionId: "wrong",
    producer: "wrong",
    capability: "wrong",
    operationId: "wrong",
    operationFingerprint: "sha256-v1:wrong",
    checkpointFingerprint: "sha256-v1:wrong",
    inspectedAt: now,
    status: "ambiguous",
    observations: [
      {kind: "multiple_candidates", entityType: "luchador", candidateIds: ["z", "a", "a"], identityKey: "fighter:inspection", fullDocument: {secret: "no"}} as unknown as GlobalResolutionObservation,
      {kind: "entity_missing", entityType: "luchador", expectedId: "fighter:real"},
    ],
    warnings: [" second ", "token=private", "second"],
    fingerprint: "sha256-v1:wrong",
  } satisfies GlobalResolutionInspectionEvidence;
  const normalizedOne = normalizeGlobalResolutionInspectionEvidence({request: request(), inspector: rawInspector, evidence: raw, inspectedAt: now});
  const normalizedTwo = normalizeGlobalResolutionInspectionEvidence({request: request(), inspector: rawInspector, evidence: {...raw, observations: [...raw.observations].reverse()}, inspectedAt: later});
  assert.equal(normalizedOne.fingerprint, normalizedTwo.fingerprint);
  assert.notEqual(normalizedOne.inspectedAt, normalizedTwo.inspectedAt);
  assert.deepEqual((normalizedOne.observations.find((item) => item.kind === "multiple_candidates") as Extract<GlobalResolutionObservation, {kind: "multiple_candidates"}>).candidateIds, ["a", "z"]);
  assert.equal(JSON.stringify(normalizedOne).includes("fullDocument"), false);
  assert.equal(JSON.stringify(normalizedOne).includes("private"), false);
  assert.deepEqual(normalizedOne.warnings, ["second", "token=[redacted]"]);
  const invalidStatus = normalizeGlobalResolutionInspectionEvidence({
    request: request(),
    inspector: rawInspector,
    evidence: {...raw, status: "unexpected"} as unknown as GlobalResolutionInspectionEvidence,
    inspectedAt: now,
  });
  assert.equal(invalidStatus.status, "unavailable");

  assert.equal((await service.inspect(request({caseVersion: 2}))).ok, false);
  const checkpointConflict = await service.inspect(request({checkpointFingerprint: "sha256-v1:changed"}));
  assert.equal(!checkpointConflict.ok && checkpointConflict.code, "checkpoint_conflict");
  const operationConflict = await service.inspect(request({operationFingerprint: "sha256-v1:changed"}));
  assert.equal(!operationConflict.ok && operationConflict.code, "operation_conflict");
  const completed = structuredClone(stored);
  completed.globalResolution!.graph.nodes[0].state = "succeeded";
  const completedResult = await new GlobalResolutionInspectionService(serviceRegistry, () => completed, () => now).inspect(request());
  assert.equal(!completedResult.ok && completedResult.code, "operation_conflict");

  const adapted = inspectionEvidenceToReconciliationEvidence(observedResult.evidence);
  assert.equal(adapted[0].finding, "effect_confirmed");
  assert.equal(adapted[0].documentId, "fighter:real");
  const reconciliationCase: GlobalResolutionReconciliationCase = {caseId: stored.id, caseVersion: stored.version, checkpointFingerprint: stored.globalResolution!.checkpointFingerprint, operationId: operation().id, capability: "create:luchador", reason: "executor_uncertain", evidence: adapted, confidence: "confirmed", createdAt: now};
  assert.equal(assessReconciliation(reconciliationCase, stored.globalResolution!).status, "confirmed_succeeded", "identity y fingerprint inspeccionados permiten al assessment publicado decidir");
  const localOnly: GlobalResolutionReconciliationCase = {...reconciliationCase, evidence: [], confidence: "insufficient"};
  assert.doesNotThrow(() => assessReconciliation(localOnly, stored.globalResolution!));

  const oldFingerprint = observedResult.evidence.fingerprint;
  const changedRequest = request({checkpointFingerprint: "sha256-v1:newcheckpoint"});
  const rebound = normalizeGlobalResolutionInspectionEvidence({request: changedRequest, inspector: rawInspector, evidence: observedResult.evidence, inspectedAt: later});
  assert.notEqual(rebound.fingerprint, oldFingerprint);

  assert.deepEqual(globalResolutionInspectionSecurity, {
    readOnly: true,
    executesCapabilities: false,
    executesProducers: false,
    executesResume: false,
    mutatesReviewCase: false,
    mutatesCheckpoint: false,
    persistsEvidence: false,
    persistsCredentials: false,
    automaticExecution: false,
    genericQueries: false,
  });
  const serialized = JSON.stringify({request: request(), result: observedResult});
  assert.equal(serialized.includes("authorization"), false);
  assert.equal(serialized.includes("fullDocument"), false);
  assert.equal(JSON.stringify(stored), before);
  const inspectionSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/service.ts"), "utf8");
  const inspectionTree = [
    "service.ts", "registry.ts", "normalize.ts", "adapter.ts", "types.ts",
  ].map((file) => readFileSync(resolve(`_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/${file}`), "utf8")).join("\n");
  assert.equal(inspectionSource.includes("updateReviewCase"), false);
  assert.equal(inspectionSource.includes("updateGlobalResolutionCheckpoint"), false);
  assert.equal(inspectionSource.includes("executeUniversalExecutionPlan"), false);
  assert.equal(inspectionTree.includes("saveDraft("), false);
  assert.equal(inspectionTree.includes("fetch("), false);
  assert.equal(inspectionTree.includes("createClient"), false);
  assert.equal(inspectionTree.includes("localStorage"), false);
  assert.equal(inspectionTree.includes("useEffect"), false);
  console.log("AU4 global resolution inspection contract tests: OK");
}

main();
