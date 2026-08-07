import assert from "node:assert/strict";
import {
  CandidateDiscoveryRegistry, CandidateDiscoveryService, createSanityFighterCandidateDiscoveryAdapter,
  type CandidateDiscoveryContext, type CandidateDiscoveryRequest,
} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity";
import {createInMemoryCandidateReader} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity/discovery/devFixture";
import {
  FIGHTER_IDENTITY_GUARD_CAPABILITY, buildGlobalResolutionPlan, ensureFighterIdentityGuardOperations,
  fighterIdentityGuardForCreation, resolveFighterIdentityGuard, validateFighterIdentityGuardAuthorization,
  pilotCapabilityRegistry, createGlobalResolutionCheckpoint, updateCheckpointAfterFighterIdentityGuard,
  markCheckpointExecutionStarted, simulateGlobalResolutionPlan, extractFighterCreationUniversalPlan,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import type {GlobalResolutionCurrentCatalog} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint";
import type {ReviewCase, ReviewJsonObject} from "../_laboratorio/laboratorio-ia/src/review/types";
import {buildResumeContract, type UniversalReviewInput} from "../_laboratorio/laboratorio-ia/src/review/universal";

const now = "2026-07-31T12:00:00.000Z";
const draft: ReviewJsonObject = {entityType: "fighter", name: "Ada Fighter", identityKey: "fighter:ada-fighter", disciplineId: "discipline:boxing", organizationIds: ["organization:test"], sourceEvidence: [{source: "test"}]};
const evidence = [{id: "e", kind: "source", source: "test", confidence: .99, limitations: []}];
const reviewCase: ReviewCase = {
  schemaVersion: 1, id: "case:au5-b3", dedupeKey: "case:au5-b3", module: "external.news", title: "Guard",
  status: "open", priority: "high", subject: {type: "external_news"},
  issues: [{id: "issue:fighter", kind: "missing_entity", valueKind: "fighter", fieldPath: "fighter", label: "Fighter", message: "Missing", required: true, blocking: true}],
  resolutions: [{type: "create_entity", issueId: "issue:fighter", entityType: "fighter", draft: {name: "Ada Fighter"}}],
  context: {producer: "external_news", operation: "create_draft", payloadSnapshot: {id: "news:1"}},
  createdAt: now, updatedAt: now, version: 1, resumeAttempts: 0,
};

function plan() {
  const built = buildGlobalResolutionPlan({
    reviewCase, preparedEntities: [{issueId: "issue:fighter", entityType: "fighter", draft, identityKey: "fighter:ada-fighter", valid: true, evidence}],
    evidence: evidence.map((item) => ({...item, issueId: "issue:fighter"})), finalEntityType: "noticia",
    policy: {availableCapabilities: ["create:luchador", FIGHTER_IDENTITY_GUARD_CAPABILITY, "validate:noticia", "resume:external_news"]}, now: () => now,
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("plan_failed");
  return built.plan;
}

const service = (records: readonly Record<string, unknown>[]) => {
  const registry = new CandidateDiscoveryRegistry();
  registry.register(createSanityFighterCandidateDiscoveryAdapter(createInMemoryCandidateReader(records)));
  return new CandidateDiscoveryService(registry);
};
const statusService = (status: "partial" | "truncated") => {
  const base = createSanityFighterCandidateDiscoveryAdapter(createInMemoryCandidateReader([]));
  const registry = new CandidateDiscoveryRegistry();
  registry.register(Object.freeze({...base, async discover(request: CandidateDiscoveryRequest, context: CandidateDiscoveryContext) {
    const result = await base.discover(request, context);
    return Object.freeze({...result, status, truncated: status === "truncated", reason: status === "truncated" ? "limit_reached" as const : "missing_context" as const});
  }}));
  return new CandidateDiscoveryService(registry);
};

async function main() {
  const current = plan();
  const create = current.operations.find((operation) => operation.kind === "create_entity" && operation.entityType === "luchador")!;
  const guard = fighterIdentityGuardForCreation(current.operations, create.id)!;
  assert.ok(guard);
  assert.equal(guard.requiredCapability, FIGHTER_IDENTITY_GUARD_CAPABILITY);
  assert.equal(create.dependencyIds.includes(guard.id), true);
  assert.equal(current.operations.filter((operation) => operation.requiredCapability === FIGHTER_IDENTITY_GUARD_CAPABILITY).length, 1);
  const twice = ensureFighterIdentityGuardOperations(ensureFighterIdentityGuardOperations(current.operations, current.producer), current.producer);
  assert.equal(twice.filter((operation) => operation.requiredCapability === FIGHTER_IDENTITY_GUARD_CAPABILITY).length, 1);
  assert.deepEqual(twice.map((operation) => operation.id), ensureFighterIdentityGuardOperations(current.operations, current.producer).map((operation) => operation.id));

  const empty = await resolveFighterIdentityGuard({plan: current, guardOperationId: guard.id, service: service([]), now: () => now});
  assert.equal(empty.authorization.decision, "create_new");
  assert.equal(empty.authorization.discoveryStatus, "complete");
  assert.equal(validateFighterIdentityGuardAuthorization(empty.authorization, {plan: current, creationOperationId: create.id}).valid, true);
  assert.equal(empty.authorization.entityType, "fighter"); assert.equal(empty.authorization.schemaType, "luchador"); assert.equal(empty.authorization.createCapability, "create:luchador"); assert.equal(empty.authorization.planId, current.id); assert.equal(empty.authorization.rulesVersion, "1.0.0"); assert.ok(empty.authorization.nonce);

  const existing = await resolveFighterIdentityGuard({plan: current, guardOperationId: guard.id, service: service([{_id: "fighter:ada", _type: "luchador", nombre: "Ada Fighter"}]), now: () => now});
  assert.equal(existing.authorization.decision, "reuse_existing");
  assert.equal(existing.authorization.resolvedEntityId, "fighter:ada");
  assert.equal(validateFighterIdentityGuardAuthorization(existing.authorization, {plan: current, creationOperationId: create.id}).valid, false);

  const ambiguous = await resolveFighterIdentityGuard({plan: current, guardOperationId: guard.id, service: service([
    {_id: "fighter:ada-1", _type: "luchador", nombre: "Ada Fighter"},
    {_id: "fighter:ada-2", _type: "luchador", nombre: "Ada Fighter"},
  ]), now: () => now});
  assert.equal(ambiguous.authorization.decision, "ambiguous");

  const unavailable = await resolveFighterIdentityGuard({plan: current, guardOperationId: guard.id, service: new CandidateDiscoveryService(new CandidateDiscoveryRegistry()), now: () => now});
  assert.equal(unavailable.authorization.decision, "blocked");
  assert.equal(unavailable.authorization.reasonCode, "discovery_unavailable");
  const partial = await resolveFighterIdentityGuard({plan: current, guardOperationId: guard.id, service: statusService("partial"), now: () => now});
  assert.equal(partial.authorization.reasonCode, "discovery_incomplete");
  const truncated = await resolveFighterIdentityGuard({plan: current, guardOperationId: guard.id, service: statusService("truncated"), now: () => now});
  assert.equal(truncated.authorization.reasonCode, "discovery_incomplete");

  const controller = new AbortController(); controller.abort();
  const cancelled = await resolveFighterIdentityGuard({plan: current, guardOperationId: guard.id, service: service([]), signal: controller.signal, now: () => now});
  assert.equal(cancelled.authorization.reasonCode, "discovery_cancelled");

  assert.equal(validateFighterIdentityGuardAuthorization({...empty.authorization, identityFingerprint: "sha256-v1:changed"}, {plan: current, creationOperationId: create.id}).valid, false);
  assert.equal(validateFighterIdentityGuardAuthorization(undefined, {plan: current, creationOperationId: create.id}).reasonCode, "guard_missing");
  const otherPlan = {...current, fingerprint: "sha256-v1:changed"};
  assert.equal(validateFighterIdentityGuardAuthorization(empty.authorization, {plan: otherPlan, creationOperationId: create.id}).valid, false);
  assert.equal(JSON.stringify(empty.authorization).includes("query"), false);
  assert.equal(JSON.stringify(empty.authorization).includes("document"), false);

  const graph = structuredClone(current.graph);
  const guardNode = graph.nodes.find((node) => node.operation.id === guard.id)!;
  const complete = (id: string) => {
    const node = graph.nodes.find((candidate) => candidate.id === id)!;
    node.dependencyIds.forEach(complete);
    node.state = "succeeded";
  };
  guardNode.dependencyIds.forEach(complete);
  guardNode.state = "ready";
  graph.nodes.find((node) => node.operation.id === create.id)!.state = "pending";
  graph.state = "ready";
  const capabilities = pilotCapabilityRegistry.list();
  const catalog: GlobalResolutionCurrentCatalog = {
    schemaVersion: 1,
    capabilities: capabilities.map(({id, support, operationKinds}) => ({id, support, operationKinds})),
    executors: [], producers: [{producer: "external_news", version: 1, supportedEntityTypes: ["external_news"], supportedOperations: ["create_draft"]}],
    fingerprint: "sha256-v1:test", valid: true, errors: [],
    recoveryEnvironment: {capabilities: capabilities.map(({id, support}) => ({id, support})), executors: []},
  };
  const pendingCheckpoint = createGlobalResolutionCheckpoint({reviewCase, plan: current, graph, capabilities, phase: "partially_executed", now: () => now});
  assert.throws(() => markCheckpointExecutionStarted({reviewCase, plan: current, catalog, checkpoint: pendingCheckpoint, operationId: create.id, idempotencyKey: "direct", startedAt: now}), /not_ready|identity_guard/);
  const authorizedCheckpoint = updateCheckpointAfterFighterIdentityGuard({reviewCase, plan: current, catalog, checkpoint: pendingCheckpoint, authorization: empty.authorization, now: () => now});
  assert.equal(authorizedCheckpoint.identityGuard?.decision, "create_new");
  assert.equal(authorizedCheckpoint.graph.nodes.find((node) => node.operationId === create.id)?.state, "ready");
  assert.doesNotThrow(() => markCheckpointExecutionStarted({reviewCase, plan: current, catalog, checkpoint: authorizedCheckpoint, operationId: create.id, idempotencyKey: "authorized", startedAt: now}));
  const reusedCheckpoint = updateCheckpointAfterFighterIdentityGuard({reviewCase, plan: current, catalog, checkpoint: pendingCheckpoint, authorization: existing.authorization, now: () => now});
  assert.equal(reusedCheckpoint.graph.nodes.find((node) => node.operationId === create.id)?.state, "succeeded");
  assert.equal(reusedCheckpoint.graph.nodes.find((node) => node.operationId === create.id)?.result?.references[0]?.id, "fighter:ada");
  const blockedCheckpoint = updateCheckpointAfterFighterIdentityGuard({reviewCase, plan: current, catalog, checkpoint: pendingCheckpoint, authorization: ambiguous.authorization, now: () => now});
  assert.equal(blockedCheckpoint.graph.nodes.find((node) => node.operationId === create.id)?.state, "blocked");
  const simulation = simulateGlobalResolutionPlan(current, {
    reviewCase, preparedEntities: [{issueId: "issue:fighter", entityType: "fighter", draft}],
    fighterCandidates: [], newsPayload: {titulo: "News", contenido: "Body", fuenteUrl: "https://example.test", fechaPublicacion: now, disciplina: "discipline:boxing", organizacionRelacionada: "", eventoRelacionado: "", luchadoresRelacionados: [], imagenPrincipal: "https://example.test/image.jpg"},
    producerContracts: [{producer: "external_news", supportsSimulation: true, allowsProjectedReferences: true}],
  });
  const snapshot = {title: "Guard"};
  const universalInput: UniversalReviewInput = {
    schemaVersion: 1, logicalKey: reviewCase.id, producerId: "external_news", operationId: "create_draft",
    operationType: "create", module: "external.news", entity: {type: "noticia"}, issueFamily: "missing_reference",
    issueCode: "missing_fighter", priority: "high", title: "Guard", snapshot, issues: [], evidence: [], constraints: [],
    resume: buildResumeContract({producerId: "external_news", operationId: "create_draft", operationType: "create", checkpoint: "review", snapshotVersion: 1, snapshot, idempotencyKey: reviewCase.id}),
  };
  const safeSimulation = {
    ...simulation, simulatable: true, blockers: [],
    nodeResults: simulation.nodeResults.map((item) => item.input.operationId === create.id ? {...item, status: "simulated" as const, decision: "create_candidate" as const, blockers: []} : item),
  };
  assert.equal(extractFighterCreationUniversalPlan({plan: current, simulation: safeSimulation, reviewInput: universalInput}).ok, false);
  const authorizedExtraction = extractFighterCreationUniversalPlan({plan: current, simulation: safeSimulation, reviewInput: universalInput, identityGuardAuthorization: empty.authorization});
  assert.equal(authorizedExtraction.ok, true, authorizedExtraction.ok ? "" : authorizedExtraction.reason);
  console.log("AU5 identity guard graph tests: OK (32 cases)");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
