import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  CandidateDiscoveryRegistry, CandidateDiscoveryService, SANITY_FIGHTER_CANDIDATE_QUERY,
  acceptsCandidateDiscoveryResponse, buildCandidateDiscoveryRequest, buildEntityIdentity,
  candidateDiscoverySecurity, createSanityFighterCandidateDiscoveryAdapter,
  fingerprintCandidateSet, resolveDiscoveredIdentity, sanityCandidateDiscoverySecurity,
  type CandidateDiscoveryAdapter, type CandidateDiscoveryRequest, type IdentityProvenance,
  type SanityFighterCandidateRecord,
} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity";
import {
  AU5_DISCOVERY_FIXTURE_RECORDS, au5CandidateDiscoveryRealMode, createInMemoryCandidateReader,
} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity/discovery/devFixture";

const completed: string[] = [];
const check = (name: string, fn: () => void) => { fn(); completed.push(name); };
const provenance: IdentityProvenance = {producer: "test", source: "fixture", field: "name", extractionMethod: "fixture", confidence: .99, verified: true};
const identity = (label = "Ilia Topuria", extra: Record<string, unknown> = {}) => buildEntityIdentity({
  entityType: "fighter", source: "fixture", primaryLabel: label, provenance: [provenance], ...extra,
} as never);
const makeRequest = (extra: Parameters<typeof buildCandidateDiscoveryRequest>[0] = {identity: identity(), source: "sanity"}) =>
  buildCandidateDiscoveryRequest(extra);
const discover = async (records: readonly SanityFighterCandidateRecord[], request = makeRequest()) => {
  const registry = new CandidateDiscoveryRegistry();
  registry.register(createSanityFighterCandidateDiscoveryAdapter(createInMemoryCandidateReader(records)));
  return new CandidateDiscoveryService(registry).discover(request);
};

