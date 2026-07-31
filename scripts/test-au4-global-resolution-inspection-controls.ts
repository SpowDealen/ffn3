import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  GLOBAL_RESOLUTION_ASSESSMENT_LABELS,
  GlobalResolutionRequestGate,
  SANITY_EXTERNAL_NEWS_INSPECTOR_ID,
  buildGlobalResolutionInspectionControlView,
  buildGlobalResolutionInspectionRequest,
  splitGlobalResolutionReconciliationEvidence,
  summarizeGlobalResolutionInspectionObservation,
  type GlobalResolutionControlsView,
  type GlobalResolutionInspectionEvidence,
  type GlobalResolutionInspectionUiState,
  type GlobalResolutionReconciliationAssessment,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import type {EntityOperation} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import type {GlobalResolutionCheckpoint} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";

const now = "2026-07-29T12:00:00.000Z";

function operation(capability: string): EntityOperation {
  if (capability === "create:luchador") return {
    id: "operation:create", kind: "create_entity", entityType: "luchador", target: {identityKey: "fighter:ui-controls"},
    payload: {entityType: "fighter", name: "UI Controls", identityKey: "fighter:ui-controls", disciplineId: "mma", organizationIds: ["ufc"], sourceEvidence: [{source: "fixture"}]},
    source: "global_resolution", evidence: [], confidence: .95, risk: "medium", preconditions: [], postconditions: [], dependencyIds: [], requiredCapability: capability, idempotencyKey: "idempotency:create", compensatable: false, explanation: "Fixture",
  };
  if (capability === "replace_reference:noticia:luchador") return {
    id: "operation:reference", kind: "replace_reference", entityType: "luchador", target: {fieldPath: "luchadoresRelacionados", identityKey: "fighter:ui-controls"},
    payload: {referenceOperationId: "operation:create"}, source: "global_resolution", evidence: [], confidence: .95, risk: "low", preconditions: [], postconditions: [], dependencyIds: ["operation:create"], requiredCapability: capability, idempotencyKey: "idempotency:reference", compensatable: false, explanation: "Fixture",
  };
  if (capability === "resume:external_news") return {
    id: "operation:resume", kind: "validate_entity", entityType: "noticia", payload: {scope: "resume", producer: "external_news"},
    source: "global_resolution", evidence: [], confidence: .95, risk: "low", preconditions: [], postconditions: [], dependencyIds: [], requiredCapability: capability, idempotencyKey: "idempotency:resume", compensatable: false, explanation: "Fixture",
  };
  return {
    id: "operation:unknown", kind: "validate_entity", entityType: "noticia", payload: {scope: "other"},
    source: "global_resolution", evidence: [], confidence: .95, risk: "low", preconditions: [], postconditions: [], dependencyIds: [], requiredCapability: capability, idempotencyKey: "idempotency:unknown", compensatable: false, explanation: "Fixture",
  };
}

