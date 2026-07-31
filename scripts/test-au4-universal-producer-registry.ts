import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  EXTERNAL_NEWS_INSPECTOR_ID,
  EXTERNAL_NEWS_PRODUCER_ID,
  GlobalResolutionCapabilityCatalog,
  GlobalResolutionInspectorRegistry,
  GlobalResolutionProducerAdapterRegistry,
  GlobalResolutionProducerRegistry,
  createGlobalResolutionProducerRuntime,
  externalNewsProducerAdapterDescriptors,
  externalNewsProducerManifest,
  externalNewsUniversalCapabilities,
  fingerprintGlobalResolutionProducerManifest,
  validateGlobalResolutionProducerManifest,
  type GlobalResolutionProducerManifest,
  type ProducerAdapterManifest,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {buildGlobalResolutionInspectionDevResult} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/devFixture";

const cloneManifest = (): GlobalResolutionProducerManifest => structuredClone(externalNewsProducerManifest);

function registryWith(inspectorIds: string[] = [EXTERNAL_NEWS_INSPECTOR_ID]) {
  const capabilities = new GlobalResolutionCapabilityCatalog();
  externalNewsUniversalCapabilities.forEach((capability) => capabilities.register(capability));
  const adapters = new GlobalResolutionProducerAdapterRegistry();
  externalNewsProducerAdapterDescriptors().forEach((adapter) => adapters.register(adapter));
  return {capabilities, adapters, producers: new GlobalResolutionProducerRegistry(capabilities, adapters, new Set(inspectorIds))};
}

function competingManifest(id = "fixture_second_producer", inspectorId = EXTERNAL_NEWS_INSPECTOR_ID): GlobalResolutionProducerManifest {
  const manifest = cloneManifest();
  manifest.producerId = id;
  manifest.displayName = `Fixture ${id}`;
  manifest.inspectors = manifest.inspectors.map((binding) => ({...binding, inspectorId}));
  return manifest;
}

