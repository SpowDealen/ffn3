import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {buildEntityOperation, entityOperationRegistry, type EntityOperation, type EntityOperationEntityType} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import {buildResolutionGraphFromOperations, ensureIdentityCreationGuardOperations, identityCreationGuardForCreation, identityCreationGuardProfiles, identityCreationGuardSecurity, isIdentityCreationSupported, pilotCapabilityRegistry, validateIdentityCreationAuthorization} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {createEntityResolutionEngine} from "../_laboratorio/laboratorio-ia/src/review/entityResolution";
import * as universal from "../_laboratorio/laboratorio-ia/src/review/universal";

const now = "2026-07-31T12:00:00.000Z";
const schemas = ["luchador", "evento", "organizacion", "categoriaPeso", "disciplina", "combate", "noticia"] as const;
const operation = (entityType: EntityOperationEntityType, index: number): EntityOperation => buildEntityOperation({id: `create:${entityType}:${index}`, kind: "create_entity", entityType, payload: {nombre: `${entityType} ${index}`}, source: "global_resolution", evidence: [], confidence: 1, risk: "medium", preconditions: [], postconditions: [], dependencyIds: [], requiredCapability: `create:${entityType}`, compensatable: false, explanation: "Fixture de creación protegida."});

async function main() {
  assert.deepEqual(identityCreationGuardProfiles.map((item) => item.schemaType), schemas);
  assert.deepEqual(identityCreationGuardProfiles.filter(isIdentityCreationSupported).map((item) => item.schemaType), ["luchador", "evento", "organizacion", "categoriaPeso"]);
  assert.equal(identityCreationGuardProfiles.find((item) => item.schemaType === "evento")?.unsupportedReason, undefined);
  assert.equal(identityCreationGuardProfiles.find((item) => item.schemaType === "combate")?.unsupportedReason, "discovery_adapter_missing");
  for (const entityType of schemas) assert.equal(entityOperationRegistry.supports(entityType, "create_entity"), entityType === "luchador" ? "executable" : undefined);

  const creates = schemas.map(operation);
  const guarded = ensureIdentityCreationGuardOperations(creates, "au6-b3");
  assert.equal(guarded.length, creates.length * 2);
  for (const create of creates) {
    const guard = identityCreationGuardForCreation(guarded, create.id); assert.ok(guard, create.entityType);
    assert.equal(guarded.find((item) => item.id === create.id)?.dependencyIds.filter((id) => id === guard?.id).length, 1);
    assert.equal(guard?.requiredCapability, identityCreationGuardProfiles.find((item) => item.schemaType === create.entityType)?.guardCapability);
  }
  assert.deepEqual(ensureIdentityCreationGuardOperations(guarded, "au6-b3"), guarded);
  assert.throws(() => ensureIdentityCreationGuardOperations([operation("evento", 8), {...operation("evento", 9), entityType: "resultado" as EntityOperationEntityType}], "au6-b3"), /unregistered/);

  const graph = buildResolutionGraphFromOperations({caseId: "case:au6-b3", caseVersion: 1, producer: "au6-b3", originalOperation: "fixture", operations: creates, policy: {minimumCreateConfidence: .8, minimumReuseConfidence: .8, ambiguity: "block", allowSkipOperation: false, allowOptionalDependencySkip: false, allowSkippedDependencyForResume: false, maximumRisk: "medium", requireAllNodesForResume: true, unsupportedOperation: "block", insufficientInformation: "block", availableCapabilities: pilotCapabilityRegistry.list().map((item) => item.id)}, now: () => now});
  for (const create of creates) assert.equal(graph.nodes.find((node) => node.operation.id === create.id)?.dependencyIds.some((id) => id.startsWith("identity-guard:")), true);
  for (const create of creates.filter((item) => item.entityType !== "luchador" && ["evento", "organizacion", "categoriaPeso"].includes(item.entityType))) assert.deepEqual(validateIdentityCreationAuthorization(undefined, {plan: {operations: guarded} as never, creationOperationId: create.id}), {valid: false, reasonCode: "blocked_missing_preflight"});

  const unsupported = await createEntityResolutionEngine({}).resolve({version: 1, mode: "creation_preflight", entityType: "event", producer: "review-center", source: "sanity", plan: {id: "plan"}, guardOperationId: "guard:event"});
  assert.equal(unsupported.status, "unavailable"); assert.equal(unsupported.reasonCode, "fighter_creation_preflight_unavailable");
  assert.deepEqual(identityCreationGuardSecurity, {failClosed: true, defaultProfile: false, automaticReuse: false, reconciliationAuthorization: false, callerDecision: false, callerToken: false});

  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = "testproject"; process.env.NEXT_PUBLIC_SANITY_DATASET = "test"; process.env.SANITY_API_WRITE_TOKEN = "test-token";
  const routes = [
    "../app/api/guardar-borrador/route", "../app/api/sources/fekm/categories/create/route", "../app/api/sources/fekm/events/create-event/route", "../app/api/sources/fekm/events/create-organization/route",
    "../app/api/sources/bkfc/events/create-categories/route", "../app/api/sources/bkfc/events/create-event/route", "../app/api/sources/bkfc/events/create-fights/route",
    "../app/api/sources/one/events/create-categories/route", "../app/api/sources/one/events/create-event/route", "../app/api/sources/one/events/create-fights/route", "../app/api/sources/ufc/events/create-fights/route",
  ];
  for (const path of routes) {
    const route = await import(path) as {POST(request: Request): Promise<Response> | Response};
    const response = await route.POST(new Request("http://localhost/create", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({confirm: true, document: {_type: "evento"}})}));
    assert.equal(response.status, 409, path); assert.equal((await response.json() as {reasonCode?: string}).reasonCode, "identity_resolution_unsupported", path);
  }

  const snapshot = {name: "Evento sin autorización"};
  const resume = universal.buildResumeContract({producerId: "au6-b3", operationId: "create-event", operationType: "create", checkpoint: "ready", snapshotVersion: 1, snapshot, requiredCapabilities: ["create:evento"], idempotencyKey: "au6-b3:create-event"});
  const reviewInput: universal.UniversalReviewInput = {schemaVersion: 1, logicalKey: "au6-b3:event", producerId: "au6-b3", operationId: "create-event", operationType: "create", module: "test", entity: {type: "evento"}, issueFamily: "missing_reference", issueCode: "event_missing", priority: "high", title: "Creación protegida", snapshot, issues: [{id: "issue:event", kind: "missing_entity", label: "Evento", message: "Falta el evento", blocking: true}], evidence: [], constraints: [], resume};
  const universalPlan = universal.buildUniversalExecutionPlan({reviewCase: {id: "case:au6-b3:event", version: 1, subject: {type: "evento"}, context: {}}, reviewInput, effects: [{id: "create-event", type: "create_entity", entityType: "evento", payload: {nombre: "Evento sin autorización"}}], postconditions: [{id: "post:create-event", kind: "entity_created", description: "Evento persistido", required: true, effectIndexes: [0]}], now: () => now});
  let writeCalls = 0;
  const unregister = universal.registerReviewExecutor({executorId: "au6-b3-event-writer", version: 1, capability: "create:evento", supportedEffects: ["create_entity"], supportedEntityTypes: ["evento"], risk: "medium", canExecute: () => true,
    async simulate(_plan, _state, effectIndexes) { const binding = universal.getRegisteredReviewExecutor("au6-b3-event-writer")!; return {executorId: binding.manifest.executorId, executorVersion: binding.manifest.version, executorManifestFingerprint: binding.manifestFingerprint, capability: binding.manifest.capability, status: "safe", effectIndexes, changes: [], warnings: [], blockingReasons: [], errors: []}; },
    async execute(_plan, _state, effectIndexes, options) { writeCalls += 1; const binding = universal.getRegisteredReviewExecutor("au6-b3-event-writer")!; return {executorId: binding.manifest.executorId, executorVersion: binding.manifest.version, executorManifestFingerprint: binding.manifestFingerprint, capability: binding.manifest.capability, status: "succeeded", effectIndexes, idempotencyKey: options.idempotencyKey, references: []}; },
    async validateExecution(plan, result) { return {valid: true, planFingerprint: plan.planFingerprint, executorId: result.executorId, executionIdempotencyKey: result.idempotencyKey, checkedPostconditionIds: ["post:create-event"], checkedEffectIndexes: result.effectIndexes, errors: [], warnings: [], validatedAt: now}; },
  });
  try {
    const simulation = await universal.simulateUniversalExecutionPlan(universalPlan, snapshot, {now: () => now});
    assert.equal(simulation.status, "safe");
    const execution = await universal.executeUniversalExecutionPlan(universalPlan, snapshot, simulation, {now: () => now});
    assert.equal(execution.status, "blocked"); assert.equal(execution.error?.code, "identity_guard_required"); assert.equal(writeCalls, 0);
  } finally { unregister(); }

  const lifecycle = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint/lifecycle.ts"), "utf8");
  const recovery = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint/recovery.ts"), "utf8");
  const dispatcher = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/universal/executeUniversalExecutionPlan.ts"), "utf8");
  const legacyMaterialization = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/materialization/preparedEntityMaterialization.ts"), "utf8");
  const materializationCapabilities = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/materialization/materializationCapabilities.ts"), "utf8");
  assert.equal((lifecycle.match(/validateIdentityCreationAuthorization/g) ?? []).length >= 3, true);
  assert.equal(recovery.includes('node.operation.entityType !== "luchador"'), false);
  assert.equal(dispatcher.includes("createEffectsAuthorized"), true);
  assert.equal(legacyMaterialization.includes("checkDuplicate("), false); assert.equal(legacyMaterialization.includes(".createEntity("), false);
  assert.equal(materializationCapabilities.includes("sanity.create_prepared_entity"), false); assert.equal((materializationCapabilities.match(/capability\(\{/g) ?? []).length, 1);
  console.log("AU6 universal identity creation guard tests: OK (7 schemas, graph, engine, routes and dispatcher)");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
