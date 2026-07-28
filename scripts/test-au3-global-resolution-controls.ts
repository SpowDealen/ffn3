import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  buildExternalNewsControlPlanningInput,
  buildExternalNewsControlSimulationContext,
  buildGlobalResolutionControlsView,
  externalNewsRuntimeManifests,
  GlobalResolutionRequestGate,
  initializeExternalNewsGlobalResolution,
  recoverExternalNewsGlobalResolution,
  registerExternalNewsGlobalResolutionRuntime,
  simulateExternalNewsGlobalResolution,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {getReviewCase, setReviewCaseRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/store/reviewStore";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";

const now = "2026-07-28T18:00:00.000Z";
const identityKey = "fighter:ada-controls";

class MemoryRepository {
  constructor(private cases: ReviewCase[] = []) {}
  load(): ReviewCase[] { return structuredClone(this.cases); }
  save(cases: readonly ReviewCase[]): void { this.cases = structuredClone([...cases]); }
}

function fixture(overrides: Partial<ReviewCase> = {}): ReviewCase {
  return {
    schemaVersion: 1,
    id: "case:au3:controls",
    dedupeKey: "external-news:controls",
    module: "external.news",
    title: "Ada Controls prepara un combate",
    status: "open",
    priority: "high",
    source: "Controlled",
    subject: {type: "external_news", id: "news:controls"},
    issues: [{id: "issue:fighter", kind: "missing_entity", valueKind: "fighter", fieldPath: "fighter", label: "Ada Controls", message: "Falta luchador", required: true, blocking: true}],
    resolutions: [{type: "create_entity", issueId: "issue:fighter", entityType: "fighter", draft: {entityType: "fighter", name: "Ada Controls", identityKey, disciplineId: "discipline:boxing", organizationIds: ["organization:test"], sourceEvidence: [{source: "controlled", confidence: .99}]}}],
    context: {
      producer: "external_news",
      operation: "create_draft",
      sourceId: "source:controlled",
      sourceName: "Controlled",
      sourceUrl: "https://example.test/source",
      externalItemId: "news:controls",
      canonicalUrl: "https://example.test/news",
      title: "Ada Controls prepara un combate",
      createdAt: now,
      payloadSnapshot: {id: "news:controls", title: "Ada Controls prepara un combate", excerpt: "Resumen editorial suficientemente largo", bodyText: "Contenido editorial suficientemente largo para validar la noticia.", canonicalUrl: "https://example.test/news", publishedAt: now, image: {url: "https://example.test/image.jpg"}},
      analysisSnapshot: {analysis: {relevancia: "alta"}, resolved: {disciplina: {id: "discipline:boxing"}, organizacion: null, evento: null, luchadoresPrincipales: [], luchadoresSecundarios: []}},
    },
    createdAt: now,
    updatedAt: now,
    version: 1,
    resumeAttempts: 0,
    ...overrides,
  };
}

async function main(): Promise<void> {
  const repository = new MemoryRepository([fixture()]);
  const restoreRepository = setReviewCaseRepositoryForTests(repository);
  let entityWrites = 0;
  let draftWrites = 0;
  const unregister = registerExternalNewsGlobalResolutionRuntime({
    fighter: {entityCreationExecutor: {async checkDuplicate() { return {status: "none", candidates: []}; }, async createEntity() { entityWrites += 1; return {success: true, entityId: "fighter:controls"}; }}},
    resume: {executor: {buildOutput() { return {_type: "noticia"}; }, async saveDraft() { draftWrites += 1; return {success: true, documentId: "draft:controls"}; }}},
    now: () => now,
  });
  try {
    const incompatible = fixture({context: {...fixture().context, producer: "other"}});
    assert.equal(buildGlobalResolutionControlsView(incompatible).visible, false);
    const absentCase = getReviewCase(fixture().id)!;
    const absentRecovery = await recoverExternalNewsGlobalResolution(absentCase.id);
    const absent = buildGlobalResolutionControlsView(absentCase, absentRecovery);
    assert.equal(absent.visible, true);
    assert.equal(absent.recoveryStatus, "absent");
    assert.equal(absent.recoveryLabel, "Resolución universal no inicializada");
    assert.equal(absent.canInitialize, true);
    assert.equal(entityWrites, 0);
    assert.equal(draftWrites, 0);

    const planning = buildExternalNewsControlPlanningInput(absentCase);
    assert.equal(planning.preparedEntities.length, 1);
    assert.equal(planning.preparedEntities[0].valid, true);
    assert.equal(planning.evidence.length, 1);
    const simulationContext = buildExternalNewsControlSimulationContext(absentCase);
    assert.equal(simulationContext.newsPayload?.titulo, absentCase.title);

    const initialized = await initializeExternalNewsGlobalResolution({caseId: absentCase.id, planning});
    assert.equal(initialized.status, "initialized");
    let current = getReviewCase(absentCase.id)!;
    let recovery = await recoverExternalNewsGlobalResolution(current.id);
    let view = buildGlobalResolutionControlsView(current, recovery);
    assert.equal(view.recoveryStatus, "valid");
    assert.equal(view.phase, "planned");
    assert.equal(view.canSimulate, true);
    assert.equal(entityWrites, 0);
    assert.equal(draftWrites, 0);

    const simulated = await simulateExternalNewsGlobalResolution({caseId: current.id, context: buildExternalNewsControlSimulationContext(current)});
    assert.equal(simulated.status, "simulated");
    current = getReviewCase(current.id)!;
    recovery = await recoverExternalNewsGlobalResolution(current.id);
    view = buildGlobalResolutionControlsView(current, recovery);
    assert.equal(view.total > 0, true);
    assert.equal(view.operations.some((operation) => operation.label === "Crear o reutilizar luchador"), true);
    assert.equal(view.operations.some((operation) => operation.label === "Aplicar referencia del luchador"), true);
    assert.equal(view.operations.some((operation) => operation.label === "Validar noticia"), true);
    assert.equal(view.operations.some((operation) => operation.label === "Guardar borrador y reanudar"), true);
    const create = view.operations.find((operation) => operation.capability === "create:luchador")!;
    const validation = view.operations.find((operation) => operation.capability === "validate:noticia")!;
    assert.equal(create.canExecute, true);
    assert.equal(create.stateLabel, "Lista");
    assert.equal(validation.support, "simulatable");
    assert.equal(validation.canExecute, false);
    assert.equal(entityWrites, 0);
    assert.equal(draftWrites, 0);

    const gate = new GlobalResolutionRequestGate();
    const first = gate.begin(current.id);
    assert.ok(first);
    assert.equal(gate.begin(current.id), undefined);
    assert.equal(gate.busy, true);
    assert.equal(first && gate.isCurrent(first, "another-case"), false);
    if (first) gate.finish(first);
    assert.equal(gate.busy, false);
    const staleToken = gate.begin(current.id)!;
    gate.cancel();
    assert.equal(gate.isCurrent(staleToken, current.id), false);

    const staleCase = structuredClone(current);
    staleCase.title = `${staleCase.title} actualizado`;
    staleCase.version += 1;
    staleCase.updatedAt = "2026-07-28T18:01:00.000Z";
    repository.save([staleCase]);
    const staleRecovery = await recoverExternalNewsGlobalResolution(staleCase.id);
    const stale = buildGlobalResolutionControlsView(staleCase, staleRecovery);
    assert.equal(stale.recoveryStatus, "stale");
    assert.equal(stale.canRegenerate, true);
    assert.equal(stale.operations.length, 0);

    const invalidRecovery = {...staleRecovery, checkpointStatus: "invalid" as const, recovery: {status: "invalid" as const, reasons: ["checkpoint_corrupt"]}, regenerationRequired: true, executionAllowed: false, reasons: ["checkpoint_corrupt"]};
    const invalid = buildGlobalResolutionControlsView(staleCase, invalidRecovery);
    assert.equal(invalid.recoveryStatus, "invalid");
    assert.equal(invalid.canDiscardInvalid, true);
    assert.equal(invalid.canSimulate, false);

    const validRecovery = simulated.recovery;
    assert.equal(validRecovery.recovery.status, "valid");
    if (validRecovery.recovery.status !== "valid") return;
    const reconciliationRecovery = structuredClone(validRecovery);
    if (reconciliationRecovery.recovery.status !== "valid") return;
    reconciliationRecovery.recovery.checkpoint.phase = "reconciliation_required";
    reconciliationRecovery.recovery.graph.nodes[0].state = "reconciliation_required";
    reconciliationRecovery.recovery.graph.nodes[0].error = {code: "reconciliation_required", message: "No repetir la operación.", retryable: false};
    reconciliationRecovery.reconciliationRequired = true;
    const reconciliation = buildGlobalResolutionControlsView(getReviewCase(fixture().id) ?? current, reconciliationRecovery);
    assert.equal(reconciliation.reconciliation, 1);
    assert.equal(reconciliation.operations.some((operation) => operation.canExecute), false);

    const resumed = buildGlobalResolutionControlsView(fixture({status: "resumed"}), absentRecovery);
    assert.equal(resumed.canInitialize, false);

    assert.deepEqual(externalNewsRuntimeManifests.map((item) => item.capability), ["create:luchador", "replace_reference:noticia:luchador", "validate:noticia", "resume:external_news"]);
    const component = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/components/GlobalResolutionControls.tsx"), "utf8");
    const details = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/components/ReviewCaseDetails.tsx"), "utf8");
    const legacyPreview = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/components/ExternalNewsResumePreviewPanel.tsx"), "utf8");
    const styles = readFileSync(resolve("_laboratorio/laboratorio-ia/src/styles.css"), "utf8");
    assert.equal(details.includes("<GlobalResolutionControls reviewCase={reviewCase} />"), true);
    assert.equal(component.includes("recoverExternalNewsGlobalResolution(reviewCase.id)"), true);
    assert.equal(component.includes("useEffect(() => executeExternalNewsResolutionOperation"), false);
    assert.equal(component.includes("useEffect(() => initializeExternalNewsGlobalResolution"), false);
    assert.equal(component.includes("aria-busy={locked}"), true);
    assert.equal(component.includes("disabled={locked}"), true);
    assert.equal(component.includes('role="alert"'), true);
    assert.equal(component.includes("tabIndex={feedback.kind"), true);
    assert.equal(component.includes("window.confirm"), true);
    assert.equal(component.includes("expectedCaseVersion: current.version"), true);
    assert.equal(component.includes("expectedCheckpointFingerprint: checkpoint.checkpointFingerprint"), true);
    assert.equal(component.includes("operationId,"), true);
    assert.equal(component.includes("fetch("), false);
    assert.equal(component.toLowerCase().includes("telegram"), false);
    assert.equal(component.includes("saveDraft("), false);
    assert.equal(component.includes("localStorage"), false);
    assert.equal(legacyPreview.includes('reviewCase.context.producer !== "external_news" || reviewCase.globalResolution'), true);
    assert.equal(component.includes('aria-label="Preview universal preparada"'), true);
    assert.equal(styles.includes("@media (max-width: 560px)"), true);
    assert.equal(styles.includes(".global-resolution-operation .review-button { width: 100%; }"), true);
  } finally {
    unregister();
    restoreRepository();
  }
  console.log("AU3 global resolution controls tests: OK");
}

main();