function checkpoint(capability: string): GlobalResolutionCheckpoint {
  const op = operation(capability);
  return {
    schemaVersion: 1, id: "checkpoint:ui", caseId: "case:ui", caseVersion: 1, storedAtCaseVersion: 1, producer: "external_news",
    plan: {
      schemaVersion: 1, planId: "plan:ui", caseId: "case:ui", caseVersion: 1, producer: "external_news", originalOperation: "create_draft", operations: [op],
      status: "ready", structurallyValid: true, executable: true, blockers: [], warnings: [], assumptions: [],
      policy: {minimumCreateConfidence: .8, minimumReuseConfidence: .8, ambiguity: "block", allowSkipOperation: false, allowOptionalDependencySkip: false, allowSkippedDependencyForResume: false, maximumRisk: "medium", requireAllNodesForResume: true, unsupportedOperation: "block", insufficientInformation: "block", availableCapabilities: [capability]},
      requiredCapabilities: [capability], capabilityRequirements: [{id: capability, support: "executable"}], executorRequirements: [],
      planFingerprint: "sha256-v1:planuicontrols", idempotencyKey: "plan:ui",
    },
    graph: {
      schemaVersion: 1, graphId: "graph:ui", planId: "plan:ui", caseId: "case:ui", caseVersion: 1, producer: "external_news", originalOperation: "create_draft",
      nodes: [{id: "node:ui", operationId: op.id, dependencyIds: [], state: "reconciliation_required", idempotencyKey: op.idempotencyKey, isResumeNode: capability === "resume:external_news", requiredForCompletion: true}],
      state: "reconciliation_required", intentFingerprint: "sha256-v1:intentuicontrols", fingerprint: "sha256-v1:graphuicontrols", idempotencyKey: "graph:ui", metadata: {},
    },
    planFingerprint: "sha256-v1:planuicontrols", graphFingerprint: "sha256-v1:graphuicontrols", caseFingerprint: "sha256-v1:caseuicontrols",
    checkpointFingerprint: "sha256-v1:checkpointuicontrols", phase: "reconciliation_required",
    execution: capability === "replace_reference:noticia:luchador" ? {
      planFingerprint: "sha256-v1:planuicontrols", simulationFingerprint: "sha256-v1:simulationuicontrols", status: "reconciliation_required",
      operations: [{operationId: "operation:create", capability: "create:luchador", status: "succeeded", attempt: 1, idempotencyKey: "create", documentId: "fighter-ui", startedAt: now, completedAt: now}],
      startedAt: now, completedAt: now, resultFingerprint: "sha256-v1:resultuicontrols",
    } : undefined,
    resume: capability === "resume:external_news" ? {
      operationId: op.id, planId: "plan:ui", planFingerprint: "sha256-v1:planuicontrols", previewFingerprint: "sha256-v1:previewuicontrols",
      payloadFingerprint: "sha256-v1:payloaduicontrols", snapshotFingerprint: "sha256-v1:snapshotuicontrols", referenceIds: ["fighter-ui"],
      validation: {valid: true, blockerCodes: []}, preparedAt: now,
    } : undefined,
    history: [], createdAt: now, updatedAt: now,
  };
}

function fixture(capability = "create:luchador", producer = "external_news"): ReviewCase {
  return {
    schemaVersion: 1, id: "case:ui", dedupeKey: "case:ui", module: "external.news", title: "Inspection controls", status: "open", priority: "high",
    subject: {type: "external_news"}, issues: [], resolutions: [], context: {producer}, createdAt: now, updatedAt: now, version: 1, resumeAttempts: 0,
    resumeExecution: capability === "resume:external_news" || capability === "replace_reference:noticia:luchador"
      ? {status: "failed", attemptCount: 1, startedAt: now, failedAt: now, draftId: "drafts.news-ui", error: {code: "timeout", message: "timeout"}}
      : undefined,
    globalResolution: checkpoint(capability),
  };
}

function controls(status: GlobalResolutionControlsView["recoveryStatus"] = "valid"): GlobalResolutionControlsView {
  return {
    visible: true, compatible: true, recoveryStatus: status, recoveryLabel: status, phase: status === "valid" ? "reconciliation_required" : undefined,
    phaseLabel: "Reconciliación necesaria", producer: "external_news", caseVersion: 1, checkpointFingerprint: "sha256-v1:checkpointuicontrols",
    total: 1, completed: 0, ready: 0, blocked: 0, reconciliation: 1, requiresAuthorization: false, requiresRegeneration: status === "stale",
    canInitialize: false, canRegenerate: false, canDiscardInvalid: false, canSimulate: false, canPrepareResume: false, completedProcess: false, reasons: [], operations: [],
  };
}

