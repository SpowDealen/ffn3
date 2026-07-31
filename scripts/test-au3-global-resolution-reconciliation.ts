import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  applyConfirmedReconciliation,
  assessReconciliation,
  buildCurrentGlobalResolutionCatalog,
  buildExternalNewsControlPlanningInput,
  buildExternalNewsControlSimulationContext,
  collectReconciliationEvidence,
  executeExternalNewsResolutionOperation,
  globalResolutionReconciliationSecurity,
  initializeExternalNewsGlobalResolution,
  markCheckpointReconciliationRequired,
  markCheckpointExecutionStarted,
  prepareExternalNewsGlobalResume,
  reconciliationOperationIds,
  registerExternalNewsGlobalResolutionRuntime,
  simulateExternalNewsGlobalResolution,
  type GlobalResolutionEffectInspector,
  type GlobalResolutionInspectionEvidence,
  type GlobalResolutionReconciliationEvidence,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {createMemoryOutcomeRepository, setOutcomeRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/outcomes";
import {
  getReviewCase,
  setReviewCaseRepositoryForTests,
  updateGlobalResolutionCheckpoint,
} from "../_laboratorio/laboratorio-ia/src/review/store/reviewStore";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";
import {CandidateDiscoveryRegistry, CandidateDiscoveryService, createSanityFighterCandidateDiscoveryAdapter} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity";
import {createInMemoryCandidateReader} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity/discovery/devFixture";

const now = "2026-07-28T20:00:00.000Z";
const identityKey = "fighter:fighter-reconciliation";

class MemoryRepository {
  constructor(private cases: ReviewCase[] = []) {}
  load(): ReviewCase[] { return structuredClone(this.cases); }
  save(cases: readonly ReviewCase[]): void { this.cases = structuredClone([...cases]); }
}

function fixture(): ReviewCase {
  return {
    schemaVersion: 1,
    id: "case:au3:reconciliation",
    dedupeKey: "external-news:reconciliation",
    module: "external.news",
    title: "Reconciliación AU3",
    status: "open",
    priority: "critical",
    source: "Controlled",
    subject: {type: "external_news", id: "news:reconciliation"},
    issues: [{id: "issue:fighter", kind: "missing_entity", valueKind: "fighter", fieldPath: "fighter", label: "Fighter", message: "Falta luchador", required: true, blocking: true}],
    resolutions: [{type: "create_entity", issueId: "issue:fighter", entityType: "fighter", draft: {entityType: "fighter", name: "Fighter Reconciliation", identityKey, disciplineId: "discipline:boxing", organizationIds: ["organization:test"], sourceEvidence: [{source: "controlled", confidence: .99}]}}],
    context: {
      producer: "external_news",
      operation: "create_draft",
      sourceId: "source:controlled",
      sourceName: "Controlled",
      sourceUrl: "https://example.test/source",
      externalItemId: "news:reconciliation",
      canonicalUrl: "https://example.test/news",
      title: "Reconciliación AU3",
      createdAt: now,
      payloadSnapshot: {id: "news:reconciliation", title: "Reconciliación AU3", excerpt: "Resumen editorial suficientemente largo", bodyText: "Contenido editorial suficientemente largo para una noticia reconciliada.", canonicalUrl: "https://example.test/news", publishedAt: now, image: {url: "https://example.test/image.jpg"}},
      analysisSnapshot: {analysis: {relevancia: "alta"}, resolved: {disciplina: {id: "discipline:boxing"}, organizacion: null, evento: null, luchadoresPrincipales: [], luchadoresSecundarios: []}},
    },
    createdAt: now,
    updatedAt: now,
    version: 1,
    resumeAttempts: 0,
  };
}

function externalEvidence(operationId: string, finding: "effect_confirmed" | "effect_not_found", suffix = ""): GlobalResolutionReconciliationEvidence {
  return {
    id: `external:${finding}:${suffix}`,
    type: "external_inspection",
    source: "external_inspector",
    operationId,
    observedAt: now,
    summary: finding === "effect_not_found" ? "No existe efecto con la clave esperada" : "El efecto equivalente existe",
    confidence: "confirmed",
    finding,
  };
}

function inspectionEvidence(input: Parameters<GlobalResolutionEffectInspector["inspect"]>[0], inspector: GlobalResolutionEffectInspector, status: GlobalResolutionInspectionEvidence["status"]): GlobalResolutionInspectionEvidence {
  const exists = status === "observed";
  return {
    inspectorId: inspector.id,
    inspectorVersion: inspector.version,
    inspectionId: `inspection:${status}`,
    producer: input.producer,
    capability: input.capability,
    operationId: input.operationId,
    operationFingerprint: input.operationFingerprint,
    checkpointFingerprint: input.checkpointFingerprint,
    inspectedAt: now,
    status,
    observations: exists
      ? [{kind: "entity_exists", entityType: input.subject.entityType ?? "noticia", entityId: input.subject.expectedId ?? "draft:other"}]
      : [{kind: "entity_missing", entityType: input.subject.entityType ?? "noticia", expectedId: input.subject.expectedId}],
    warnings: [],
    fingerprint: "sha256-v1:fixture",
  };
}

async function main(): Promise<void> {
  const repository = new MemoryRepository([fixture()]);
  const restoreReview = setReviewCaseRepositoryForTests(repository);
  const restoreOutcomes = setOutcomeRepositoryForTests(createMemoryOutcomeRepository());
  let entityWrites = 0;
  let draftWrites = 0;
  let inspectorCalls = 0;
  const unregister = registerExternalNewsGlobalResolutionRuntime({
    fighter: {
      entityCreationExecutor: {
        async checkDuplicate() { return {status: "none", candidates: []}; },
        async createEntity() { entityWrites += 1; return {success: true, entityId: "fighter:reconciliation"}; },
      },
      inspectCreatedEntity: async (id) => ({id, entityType: "luchador", name: "Fighter Reconciliation", identityKey, disciplineId: "discipline:boxing", organizationId: "organization:test", payload: {}}),
      now: () => now,
    },
    resume: {
      executor: {
        buildOutput() { return {_type: "noticia", titulo: "Reconciliación AU3"}; },
        async saveDraft() { draftWrites += 1; return {success: true, documentId: "draft:reconciliation"}; },
      },
      now: () => now,
    },
    now: () => now,
  });
  try {
    let current = getReviewCase(fixture().id)!;
    const initialized = await initializeExternalNewsGlobalResolution({caseId: current.id, planning: buildExternalNewsControlPlanningInput(current), dependencies: {now: () => now}});
    assert.equal(initialized.status, "initialized", JSON.stringify(initialized));
    current = getReviewCase(current.id)!;
    assert.equal((await simulateExternalNewsGlobalResolution({caseId: current.id, context: buildExternalNewsControlSimulationContext(current), dependencies: {now: () => now}})).status, "simulated");
    current = getReviewCase(current.id)!;
    const registry = new CandidateDiscoveryRegistry();
    registry.register(createSanityFighterCandidateDiscoveryAdapter(createInMemoryCandidateReader([])));
    const candidateDiscoveryService = new CandidateDiscoveryService(registry);
    const guardId = current.globalResolution!.plan.operations.find((item) => item.requiredCapability === "resolve_identity:fighter")!.id;
    assert.equal((await executeExternalNewsResolutionOperation({caseId: current.id, expectedCaseVersion: current.version, expectedCheckpointFingerprint: current.globalResolution!.checkpointFingerprint, operationId: guardId, simulationContext: buildExternalNewsControlSimulationContext(current), idempotencyContext: "reconciliation:guard", dependencies: {now: () => now, candidateDiscoveryService}})).status, "succeeded");
    current = getReviewCase(current.id)!;
    const simulatedCase = structuredClone(current);
    const createId = current.globalResolution!.plan.operations.find((item) => item.kind === "create_entity")!.id;
    assert.equal((await executeExternalNewsResolutionOperation({caseId: current.id, expectedCaseVersion: current.version, expectedCheckpointFingerprint: current.globalResolution!.checkpointFingerprint, operationId: createId, simulationContext: buildExternalNewsControlSimulationContext(current), idempotencyContext: "reconciliation:create", authorized: true, dependencies: {now: () => now}})).status, "succeeded");
    current = getReviewCase(current.id)!;
    const replaceId = current.globalResolution!.plan.operations.find((item) => item.kind === "replace_reference")!.id;
    assert.equal((await executeExternalNewsResolutionOperation({caseId: current.id, expectedCaseVersion: current.version, expectedCheckpointFingerprint: current.globalResolution!.checkpointFingerprint, operationId: replaceId, simulationContext: buildExternalNewsControlSimulationContext(current), idempotencyContext: "reconciliation:replace", authorized: true, dependencies: {now: () => now}})).status, "succeeded");
    current = getReviewCase(current.id)!;
    const validateId = current.globalResolution!.plan.operations.find((item) => item.requiredCapability === "validate:noticia")!.id;
    assert.equal((await executeExternalNewsResolutionOperation({caseId: current.id, expectedCaseVersion: current.version, expectedCheckpointFingerprint: current.globalResolution!.checkpointFingerprint, operationId: validateId, simulationContext: buildExternalNewsControlSimulationContext(current), idempotencyContext: "reconciliation:validate", dependencies: {now: () => now}})).status, "succeeded");
    current = getReviewCase(current.id)!;
    const prepared = await prepareExternalNewsGlobalResume({caseId: current.id, expectedCaseVersion: current.version, expectedCheckpointFingerprint: current.globalResolution!.checkpointFingerprint, dependencies: {now: () => now}});
    assert.equal(prepared.status, "ready_to_resume");
    current = getReviewCase(current.id)!;
    const readyCheckpoint = current.globalResolution!;
    const resumeId = readyCheckpoint.resume!.operationId;
    const recoveryGraph = readyCheckpoint.graph;
    const catalog = buildCurrentGlobalResolutionCatalog();
    const graph = (await import("../_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint/serialization")).deserializeResolutionGraph(recoveryGraph, readyCheckpoint.plan, readyCheckpoint.createdAt);
    assert.equal(graph.ok, true);
    if (!graph.ok) throw new Error("graph_invalid");
    const plan = (await import("../_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint/serialization")).deserializeGlobalResolutionPlan(readyCheckpoint.plan, graph.value, readyCheckpoint.createdAt);
    assert.equal(plan.ok, true);
    if (!plan.ok) throw new Error("plan_invalid");
    const started = markCheckpointExecutionStarted({reviewCase: current, checkpoint: readyCheckpoint, plan: plan.value, catalog, operationId: resumeId, idempotencyKey: `resume:${resumeId}`, startedAt: now, resume: true, now: () => now});
    updateGlobalResolutionCheckpoint(current.id, current.version, () => started, new Date(now), readyCheckpoint.checkpointFingerprint);
    current = getReviewCase(current.id)!;
    const startedCase = structuredClone(current);
    const uncertainCheckpoint = markCheckpointReconciliationRequired({reviewCase: startedCase, checkpoint: startedCase.globalResolution!, plan: plan.value, catalog, operationId: resumeId, reason: "executor_timeout", now: () => now});
    const notAppliedCase = {...startedCase, globalResolution: uncertainCheckpoint};

    // Simula exactamente: el dominio guardó y actualizó ReviewCase, pero el checkpoint final no persistió.
    repository.save([{
      ...current,
      status: "resumed",
      resumedAt: now,
      updatedAt: now,
      version: current.version + 1,
      resumeAttempts: current.resumeAttempts + 1,
      resumeExecution: {
        status: "succeeded",
        attemptCount: 1,
        startedAt: now,
        completedAt: now,
        previewFingerprint: current.globalResolution!.resume!.previewFingerprint,
        caseVersionAtStart: current.version,
        draftId: "draft:reconciliation",
        documentId: "draft:reconciliation",
        summary: {appliedResolutionCount: 1, changeCount: 1},
      },
    }]);
    const uncertain = getReviewCase(current.id)!;
    assert.deepEqual(reconciliationOperationIds(uncertain), [resumeId]);
    const writesBeforeReconciliation = {entityWrites, draftWrites};

    const collected = await collectReconciliationEvidence({reviewCase: uncertain, operationId: resumeId, now: () => now});
    assert.equal(collected.evidence.some((item) => item.type === "resume_result" && item.confidence === "confirmed"), true);
    assert.equal(collected.evidence.some((item) => item.type === "stored_document_id"), true);
    assert.equal(new Set(collected.evidence.map((item) => item.id)).size, collected.evidence.length);
    assert.equal(collected.evidence.every((item) => !item.summary.includes("{")), true);
    const assessment = assessReconciliation(collected, uncertain.globalResolution!);
    assert.equal(assessment.status, "confirmed_succeeded");
    if (assessment.status !== "confirmed_succeeded") throw new Error("critical_resume_not_confirmed");
    assert.equal(assessment.outcome.documentId, "draft:reconciliation");
    assert.equal(assessment.outcome.payloadFingerprint, uncertain.globalResolution!.resume!.payloadFingerprint);

    const applied = await applyConfirmedReconciliation({assessment, expectedCaseVersion: uncertain.version, expectedCheckpointFingerprint: uncertain.globalResolution!.checkpointFingerprint, expectedAssessmentFingerprint: assessment.assessmentFingerprint, now: () => now});
    assert.equal(applied.status, "applied", JSON.stringify(applied));
    const repaired = getReviewCase(uncertain.id)!;
    assert.equal(repaired.globalResolution?.phase, "completed");
    assert.equal(repaired.globalResolution?.graph.nodes.find((item) => item.operationId === resumeId)?.state, "succeeded");
    assert.equal(repaired.globalResolution?.resume?.draftId, "draft:reconciliation");
    assert.equal(repaired.globalResolution?.history.some((item) => item.kind === "reconciliation_applied"), true);
    assert.equal(repaired.globalResolution?.history.some((item) => item.kind === "reconciliation_evidence_collected"), true);
    assert.deepEqual({entityWrites, draftWrites}, writesBeforeReconciliation);
    assert.equal((await applyConfirmedReconciliation({assessment, expectedCaseVersion: uncertain.version, expectedCheckpointFingerprint: uncertain.globalResolution!.checkpointFingerprint, expectedAssessmentFingerprint: assessment.assessmentFingerprint, now: () => now})).status, "already_reconciled");
    assert.equal(repaired.globalResolution?.history.filter((item) => item.kind === "reconciliation_applied").length, 1);

    // Timeout incierto sin ID: no hay base para repetir ni reparar.
    const timeoutCase = structuredClone(uncertain);
    timeoutCase.status = "resume_failed";
    timeoutCase.resumeExecution = {status: "failed", attemptCount: 1, startedAt: now, failedAt: now, previewFingerprint: timeoutCase.globalResolution!.resume!.previewFingerprint, error: {code: "timeout", message: "timeout"}};
    timeoutCase.globalResolution!.phase = "reconciliation_required";
    const timeoutNode = timeoutCase.globalResolution!.graph.nodes.find((item) => item.operationId === resumeId)!;
    timeoutNode.state = "reconciliation_required";
    timeoutNode.result = undefined;
    const timeoutAssessment = assessReconciliation(await collectReconciliationEvidence({reviewCase: timeoutCase, operationId: resumeId, now: () => now}), timeoutCase.globalResolution!);
    assert.equal(timeoutAssessment.status, "insufficient_evidence");
    assert.equal(timeoutAssessment.retryAllowed, false);

    const absentInspector: GlobalResolutionEffectInspector = {
      id: "test:absent",
      version: "1",
      supports: () => ({supported: true, specificity: 1}),
      async inspect(input) { inspectorCalls += 1; return inspectionEvidence(input, absentInspector, "not_observed"); },
    };
    const absentCase = await collectReconciliationEvidence({reviewCase: timeoutCase, operationId: resumeId, inspector: absentInspector, includeExternalInspection: true, now: () => now});
    assert.equal(inspectorCalls, 1);
    const notApplied = assessReconciliation(absentCase, timeoutCase.globalResolution!);
    assert.equal(notApplied.status, "confirmed_not_applied");
    assert.equal(notApplied.retryAllowed, true);

    repository.save([notAppliedCase]);
    const storedNotApplied = getReviewCase(notAppliedCase.id)!;
    const actionableNotAppliedCase = await collectReconciliationEvidence({reviewCase: storedNotApplied, operationId: resumeId, inspector: absentInspector, includeExternalInspection: true, now: () => now});
    const actionableNotApplied = assessReconciliation(actionableNotAppliedCase, storedNotApplied.globalResolution!);
    assert.equal(actionableNotApplied.status, "confirmed_not_applied");
    const staleApply = await applyConfirmedReconciliation({assessment: actionableNotApplied, expectedCaseVersion: storedNotApplied.version + 1, expectedCheckpointFingerprint: storedNotApplied.globalResolution!.checkpointFingerprint, expectedAssessmentFingerprint: actionableNotApplied.assessmentFingerprint, inspector: absentInspector, includeExternalInspection: true, now: () => now});
    assert.equal(staleApply.status, "conflict");
    const retryEnabled = await applyConfirmedReconciliation({assessment: actionableNotApplied, expectedCaseVersion: storedNotApplied.version, expectedCheckpointFingerprint: storedNotApplied.globalResolution!.checkpointFingerprint, expectedAssessmentFingerprint: actionableNotApplied.assessmentFingerprint, inspector: absentInspector, includeExternalInspection: true, now: () => now});
    assert.equal(retryEnabled.status, "applied", JSON.stringify(retryEnabled));
    const retryCase = getReviewCase(storedNotApplied.id)!;
    assert.equal(retryCase.globalResolution?.graph.nodes.find((item) => item.operationId === resumeId)?.state, "ready");
    assert.equal(retryCase.globalResolution?.resume?.draftId, undefined);
    assert.equal(retryCase.globalResolution?.execution?.operations.find((item) => item.operationId === resumeId)?.attempt, undefined);
    assert.deepEqual({entityWrites, draftWrites}, writesBeforeReconciliation);

    const conflictingCase = structuredClone(absentCase);
    conflictingCase.evidence.push({...externalEvidence(resumeId, "effect_confirmed", "two"), documentId: "draft:other"});
    assert.equal(assessReconciliation(conflictingCase, timeoutCase.globalResolution!).status, "conflicting_evidence");
    const failedInspector: GlobalResolutionEffectInspector = {id: "test:failed", version: "1", supports: () => ({supported: true, specificity: 1}), async inspect() { throw new Error("secret stack"); }};
    const failedInspection = await collectReconciliationEvidence({reviewCase: timeoutCase, operationId: resumeId, inspector: failedInspector, includeExternalInspection: true, now: () => now});
    assert.equal(failedInspection.evidence.some((item) => item.summary.includes("secret")), false);
    assert.equal(await collectReconciliationEvidence({reviewCase: timeoutCase, operationId: resumeId, inspector: absentInspector, includeExternalInspection: false, now: () => now}).then((value) => value.evidence.some((item) => item.source === "external_inspector")), false);

    const fighterGraph = (await import("../_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint/serialization")).deserializeResolutionGraph(simulatedCase.globalResolution!.graph, simulatedCase.globalResolution!.plan, simulatedCase.globalResolution!.createdAt);
    assert.equal(fighterGraph.ok, true);
    if (!fighterGraph.ok) throw new Error("fighter_graph_invalid");
    const fighterPlan = (await import("../_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint/serialization")).deserializeGlobalResolutionPlan(simulatedCase.globalResolution!.plan, fighterGraph.value, simulatedCase.globalResolution!.createdAt);
    assert.equal(fighterPlan.ok, true);
    if (!fighterPlan.ok) throw new Error("fighter_plan_invalid");
    const fighterCheckpoint = markCheckpointReconciliationRequired({reviewCase: simulatedCase, checkpoint: simulatedCase.globalResolution!, plan: fighterPlan.value, catalog, operationId: createId, reason: "postcondition_unverified", now: () => now});
    const fighterCase: ReviewCase = {...simulatedCase, globalResolution: fighterCheckpoint, entityMaterialization: {status: "reconciliation_required", attemptCount: 1, completedAt: now, issueResults: [{issueId: "issue:fighter", identityKey, entityType: "fighter", entityId: "fighter:reconciliation", status: "created"}]}};
    const fighterAssessment = assessReconciliation(await collectReconciliationEvidence({reviewCase: fighterCase, operationId: createId, now: () => now}), fighterCheckpoint);
    assert.equal(fighterAssessment.status, "confirmed_succeeded");
    const fighterWithoutPostcondition = structuredClone(fighterCase);
    fighterWithoutPostcondition.entityMaterialization = undefined;
    assert.equal(assessReconciliation(await collectReconciliationEvidence({reviewCase: fighterWithoutPostcondition, operationId: createId, now: () => now}), fighterCheckpoint).status, "insufficient_evidence");

    assert.deepEqual(globalResolutionReconciliationSecurity, {
      executesCapabilities: false,
      callsSaveDraft: false,
      persistsAuthorization: false,
      automaticInspector: false,
      secondStore: false,
      externalWrites: false,
      payloadsPersisted: false,
    });
    const service = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/reconciliation/service.ts"), "utf8");
    const component = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/components/GlobalResolutionControls.tsx"), "utf8");
    const controlsModel = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/controlsModel.ts"), "utf8");
    assert.equal(service.includes("saveDraft("), false);
    assert.equal(service.includes("executeUniversalExecutionPlan"), false);
    assert.equal(service.includes("fetch("), false);
    assert.equal(service.toLowerCase().includes("telegram"), false);
    assert.equal(component.includes("Comprobar resultado real"), true);
    assert.equal(controlsModel.includes('repair_checkpoint: "Reparar checkpoint"'), true);
    assert.equal(controlsModel.includes('enable_retry: "Habilitar nuevo intento"'), true);
    assert.equal(component.includes("marcar manualmente"), false);
    assert.equal(component.includes("window.confirm(confirmation)"), true);
  } finally {
    unregister();
    restoreOutcomes();
    restoreReview();
  }
  console.log("AU3 global resolution reconciliation tests: OK");
}

main();