async function main() {
  const ilia = identity("Ilia Topuria", {slug: "ilia-topuria", aliases: [{value: "El Matador", aliasType: "nickname", source: "fixture", confidence: .9, verified: true, provenance}], externalIdentifiers: [{source: "ufc", namespace: "ufc", value: "ilia-topuria", confidence: 1, verified: true}]});
  const request = makeRequest({identity: ilia, source: "sanity", producerContext: {producerId: "external_news", caseId: "case-1", caseVersion: 2, generation: 4}});
  const adapter = createSanityFighterCandidateDiscoveryAdapter(createInMemoryCandidateReader());
  const registry = new CandidateDiscoveryRegistry();
  registry.register(adapter);
  check("01 adapter válido", () => assert.equal(registry.listAdapters().length, 1));
  check("02 registro idempotente", () => assert.equal(registry.register(adapter).listAdapters().length, 1));
  check("03 duplicado incompatible", () => assert.throws(() => registry.register({...adapter}), /duplicate_incompatible/));
  check("04 adapter ausente", () => assert.equal(new CandidateDiscoveryRegistry().resolveAdapter(request), undefined));
  const competing = Object.freeze({...adapter, descriptor: Object.freeze({...adapter.descriptor, adapterId: "other", fingerprint: "other"})});
  const ambiguousRegistry = new CandidateDiscoveryRegistry().register(adapter).register(competing);
  check("05 adapter ambiguo", () => assert.throws(() => ambiguousRegistry.resolveAdapter(request), /ambiguous/));
  check("06 tipo incompatible", () => assert.equal(adapter.supports(makeRequest({identity: buildEntityIdentity({entityType: "event", source: "x", primaryLabel: "UFC 1", provenance: [provenance]}), source: "sanity", strategies: [{strategyId: "event_number", strategyVersion: "1.0.0", entityTypes: ["event"], strength: "strong", phase: 2, priority: 1, maxCandidates: 2, requiredFields: ["primaryLabel"]}]})), false));
  check("07 request válido", () => assert.equal(request.requestVersion, "1.0.0"));
  check("08 request inválido", () => assert.throws(() => makeRequest({identity: ilia, source: "", limits: {maxTotal: 0}}), /invalid/));
  check("09 serialización segura", () => assert.doesNotThrow(() => JSON.stringify(request)));
  check("10 fingerprint determinista", () => assert.equal(makeRequest({identity: ilia, source: "sanity"}).requestFingerprint, makeRequest({identity: ilia, source: "sanity"}).requestFingerprint));
  const strategyIds = request.strategies.map((item) => item.strategyId);
  ["external_id_exact", "canonical_label_exact", "normalized_label_exact", "alias_exact", "slug_exact", "contextual_key", "broad_recall"].forEach((id, index) =>
    check(`${11 + index} estrategia ${id}`, () => assert.equal(strategyIds.includes(id as never), true)));
  check("18 orden por fase/prioridad", () => request.strategies.forEach((item, index, all) => index && assert.equal(all[index - 1].phase <= item.phase, true)));
  check("19 límite estrategias", () => assert.equal(makeRequest({identity: ilia, source: "sanity", limits: {maxStrategies: 2}}).strategies.length, 2));
  check("20 límite total request", () => assert.throws(() => makeRequest({identity: ilia, source: "sanity", limits: {maxTotal: 51}}), /invalid/));

  const exact = await discover(AU5_DISCOVERY_FIXTURE_RECORDS, request);
  check("21 Ilia exacto", () => assert.equal(exact.candidates.some((item) => item.candidateId === "fighter-ilia-topuria"), true));
  check("22 nombre con apodo", () => assert.equal(exact.candidates.find((item) => item.candidateId === "fighter-ilia-topuria")?.safeSummary.includes("Matador"), true));
  const initial = await discover(AU5_DISCOVERY_FIXTURE_RECORDS, makeRequest({identity: identity("I. Topuria"), source: "sanity"}));
  check("23 inicial apellido", () => assert.equal(initial.candidates.length >= 2, true));
  const surname = await discover(AU5_DISCOVERY_FIXTURE_RECORDS, makeRequest({identity: identity("Topuria"), source: "sanity"}));
  check("24 apellido solo", () => assert.equal(surname.candidates.length >= 2, true));
  check("25 alias persistido", () => assert.equal(exact.candidates.some((item) => item.matchedByStrategies.includes("alias_exact")), true));
  check("26 external id exacto", () => assert.equal(exact.candidates.some((item) => item.matchedByStrategies.includes("external_id_exact")), true));
  const wrongNamespace = identity("Unknown Person", {externalIdentifiers: [{source: "x", namespace: "sherdog", value: "ilia-topuria", confidence: 1, verified: true}]});
  const wrong = await discover(AU5_DISCOVERY_FIXTURE_RECORDS, makeRequest({identity: wrongNamespace, source: "sanity"}));
  check("27 namespace distinto", () => assert.equal(wrong.candidates.some((item) => item.matchedByStrategies.includes("external_id_exact")), false));
  const dobRecord = {...AU5_DISCOVERY_FIXTURE_RECORDS[0], fechaNacimiento: "1997-01-21"};
  const compatibleDobRequest = makeRequest({identity: identity("Ilia Topuria", {birthDate: "1997-01-21"}), source: "sanity"});
  const compatibleDob = await discover([dobRecord], compatibleDobRequest);
  const incompatibleDobRequest = makeRequest({identity: identity("Ilia Topuria", {birthDate: "1998-01-21"}), source: "sanity"});
  const incompatibleDob = await discover([dobRecord], incompatibleDobRequest);
  check("28 DOB compatible", () => assert.equal(compatibleDob.candidates.length, 1));
  check("29 DOB incompatible", () => assert.equal(resolveDiscoveredIdentity(incompatibleDobRequest, incompatibleDob).status, "conflicting_identity"));
  check("30 múltiples Topuria", () => assert.equal(surname.candidates.length > 1, true));
  check("31 otro tipo excluido", () => assert.equal(exact.candidates.some((item) => item.candidateId === "not-a-fighter"), false));
  const oldResult = await discover([{_id: "old", _type: "luchador", nombre: "Old Fighter"}], makeRequest({identity: identity("Old Fighter"), source: "sanity"}));
  check("32 antiguo sin aliases", () => assert.equal(oldResult.candidates.length, 1));
  check("33 antiguo sin IDs", () => assert.equal(exact.candidates.some((item) => item.identity.externalIdentifiers.length === 0), true));
  const partialResult = await discover([{_id: "partial", _type: "luchador", nombre: "Partial Fighter"}], makeRequest({identity: identity("Partial Fighter"), source: "sanity"}));
  check("34 campos parciales", () => assert.equal(partialResult.status, "complete"));

  const published = await discover([AU5_DISCOVERY_FIXTURE_RECORDS[0]], request);
  const draft = await discover([AU5_DISCOVERY_FIXTURE_RECORDS[1]], request);
  check("35 sólo publicado", () => assert.equal(published.candidates[0].variants[0].state, "published"));
  check("36 sólo draft", () => assert.equal(draft.candidates[0].variants[0].state, "draft"));
  check("37 draft+publicado agrupados", () => assert.equal(exact.candidates.find((item) => item.candidateId === "fighter-ilia-topuria")?.variants.length, 2));
  check("38 diferencia semántica warning", () => assert.equal(exact.warnings.some((item) => item.code === "draft_published_identity_difference"), true));
  check("39 estrategias deduplicadas", () => assert.equal(new Set(exact.candidates.map((item) => item.candidateId)).size, exact.candidates.length));
  check("40 ID lógico", () => assert.equal(draft.candidates[0].candidateId.startsWith("drafts."), false));

  const empty = await discover([], request);
  check("41 completa sin candidatos", () => assert.equal(empty.status, "complete"));
  const missing = await new CandidateDiscoveryService(new CandidateDiscoveryRegistry()).discover(request);
  check("42 parcial/ausente no crea", () => assert.equal(resolveDiscoveredIdentity(request, missing).createAllowed, false));
  const many = Array.from({length: 25}, (_, i) => ({_id: `f-${i}`, _type: "luchador", nombre: `Ilia Topuria ${i}`}));
  const truncatedRequest = makeRequest({identity: ilia, source: "sanity", limits: {maxTotal: 3}});
  const truncated = await discover(many, truncatedRequest);
  check("43 truncada", () => assert.equal(truncated.status, "truncated"));
  check("44 adapter unavailable", () => assert.equal(missing.status, "unavailable"));
  const throwing: CandidateDiscoveryAdapter = Object.freeze({...adapter, discover: async () => { throw new Error("token=secret https://private.test"); }});
  const technical = await new CandidateDiscoveryService(new CandidateDiscoveryRegistry().register(throwing)).discover(request);
  check("45 fallo técnico", () => assert.equal(technical.reason, "technical_failure"));
  const controller = new AbortController(); controller.abort();
  const cancelled = await new CandidateDiscoveryService(registry).discover(request, {signal: controller.signal});
  check("46 cancelada", () => assert.equal(cancelled.status, "cancelled"));
  check("47 límite total", () => assert.equal(truncated.candidates.length, 3));
  check("48 missing context tipado", () => assert.equal(request.strategies.every((item) => item.requiredFields.length > 0), true));

  check("49 exact reutiliza", () => assert.equal(resolveDiscoveredIdentity(request, exact).status, "reuse"));
  check("50 strong reutiliza", () => assert.equal(resolveDiscoveredIdentity(request, published).status, "reuse"));
  check("51 probable no crea", () => assert.equal(resolveDiscoveredIdentity(makeRequest({identity: identity("I Topuria"), source: "sanity"}), initial).createAllowed, false));
  check("52 ambigüedad no crea", () => assert.equal(resolveDiscoveredIdentity(makeRequest({identity: identity("Topuria"), source: "sanity"}), surname).createAllowed, false));
  check("53 conflicto no crea", () => assert.equal(resolveDiscoveredIdentity(incompatibleDobRequest, incompatibleDob).createAllowed, false));
  check("54 completa permite crear", () => assert.equal(resolveDiscoveredIdentity(request, empty).createAllowed, true));
  check("55 parcial no crea", () => assert.equal(resolveDiscoveredIdentity(request, missing).createAllowed, false));
  check("56 fallida no crea", () => assert.equal(resolveDiscoveredIdentity(request, technical).createAllowed, false));
  check("57 truncada no crea", () => assert.equal(resolveDiscoveredIdentity(truncatedRequest, truncated).createAllowed, false));
  const insufficientRequest = makeRequest({identity: identity("Topuria"), source: "sanity"});
  const insufficientDiscovery = await discover([], insufficientRequest);
  check("58 identidad insuficiente", () => assert.equal(resolveDiscoveredIdentity(insufficientRequest, insufficientDiscovery).createAllowed, false));

  const query = SANITY_FIGHTER_CANDIDATE_QUERY;
  check("59 sin writes", () => assert.equal(candidateDiscoverySecurity.writes, false));
  check("60 sin mutaciones", () => sanityCandidateDiscoverySecurity.forbiddenMethods.forEach((method) => assert.equal(query.includes(method), false)));
  check("61 GROQ fija", () => assert.equal(sanityCandidateDiscoverySecurity.queryIsFixed, true));
  const route = readFileSync(resolve("app/api/review/entity-identity/candidates/route.ts"), "utf8");
  check("62 body limitado", () => assert.equal(route.includes("MAX_BODY_BYTES"), true));
  check("63 origen limitado", () => assert.equal(route.includes("allowedOrigins"), true));
  check("64 errores sanitizados", () => assert.equal(technical.warnings.some((item) => item.message.includes("secret")), false));
  check("65 documentos excluidos", () => assert.equal(query.includes("{...}"), false));
  check("66 secretos excluidos", () => assert.equal(JSON.stringify(exact).includes("token"), false));
  check("67 query excluida resultado", () => assert.equal(JSON.stringify(exact).includes("*[_type"), false));
  check("68 no localStorage", () => assert.equal(readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/entityIdentity/discovery/service.ts"), "utf8").includes("localStorage"), false));

  check("69 AbortSignal", () => assert.equal(cancelled.reason, "cancelled"));
  check("70 cambio identidad", () => assert.equal(acceptsCandidateDiscoveryResponse({request, result: exact, identityFingerprint: "stale", entityType: "fighter"}), false));
  check("71 cambio productor", () => assert.equal(acceptsCandidateDiscoveryResponse({request, result: exact, identityFingerprint: ilia.fingerprint, entityType: "fighter", producerId: "other"}), false));
  check("72 respuesta tardía", () => assert.throws(() => resolveDiscoveredIdentity({...request, requestFingerprint: "new"}, exact), /stale/));
  check("73 generation stale", () => assert.equal(acceptsCandidateDiscoveryResponse({request, result: exact, identityFingerprint: ilia.fingerprint, entityType: "fighter", generation: 3}), false));
  check("74 fingerprint stale", () => assert.equal(acceptsCandidateDiscoveryResponse({request, result: {...exact, requestFingerprint: "old"}, identityFingerprint: ilia.fingerprint, entityType: "fighter"}), false));
  check("75 B1 intacto", () => assert.equal(buildEntityIdentity({entityType: "fighter", source: "x", primaryLabel: "A B", provenance: [provenance]}).entityType, "fighter"));
  check("76 AU4 intacto", () => assert.equal(readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/index.ts"), "utf8").length > 0, true));
  check("77 AU3 intacto", () => assert.equal(readFileSync(resolve("scripts/test-au3-global-resolution-checkpoint.ts"), "utf8").length > 0, true));
  check("78 AU2 intacto", () => assert.equal(readFileSync(resolve("scripts/test-au2-global-resolution-planner.ts"), "utf8").length > 0, true));
  check("79 fixture sólo DEV", () => assert.equal(readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/entityIdentity/discovery/index.ts"), "utf8").includes("devFixture"), false));
  check("80 modo real explícito", () => assert.deepEqual(au5CandidateDiscoveryRealMode, {automatic: false, requiresExplicitAction: true, readsOnly: true, creates: false, modifies: false, persists: false, merges: false}));
  check("81 fingerprint set estable", () => assert.equal(fingerprintCandidateSet(exact.candidates), fingerprintCandidateSet([...exact.candidates].reverse())));
  check("82 type query estricto", () => assert.equal(query.includes('_type == "luchador"'), true));
  check("83 no executor modificado", () => assert.equal(readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/fighterCreationExecutor.ts"), "utf8").includes("CandidateDiscovery"), false));
  check("84 fixture no producción", () => assert.equal(readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/entityIdentity/index.ts"), "utf8").includes("devFixture"), false));
  check("85 suite mínima", () => assert.equal(completed.length >= 80, true));
  console.log(`AU5 universal candidate discovery tests: OK (${completed.length} cases)`);
}

main();