function inspectionEvidence(observations: GlobalResolutionInspectionEvidence["observations"], status: GlobalResolutionInspectionEvidence["status"] = "observed"): GlobalResolutionInspectionEvidence {
  return {
    inspectorId: SANITY_EXTERNAL_NEWS_INSPECTOR_ID, inspectorVersion: "1.0.0", inspectionId: "inspection:ui", producer: "external_news",
    capability: "create:luchador", operationId: "operation:create", operationFingerprint: "sha256-v1:operationuicontrols",
    checkpointFingerprint: "sha256-v1:checkpointuicontrols", inspectedAt: now, status, observations, warnings: [], fingerprint: "sha256-v1:evidenceuicontrols",
  };
}

function assessment(status: GlobalResolutionReconciliationAssessment["status"]): GlobalResolutionReconciliationAssessment {
  const base = {
    reconciliationCase: {caseId: "case:ui", caseVersion: 1, checkpointFingerprint: "sha256-v1:checkpointuicontrols", operationId: "operation:create", capability: "create:luchador", reason: "executor_uncertain" as const, evidence: [], confidence: "confirmed" as const, createdAt: now},
    evidence: [], assessmentFingerprint: `sha256-v1:${status.replace(/\W/g, "")}`, missingEvidence: [],
  };
  if (status === "confirmed_succeeded") return {...base, status, outcome: {outcome: "created", documentId: "fighter-ui", identityKey: "fighter:ui-controls", payloadFingerprint: "sha256-v1:payload"}, repairAllowed: true, retryAllowed: false, notification: "Reconciliación completada"};
  if (status === "confirmed_not_applied") return {...base, status, repairAllowed: false, retryAllowed: true, notification: "Operación habilitada para nuevo intento"};
  if (status === "conflicting_evidence") return {...base, status, repairAllowed: false, retryAllowed: false, notification: "Evidencia contradictoria"};
  if (status === "already_reconciled") return {...base, status, repairAllowed: false, retryAllowed: false, notification: "Reconciliación completada"};
  return {...base, status, repairAllowed: false, retryAllowed: false, notification: "Reconciliación pendiente por falta de evidencia"};
}

function succeededState(status: GlobalResolutionReconciliationAssessment["status"], evidence = inspectionEvidence([{kind: "entity_exists", entityType: "luchador", entityId: "fighter-ui", identityKey: "fighter:ui-controls", payloadFingerprint: "sha256-v1:payload"}])): GlobalResolutionInspectionUiState {
  return {status: "succeeded", operationId: "operation:create", evidence, assessment: assessment(status)};
}