async function main(): Promise<void> {
  const runtime = createGlobalResolutionProducerRuntime();
  assert.deepEqual(runtime.producers.listProducers().map(({manifest}) => manifest.producerId), ["bkfc_events", EXTERNAL_NEWS_PRODUCER_ID, "fekm_participants", "one_events", "ufc_events"]);

  const countBefore = runtime.producers.listProducers().length;
  runtime.producers.registerProducer(cloneManifest());
  assert.equal(runtime.producers.listProducers().length, countBefore);
  assert.throws(() => runtime.producers.registerProducer({...cloneManifest(), displayName: "Incompatible"}), /producer_manifest_duplicate_incompatible/);

  const reordered = cloneManifest();
  reordered.capabilities.reverse();
  reordered.adapters.reverse();
  reordered.inspectors.reverse();
  reordered.caseTypes.reverse();
  reordered.compatibility.caseTypes.reverse();
  assert.equal(fingerprintGlobalResolutionProducerManifest(reordered), fingerprintGlobalResolutionProducerManifest(externalNewsProducerManifest));
  assert.notEqual(fingerprintGlobalResolutionProducerManifest({...cloneManifest(), producerVersion: "2.0.0"}), fingerprintGlobalResolutionProducerManifest(externalNewsProducerManifest));

  assert.equal(runtime.producers.resolveProducerForCase({producerId: EXTERNAL_NEWS_PRODUCER_ID}).status, "resolved");
  assert.equal(runtime.producers.resolveProducerForCase({caseType: "external_news"}).status, "resolved");
  assert.equal(runtime.producers.resolveProducerForCase({}).status, "missing");
  runtime.producers.registerProducer(competingManifest());
  const ambiguous = runtime.producers.resolveProducerForCase({caseType: "external_news"});
  assert.equal(ambiguous.status, "ambiguous");
  assert.deepEqual(ambiguous.status === "ambiguous" ? ambiguous.producerIds : [], ["external_news@1.0.0", "fixture_second_producer@1.0.0"]);
  assert.equal(runtime.producers.resolveProducerForCase({producerId: EXTERNAL_NEWS_PRODUCER_ID, producerVersion: "9.0.0"}).status, "version_mismatch");

  assert.equal(runtime.producers.resolveCapability(EXTERNAL_NEWS_PRODUCER_ID, {kind: "create_entity", requiredCapability: "create:luchador"})?.capabilityId, "create:luchador");
  assert.equal(runtime.producers.resolveCapability(EXTERNAL_NEWS_PRODUCER_ID, {kind: "create_entity", requiredCapability: "create:unknown"}), undefined);
  assert.equal(runtime.producers.resolveInspectorBinding(EXTERNAL_NEWS_PRODUCER_ID, "create:luchador").status, "resolved");
  assert.equal(runtime.producers.resolveInspectorBinding(EXTERNAL_NEWS_PRODUCER_ID, "create:luchador", new GlobalResolutionInspectorRegistry()).status, "missing");
  assert.equal(runtime.producers.resolveAdapter(EXTERNAL_NEWS_PRODUCER_ID, "planner").status, "resolved");
  const missingBinding: ProducerAdapterManifest = {adapterKind: "planner", adapterId: "fixture.adapter.missing", priority: 1};
  assert.equal(runtime.adapters.resolve([missingBinding], "planner").status, "missing");

  const circular = cloneManifest();
  circular.capabilities = circular.capabilities.map((capability) => capability.capabilityId === "create:luchador"
    ? {...capability, dependencies: ["resume:external_news"]}
    : capability.capabilityId === "resume:external_news"
      ? {...capability, dependencies: ["create:luchador"]}
      : capability);
  assert.equal(validateGlobalResolutionProducerManifest(circular, runtime).issues.some(({code}) => code === "capability_dependency_cycle"), true);

  const noInspection = cloneManifest();
  noInspection.capabilities = noInspection.capabilities.map((capability) => capability.capabilityId === "create:luchador"
    ? {...capability, supportsInspection: false, modes: capability.modes.filter((mode) => mode !== "inspect")}
    : capability);
  assert.equal(validateGlobalResolutionProducerManifest(noInspection, runtime).issues.some(({code}) => code === "reconciliation_without_inspection"), true);

  const unsafeRetry = cloneManifest();
  unsafeRetry.executionPolicy.retryPolicy = "disabled";
  unsafeRetry.capabilities = unsafeRetry.capabilities.map((capability) => capability.capabilityId === "create:luchador" ? {...capability, supportsIdempotency: false} : capability);
  assert.equal(validateGlobalResolutionProducerManifest(unsafeRetry, runtime).issues.some(({code}) => code === "retry_without_safe_policy"), true);

  const missingAuthorization = cloneManifest();
  missingAuthorization.executionPolicy.defaultAuthorization = "not_required";
  assert.equal(validateGlobalResolutionProducerManifest(missingAuthorization, runtime).issues.some(({code}) => code === "execution_authorization_undefined"), true);

  const fixtureCase = buildGlobalResolutionInspectionDevResult("confirmed_succeeded").reviewCase;
  assert.equal(runtime.producers.resolveLegacyReviewCase(fixtureCase).status, "legacy_compatible");
  const legacyAmbiguousCase = structuredClone(fixtureCase);
  legacyAmbiguousCase.context = {};
  assert.equal(runtime.producers.resolveLegacyReviewCase(legacyAmbiguousCase).status, "migration_required");

  const fixtureBinding = fixtureCase.globalResolution?.producerManifest;
  assert.ok(fixtureBinding);
  assert.equal(runtime.producers.checkCheckpoint(EXTERNAL_NEWS_PRODUCER_ID, fixtureBinding).status, "compatible");
  assert.equal(runtime.producers.checkCheckpoint(EXTERNAL_NEWS_PRODUCER_ID, {...fixtureBinding!, manifestFingerprint: "sha256-v1:obsolete"}).status, "stale");
  assert.equal(runtime.producers.checkCheckpoint(EXTERNAL_NEWS_PRODUCER_ID).status, "legacy_compatible");

  assert.equal(JSON.stringify(externalNewsProducerManifest).includes("function"), false);
  assert.equal(JSON.stringify(externalNewsProducerManifest).includes("SANITY_API"), false);
  assert.equal(runtime.producers.getProducer(EXTERNAL_NEWS_PRODUCER_ID)?.manifest.displayName, "Noticias externas");

  const coreSources = [
    "types.ts", "fingerprint.ts", "capabilityCatalog.ts", "adapterRegistry.ts", "validation.ts", "registry.ts",
  ].map((file) => readFileSync(resolve(`_laboratorio/laboratorio-ia/src/review/globalResolution/producers/${file}`), "utf8")).join("\n");
  for (const forbidden of ["external_news", "external-news", "UFC", "ONE", "BKFC", "FEKM", "official_sources"]) assert.equal(coreSources.includes(forbidden), false);

  const planning = createGlobalResolutionProducerRuntime().producers.planningContext(EXTERNAL_NEWS_PRODUCER_ID);
  assert.ok(planning?.availableCapabilities.includes("create:luchador"));
  assert.ok(planning?.plannerAdapterIds.length);
  assert.ok(planning?.executorAdapterIds.length);
  assert.equal(fixtureCase.globalResolution?.producerManifest?.producerVersion, "1.0.0");

  const engineSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/reconciliation/engine/engine.ts"), "utf8");
  assert.equal(engineSource.includes("external_news"), false);
  assert.equal(createGlobalResolutionProducerRuntime().producers.resolveInspectorBinding(EXTERNAL_NEWS_PRODUCER_ID, "resume:external_news").status, "resolved");

  assert.equal(buildGlobalResolutionInspectionDevResult("producer_missing").producerState.status, "missing");
  assert.equal(buildGlobalResolutionInspectionDevResult("producer_ambiguous").producerState.status, "ambiguous");
  assert.equal(buildGlobalResolutionInspectionDevResult("producer_version_mismatch").producerState.status, "version_mismatch");
  assert.equal(buildGlobalResolutionInspectionDevResult("capability_unsupported").producerState.status, "capability_unsupported");
  assert.equal(buildGlobalResolutionInspectionDevResult("inspector_unavailable").producerState.status, "inspector_unavailable");
  const componentSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/components/GlobalResolutionControls.tsx"), "utf8");
  assert.equal(componentSource.includes("import.meta.env.DEV"), true);
  assert.equal(componentSource.includes('producer === "external_news"'), false);
  assert.equal(componentSource.includes('producer === "external-news"'), false);
  assert.equal(componentSource.includes("resolveGlobalResolutionProducerControls"), true);

  const stable = createGlobalResolutionProducerRuntime();
  stable.producers.registerProducer(competingManifest("aaa_fixture"));
  assert.deepEqual(stable.producers.listProducers().map(({manifest}) => manifest.producerId), ["aaa_fixture", "bkfc_events", "external_news", "fekm_participants", "one_events", "ufc_events"]);

  const secretManifest = cloneManifest();
  secretManifest.metadata = {token: "abc123"};
  const secretValidation = validateGlobalResolutionProducerManifest(secretManifest, runtime);
  assert.equal(secretValidation.valid, false);
  assert.equal(JSON.stringify(secretValidation).includes("abc123"), false);
  assert.throws(() => runtime.producers.registerProducer(secretManifest), (error: unknown) => error instanceof Error && !error.message.includes("abc123"));

  const warningManifest = competingManifest("warning_fixture");
  warningManifest.adapters = warningManifest.adapters.filter(({adapterKind}) => adapterKind !== "planner");
  const warningRegistry = registryWith();
  warningRegistry.producers.registerProducer(warningManifest);
  assert.equal(warningRegistry.producers.getProducer("warning_fixture")?.warnings.some(({code}) => code === "producer_without_planner"), true);

  const priorityAdapters = new GlobalResolutionProducerAdapterRegistry();
  priorityAdapters.register({adapterId: "fixture.planner.low", version: "1.0.0", adapterKind: "planner", implementation: {}});
  priorityAdapters.register({adapterId: "fixture.planner.high", version: "1.0.0", adapterKind: "planner", implementation: {}});
  const priorityBindings: ProducerAdapterManifest[] = [
    {adapterKind: "planner", adapterId: "fixture.planner.low", priority: 10},
    {adapterKind: "planner", adapterId: "fixture.planner.high", priority: 20},
  ];
  assert.equal(priorityAdapters.resolve(priorityBindings, "planner").status, "resolved");
  assert.equal(priorityAdapters.resolve(priorityBindings.map((binding) => ({...binding, priority: 20})), "planner").status, "ambiguous");

  const shared = registryWith([EXTERNAL_NEWS_INSPECTOR_ID, "fixture:second-inspector"]);
  shared.producers.registerProducer(externalNewsProducerManifest);
  shared.producers.registerProducer(competingManifest("second_shared_capability", "fixture:second-inspector"));
  assert.equal(shared.producers.resolveCapability("second_shared_capability", {kind: "create_entity", requiredCapability: "create:luchador"})?.capabilityId, "create:luchador");
  assert.equal(shared.producers.resolveInspectorBinding(EXTERNAL_NEWS_PRODUCER_ID, "create:luchador").status, "resolved");
  const secondInspector = shared.producers.resolveInspectorBinding("second_shared_capability", "create:luchador");
  assert.equal(secondInspector.status === "resolved" ? secondInspector.binding.inspectorId : "", "fixture:second-inspector");

  console.log("AU4 universal producer registry tests: OK");
}

void main();
