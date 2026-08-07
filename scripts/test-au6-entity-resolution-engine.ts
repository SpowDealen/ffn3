import assert from "node:assert/strict";
import {readFileSync, readdirSync, statSync} from "node:fs";
import {join, resolve} from "node:path";
import {buildEntityIdentity, CandidateDiscoveryRegistry, CandidateDiscoveryService, createSanityFighterCandidateDiscoveryAdapter, type IdentityProvenance} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity";
import {createInMemoryCandidateReader} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity/discovery/devFixture";
import {createInMemoryCorpusAdapter, type EntityKind} from "../_laboratorio/laboratorio-ia/src/review/entityReconciliation";
import {AU5_TRANSVERSAL_FIXTURES} from "../_laboratorio/laboratorio-ia/src/review/entityReconciliation/fixtures/transversal";
import {assessEntityResolutionFreshness, createCanonicalEntityResolutionProfiles, createEntityResolutionEngine, EntityResolutionProfileRegistry, entityResolutionSecurity, type CreationPreflightEngineRequest, type ResolutionProfile} from "../_laboratorio/laboratorio-ia/src/review/entityResolution";
import type {FighterIdentityGuardAuthorization} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";

const now = new Date("2026-07-31T12:00:00.000Z");
const provenance: IdentityProvenance = {producer: "au6-test", source: "fixture", field: "name", extractionMethod: "fixture", confidence: 1, verified: true};
const identity = (label = "Ada Fighter") => buildEntityIdentity({entityType: "fighter", source: "fixture", primaryLabel: label, provenance: [provenance]});
const discoveryService = (records: readonly Record<string, unknown>[] = []) => {
  const registry = new CandidateDiscoveryRegistry();
  registry.register(createSanityFighterCandidateDiscoveryAdapter(createInMemoryCandidateReader(records)));
  return new CandidateDiscoveryService(registry);
};
const records = Object.fromEntries(Object.entries(AU5_TRANSVERSAL_FIXTURES).map(([kind, items]) => [kind, [...items]])) as Record<EntityKind, unknown[]>;
const scan = (kind: EntityKind, scope: "all" | "recent" = "all") => ({version: 1 as const, kind, scope, limit: 50, maxGroups: 10, maxBlockSize: 10});

const authorization = (request: CreationPreflightEngineRequest): FighterIdentityGuardAuthorization => Object.freeze({
  authorizationVersion: "1.0.0", capability: "resolve_identity:fighter", guardOperationId: request.guardOperationId,
  creationOperationId: "create:1", planFingerprint: "sha256-v1:plan", caseId: "case:1", caseVersion: 1,
  producer: request.producer, source: request.source, decision: "create_new", reasonCode: "create_new_authorized",
  identityFingerprint: "sha256-v1:identity", creationPayloadFingerprint: "sha256-v1:payload", requestFingerprint: "sha256-v1:request",
  discoveryStatus: "complete", discoveryResultFingerprint: "sha256-v1:discovery", candidateIds: [], strategyIds: [], warningCodes: [],
  contextFingerprint: "sha256-v1:context", authorizedAt: now.toISOString(), expiresAt: "2026-07-31T12:15:00.000Z", authorizationFingerprint: "sha256-v1:authorization",
});