async function main(): Promise<void> {
  const original = fixture();
  const before = JSON.stringify(original);
  const idle = buildGlobalResolutionInspectionControlView({reviewCase: original, controls: controls(), operationId: "operation:create", state: {status: "idle"}});
  assert.equal(idle.visible, true);
  assert.equal(idle.canConfirm, true);
  assert.equal(JSON.stringify(original), before);
  assert.equal(buildGlobalResolutionInspectionControlView({reviewCase: fixture("create:luchador", "other"), controls: controls(), operationId: "operation:create", state: {status: "idle"}}).visible, false);
  assert.equal(buildGlobalResolutionInspectionControlView({reviewCase: fixture("validate:noticia"), controls: controls(), operationId: "operation:unknown", state: {status: "idle"}}).visible, false);
  assert.equal(buildGlobalResolutionInspectionControlView({reviewCase: original, controls: controls("stale"), operationId: "operation:create", state: {status: "idle"}}).visible, false);
  assert.equal(buildGlobalResolutionInspectionControlView({reviewCase: original, controls: controls("invalid"), operationId: "operation:create", state: {status: "idle"}}).visible, false);

  const createRequest = buildGlobalResolutionInspectionRequest({reviewCase: fixture(), operationId: "operation:create", inspectorId: SANITY_EXTERNAL_NEWS_INSPECTOR_ID, requestedAt: now});
  assert.equal(createRequest.ok && createRequest.request.subject.identityKey, "fighter:ui-controls");
  const resumeRequest = buildGlobalResolutionInspectionRequest({reviewCase: fixture("resume:external_news"), operationId: "operation:resume", inspectorId: SANITY_EXTERNAL_NEWS_INSPECTOR_ID, requestedAt: now});
  assert.equal(resumeRequest.ok && resumeRequest.request.subject.expectedId, "drafts.news-ui");
  const referenceRequest = buildGlobalResolutionInspectionRequest({reviewCase: fixture("replace_reference:noticia:luchador"), operationId: "operation:reference", inspectorId: SANITY_EXTERNAL_NEWS_INSPECTOR_ID, requestedAt: now});
  assert.deepEqual(referenceRequest.ok && referenceRequest.request.subject.expectedReferences, [{field: "luchadores", targetId: "fighter-ui"}]);
  assert.equal(createRequest.ok && Object.keys(createRequest.request.subject).some((key) => ["query", "dataset", "projectId", "token"].includes(key)), false);

  const summaries = [
    summarizeGlobalResolutionInspectionObservation({kind: "entity_exists", entityType: "luchador", entityId: "fighter-ui"}),
    summarizeGlobalResolutionInspectionObservation({kind: "entity_missing", entityType: "luchador", identityKey: "fighter:ui"}),
    summarizeGlobalResolutionInspectionObservation({kind: "reference_exists", ownerId: "news", field: "luchadores", targetId: "fighter"}),
    summarizeGlobalResolutionInspectionObservation({kind: "reference_missing", ownerId: "news", field: "luchadores", targetId: "fighter"}),
    summarizeGlobalResolutionInspectionObservation({kind: "payload_matches", entityId: "news", expectedFingerprint: "sha256-v1:a", actualFingerprint: "sha256-v1:a"}),
    summarizeGlobalResolutionInspectionObservation({kind: "payload_differs", entityId: "news", expectedFingerprint: "sha256-v1:a", actualFingerprint: "sha256-v1:b"}),
    summarizeGlobalResolutionInspectionObservation({kind: "multiple_candidates", entityType: "luchador", candidateIds: ["a", "b"]}),
    summarizeGlobalResolutionInspectionObservation({kind: "service_unavailable", reason: "unavailable"}),
  ];
  assert.deepEqual(summaries.map((item) => item.label), [
    "Sanity confirma que existe el luchador", "Sanity no encontró el luchador esperado", "La noticia contiene la referencia al luchador",
    "La noticia no contiene la referencia esperada", "El contenido coincide con el fingerprint preparado",
    "El documento existe, pero su contenido no coincide completamente", "Se encontraron varias entidades compatibles",
    "No fue posible comprobar Sanity en este momento",
  ]);

  for (const status of ["confirmed_succeeded", "confirmed_not_applied", "conflicting_evidence", "insufficient_evidence", "already_reconciled"] as const) {
    const view = buildGlobalResolutionInspectionControlView({reviewCase: original, controls: controls(), operationId: "operation:create", state: succeededState(status)});
    assert.equal(view.assessmentLabel, GLOBAL_RESOLUTION_ASSESSMENT_LABELS[status]);
    assert.equal(view.canRepair, status === "confirmed_succeeded");
    assert.equal(view.canEnableRetry, status === "confirmed_not_applied");
  }
  const failed = buildGlobalResolutionInspectionControlView({reviewCase: original, controls: controls(), operationId: "operation:create", state: {status: "failed", operationId: "operation:create", code: "inspection_failed", message: "No se pudo leer Sanity.", retryable: true}});
  assert.equal(failed.canRetry, true);
  assert.deepEqual(failed.responsive, {wrapLongValues: true, stackActionsBelow: 560});

  const split = splitGlobalResolutionReconciliationEvidence([
    {id: "local", type: "review_case_status", source: "review_case", operationId: "operation:create", observedAt: now, summary: "local", confidence: "strong"},
    {id: "sanity", type: "external_inspection", source: "external_inspector", operationId: "operation:create", observedAt: now, summary: "sanity", confidence: "confirmed"},
  ]);
  assert.deepEqual(split.local.map((item) => item.id), ["local"]);
  assert.deepEqual(split.sanity.map((item) => item.id), ["sanity"]);

  const gate = new GlobalResolutionRequestGate();
  const token = gate.begin("case:ui");
  assert.ok(token);
  assert.equal(gate.begin("case:ui"), undefined);
  gate.cancel();
  assert.equal(token && gate.isCurrent(token, "case:ui"), false);
  assert.equal(gate.busy, false);

  const component = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/components/GlobalResolutionControls.tsx"), "utf8");
  const details = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/components/ReviewCaseDetails.tsx"), "utf8");
  const legacy = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/components/ExternalNewsResumePreviewPanel.tsx"), "utf8");
  const styles = readFileSync(resolve("_laboratorio/laboratorio-ia/src/styles.css"), "utf8");
  const controlsModelSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/controlsModel.ts"), "utf8");
  const orchestrator = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/reconciliation/engine/orchestrator.ts"), "utf8");
  assert.equal(component.includes("Comprobar en Sanity"), true);
  assert.equal(component.includes("Se realizará una consulta de sólo lectura en Sanity"), true);
  assert.equal(component.includes(">Cancelar<"), true);
  assert.equal(component.includes("confirmSanityInspection(operationId)"), true);
  assert.equal(component.indexOf("setInspectionState({status: \"confirming\"") < component.indexOf("reconciliationEngine.inspectAndAssess("), true);
  assert.equal(component.includes("Comprobando Sanity…"), true);
  assert.equal(component.includes("disabled={locked}"), true);
  assert.equal(component.includes("Cancelar comprobación"), true);
  assert.equal(component.includes("new AbortController()"), true);
  assert.equal(component.includes("inspectionAbort.current?.abort()"), true);
  assert.equal(orchestrator.includes("expectedContext(request, inspected.ok ? inspected.inspector : undefined)"), true);
  assert.equal(orchestrator.includes("inspectionEvidence: inspected.ok ? [inspected.evidence]"), true);
  assert.equal(component.includes("Evidencia local"), true);
  assert.equal(component.includes("Evidencia de Sanity"), true);
  assert.equal(component.includes("Resultado de la evaluación"), true);
  assert.equal(controlsModelSource.includes('repair_checkpoint: "Reparar checkpoint"'), true);
  assert.equal(controlsModelSource.includes('enable_retry: "Habilitar nuevo intento"'), true);
  assert.equal(controlsModelSource.includes('inspect_again: "Volver a comprobar"'), true);
  assert.equal(component.includes('role="dialog"'), true);
  assert.equal(component.includes('role="alert"'), true);
  assert.equal(component.includes("inspectionResultRef.current?.focus()"), true);
  assert.equal(component.includes("inspectionErrorRef.current?.focus()"), true);
  assert.equal(component.includes('event.key === "Escape"'), true);
  assert.equal(component.includes("aria-busy={locked}"), true);
  assert.equal(component.includes("useEffect(() => confirmSanityInspection"), false);
  assert.equal(component.includes("useEffect(() => requestSanityInspection"), false);
  assert.equal(component.includes("saveDraft("), false);
  assert.equal(component.includes("executeUniversalExecutionPlan"), false);
  assert.equal(component.includes("executeExternalNewsResume"), false);
  assert.equal(component.includes("fetch("), false);
  assert.equal(component.includes("GROQ"), false);
  assert.equal(component.includes("SANITY_API_READ_TOKEN"), false);
  assert.equal(component.includes("stack"), false);
  assert.equal(component.includes("<input"), false);
  assert.equal((details.match(/<GlobalResolutionControls /g) ?? []).length, 1);
  assert.equal(legacy.includes('reviewCase.context.producer !== "external_news" || reviewCase.globalResolution'), true);
  assert.equal(styles.includes("overflow-wrap: anywhere"), true);
  assert.equal(styles.includes(".global-resolution-inspection-actions { display: grid; grid-template-columns: 1fr; }"), true);
  assert.equal(styles.includes("@media (max-width: 560px)"), true);
  console.log("AU4 global resolution inspection controls tests: OK");
}

void main();
