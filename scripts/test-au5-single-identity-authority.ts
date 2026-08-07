import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  buildGlobalResolutionPlan, createFighterCreationUniversalExecutor, extractFighterCreationUniversalPlan,
  fighterIdentityGuardForCreation, resolveFighterIdentityGuard, simulateGlobalResolutionPlan,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {CandidateDiscoveryRegistry, CandidateDiscoveryService, createSanityFighterCandidateDiscoveryAdapter} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity";
import {createInMemoryCandidateReader} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity/discovery/devFixture";
import {buildResumeContract, type ReviewEffect, type UniversalExecutionPlan, type UniversalReviewInput} from "../_laboratorio/laboratorio-ia/src/review/universal";
import type {CreateEditorialEntityExecutor} from "../_laboratorio/laboratorio-ia/src/review/materialization";
import type {ReviewCase, ReviewJsonObject, ReviewJsonValue} from "../_laboratorio/laboratorio-ia/src/review/types";

const now = "2026-07-27T16:00:00.000Z";
const draft: ReviewJsonObject = {entityType: "fighter", name: "Ada Fighter", identityKey: "fighter:ada-fighter", disciplineId: "discipline:boxing", organizationIds: ["organization:test"], sourceEvidence: [{source: "test"}]};
const reviewCase = (): ReviewCase => ({schemaVersion: 1, id: "case:au5-b4", dedupeKey: "case:au5-b4", module: "external.news", title: "Fighter", status: "open", priority: "high", subject: {type: "external_news", id: "news:1"}, issues: [{id: "issue:fighter", kind: "missing_entity", valueKind: "fighter", fieldPath: "fighter", label: "Fighter", message: "Missing", required: true, blocking: true}], resolutions: [{type: "create_entity", issueId: "issue:fighter", entityType: "fighter", draft: {name: "Ada Fighter"}}], context: {producer: "external_news", operation: "create_draft", payloadSnapshot: {id: "news:1"}}, createdAt: now, updatedAt: now, version: 1, resumeAttempts: 0});
const reviewInput = (): UniversalReviewInput => { const snapshot = {title: "Fighter"}; return {schemaVersion: 1, logicalKey: "case:au5-b4", producerId: "external_news", operationId: "create_draft", operationType: "create", module: "external.news", entity: {type: "noticia", id: "news:1"}, issueFamily: "missing_reference", issueCode: "missing_fighter", priority: "high", title: "Fighter", snapshot, issues: [], evidence: [], constraints: [], resume: buildResumeContract({producerId: "external_news", operationId: "create_draft", operationType: "create", checkpoint: "review", snapshotVersion: 1, snapshot, idempotencyKey: "case:au5-b4"})}; };

