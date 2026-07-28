import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  authorizeAndResumeExternalNews,
  authorizeExternalNewsGlobalResume,
  executeExternalNewsResolutionOperation,
  externalNewsApplicationAudit,
  externalNewsRuntimeManifests,
  initializeExternalNewsGlobalResolution,
  prepareExternalNewsGlobalResume,
  recoverExternalNewsGlobalResolution,
  registerExternalNewsGlobalResolutionRuntime,
  simulateExternalNewsGlobalResolution,
  type PreparedEntityPlanningInput,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {getExternalNewsResumeSnapshot} from "../_laboratorio/laboratorio-ia/src/review/resume/externalNews";
import {
  getReviewCase,
  setGlobalResolutionCheckpoint,
  setReviewCaseRepositoryForTests,
  updateGlobalResolutionCheckpoint,
} from "../_laboratorio/laboratorio-ia/src/review/store/reviewStore";
import type {ReviewCase, ReviewJsonObject} from "../_laboratorio/laboratorio-ia/src/review/types";

const timestamps = [
  "2026-07-28T14:00:00.000Z", "2026-07-28T14:01:00.000Z", "2026-07-28T14:02:00.000Z",
  "2026-07-28T14:03:00.000Z", "2026-07-28T14:04:00.000Z", "2026-07-28T14:05:00.000Z",
  "2026-07-28T14:06:00.000Z", "2026-07-28T14:07:00.000Z", "2026-07-28T14:08:00.000Z",
  "2026-07-28T14:09:00.000Z", "2026-07-28T14:10:00.000Z", "2026-07-28T14:11:00.000Z",
];
let clockIndex = 0;
const clock = () => timestamps[Math.min(clockIndex++, timestamps.length - 1)];
const identityKey = "fighter:ada-au3";

class MemoryRepository {
  constructor(private cases: ReviewCase[] = []) {}
  load(): ReviewCase[] { return structuredClone(this.cases); }
  save(cases: readonly ReviewCase[]): void { this.cases = structuredClone([...cases]); }
}

function reviewCase(overrides: Partial<ReviewCase> = {}): ReviewCase {
  return {
    schemaVersion: 1,
    id: "case:au3:external-news",
    dedupeKey: "external-news:au3",
    module: "external.news",
    title: "Ada AU3 firma un combate",
    status: "open",
    priority: "high",
    source: "Controlled",
    subject: {type: "external_news", id: "news:au3", label: "Ada AU3"},
    issues: [{id: "issue:fighter", kind: "missing_entity", valueKind: "fighter", fieldPath: "fighter", label: "Ada AU3", message: "Falta luchador", required: true, blocking: true}],
    resolutions: [{type: "create_entity", issueId: "issue:fighter", entityType: "fighter", draft: prepared().draft}],
    context: {
      producer: "external_news",
      operation: "create_draft",
      sourceId: "source:controlled",
      sourceName: "Controlled",
      sourceUrl: "https://example.test/source",
      externalItemId: "news:au3",
      canonicalUrl: "https://example.test/news",
      title: "Ada AU3 firma un combate",
      createdAt: timestamps[0],
      payloadSnapshot: {id: "news:au3", title: "Ada AU3 firma un combate", excerpt: "Resumen editorial suficientemente largo", bodyText: "Contenido editorial suficientemente largo y verificado para una noticia.", canonicalUrl: "https://example.test/news", publishedAt: timestamps[0], image: {url: "https://example.test/image.jpg"}},
      analysisSnapshot: {analysis: {relevancia: "alta"}, resolved: {disciplina: {id: "discipline:boxing"}, organizacion: null, evento: null, luchadoresPrincipales: [], luchadoresSecundarios: []}},
    },
    createdAt: timestamps[0],
    updatedAt: timestamps[0],
    version: 1,
    resumeAttempts: 0,
    ...overrides,
  };
}

