import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parse as parseGroq} from "groq-js";
import {buildEntityIdentity, buildCandidateDiscoveryRequest, CandidateDiscoveryRegistry, CandidateDiscoveryService, candidateDiscoveryProfiles, createSanityMultiEntityCandidateDiscoveryAdapter, SANITY_MULTI_ENTITY_CANDIDATE_QUERIES, sanityMultiEntityDiscoverySecurity, type CandidateDiscoveryStatus, type IdentityProvenance, type SanityMultiEntityCandidateReader, type SanityMultiEntityCandidateRecord, type UniversalEntityIdentity} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity";
import {createEntityResolutionEngine} from "../_laboratorio/laboratorio-ia/src/review/entityResolution";
import type {EntityKind} from "../_laboratorio/laboratorio-ia/src/review/entityReconciliation";

const provenance: IdentityProvenance = {producer: "au6-b2", source: "fixture", field: "identity", extractionMethod: "fixture", confidence: 1, verified: true};
const identities: Record<Exclude<EntityKind, "fighter">, UniversalEntityIdentity> = {
  event: buildEntityIdentity({entityType: "event", source: "fixture", primaryLabel: "Arena Series 12", organization: "organization:alpha", date: "2026-10-10T20:00:00Z", slug: "arena-series-12", provenance: [provenance]}),
  organization: buildEntityIdentity({entityType: "organization", source: "fixture", primaryLabel: "Combat Alliance", officialDomain: "combat-alliance.test", country: "espana", slug: "combat-alliance", provenance: [provenance]}),
  weight_category: buildEntityIdentity({entityType: "weight_category", source: "fixture", primaryLabel: "Peso ligero", discipline: "discipline:mma", limit: 70.3, unit: "kg", sex: "masculino", limitType: "hasta", slug: "peso-ligero", provenance: [provenance]}),
};
const fixtures: Record<Exclude<EntityKind, "fighter">, SanityMultiEntityCandidateRecord[]> = {
  event: [
    {_id: "event:arena", _type: "evento", nombre: "Arena Series 12", slug: {current: "arena-series-12"}, fecha: "2026-10-10T20:00:00Z", organizacionId: "organization:alpha", disciplinaId: "discipline:mma", ciudad: "Madrid", pais: "España"},
    {_id: "drafts.event:arena", _type: "evento", nombre: "Arena Series XII", slug: {current: "arena-series-12"}, fecha: "2026-10-10T20:00:00Z", organizacionId: "organization:alpha", disciplinaId: "discipline:mma"},
    {_id: "event:recurring", _type: "evento", nombre: "Arena Series 12", fecha: "2027-10-10T20:00:00Z", organizacionId: "organization:beta", disciplinaId: "discipline:kickboxing"},
  ],
  organization: [
    {_id: "organization:combat", _type: "organizacion", nombre: "Combat Alliance", slug: {current: "combat-alliance"}, sitioWeb: "https://combat-alliance.test", paisOrigen: "espana", disciplinaIds: ["discipline:mma"]},
    {_id: "drafts.organization:combat", _type: "organizacion", nombre: "Combat Alliance Europe", slug: {current: "combat-alliance"}, sitioWeb: "https://combat-alliance.test", paisOrigen: "espana"},
    {_id: "organization:homonym", _type: "organizacion", nombre: "Combat Alliance", sitioWeb: "https://other-alliance.test", paisOrigen: "usa"},
  ],
  weight_category: [
    {_id: "category:light", _type: "categoriaPeso", nombre: "Peso ligero", slug: {current: "peso-ligero"}, disciplinaId: "discipline:mma", limitePeso: 70.3, unidad: "kg", sexo: "masculino", tipoLimite: "hasta"},
    {_id: "drafts.category:light", _type: "categoriaPeso", nombre: "Ligero MMA", slug: {current: "peso-ligero"}, disciplinaId: "discipline:mma", limitePeso: 70.3, unidad: "kg", sexo: "masculino", tipoLimite: "hasta"},
    {_id: "category:other", _type: "categoriaPeso", nombre: "Peso ligero", disciplinaId: "discipline:kickboxing", limitePeso: 60, unidad: "kg", sexo: "femenino", tipoLimite: "hasta"},
  ],
};

