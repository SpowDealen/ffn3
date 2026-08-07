import assert from "node:assert/strict";
import {buildEntityOperation, type EntityOperationEntityType} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import {CandidateDiscoveryRegistry, CandidateDiscoveryService, createSanityFighterCandidateDiscoveryAdapter, createSanityMultiEntityCandidateDiscoveryAdapter} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity";
import {createInMemoryCandidateReader} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity/discovery/devFixture";
import {ensureIdentityCreationGuardOperations, identityCreationGuardForCreation, resolveIdentityCreationPreflight, validateIdentityCreationAuthorization, validateIdentityCreationPreflight, type IdentityCreationPreflight} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";

const now = "2026-08-07T12:00:00.000Z";
const payloads: Record<string, Record<string, unknown>> = {
  luchador: {nombre: "Ada Fighter", disciplineId: "discipline:mma", organizationIds: ["organization:test"]},
  evento: {nombre: "UFC 999", organizacion: "organization:ufc", fecha: "2026-08-07", disciplina: "discipline:mma"},
  organizacion: {nombre: "Promotion Nova", paisOrigen: "ES", disciplinas: ["discipline:mma"]},
  categoriaPeso: {nombre: "Peso prueba", disciplina: "discipline:mma", limitePeso: 77.1, unidad: "kg", sexo: "male", reglamento: "unified-mma"},
};
function planFor(entityType: EntityOperationEntityType) {
  const create = buildEntityOperation({id: `create:${entityType}`, kind: "create_entity", entityType, payload: payloads[entityType] as never, source: "global_resolution", evidence: [], confidence: 1, risk: "medium", preconditions: [], postconditions: [], dependencyIds: [], requiredCapability: `create:${entityType}`, compensatable: false, explanation: "AU6 fixture"});
  const operations = ensureIdentityCreationGuardOperations([create], "au6-b4");
  const plan = {id: `plan:${entityType}`, fingerprint: `sha256-v1:plan${entityType}`, caseId: `case:${entityType}`, caseVersion: 1, producer: "au6-b4", operations} as never;
  const guard = identityCreationGuardForCreation(operations, create.id); if (!guard) throw new Error("guard_missing");
  return {plan, create, guard};
}
function service(status: "complete" | "partial" = "complete") {
  const registry = new CandidateDiscoveryRegistry();
  registry.register(createSanityFighterCandidateDiscoveryAdapter(createInMemoryCandidateReader([])));
  const reader = {readCandidates: async () => ({status, records: []})};
  registry.register(createSanityMultiEntityCandidateDiscoveryAdapter("event", reader));
  registry.register(createSanityMultiEntityCandidateDiscoveryAdapter("organization", reader));
  registry.register(createSanityMultiEntityCandidateDiscoveryAdapter("weight_category", reader));
  return new CandidateDiscoveryService(registry);
}
async function preflight(entityType: EntityOperationEntityType, status: "complete" | "partial" = "complete") {
  const fixture = planFor(entityType);
  const proof = await resolveIdentityCreationPreflight({plan: fixture.plan, guardOperationId: fixture.guard.id, service: service(status), now: () => now});
  return {...fixture, proof};
}

async function main() {
  for (const schema of ["luchador", "evento", "organizacion", "categoriaPeso"] as const) {
    const result = await preflight(schema);
    assert.equal(result.proof.state, "safe_to_create", schema);
    assert.equal(result.proof.decision, "create_new", schema);
    assert.deepEqual(validateIdentityCreationAuthorization(result.proof, {plan: result.plan, creationOperationId: result.create.id, now: () => now}), {valid: true, reasonCode: "safe_to_create"}, schema);
  }
  const incomplete = await preflight("evento", "partial");
  assert.equal(incomplete.proof.state, "blocked_discovery_partial");
  assert.equal(validateIdentityCreationAuthorization(incomplete.proof, {plan: incomplete.plan, creationOperationId: incomplete.create.id, now: () => now}).valid, false);
  const valid = await preflight("organizacion");
  const stale = {...valid.proof, operationFingerprint: "sha256-v1:changed"} as IdentityCreationPreflight;
  assert.equal(validateIdentityCreationPreflight(stale, {plan: valid.plan, creationOperationId: valid.create.id, now: () => now}).reasonCode, "blocked_stale_resolution");
  assert.equal(validateIdentityCreationAuthorization(undefined, {plan: valid.plan, creationOperationId: valid.create.id}).reasonCode, "blocked_missing_preflight");
  console.log("AU6 B4 safe entity creation activation tests: OK (supported types, complete discovery, fail-closed and stale proof)");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
