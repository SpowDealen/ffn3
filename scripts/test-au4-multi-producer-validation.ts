import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  GlobalResolutionCapabilityCatalog,
  GlobalResolutionInspectionService,
  GlobalResolutionInspectorRegistry,
  GlobalResolutionProducerAdapterRegistry,
  GlobalResolutionProducerRegistry,
  UniversalReconciliationInspectionEngine,
  deriveGlobalResolutionProducerSupportMatrix,
  externalNewsProducerAdapterDescriptors,
  externalNewsProducerManifest,
  externalNewsUniversalCapabilities,
  fingerprintGlobalResolutionInspectionEvidence,
  fingerprintGlobalResolutionProducerManifest,
  validateGlobalResolutionProducerManifest,
  type GlobalResolutionInspectionEvidence,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {
  GlobalResolutionInspectionDevFixtureSession,
  applyGlobalResolutionInspectionDevFixtureAssessment,
  buildGlobalResolutionInspectionDevResult,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/devFixture";
import {
  VALIDATION_OFFICIAL_SOURCE_CAPABILITY,
  VALIDATION_OFFICIAL_SOURCE_COMPLETION_CAPABILITY,
  VALIDATION_OFFICIAL_SOURCE_INSPECTOR_ID,
  VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID,
  buildValidationOfficialSourceInspectionRequest,
  createValidationOfficialSourceInspector,
  createValidationOfficialSourceReconciliationContracts,
  validationOfficialSourceAdapterDescriptors,
  validationOfficialSourceCompletionCapabilityManifest,
  validationOfficialSourceEvidenceToReconciliationEvidence,
  validationOfficialSourceManifest,
  validationOfficialSourceSecurity,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/validationOfficialSource.dev";

const now = "2026-07-30T12:00:00.000Z";
const completed: string[] = [];
function check(name: string, assertion: () => void): void {
  assertion();
  completed.push(name);
}
async function checkAsync(name: string, assertion: () => Promise<void>): Promise<void> {
  await assertion();
  completed.push(name);
}

function runtime() {
  const capabilities = new GlobalResolutionCapabilityCatalog();
  externalNewsUniversalCapabilities.forEach((capability) => capabilities.register(capability));
  capabilities.register(validationOfficialSourceCompletionCapabilityManifest);
  const adapters = new GlobalResolutionProducerAdapterRegistry();
  [...externalNewsProducerAdapterDescriptors(), ...validationOfficialSourceAdapterDescriptors()].forEach((adapter) => adapters.register(adapter));
  const producers = new GlobalResolutionProducerRegistry(capabilities, adapters, new Set([
    "sanity:external_news-effects",
    VALIDATION_OFFICIAL_SOURCE_INSPECTOR_ID,
  ]));
  producers.registerProducer(externalNewsProducerManifest);
  producers.registerProducer(validationOfficialSourceManifest);
  return {capabilities, adapters, producers};
}

async function main(): Promise<void> {
  const combined = runtime();
  const validationRegistrationCount = () => combined.producers.listProducers().filter(({manifest}) => manifest.producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID).length;
  check("01 segundo productor registrado", () => assert.equal(validationRegistrationCount(), 1));
  check("02 familia official_sources", () => assert.equal(validationOfficialSourceManifest.family, "official_sources"));
  check("03 manifiesto válido", () => assert.equal(validateGlobalResolutionProducerManifest(validationOfficialSourceManifest, {
    capabilities: combined.capabilities,
    adapters: combined.adapters,
    inspectorIds: new Set([VALIDATION_OFFICIAL_SOURCE_INSPECTOR_ID]),
  }).valid, true));
  check("04 fingerprint de manifiesto determinista", () => assert.equal(
    fingerprintGlobalResolutionProducerManifest(validationOfficialSourceManifest),
    fingerprintGlobalResolutionProducerManifest(structuredClone(validationOfficialSourceManifest)),
  ));
  check("05 adapter independiente", () => assert.equal(validationOfficialSourceManifest.adapters.some(({adapterId}) => adapterId.includes("validation-official-source")), true));
  check("06 inspector independiente", () => assert.notEqual(VALIDATION_OFFICIAL_SOURCE_INSPECTOR_ID, "sanity:external_news-effects"));
  check("07 contrato independiente", () => assert.equal(createValidationOfficialSourceReconciliationContracts().get(VALIDATION_OFFICIAL_SOURCE_CAPABILITY)?.successOutcome, "validated_created"));
  check("08 capability compartida", () => assert.equal(combined.capabilities.get(VALIDATION_OFFICIAL_SOURCE_CAPABILITY)?.capabilityId, VALIDATION_OFFICIAL_SOURCE_CAPABILITY));
  check("09 inspectores distintos para la misma capability", () => assert.notEqual(
    validationOfficialSourceManifest.inspectors[0].inspectorId,
    externalNewsProducerManifest.inspectors.find(({capabilityId}) => capabilityId === VALIDATION_OFFICIAL_SOURCE_CAPABILITY)?.inspectorId,
  ));

  const externalSucceeded = buildGlobalResolutionInspectionDevResult("confirmed_succeeded", "external_news", 1);
  const externalMissing = buildGlobalResolutionInspectionDevResult("confirmed_not_applied", "external_news", 1);
  const validationSucceeded = buildGlobalResolutionInspectionDevResult("confirmed_succeeded", VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID, 1);
  const validationMissing = buildGlobalResolutionInspectionDevResult("confirmed_not_applied", VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID, 1);
  check("10 mismo assessment engine", () => assert.equal(externalSucceeded.assessment.version, validationSucceeded.assessment.version));
  check("11 mismo lifecycle", () => assert.equal(
    applyGlobalResolutionInspectionDevFixtureAssessment(validationSucceeded.reviewCase, validationSucceeded.assessment).globalResolution?.history.some(({kind}) => kind === "reconciliation_applied"),
    true,
  ));
  const controlsSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/components/GlobalResolutionControls.tsx"), "utf8");
  check("12 mismos controles UI", () => assert.equal(controlsSource.includes("GlobalResolutionInspectionDevFixture"), true));
  check("13 productor A confirmado", () => assert.equal(externalSucceeded.assessment.status, "confirmed_succeeded"));
  check("14 productor A no aplicado", () => assert.equal(externalMissing.assessment.status, "confirmed_not_applied"));
  check("15 productor B confirmado", () => assert.equal(validationSucceeded.assessment.status, "confirmed_succeeded"));
  check("16 productor B no aplicado", () => assert.equal(validationMissing.assessment.status, "confirmed_not_applied"));
  check("17 productor B conflicto", () => assert.equal(buildGlobalResolutionInspectionDevResult("conflicting_evidence", VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID).assessment.status, "conflicting_evidence"));
  check("18 productor B insuficiencia", () => assert.equal(buildGlobalResolutionInspectionDevResult("insufficient_evidence", VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID).assessment.status, "insufficient_evidence"));
  check("19 productor B fallo técnico", () => assert.equal(buildGlobalResolutionInspectionDevResult("technical_failure", VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID).assessment.status, "technical_failure"));
  check("20 productor B stale", () => assert.equal(buildGlobalResolutionInspectionDevResult("stale_context", VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID).assessment.status, "stale_context"));
  check("21 productor B ya reconciliado", () => assert.equal(buildGlobalResolutionInspectionDevResult("already_reconciled", VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID).assessment.status, "already_reconciled"));
  check("22 productor B unsupported", () => assert.equal(buildGlobalResolutionInspectionDevResult("unsupported", VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID).assessment.status, "unsupported"));

  const matrix = deriveGlobalResolutionProducerSupportMatrix(combined.producers);
  const validationRow = matrix.find(({producerId, capabilityId}) => producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID && capabilityId === VALIDATION_OFFICIAL_SOURCE_CAPABILITY)!;
  check("23 matriz derivada", () => assert.equal(validationRow.supportStatus, "validation_only"));
  check("24 matriz familia", () => assert.equal(validationRow.family, "official_sources"));
  check("25 matriz sin ejecución real", () => assert.equal(validationRow.execute, false));
  check("26 matriz permite inspección", () => assert.equal(validationRow.inspect, true));
  check("27 matriz permite reconciliación", () => assert.equal(validationRow.reconcile, true));
  check("28 productor repetido no duplica", () => {
    combined.producers.registerProducer(validationOfficialSourceManifest);
    assert.equal(validationRegistrationCount(), 1);
  });

  const validationCase = validationSucceeded.reviewCase;
  const request = buildValidationOfficialSourceInspectionRequest({
    reviewCase: validationCase,
    operationId: validationSucceeded.assessment.reconciliationCase.operationId,
    generation: 3,
    requestedAt: now,
  });
  const inspector = createValidationOfficialSourceInspector({scenario: "confirmed_succeeded"});
  const inspectors = new GlobalResolutionInspectorRegistry();
  inspectors.register(inspector);
  inspectors.register(inspector);
  check("29 inspector repetido no duplica", () => assert.equal(inspectors.list().length, 1));
  const service = new GlobalResolutionInspectionService(inspectors, () => validationCase, () => now);
  const inspected = await service.inspect(request);
  const inspectedAgain = await service.inspect(request);
  check("30 request validation producer", () => assert.equal(inspected.ok && inspected.evidence.producer, VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID));
  check("31 evidencia estable", () => assert.equal(
    inspectedAgain.ok && inspected.ok ? inspectedAgain.evidence.fingerprint : "",
    inspected.ok ? inspected.evidence.fingerprint : "",
  ));
  check("32 fingerprint incluye productor", () => assert.notEqual(
    fingerprintGlobalResolutionInspectionEvidence({...validationSucceeded.evidence, producer: "other"}),
    validationSucceeded.evidence.fingerprint,
  ));
  check("33 fingerprint incluye versión", () => assert.notEqual(
    fingerprintGlobalResolutionInspectionEvidence({...validationSucceeded.evidence, producerVersion: "2.0.0"}),
    validationSucceeded.evidence.fingerprint,
  ));
  check("34 fingerprint incluye manifiesto", () => assert.notEqual(
    fingerprintGlobalResolutionInspectionEvidence({...validationSucceeded.evidence, manifestVersion: "2.0.0"}),
    validationSucceeded.evidence.fingerprint,
  ));
  check("35 fingerprint cambia al cambiar adapter", () => {
    const changed = structuredClone(validationOfficialSourceManifest);
    changed.adapters[0].adapterId = "validation-official-source.changed-adapter.v1";
    assert.notEqual(fingerprintGlobalResolutionProducerManifest(changed), fingerprintGlobalResolutionProducerManifest(validationOfficialSourceManifest));
  });
  check("36 fingerprint cambia al cambiar inspector", () => {
    const changed = structuredClone(validationOfficialSourceManifest);
    changed.inspectors[0].inspectorId = "validation:changed-inspector";
    assert.notEqual(fingerprintGlobalResolutionProducerManifest(changed), fingerprintGlobalResolutionProducerManifest(validationOfficialSourceManifest));
  });
  check("37 manifest version obsoleta", () => assert.equal(combined.producers.checkCheckpoint(VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID, {
    ...combined.producers.checkpointBinding(VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID)!,
    manifestVersion: "0.0.1",
  }).status, "stale"));
  check("38 definition version obsoleta", () => assert.equal(combined.producers.resolveProducerForCase({
    producerId: VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID,
    producerVersion: "0.0.1",
  }).status, "version_mismatch"));
  check("39 binding inexistente", () => assert.equal(combined.producers.resolveAdapter("missing", "planner").status, "missing"));
  check("40 inspector inexistente", () => assert.equal(new GlobalResolutionInspectorRegistry().select(request).ok, false));
  const incompatibleRegistry = new GlobalResolutionInspectorRegistry();
  incompatibleRegistry.register({...inspector, id: "validation:incompatible", supports: () => ({supported: false, reason: "version_unsupported"})});
  check("41 inspector incompatible", () => assert.equal(incompatibleRegistry.select({...request, inspectorId: "validation:incompatible"}).ok, false));
  check("42 contrato incompatible", () => assert.equal(createValidationOfficialSourceReconciliationContracts().get("unknown"), undefined));

  async function failureFromEvidence(override: (evidence: GlobalResolutionInspectionEvidence) => GlobalResolutionInspectionEvidence) {
    const registry = new GlobalResolutionInspectorRegistry();
    registry.register(createValidationOfficialSourceInspector({scenario: "confirmed_succeeded", overrideEvidence: override}));
    return new GlobalResolutionInspectionService(registry, () => validationCase, () => now).inspect(request);
  }
  const wrongProducer = await failureFromEvidence((evidence) => ({...evidence, producer: "wrong"}));
  check("43 evidencia de productor incorrecto", () => assert.equal(!wrongProducer.ok && wrongProducer.code, "wrong_producer_evidence"));
  const wrongOperation = await failureFromEvidence((evidence) => ({...evidence, operationId: "operation:wrong"}));
  check("44 evidencia de operación incorrecta", () => assert.equal(!wrongOperation.ok && wrongOperation.code, "wrong_operation_evidence"));
  const staleGeneration = await failureFromEvidence((evidence) => ({...evidence, inspectionGeneration: 2}));
  check("45 generación obsoleta", () => assert.equal(!staleGeneration.ok && staleGeneration.code, "stale_generation"));
  const ambiguousRuntime = runtime();
  ambiguousRuntime.producers.registerProducer({...structuredClone(validationOfficialSourceManifest), producerId: "validation_official_source_competing"});
  check("46 productor ambiguo", () => assert.equal(ambiguousRuntime.producers.resolveProducerForCase({caseType: "validation_official_source"}).status, "ambiguous"));
  check("47 capability parcial bloqueada", () => assert.equal(combined.producers.resolveCapability(VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID, {kind: "replace_reference", requiredCapability: "replace_reference:noticia:luchador"}), undefined));

  const repaired = applyGlobalResolutionInspectionDevFixtureAssessment(validationSucceeded.reviewCase, validationSucceeded.assessment);
  const repairedTwice = applyGlobalResolutionInspectionDevFixtureAssessment(repaired, validationSucceeded.assessment);
  check("48 repair idempotente", () => assert.equal(repaired.globalResolution?.checkpointFingerprint, repairedTwice.globalResolution?.checkpointFingerprint));
  const retry = applyGlobalResolutionInspectionDevFixtureAssessment(validationMissing.reviewCase, validationMissing.assessment);
  const retryTwice = applyGlobalResolutionInspectionDevFixtureAssessment(retry, validationMissing.assessment);
  check("49 retry idempotente", () => assert.equal(retry.globalResolution?.checkpointFingerprint, retryTwice.globalResolution?.checkpointFingerprint));
  check("50 retry no ejecutado", () => assert.equal(retry.globalResolution?.execution, validationMissing.reviewCase.globalResolution?.execution));
  check("51 no writes", () => assert.equal(validationOfficialSourceSecurity.writes, false));
  check("52 no consultas Sanity", () => assert.equal(validationOfficialSourceSecurity.sanity, false));
  check("53 no API externa", () => assert.equal(validationOfficialSourceSecurity.network, false));
  check("54 no localStorage", () => assert.equal(validationOfficialSourceSecurity.localStorage, false));
  check("55 ningún caso real modificado", () => assert.equal(validationCase.globalResolution?.phase, "reconciliation_required"));

  const fixtureComponent = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/components/GlobalResolutionInspectionDevFixture.tsx"), "utf8");
  const inspectionIndex = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/index.ts"), "utf8");
  check("56 fixture sólo DEV", () => assert.equal(controlsSource.includes("import.meta.env.DEV"), true));
  check("57 productor validation-only sólo DEV test", () => assert.equal(inspectionIndex.includes("validationOfficialSource"), false));
  check("58 producción usa import eliminable", () => assert.equal(controlsSource.includes('lazy(() => import("./GlobalResolutionInspectionDevFixture"))'), true));
  check("59 UI sin condiciones por productor", () => {
    assert.equal(/producer(Id)?\s*===\s*["']/.test(controlsSource), false);
    assert.equal(/switch\s*\(\s*producer/.test(controlsSource), false);
  });
  const universalFiles = [
    "_laboratorio/laboratorio-ia/src/review/globalResolution/reconciliation/engine/engine.ts",
    "_laboratorio/laboratorio-ia/src/review/globalResolution/reconciliation/engine/orchestrator.ts",
    "_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/service.ts",
    "_laboratorio/laboratorio-ia/src/review/globalResolution/producers/registry.ts",
    "_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint/lifecycle.ts",
  ].map((path) => readFileSync(resolve(path), "utf8")).join("\n");
  check("60 núcleo sin condiciones por productor", () => {
    assert.equal(universalFiles.includes("validation_official_source"), false);
    assert.equal(universalFiles.includes("official_sources"), false);
  });
  check("61 integración B5", () => assert.equal(combined.producers.listProducers().length, 2));
  check("62 integración B4", () => assert.equal(typeof UniversalReconciliationInspectionEngine, "function"));
  check("63 integración B1-B3.5", () => {
    assert.equal(typeof GlobalResolutionInspectionService, "function");
    assert.equal(fixtureComponent.includes("Productor DEV"), true);
  });
  check("64 integración AU3", () => assert.equal(repaired.globalResolution?.history.some(({kind}) => kind === "reconciliation_applied"), true));
  check("65 integración AU2", () => assert.equal(validationCase.globalResolution?.graph.nodes.length, 3));

  const session = new GlobalResolutionInspectionDevFixtureSession();
  const slow = session.inspect("confirmed_succeeded", "external_news", {delayMs: 30});
  session.selectProducer();
  check("66 cambio de productor invalida assessment", () => assert.equal(session.pendingCount, 0));
  await checkAsync("67 cambio de productor aborta request", async () => assert.equal(await slow, undefined));
  const first = session.inspect("confirmed_succeeded", "external_news", {delayMs: 30});
  const second = session.inspect("confirmed_not_applied", VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID, {delayMs: 0});
  await checkAsync("68 respuesta tardía descartada", async () => assert.equal(await first, undefined));
  await checkAsync("69 evidencia no se cruza", async () => assert.equal((await second)?.evidence.producer, VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID));
  session.dispose();
  check("70 desmontaje limpia recursos", () => assert.equal(session.pendingCount, 0));
  const scenarioSession = new GlobalResolutionInspectionDevFixtureSession();
  void scenarioSession.inspect("confirmed_succeeded", "external_news", {delayMs: 30});
  scenarioSession.selectScenario();
  check("71 cambio de escenario limpia recursos", () => assert.equal(scenarioSession.pendingCount, 0));
  scenarioSession.dispose();

  const engine = new UniversalReconciliationInspectionEngine(
    service,
    () => validationCase,
    createValidationOfficialSourceReconciliationContracts(),
    validationOfficialSourceEvidenceToReconciliationEvidence,
  );
  const endToEnd = await engine.inspectAndAssess(request);
  check("72 orchestrator multiproductor", () => assert.equal(endToEnd.accepted && endToEnd.assessment.status, "confirmed_succeeded"));
  check("73 contrato de evidencia propio", () => assert.equal(validationOfficialSourceEvidenceToReconciliationEvidence(validationSucceeded.evidence)[0].outcome, undefined));
  check("74 operación completion declarada", () => assert.equal(validationOfficialSourceManifest.capabilities.some(({capabilityId}) => capabilityId === VALIDATION_OFFICIAL_SOURCE_COMPLETION_CAPABILITY), true));
  check("75 assessment repetido estable", () => assert.equal(
    buildGlobalResolutionInspectionDevResult("confirmed_succeeded", VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID, 1).assessment.assessmentFingerprint,
    validationSucceeded.assessment.assessmentFingerprint,
  ));
  check("76 superficie fixture única", () => assert.equal(fixtureComponent.includes("switch (producer"), false));
  check("77 suite mínima", () => assert.equal(completed.length >= 64, true));
  await checkAsync("78 seguridad async abort", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await service.inspect({...request, inspectionGeneration: 99}, {signal: controller.signal});
    assert.equal(result.ok, false);
  });

  console.log(`AU4 multi-producer validation tests: OK (${completed.length} cases)`);
}

void main();