function reader(status: CandidateDiscoveryStatus = "complete", records = fixtures): SanityMultiEntityCandidateReader {
  return {async readCandidates(entityType, input) { const values = records[entityType]; const filtered = input.recall === "__no_recall__" ? values : values.filter((item) => String(item.nombre).toLocaleLowerCase("und").includes(input.recall.replace(/\*/gu, ""))); return {status, records: filtered, warnings: status === "complete" ? [] : ["Lectura incompleta de fixture."]}; }};
}
function service(status: CandidateDiscoveryStatus = "complete", records = fixtures) {
  const registry = new CandidateDiscoveryRegistry();
  for (const entityType of ["event", "organization", "weight_category"] as const) registry.register(createSanityMultiEntityCandidateDiscoveryAdapter(entityType, reader(status, records)));
  return new CandidateDiscoveryService(registry);
}
const request = (entityType: Exclude<EntityKind, "fighter">, extra: {maxTotal?: number; cursor?: string; timeoutMs?: number} = {}) => buildCandidateDiscoveryRequest({identity: identities[entityType], source: "sanity", limits: {maxTotal: extra.maxTotal ?? 20, timeoutMs: extra.timeoutMs ?? 8_000}, cursor: extra.cursor});

async function main() {
  for (const query of Object.values(SANITY_MULTI_ENTITY_CANDIDATE_QUERIES)) assert.doesNotThrow(() => parseGroq(query));
  assert.equal(Object.values(SANITY_MULTI_ENTITY_CANDIDATE_QUERIES).every((query) => query.includes("[0...51]") && !query.includes("$maxTotal") && query.includes("_id") && !query.includes("{...}")), true);
  assert.deepEqual(candidateDiscoveryProfiles.filter((profile) => profile.entityType !== "fighter").map((profile) => profile.schemaType), ["evento", "organizacion", "categoriaPeso"]);
  assert.equal(candidateDiscoveryProfiles.find((profile) => profile.entityType === "event")?.contextFields.includes("fecha"), true);
  assert.equal(candidateDiscoveryProfiles.find((profile) => profile.entityType === "organization")?.identityFields.includes("sitioWeb"), true);
  assert.equal(candidateDiscoveryProfiles.find((profile) => profile.entityType === "weight_category")?.conflictFields.includes("sexo"), true);

  const discovery = service(); const engine = createEntityResolutionEngine({candidateDiscoveryService: discovery}, {clock: () => new Date("2026-07-31T12:00:00.000Z"), monotonic: () => 0});
  const capabilities = engine.listCapabilities();
  for (const kind of ["event", "organization", "weight_category"] as const) {
    assert.equal(capabilities.find((profile) => profile.entityType === kind)?.modes.includes("identity_lookup"), true);
    assert.equal(capabilities.find((profile) => profile.entityType === kind)?.modes.includes("creation_preflight"), true);
    const result = await engine.resolve({version: 1, mode: "identity_lookup", entityType: kind, producer: "review-center", source: "sanity", identity: identities[kind]});
    assert.equal(result.mode, "identity_lookup"); if (result.mode !== "identity_lookup" || !result.identityLookup) throw new Error(`lookup_missing:${kind}`);
    assert.equal(result.completeness, "complete"); assert.equal(result.caseLinks.length, 0); assert.equal(result.identityLookup.discovery.candidates.length >= 2, true);
    assert.equal(result.identityLookup.discovery.candidates.some((candidate) => candidate.variants.length === 2), true);
    assert.equal(result.identityLookup.discovery.warnings.some((warning) => warning.code === "draft_published_identity_difference"), true);
    assert.equal(result.identityLookup.resolution.resolution.candidates.some(({comparison}) => comparison.decision === "conflicting_identity"), true);
    assert.equal(JSON.stringify(result).includes("_type"), false); assert.equal(JSON.stringify(result).includes("query"), false);
  }
  const event = await discovery.discover(request("event")); assert.equal(event.candidates.some((candidate) => candidate.matchedByStrategies.includes("contextual_key") || candidate.matchedByStrategies.includes("slug_exact")), true); assert.equal(event.candidates.some((candidate) => candidate.matchedByStrategies.includes("event_number")), true);
  const organization = await discovery.discover(request("organization")); assert.equal(organization.candidates.some((candidate) => candidate.matchedByStrategies.includes("canonical_url")), true);
  const category = await discovery.discover(request("weight_category")); assert.equal(category.candidates.some((candidate) => candidate.matchedByStrategies.includes("weight_limit")), true);

  const noAdapters = createEntityResolutionEngine({candidateDiscoveryService: new CandidateDiscoveryService(new CandidateDiscoveryRegistry())});
  assert.equal(noAdapters.listCapabilities().find((profile) => profile.entityType === "event")?.modes.includes("identity_lookup"), false);
  const unsupported = await noAdapters.resolve({version: 1, mode: "identity_lookup", entityType: "event", producer: "review-center", source: "sanity", identity: identities.event}); assert.equal(unsupported.status, "unsupported");
  const eventAdapterOnly = new CandidateDiscoveryRegistry().register(createSanityMultiEntityCandidateDiscoveryAdapter("event", reader()));
  const oneProfileEngine = createEntityResolutionEngine({candidateDiscoveryService: new CandidateDiscoveryService(eventAdapterOnly)});
  assert.equal(oneProfileEngine.listCapabilities().find((profile) => profile.entityType === "event")?.modes.includes("identity_lookup"), true);
  assert.equal(oneProfileEngine.listCapabilities().find((profile) => profile.entityType === "organization")?.modes.includes("identity_lookup"), false);

  for (const status of ["partial", "unavailable"] as const) { const result = await createEntityResolutionEngine({candidateDiscoveryService: service(status)}).resolve({version: 1, mode: "identity_lookup", entityType: "event", producer: "review-center", source: "sanity", identity: identities.event}); assert.equal(result.status, status); assert.equal(result.completeness, status); }
  const truncatedRecords = {...fixtures, event: Array.from({length: 8}, (_, index) => ({_id: `event:${index}`, _type: "evento", nombre: "Arena Series 12", fecha: "2026-10-10T20:00:00Z", organizacionId: "organization:alpha"}))};
  const truncatedService = service("complete", truncatedRecords); const truncated = await truncatedService.discover(buildCandidateDiscoveryRequest({identity: identities.event, source: "sanity", limits: {maxTotal: 3}})); assert.equal(truncated.status, "truncated"); assert.equal(truncated.candidates.length, 3); assert.equal(Boolean(truncated.cursor), true);
  const cancelledController = new AbortController(); cancelledController.abort(); const cancelled = await discovery.discover(request("event"), {signal: cancelledController.signal}); assert.equal(cancelled.status, "cancelled");
  const slowReader: SanityMultiEntityCandidateReader = {readCandidates: async (_entityType, _input, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({status: "complete", records: []}), 1_000);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, {once: true});
  })};
  const timeoutRegistry = new CandidateDiscoveryRegistry().register(createSanityMultiEntityCandidateDiscoveryAdapter("event", slowReader)); const timeout = await new CandidateDiscoveryService(timeoutRegistry).discover(buildCandidateDiscoveryRequest({identity: identities.event, source: "sanity", limits: {timeoutMs: 100}})); assert.equal(timeout.status, "unavailable"); assert.equal(timeout.reason, "timeout");
  assert.throws(() => request("event", {cursor: "x".repeat(161)}), /cursor/);

  const stableA = await engine.resolve({version: 1, mode: "identity_lookup", entityType: "event", producer: "review-center", source: "sanity", identity: identities.event}); const stableB = await engine.resolve({version: 1, mode: "identity_lookup", entityType: "event", producer: "review-center", source: "sanity", identity: identities.event}); assert.equal(stableA.requestFingerprint, stableB.requestFingerprint); assert.equal(stableA.resultFingerprint, stableB.resultFingerprint);
  const changed = await engine.resolve({version: 1, mode: "identity_lookup", entityType: "event", producer: "review-center", source: "sanity", identity: buildEntityIdentity({entityType: "event", source: "fixture", primaryLabel: "Arena Series 13", organization: "organization:alpha", date: "2026-10-11T20:00:00Z", provenance: [provenance]})}); assert.notEqual(stableA.requestFingerprint, changed.requestFingerprint);
  for (const manipulated of [{version: 1, mode: "identity_lookup", entityType: "event", producer: "review-center", source: "sanity", identity: identities.event, groq: "*[]"}, {version: 1, mode: "identity_lookup", entityType: "event", producer: "review-center", source: "sanity", identity: identities.event, capability: "guarded_creation"}, {version: 1, mode: "identity_lookup", entityType: "event", producer: "review-center", source: "caller", identity: identities.event}]) { const result = await engine.resolve(manipulated); assert.equal(result.status, "blocked"); assert.equal(JSON.stringify(result).includes("*[]"), false); }

  const domain = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/entityIdentity/discovery/adapters/sanityMultiEntity.ts"), "utf8") + readFileSync(resolve("app/api/review/entity-identity/candidates/route.ts"), "utf8"); for (const forbidden of [".create(", ".patch(", ".delete(", ".transaction(", ".mutate(", ".upsert(", "editorial-agent/entities", "createFighterCreationUniversalExecutor"]) assert.equal(domain.includes(forbidden), false, forbidden);
  assert.equal(Object.values(sanityMultiEntityDiscoverySecurity).length > 0, true); assert.equal(sanityMultiEntityDiscoverySecurity.forbiddenMethods.includes("create"), true);
  const route = readFileSync(resolve("app/api/review/entity-identity/candidates/route.ts"), "utf8"); assert.equal(route.includes("MAX_BODY_BYTES"), true); assert.equal(route.includes("Cache-Control"), true); assert.equal(route.includes("exact(body"), true);
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = "testproject"; process.env.NEXT_PUBLIC_SANITY_DATASET = "test";
  const {POST} = await import("../app/api/review/entity-identity/candidates/route");
  const validHttpBody = {requestVersion: 1, entityType: "event", phase: "strong", identity: {fingerprint: "sha256-v1:identity", primaryLabel: "Arena Series 12", normalizedPrimaryLabel: "arena series 12", aliases: [], externalIdentifiers: [], attributes: {organization: "organization:alpha"}}, strategyIds: ["canonical_label_exact"], limits: {maxPerStrategy: 8, maxTotal: 20, maxStrategies: 8, timeoutMs: 8_000, maxAliases: 12, maxKeys: 16}, requestFingerprint: "sha256-v1:request"};
  for (const manipulated of [{...validHttpBody, groq: "*[]"}, {...validHttpBody, capability: "guarded_creation"}, {...validHttpBody, adapter: "caller"}, {...validHttpBody, document: {_type: "evento"}}, {...validHttpBody, entityType: "news"}, {...validHttpBody, limits: {...validHttpBody.limits, maxTotal: 51}}, {...validHttpBody, identity: {...validHttpBody.identity, externalIdentifiers: [{namespace: "invented:event", value: "1"}]}}]) {
    const response = await POST(new Request("http://localhost/api/review/entity-identity/candidates", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(manipulated)})); assert.equal(response.status, 400);
  }
  const invalidJson = await POST(new Request("http://localhost/api/review/entity-identity/candidates", {method: "POST", body: "{"})); assert.equal(invalidJson.status, 400);
  const ui = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/entityResolution/components/EntityIdentityLookupControls.tsx"), "utf8"); assert.equal(ui.includes("Buscar coincidencias existentes"), true); assert.equal(ui.includes("Sin creación, reconciliación automática ni mutaciones"), true); assert.equal(ui.includes("create_entity"), false);
  console.log("AU6 multi-entity discovery tests: OK (3 schemas, fixed GROQ, engine, API/UI and read-only security)");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