function prepared(): PreparedEntityPlanningInput {
  return {
    issueId: "issue:fighter",
    entityType: "fighter",
    draft: {entityType: "fighter", name: "Ada AU3", identityKey, disciplineId: "discipline:boxing", organizationIds: ["organization:test"], sourceEvidence: [{source: "controlled"}]},
    identityKey,
    valid: true,
    evidence: [{id: "evidence:au3", kind: "controlled_source", source: "test", confidence: .99, limitations: []}],
  };
}

function simulationContext(value: ReviewCase) {
  const snapshot = getExternalNewsResumeSnapshot(value.context).snapshot;
  if (!snapshot) throw new Error("snapshot_missing");
  return {
    reviewCase: value,
    preparedEntities: [{issueId: "issue:fighter", entityType: "fighter" as const, draft: prepared().draft}],
    fighterCandidates: [],
    newsPayload: snapshot.payload,
    producerContracts: [{producer: "external_news", supportsSimulation: true, allowsProjectedReferences: true}],
  };
}

async function main(): Promise<void> {
  const repository = new MemoryRepository([reviewCase()]);
  const restoreRepository = setReviewCaseRepositoryForTests(repository);
  let creates = 0;
  let saves = 0;
  let builds = 0;
  const unregisterRuntime = registerExternalNewsGlobalResolutionRuntime({
    fighter: {
      entityCreationExecutor: {
        async checkDuplicate() { return {status: "none", candidates: []}; },
        async createEntity() { creates += 1; return {success: true, entityId: "fighter:real:ada"}; },
      },
      inspectCreatedEntity: async (id) => ({id, entityType: "luchador", name: "Ada AU3", identityKey, disciplineId: "discipline:boxing", organizationId: "organization:test", payload: {}}),
      now: clock,
    },
    resume: {
      executor: {
        buildOutput(form) { builds += 1; return {_type: "noticia", titulo: String(form.titulo ?? ""), contenido: String(form.contenido ?? ""), fuenteUrl: String(form.fuenteUrl ?? "")}; },
        async saveDraft(_output, options) { saves += 1; assert.ok(options.idempotencyKey); return {success: true, documentId: "draft:au3"}; },
      },
      now: clock,
    },
    now: clock,
  });
  try {
    assert.deepEqual(externalNewsRuntimeManifests.map((item) => [item.capability, item.support]), [
      ["create:luchador", "executable"],
      ["replace_reference:noticia:luchador", "executable"],
      ["validate:noticia", "simulatable"],
      ["resume:external_news", "executable"],
    ]);
    assert.equal(externalNewsRuntimeManifests.find((item) => item.capability === "validate:noticia")?.executorId, undefined);
    assert.equal(JSON.stringify(externalNewsRuntimeManifests).includes("function"), false);

    const absent = await recoverExternalNewsGlobalResolution("missing", {now: clock});
    assert.equal(absent.checkpointStatus, "absent");
    const wrong = new MemoryRepository([reviewCase({context: {...reviewCase().context, producer: "other"}})]);
    const restoreWrong = setReviewCaseRepositoryForTests(wrong);
    const wrongProducer = await initializeExternalNewsGlobalResolution({caseId: reviewCase().id, planning: {preparedEntities: [prepared()], evidence: prepared().evidence}, dependencies: {now: clock}});
    assert.deepEqual({status: wrongProducer.status, reasons: "reasons" in wrongProducer ? wrongProducer.reasons : []}, {status: "producer_mismatch", reasons: ["producer_mismatch"]});
    restoreWrong();
    const {analysisSnapshot: _analysisSnapshot, ...contextWithoutAnalysis} = reviewCase().context;
    const missingSnapshotCase = reviewCase({context: contextWithoutAnalysis});
    const restoreMissingSnapshot = setReviewCaseRepositoryForTests(new MemoryRepository([missingSnapshotCase]));
    assert.equal((await initializeExternalNewsGlobalResolution({caseId: missingSnapshotCase.id, planning: {preparedEntities: [prepared()], evidence: prepared().evidence}, dependencies: {now: clock}})).status, "case_invalid");
    restoreMissingSnapshot();
    const blockedPrepared = {...prepared(), valid: false};
    const restoreBlocked = setReviewCaseRepositoryForTests(new MemoryRepository([reviewCase()]));
    assert.equal((await initializeExternalNewsGlobalResolution({caseId: reviewCase().id, planning: {preparedEntities: [blockedPrepared], evidence: blockedPrepared.evidence}, dependencies: {now: clock}})).status, "planning_blocked");
    restoreBlocked();
    const persistenceCase = reviewCase({id: "case:au3:init-persistence"});
    const failingPersistence = {
      get: (caseId: string) => caseId === persistenceCase.id ? persistenceCase : undefined,
      set(): ReviewCase | undefined { throw new Error("injected_checkpoint_persistence_failure"); },
      update(): ReviewCase | undefined { throw new Error("injected_checkpoint_persistence_failure"); },
    };
    assert.equal((await initializeExternalNewsGlobalResolution({caseId: persistenceCase.id, planning: {preparedEntities: [prepared()], evidence: prepared().evidence}, dependencies: {now: clock, persistence: failingPersistence}})).status, "checkpoint_failed");
    const conflictPersistence = {...failingPersistence, set(): ReviewCase | undefined { throw new Error("version changed conflict"); }};
    assert.equal((await initializeExternalNewsGlobalResolution({caseId: persistenceCase.id, planning: {preparedEntities: [prepared()], evidence: prepared().evidence}, dependencies: {now: clock, persistence: conflictPersistence}})).status, "checkpoint_conflict");
    assert.equal((await simulateExternalNewsGlobalResolution({caseId: "missing", context: simulationContext(reviewCase()), dependencies: {now: clock}})).status, "absent");

    const initialized = await initializeExternalNewsGlobalResolution({caseId: reviewCase().id, planning: {preparedEntities: [prepared()], evidence: prepared().evidence}, dependencies: {now: clock}});
    assert.equal(initialized.status, "initialized");
    assert.equal((await initializeExternalNewsGlobalResolution({caseId: reviewCase().id, planning: {preparedEntities: [prepared()], evidence: prepared().evidence}, dependencies: {now: clock}})).status, "already_initialized");
    const afterInit = getReviewCase(reviewCase().id)!;
    assert.equal(afterInit.globalResolution?.phase, "planned");
    assert.equal(creates, 0);
    assert.equal(saves, 0);

    const simulated = await simulateExternalNewsGlobalResolution({caseId: afterInit.id, context: simulationContext(afterInit), dependencies: {now: clock}});
    assert.equal(simulated.status, "simulated");
    assert.equal(creates, 0);
    assert.equal(saves, 0);
    const afterSimulation = getReviewCase(afterInit.id)!;
    const checkpoint = afterSimulation.globalResolution!;
    const createOperation = checkpoint.plan.operations.find((item) => item.kind === "create_entity")!;
    assert.ok(simulated.recovery.nextReadyOperationIds.includes(createOperation.id));
    assert.equal((await executeExternalNewsResolutionOperation({caseId: afterSimulation.id, expectedCaseVersion: afterSimulation.version, expectedCheckpointFingerprint: checkpoint.checkpointFingerprint, operationId: "unknown", simulationContext: simulationContext(afterSimulation), idempotencyContext: "au3:unknown", authorized: true, dependencies: {now: clock}})).status, "operation_unknown");
    assert.equal((await executeExternalNewsResolutionOperation({caseId: afterSimulation.id, expectedCaseVersion: afterSimulation.version + 1, expectedCheckpointFingerprint: checkpoint.checkpointFingerprint, operationId: createOperation.id, simulationContext: simulationContext(afterSimulation), idempotencyContext: "au3:wrong-version", authorized: true, dependencies: {now: clock}})).status, "checkpoint_conflict");
    assert.equal((await executeExternalNewsResolutionOperation({caseId: afterSimulation.id, expectedCaseVersion: afterSimulation.version, expectedCheckpointFingerprint: "sha256-v1:old", operationId: createOperation.id, simulationContext: simulationContext(afterSimulation), idempotencyContext: "au3:old-checkpoint", authorized: true, dependencies: {now: clock}})).status, "checkpoint_conflict");

    const unauthorized = await executeExternalNewsResolutionOperation({caseId: afterSimulation.id, expectedCaseVersion: afterSimulation.version, expectedCheckpointFingerprint: checkpoint.checkpointFingerprint, operationId: createOperation.id, simulationContext: simulationContext(afterSimulation), idempotencyContext: "au3:create", dependencies: {now: clock}});
    assert.equal(unauthorized.status, "authorization_required");
    assert.equal(creates, 0);

    const createInput = {caseId: afterSimulation.id, expectedCaseVersion: afterSimulation.version, expectedCheckpointFingerprint: checkpoint.checkpointFingerprint, operationId: createOperation.id, simulationContext: simulationContext(afterSimulation), idempotencyContext: "au3:create", authorized: true, dependencies: {now: clock}};
    const firstCreate = executeExternalNewsResolutionOperation(createInput);
    const duplicateCreate = executeExternalNewsResolutionOperation(createInput);
    assert.equal(firstCreate, duplicateCreate);
    assert.equal((await firstCreate).status, "succeeded");
    assert.equal(creates, 1);
    const afterCreate = getReviewCase(afterSimulation.id)!;
    const referenceOperation = afterCreate.globalResolution!.plan.operations.find((item) => item.kind === "replace_reference")!;
    assert.ok((await recoverExternalNewsGlobalResolution(afterCreate.id)).nextReadyOperationIds.includes(referenceOperation.id));

    const reference = await executeExternalNewsResolutionOperation({caseId: afterCreate.id, expectedCaseVersion: afterCreate.version, expectedCheckpointFingerprint: afterCreate.globalResolution!.checkpointFingerprint, operationId: referenceOperation.id, simulationContext: simulationContext(afterCreate), idempotencyContext: "au3:reference", authorized: true, dependencies: {now: clock}});
    assert.deepEqual({status: reference.status, reasons: "reasons" in reference ? reference.reasons : []}, {status: "succeeded", reasons: []});
    if (reference.status !== "succeeded") throw new Error("reference_failed");
    assert.equal(reference.replacement?.ok, true);
    if (reference.replacement?.ok) {
      assert.equal(Array.isArray(reference.replacement.payload.luchadoresRelacionados) && reference.replacement.payload.luchadoresRelacionados.includes("fighter:real:ada"), true);
      assert.equal(JSON.stringify(reference.replacement.payload).includes("projected:"), false);
    }
    const afterReference = getReviewCase(afterCreate.id)!;
    assert.equal(afterReference.globalResolution?.referenceResolution?.documentId, "fighter:real:ada");
    assert.equal("payload" in (afterReference.globalResolution?.referenceResolution ?? {}), false);

    const validateOperation = afterReference.globalResolution!.plan.operations.find((item) => item.requiredCapability === "validate:noticia")!;
    const validation = await executeExternalNewsResolutionOperation({caseId: afterReference.id, expectedCaseVersion: afterReference.version, expectedCheckpointFingerprint: afterReference.globalResolution!.checkpointFingerprint, operationId: validateOperation.id, simulationContext: simulationContext(afterReference), idempotencyContext: "au3:validate", dependencies: {now: clock}});
    assert.equal(validation.status, "succeeded");
    assert.equal(saves, 0);

    const beforePrepare = getReviewCase(afterReference.id)!;
    const preparation = await prepareExternalNewsGlobalResume({caseId: beforePrepare.id, expectedCaseVersion: beforePrepare.version, expectedCheckpointFingerprint: beforePrepare.globalResolution!.checkpointFingerprint, dependencies: {now: clock}});
    assert.deepEqual({status: preparation.status, blockers: "prepared" in preparation ? preparation.prepared.blockers : [], checkpoint: "lifecycle" in preparation ? preparation.lifecycle.checkpoint.status : "none"}, {status: "ready_to_resume", blockers: [], checkpoint: "persisted"});
    if (preparation.status !== "ready_to_resume") throw new Error("resume_preparation_failed");
    assert.equal(saves, 0);
    const readyCase = getReviewCase(beforePrepare.id)!;
    assert.equal(readyCase.globalResolution?.phase, "ready_to_resume");
    const resumeOperationId = readyCase.globalResolution!.resume!.operationId;
    assert.equal(authorizeExternalNewsGlobalResume({prepared: preparation.prepared, checkpoint: readyCase.globalResolution!, operationId: "wrong", confirmedAt: clock()}), undefined);
    const authorization = authorizeExternalNewsGlobalResume({prepared: preparation.prepared, checkpoint: readyCase.globalResolution!, operationId: resumeOperationId, confirmedAt: clock(), validityMs: 60 * 60_000});
    assert.ok(authorization);
    if (!authorization) return;
    assert.equal(JSON.stringify(readyCase.globalResolution).includes("confirmedAt"), false);
    const resumed = await authorizeAndResumeExternalNews({caseId: readyCase.id, prepared: preparation.prepared, authorization, expectedCheckpointFingerprint: readyCase.globalResolution!.checkpointFingerprint, idempotencyContext: "au3:resume", dependencies: {now: clock}});
    assert.equal(resumed.status, "resumed");
    assert.equal(resumed.checkpoint.status, "persisted");
    assert.equal(saves, 1);
    assert.equal(builds, 1);
    const completed = await recoverExternalNewsGlobalResolution(readyCase.id);
    assert.equal(completed.completed, true);
    assert.equal(getReviewCase(readyCase.id)?.status, "resumed");
    assert.equal(saves, 1);

    const criticalCase = reviewCase({id: "case:au3:checkpoint-failure", dedupeKey: "external-news:au3:checkpoint-failure"});
    repository.save([criticalCase, ...repository.load()]);
    const criticalInitialized = await initializeExternalNewsGlobalResolution({caseId: criticalCase.id, planning: {preparedEntities: [prepared()], evidence: prepared().evidence}, dependencies: {now: clock}});
    assert.equal(criticalInitialized.status, "initialized");
    let criticalCurrent = getReviewCase(criticalCase.id)!;
    await simulateExternalNewsGlobalResolution({caseId: criticalCurrent.id, context: simulationContext(criticalCurrent), dependencies: {now: clock}});
    criticalCurrent = getReviewCase(criticalCase.id)!;
    const criticalCreate = criticalCurrent.globalResolution!.plan.operations.find((item) => item.kind === "create_entity")!;
    await executeExternalNewsResolutionOperation({caseId: criticalCurrent.id, expectedCaseVersion: criticalCurrent.version, expectedCheckpointFingerprint: criticalCurrent.globalResolution!.checkpointFingerprint, operationId: criticalCreate.id, simulationContext: simulationContext(criticalCurrent), idempotencyContext: "critical:create", authorized: true, dependencies: {now: clock}});
    criticalCurrent = getReviewCase(criticalCase.id)!;
    const criticalReference = criticalCurrent.globalResolution!.plan.operations.find((item) => item.kind === "replace_reference")!;
    await executeExternalNewsResolutionOperation({caseId: criticalCurrent.id, expectedCaseVersion: criticalCurrent.version, expectedCheckpointFingerprint: criticalCurrent.globalResolution!.checkpointFingerprint, operationId: criticalReference.id, simulationContext: simulationContext(criticalCurrent), idempotencyContext: "critical:reference", authorized: true, dependencies: {now: clock}});
    criticalCurrent = getReviewCase(criticalCase.id)!;
    const criticalValidation = criticalCurrent.globalResolution!.plan.operations.find((item) => item.requiredCapability === "validate:noticia")!;
    await executeExternalNewsResolutionOperation({caseId: criticalCurrent.id, expectedCaseVersion: criticalCurrent.version, expectedCheckpointFingerprint: criticalCurrent.globalResolution!.checkpointFingerprint, operationId: criticalValidation.id, simulationContext: simulationContext(criticalCurrent), idempotencyContext: "critical:validation", dependencies: {now: clock}});
    criticalCurrent = getReviewCase(criticalCase.id)!;
    const criticalPreparation = await prepareExternalNewsGlobalResume({caseId: criticalCurrent.id, expectedCaseVersion: criticalCurrent.version, expectedCheckpointFingerprint: criticalCurrent.globalResolution!.checkpointFingerprint, dependencies: {now: clock}});
    assert.equal(criticalPreparation.status, "ready_to_resume");
    if (criticalPreparation.status !== "ready_to_resume") throw new Error("critical_preparation_failed");
    criticalCurrent = getReviewCase(criticalCase.id)!;
    const criticalAuthorization = authorizeExternalNewsGlobalResume({prepared: criticalPreparation.prepared, checkpoint: criticalCurrent.globalResolution!, operationId: criticalCurrent.globalResolution!.resume!.operationId, confirmedAt: timestamps[5], validityMs: 24 * 60 * 60_000});
    assert.ok(criticalAuthorization);
    if (!criticalAuthorization) throw new Error("critical_authorization_failed");
    let resumeCheckpointUpdates = 0;
    const savesBeforeCriticalResume = saves;
    const criticalResume = await authorizeAndResumeExternalNews({
      caseId: criticalCurrent.id,
      prepared: criticalPreparation.prepared,
      authorization: criticalAuthorization,
      expectedCheckpointFingerprint: criticalCurrent.globalResolution!.checkpointFingerprint,
      idempotencyContext: "critical:resume",
      dependencies: {
        now: () => timestamps[6],
        persistence: {
          get: getReviewCase,
          set: setGlobalResolutionCheckpoint,
          update(caseId, expectedVersion, checkpointValue, now, expectedFingerprint) {
            resumeCheckpointUpdates += 1;
            if (resumeCheckpointUpdates === 2) throw new Error("injected_checkpoint_persistence_failure");
            return updateGlobalResolutionCheckpoint(caseId, expectedVersion, () => checkpointValue, now, expectedFingerprint);
          },
        },
      },
    });
    assert.equal(criticalResume.status, "resumed");
    assert.equal("checkpoint" in criticalResume && criticalResume.checkpoint.status, "failed");
    assert.equal("reconciliationRequired" in criticalResume && criticalResume.reconciliationRequired, true);
    assert.equal("canContinue" in criticalResume && criticalResume.canContinue, false);
    assert.equal(saves, savesBeforeCriticalResume + 1);
    assert.equal(getReviewCase(criticalCurrent.id)?.status, "resumed");

    assert.equal(externalNewsApplicationAudit.autoExecution, false);
    assert.equal(externalNewsApplicationAudit.persistedAuthorization, false);
    assert.equal(externalNewsApplicationAudit.persistedEditorialPayload, false);
    const panel = readFileSync(resolve("_laboratorio/laboratorio-ia/src/components/PanelIA.tsx"), "utf8");
    assert.equal(panel.includes("useEffect(() => initializeExternalNews"), false);
    assert.equal(panel.includes("useEffect(() => executeExternalNews"), false);
    assert.equal(panel.includes("registerExternalNewsGlobalResolutionRuntime"), true);
    const application = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/externalNewsApplication.ts"), "utf8");
    assert.equal(application.includes("fetch("), false);
    assert.equal(application.toLowerCase().includes("telegram"), true); // Declarado únicamente como efecto prohibido en el sello de auditoría.
  } finally {
    unregisterRuntime();
    restoreRepository();
  }
  console.log("AU3 external news global resolution application tests: OK");
}

main();