async function authorizedPlan(): Promise<UniversalExecutionPlan> {
  const built = buildGlobalResolutionPlan({reviewCase: reviewCase(), preparedEntities: [{issueId: "issue:fighter", entityType: "fighter", draft, identityKey: "fighter:ada-fighter", valid: true, evidence: [{id: "e", kind: "source", source: "test", confidence: .98, limitations: []}]}], evidence: [{issueId: "issue:fighter", id: "e", kind: "source", source: "test", confidence: .98, limitations: []}], finalEntityType: "noticia", policy: {availableCapabilities: ["create:luchador", "resolve_identity:fighter"]}, now: () => now});
  assert.equal(built.ok, true); if (!built.ok) throw new Error("plan_failed");
  const simulation = simulateGlobalResolutionPlan(built.plan, {reviewCase: reviewCase(), preparedEntities: [{issueId: "issue:fighter", entityType: "fighter", draft}], fighterCandidates: [], newsPayload: {titulo: "Noticia", contenido: "Contenido", fuenteUrl: "https://example.test", fechaPublicacion: now, disciplina: "discipline:boxing", organizacionRelacionada: "", eventoRelacionado: "", luchadoresRelacionados: [], imagenPrincipal: "https://example.test/image.jpg"}, producerContracts: [{producer: "external_news", supportsSimulation: true, allowsProjectedReferences: true}]});
  const registry = new CandidateDiscoveryRegistry(); registry.register(createSanityFighterCandidateDiscoveryAdapter(createInMemoryCandidateReader([])));
  const create = built.plan.operations.find((item) => item.kind === "create_entity" && item.entityType === "luchador")!;
  const guard = fighterIdentityGuardForCreation(built.plan.operations, create.id)!;
  const resolved = await resolveFighterIdentityGuard({plan: built.plan, guardOperationId: guard.id, service: new CandidateDiscoveryService(registry), now: () => now});
  const extracted = extractFighterCreationUniversalPlan({plan: built.plan, simulation, reviewInput: reviewInput(), identityGuardAuthorization: resolved.authorization, now: () => now});
  assert.equal(extracted.ok, true); if (!extracted.ok) throw new Error("extraction_failed"); return extracted.universalPlan;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function gateway(result: Awaited<ReturnType<CreateEditorialEntityExecutor["createEntity"]>> = {success: true, entityId: "fighter:ada"}) {
  let dedupeCalls = 0; let writeCalls = 0;
  const value: CreateEditorialEntityExecutor = {async checkDuplicate() { dedupeCalls += 1; throw new Error("legacy_deduplication_called"); }, async createEntity() { writeCalls += 1; return result; }};
  return {value, dedupeCalls: () => dedupeCalls, writeCalls: () => writeCalls};
}
async function direct(plan: UniversalExecutionPlan, source = gateway(), executionNow = now) {
  const executor = createFighterCreationUniversalExecutor({entityCreationExecutor: source.value, now: () => executionNow});
  return {result: await executor.execute(plan, {} as ReviewJsonValue, [0], {idempotencyKey: "au5-b4", signal: new AbortController().signal}), source};
}

async function main() {
  const plan = await authorizedPlan();
  const valid = await direct(plan); assert.equal(valid.result.status, "succeeded"); assert.equal(valid.source.writeCalls(), 1); assert.equal(valid.source.dedupeCalls(), 0);

  const missing = clone(plan); delete ((missing.effects[0] as ReviewEffect & {payload: Record<string, unknown>}).payload.identityGuardAuthorization); const missingRun = await direct(missing); assert.equal(missingRun.result.status, "blocked"); assert.equal(missingRun.result.error?.message, "identity_guard_missing"); assert.equal(missingRun.source.writeCalls(), 0);
  for (const decision of ["reuse_existing", "ambiguous", "blocked"] as const) { const changed = clone(plan); (((changed.effects[0] as ReviewEffect & {payload: Record<string, unknown>}).payload.identityGuardAuthorization as Record<string, unknown>).decision) = decision; const attempt = await direct(changed); assert.equal(attempt.result.error?.message, "identity_not_create_new", decision); assert.equal(attempt.source.writeCalls(), 0, decision); }
  for (const [field, value] of [["planFingerprint", "sha256-v1:changed"], ["caseId", "changed"], ["caseVersion", 99], ["producer", "changed"], ["creationOperationId", "changed"], ["identityFingerprint", "sha256-v1:changed"], ["authorizationFingerprint", "sha256-v1:changed"]] as const) {
    const changed = clone(plan); const authorization = ((changed.effects[0] as ReviewEffect & {payload: Record<string, unknown>}).payload.identityGuardAuthorization as Record<string, unknown>); authorization[field] = value; const attempt = await direct(changed); assert.equal(attempt.result.status, "blocked", field); assert.equal(attempt.source.writeCalls(), 0, field);
  }
  const changedPayload = clone(plan); ((changedPayload.effects[0] as ReviewEffect & {payload: {draft: Record<string, unknown>}}).payload.draft).name = "Other"; const changedPayloadRun = await direct(changedPayload); assert.equal(changedPayloadRun.result.status, "blocked"); assert.equal(changedPayloadRun.source.writeCalls(), 0);
  const expired = await direct(plan, gateway(), "2026-07-27T16:16:00.000Z"); assert.equal(expired.result.status, "blocked"); assert.equal(expired.result.error?.message, "identity_authorization_expired"); assert.equal(expired.source.writeCalls(), 0);
  const conflict = await direct(plan, gateway({success: false, reasonCode: "persistence_conflict", error: "occupied"})); assert.equal(conflict.result.status, "failed"); assert.equal(conflict.result.error?.code, "persistence_conflict"); assert.equal(conflict.source.writeCalls(), 1); assert.equal(conflict.source.dedupeCalls(), 0);

  const executorSource = readFileSync("_laboratorio/laboratorio-ia/src/review/globalResolution/fighterCreationExecutor.ts", "utf8");
  assert.equal(executorSource.includes(".checkDuplicate("), false); assert.equal(executorSource.includes("CandidateDiscovery"), false); assert.equal(executorSource.includes("client.fetch"), false);
  const routeSource = readFileSync("app/api/editorial-agent/entities/route.ts", "utf8");
  assert.equal(routeSource.includes("lower(nombre)"), false); assert.equal(routeSource.includes("createIfNotExists"), false); assert.match(routeSource, /identity_guard_required/); assert.match(routeSource, /persistence_conflict/);
  const materializationSource = readFileSync("_laboratorio/laboratorio-ia/src/review/materialization/preparedEntityMaterialization.ts", "utf8"); assert.match(materializationSource, /identity_resolution_unsupported/); assert.match(materializationSource, /identity_guard_required/); assert.equal(materializationSource.includes(".checkDuplicate("), false); assert.equal(materializationSource.includes(".createEntity("), false);
  for (const path of ["app/api/sources/ufc/events/create-fighters/route.ts", "app/api/sources/one/events/create-fighters/route.ts", "app/api/sources/bkfc/events/create-fighters/route.ts", "app/api/sources/fekm/participants/create/route.ts"]) {
    const source = readFileSync(path, "utf8"); assert.match(source, /normalizeProducerFighterResolutionRequests/); assert.equal(source.includes("@sanity/client"), false, path); assert.equal(source.includes("fighterCreationExecutor"), false, path);
  }
  console.log("AU5 single identity authority tests: OK (40 assertions)");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