async function main() {
  const dependencies = {candidateDiscoveryService: discoveryService(), reconciliationAdapter: createInMemoryCorpusAdapter(records), creationPreflight: async (request: CreationPreflightEngineRequest) => {
    const lookupEngine = createEntityResolutionEngine({candidateDiscoveryService: discoveryService()}, {clock: () => now, monotonic: () => 0});
    const lookup = await lookupEngine.resolve({version: 1, mode: "identity_lookup", entityType: "fighter", producer: request.producer, source: "sanity", identity: identity()});
    assert.equal(lookup.mode, "identity_lookup"); if (lookup.mode !== "identity_lookup" || !lookup.identityLookup) throw new Error("lookup_missing");
    return {authorization: authorization(request), discovery: lookup.identityLookup.discovery};
  }};
  const profiles = createCanonicalEntityResolutionProfiles(dependencies);
  const registry = new EntityResolutionProfileRegistry();
  for (const profile of profiles) registry.register(profile);
  assert.equal(registry.register(profiles[0]).listProfiles().length, 4);
  assert.deepEqual(registry.listProfiles().map((item) => item.entityType), ["event", "fighter", "organization", "weight_category"]);
  assert.throws(() => registry.register({...profiles[0]}), /duplicate_incompatible/);
  const competing = Object.freeze({...profiles[0], descriptor: Object.freeze({...profiles[0].descriptor, profileId: "competing", fingerprint: "sha256-v1:competing"})}) as ResolutionProfile;
  assert.throws(() => registry.register(competing), /ambiguous/);
  const inconsistent = Object.freeze({...profiles[0], descriptor: Object.freeze({...profiles[0].descriptor, profileId: "inconsistent", modes: ["identity_lookup" as const], capabilities: ["guarded_creation" as const], sourcesByMode: {identity_lookup: ["sanity"]}, fingerprint: "sha256-v1:inconsistent"})}) as ResolutionProfile;
  assert.throws(() => new EntityResolutionProfileRegistry().register(inconsistent), /capability_inconsistent/);
  assert.equal(registry.resolve("event", "identity_lookup"), undefined);
  assert.ok(registry.resolve("organization", "creation_preflight"));

  const engine = createEntityResolutionEngine(dependencies, {clock: () => now, monotonic: () => 0});
  const capabilities = engine.listCapabilities();
  assert.deepEqual(capabilities.find((item) => item.entityType === "fighter")?.modes, ["identity_lookup", "creation_preflight", "existing_reconciliation"]);
  for (const kind of ["event", "organization", "weight_category"] as const) assert.deepEqual(capabilities.find((item) => item.entityType === kind)?.modes, ["creation_preflight", "existing_reconciliation"]);
  assert.doesNotThrow(() => JSON.stringify(capabilities));
  assert.equal(JSON.stringify(capabilities).includes("execute"), false);

  const lookupRequest = {version: 1 as const, mode: "identity_lookup" as const, entityType: "fighter" as const, producer: "review-center", source: "sanity" as const, identity: identity()};
  const lookup = await engine.resolve(lookupRequest);
  assert.equal(lookup.mode, "identity_lookup");
  assert.equal(lookup.status, "complete");
  if (lookup.mode !== "identity_lookup" || !lookup.identityLookup) throw new Error("lookup_result_missing");
  assert.equal(lookup.identityLookup.resolution.status, "create_new");
  assert.equal(lookup.identityLookup.resolution.createAllowed, true);
  assert.equal(lookup.provenance.capability, "identity_discovery");
  const unsupported = await createEntityResolutionEngine({}, {clock: () => now, monotonic: () => 0}).resolve(lookupRequest);
  assert.equal(unsupported.status, "unsupported");
  assert.equal(unsupported.reasonCode, "mode_not_supported:fighter:identity_lookup");
  const cancelledController = new AbortController(); cancelledController.abort();
  const cancelled = await engine.resolve(lookupRequest, {signal: cancelledController.signal});
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.completeness, "cancelled");

  const preflightRequest = {version: 1 as const, mode: "creation_preflight" as const, entityType: "fighter" as const, producer: "external_news", source: "sanity" as const, plan: {fingerprint: "sha256-v1:plan"}, guardOperationId: "guard:1"};
  const preflight = await engine.resolve(preflightRequest);
  assert.equal(preflight.mode, "creation_preflight");
  if (preflight.mode !== "creation_preflight" || !preflight.creationPreflight) throw new Error("preflight_result_missing");
  assert.equal(preflight.creationPreflight.createAuthorized, true);
  assert.equal("capability" in preflight.creationPreflight.authorization && preflight.creationPreflight.authorization.capability, "resolve_identity:fighter");
  const eventPreflight = await engine.resolve({...preflightRequest, entityType: "event"});
  assert.equal(eventPreflight.status, "complete");
  assert.equal(eventPreflight.mode === "creation_preflight" && Boolean(eventPreflight.creationPreflight), true);

  for (const kind of ["fighter", "event", "organization", "weight_category"] as const) {
    const result = await engine.resolve({version: 1, mode: "existing_reconciliation", entityType: kind, producer: "review-center", source: "dev.in-memory", scan: scan(kind)});
    assert.equal(result.mode, "existing_reconciliation");
    if (result.mode !== "existing_reconciliation" || !result.existingReconciliation) throw new Error(`scan_missing:${kind}`);
    assert.equal(result.status, "needs_review");
    assert.equal(result.existingReconciliation.scan.kind, kind);
    assert.equal(result.existingReconciliation.scan.groups.length >= 1, true);
    assert.notEqual(result.existingReconciliation.scan.groups[0].state, "confirmed_duplicate");
    assert.equal(result.caseLinks.length, result.existingReconciliation.scan.groups.length);
    assert.equal(result.caseLinks[0].entityType, kind);
    assert.equal(result.existingReconciliation.cases[0].context.entityReconciliation !== undefined, true);
  }

  const stableA = await engine.resolve({version: 1, mode: "existing_reconciliation", entityType: "fighter", producer: "review-center", source: "dev.in-memory", scan: scan("fighter")});
  const stableB = await engine.resolve({version: 1, mode: "existing_reconciliation", entityType: "fighter", producer: "review-center", source: "dev.in-memory", scan: scan("fighter")});
  assert.equal(stableA.requestFingerprint, stableB.requestFingerprint);
  assert.equal(stableA.resultFingerprint, stableB.resultFingerprint);
  const changed = await engine.resolve({version: 1, mode: "existing_reconciliation", entityType: "fighter", producer: "review-center", source: "dev.in-memory", scan: scan("fighter", "recent")});
  assert.notEqual(stableA.requestFingerprint, changed.requestFingerprint);
  assert.notEqual(stableA.resultFingerprint, changed.resultFingerprint);
  assert.equal(assessEntityResolutionFreshness(stableA, {version: 1, mode: "existing_reconciliation", entityType: "fighter", producer: "review-center", source: "dev.in-memory", scan: scan("fighter")}, capabilities.find((item) => item.entityType === "fighter")!), "fresh");
  assert.equal(assessEntityResolutionFreshness(stableA, {version: 1, mode: "existing_reconciliation", entityType: "fighter", producer: "review-center", source: "dev.in-memory", scan: scan("fighter", "recent")}, capabilities.find((item) => item.entityType === "fighter")!), "stale");
  assert.equal(assessEntityResolutionFreshness({...stableA, rulesVersion: "old"} as unknown as typeof stableA, {version: 1, mode: "existing_reconciliation", entityType: "fighter", producer: "review-center", source: "dev.in-memory", scan: scan("fighter")}, capabilities.find((item) => item.entityType === "fighter")!), "stale");

  for (const manipulated of [
    {...lookupRequest, profileId: "canonical.event"},
    {...lookupRequest, capability: "guarded_creation"},
    {...lookupRequest, groq: "*[]"},
    {...lookupRequest, source: "caller-adapter"},
  ]) {
    const result = await engine.resolve(manipulated);
    assert.equal(result.status, "blocked");
    assert.equal(JSON.stringify(result).includes("*[]"), false);
  }
  const mismatched = await engine.resolve({version: 1, mode: "existing_reconciliation", entityType: "event", producer: "review-center", source: "dev.in-memory", scan: scan("fighter")});
  assert.equal(mismatched.status, "blocked");
  const throwing = createEntityResolutionEngine({candidateDiscoveryService: {supportedEntityTypes: () => ["fighter"], discover: async () => { throw new Error("token=secret https://private.test *[_type]"); }} as unknown as CandidateDiscoveryService}, {clock: () => now, monotonic: () => 0});
  const sanitized = await throwing.resolve(lookupRequest);
  assert.equal(sanitized.status, "unavailable");
  assert.equal(JSON.stringify(sanitized).includes("secret"), false);
  assert.equal(JSON.stringify(sanitized).includes("private.test"), false);

  assert.deepEqual(entityResolutionSecurity, {readOnly: true, writes: false, mutations: false, merges: false, automaticDecisions: false, callerTokens: false, arbitraryQueries: false, fallbackToFighter: false});
  const domain = resolve("_laboratorio/laboratorio-ia/src/review/entityResolution");
  const files = (directory: string): string[] => readdirSync(directory).flatMap((name) => { const path = join(directory, name); return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : []; });
  const source = files(domain).map((file) => readFileSync(file, "utf8")).join("\n");
  for (const forbidden of [".create(", ".patch(", ".delete(", ".transaction(", ".mutate(", ".upsert(", "createFighterCreationUniversalExecutor", "editorial-agent/entities"]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.equal(source.includes("fallback" + "ToFighter: false"), true);
  assert.equal(readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/identityGuard.ts"), "utf8").includes("createEntityResolutionEngine"), true);
  assert.equal(readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/entityReconciliation/actions.ts"), "utf8").includes("createEntityResolutionEngine"), true);
  console.log("AU6 entity resolution engine tests: OK (registry, 3 modes, 4 profiles, freshness and security)");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
