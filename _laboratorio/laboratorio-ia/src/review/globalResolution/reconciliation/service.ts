import {getOutcomeEvents, getOutcomesForCase} from "../../outcomes";
import {getReviewCase, updateGlobalResolutionCheckpoint} from "../../store/reviewStore";
import type {ReviewCase, ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint} from "../../universal";
import {capabilityForOperation} from "../capabilities";
import {buildCurrentGlobalResolutionCatalog} from "../checkpoint/catalog";
import {applyCheckpointReconciliation} from "../checkpoint/lifecycle";
import {deserializeGlobalResolutionPlan, deserializeResolutionGraph} from "../checkpoint/serialization";
import type {GlobalResolutionCheckpoint, GlobalResolutionCheckpointHistoryEntry} from "../checkpoint/types";
import type {
  GlobalResolutionEffectInspector,
  GlobalResolutionReconciliationApplyResult,
  GlobalResolutionReconciliationAssessment,
  GlobalResolutionReconciliationCase,
  GlobalResolutionReconciliationEvidence,
  GlobalResolutionReconciliationReason,
} from "./types";

const nowDefault = () => new Date().toISOString();
const fp = (value: unknown) => computeUniversalFingerprint(value as ReviewJsonValue);
const compact = (value?: string) => value ? value.length > 42 ? `${value.slice(0, 18)}…${value.slice(-12)}` : value : "no disponible";
const validDate = (value: string) => Number.isFinite(Date.parse(value));

function evidence(input: Omit<GlobalResolutionReconciliationEvidence, "id">): GlobalResolutionReconciliationEvidence {
  const semantic = {...input, documentId: input.documentId ? compact(input.documentId) : undefined};
  return {...input, id: `reconciliation-evidence:${fp(semantic as unknown as ReviewJsonValue).slice(-24)}`};
}

function normalize(values: readonly GlobalResolutionReconciliationEvidence[], operationId: string): GlobalResolutionReconciliationEvidence[] {
  const unique = new Map<string, GlobalResolutionReconciliationEvidence>();
  for (const value of values) {
    if (value.operationId !== operationId || !validDate(value.observedAt) || !value.type || !value.source || !value.summary || !["confirmed", "strong", "insufficient"].includes(value.confidence)) continue;
    const safe: GlobalResolutionReconciliationEvidence = {
      ...value,
      summary: value.summary.slice(0, 180),
      documentId: value.documentId?.slice(0, 160),
      identityKey: value.identityKey?.slice(0, 160),
      idempotencyKey: value.idempotencyKey?.slice(0, 220),
      outcome: value.outcome?.slice(0, 80),
    };
    const key = fp({type: safe.type, source: safe.source, operationId: safe.operationId, fingerprint: safe.fingerprint, documentId: safe.documentId, identityKey: safe.identityKey, idempotencyKey: safe.idempotencyKey, outcome: safe.outcome, finding: safe.finding} as unknown as ReviewJsonValue);
    if (!unique.has(key)) unique.set(key, {...safe, id: `reconciliation-evidence:${key.slice(-24)}`});
  }
  return [...unique.values()].sort((left, right) => left.observedAt.localeCompare(right.observedAt) || left.id.localeCompare(right.id));
}

function operationOf(checkpoint: GlobalResolutionCheckpoint, operationId: string) {
  return checkpoint.plan.operations.find((operation) => operation.id === operationId);
}

function reasonOf(reviewCase: ReviewCase, checkpoint: GlobalResolutionCheckpoint, operationId: string): GlobalResolutionReconciliationReason {
  const operation = checkpoint.execution?.operations.filter((item) => item.operationId === operationId).at(-1);
  const raw = operation?.reconciliation?.reason ?? operation?.error?.code ?? operation?.error?.message ?? "";
  if (reviewCase.status === "resumed" && checkpoint.phase !== "completed") return "domain_succeeded_checkpoint_failed";
  if (/conflict/i.test(raw)) return "domain_succeeded_checkpoint_conflict";
  if (/timeout/i.test(raw)) return "executor_timeout";
  if (/idempot/i.test(raw)) return "idempotency_conflict";
  if (/missing/i.test(raw) && operation?.capability === "resume:external_news") return "resume_result_missing";
  if (operation?.documentId) return "existing_effect_detected";
  if (/verif|postcondition/i.test(raw)) return "postcondition_unverified";
  return "executor_uncertain";
}

function localEvidence(reviewCase: ReviewCase, checkpoint: GlobalResolutionCheckpoint, operationId: string, observedAt: string): GlobalResolutionReconciliationEvidence[] {
  const values: GlobalResolutionReconciliationEvidence[] = [];
  const operation = checkpoint.execution?.operations.filter((item) => item.operationId === operationId).at(-1);
  const planOperation = operationOf(checkpoint, operationId);
  const capability = planOperation ? capabilityForOperation(planOperation) ?? planOperation.requiredCapability ?? "" : operation?.capability ?? "";
  values.push(evidence({type: "review_case_status", source: "review_case", operationId, observedAt: reviewCase.updatedAt, summary: `Estado del caso: ${reviewCase.status}`, confidence: reviewCase.status === "resumed" ? "strong" : "insufficient", outcome: reviewCase.status}));
  if (operation) {
    values.push(evidence({type: "executor_outcome", source: "checkpoint", operationId, observedAt: operation.completedAt, summary: `Executor: ${operation.status}${operation.outcome ? ` · ${operation.outcome}` : ""}`, confidence: operation.status === "succeeded" ? "confirmed" : operation.documentId ? "strong" : "insufficient", outcome: operation.outcome ?? operation.status, documentId: operation.documentId, idempotencyKey: operation.idempotencyKey}));
    values.push(evidence({type: "idempotency_key", source: "checkpoint", operationId, observedAt: operation.startedAt, summary: "Clave de idempotencia registrada", confidence: "strong", idempotencyKey: operation.idempotencyKey, fingerprint: fp(operation.idempotencyKey)}));
  } else if (planOperation) {
    values.push(evidence({type: "idempotency_key", source: "checkpoint", operationId, observedAt, summary: "Clave de idempotencia planificada", confidence: "strong", idempotencyKey: planOperation.idempotencyKey, fingerprint: fp(planOperation.idempotencyKey)}));
  }
  for (const item of checkpoint.history.filter((entry) => entry.operationId === operationId)) {
    values.push(evidence({type: "operation_history", source: "checkpoint", operationId, observedAt: item.occurredAt, summary: `${item.kind}: ${item.status}`, confidence: item.kind === "resume_completed" || item.kind === "execution_succeeded" ? "strong" : "insufficient", outcome: item.status, fingerprint: fp(item.id)}));
  }
  if (checkpoint.snapshotFingerprint) values.push(evidence({type: "snapshot_fingerprint", source: "checkpoint", operationId, observedAt: checkpoint.updatedAt, summary: "Snapshot vinculado al checkpoint", confidence: "strong", fingerprint: checkpoint.snapshotFingerprint}));
  if (checkpoint.resume?.operationId === operationId) {
    const resume = checkpoint.resume;
    values.push(evidence({type: "preview_fingerprint", source: "checkpoint", operationId, observedAt: resume.preparedAt, summary: "Preview preparada vinculada a la operación", confidence: "strong", fingerprint: resume.previewFingerprint}));
    values.push(evidence({type: "payload_fingerprint", source: "checkpoint", operationId, observedAt: resume.preparedAt, summary: "Payload preparado vinculado a la preview", confidence: "strong", fingerprint: resume.payloadFingerprint}));
  }
  const resumeExecution = reviewCase.resumeExecution;
  if (capability === "resume:external_news" && resumeExecution) {
    const documentId = resumeExecution.draftId ?? resumeExecution.documentId;
    values.push(evidence({type: "resume_result", source: "review_case", operationId, observedAt: resumeExecution.completedAt ?? resumeExecution.failedAt ?? reviewCase.updatedAt, summary: `Resultado de reanudación: ${resumeExecution.status}`, confidence: resumeExecution.status === "succeeded" && documentId ? "confirmed" : "insufficient", outcome: resumeExecution.status, documentId, fingerprint: resumeExecution.previewFingerprint}));
    if (documentId) values.push(evidence({type: "stored_document_id", source: "review_case", operationId, observedAt: resumeExecution.completedAt ?? reviewCase.updatedAt, summary: `Documento persistido: ${compact(documentId)}`, confidence: resumeExecution.status === "succeeded" ? "confirmed" : "strong", documentId}));
    if (resumeExecution.previewFingerprint) values.push(evidence({type: "preview_fingerprint", source: "review_case", operationId, observedAt: resumeExecution.completedAt ?? reviewCase.updatedAt, summary: "Preview usada por el guardado real", confidence: "confirmed", fingerprint: resumeExecution.previewFingerprint}));
  }
  if (checkpoint.referenceResolution?.operationId === operationId) {
    const reference = checkpoint.referenceResolution;
    values.push(evidence({type: "resolved_reference", source: "checkpoint", operationId, observedAt: reference.resolvedAt, summary: `Referencia real: ${compact(reference.documentId)}`, confidence: "confirmed", documentId: reference.documentId, identityKey: reference.identityKey, outcome: reference.outcome, fingerprint: reference.payloadFingerprint}));
  }
  if (capability === "create:luchador") {
    const expectedIdentity = typeof planOperation?.target?.identityKey === "string" ? planOperation.target.identityKey : undefined;
    for (const item of reviewCase.entityMaterialization?.issueResults ?? []) {
      if (expectedIdentity && item.identityKey !== expectedIdentity) continue;
      if (!["created", "existing", "reused_existing"].includes(item.status) || !item.entityId || !item.identityKey) continue;
      values.push(evidence({
        type: "executor_outcome",
        source: "review_case",
        operationId,
        observedAt: reviewCase.entityMaterialization?.completedAt ?? reviewCase.updatedAt,
        summary: `Materialización: ${item.status}`,
        confidence: "strong",
        documentId: item.entityId,
        identityKey: item.identityKey,
        outcome: item.status === "existing" ? "reused_existing" : item.status,
        fingerprint: planOperation?.payload !== undefined ? fp(planOperation.payload) : undefined,
      }));
    }
  }
  for (const outcome of getOutcomesForCase(reviewCase.id)) {
    const outcomeDocumentId = capability === "resume:external_news" ? outcome.documentReference : capability === "create:luchador" ? outcome.materializationReference : undefined;
    values.push(evidence({type: "review_case_outcome", source: "outcome_store", operationId, observedAt: outcome.updatedAt, summary: `Outcome: ${outcome.currentStatus} · operativo ${outcome.operationalStatus}`, confidence: outcomeDocumentId ? "strong" : "insufficient", documentId: outcomeDocumentId, outcome: outcome.currentStatus}));
    const allowedEvents = capability === "resume:external_news" ? ["resume_succeeded", "draft_created"] : capability === "create:luchador" ? ["materialization_succeeded"] : [];
    for (const event of getOutcomeEvents(outcome.id).filter((item) => allowedEvents.includes(item.type))) {
      const reference = event.references.find((item) => ["draft", "document", "entity"].includes(item.type));
      values.push(evidence({type: event.type === "materialization_succeeded" ? "executor_outcome" : "resume_result", source: "outcome_store", operationId, observedAt: event.occurredAt, summary: `${event.type}: ${event.status}`, confidence: reference ? "strong" : "insufficient", documentId: reference?.id, outcome: event.status, idempotencyKey: event.idempotencyKey}));
    }
  }
  return values;
}

export async function collectReconciliationEvidence(input: {
  reviewCase: ReviewCase;
  operationId: string;
  inspector?: GlobalResolutionEffectInspector;
  includeExternalInspection?: boolean;
  signal?: AbortSignal;
  now?: () => string;
}): Promise<GlobalResolutionReconciliationCase> {
  const checkpoint = input.reviewCase.globalResolution;
  if (!checkpoint) throw new Error("global_resolution_reconciliation_checkpoint_missing");
  const planOperation = operationOf(checkpoint, input.operationId);
  if (!planOperation) throw new Error("global_resolution_reconciliation_operation_missing");
  const capability = capabilityForOperation(planOperation) ?? planOperation.requiredCapability ?? "capability:unknown";
  const observedAt = (input.now ?? nowDefault)();
  let values = localEvidence(input.reviewCase, checkpoint, input.operationId, observedAt);
  if (input.includeExternalInspection && input.inspector) {
    try {
      values = [...values, ...await input.inspector.inspect({caseId: input.reviewCase.id, operationId: input.operationId, capability, idempotencyKey: checkpoint.execution?.operations.filter((item) => item.operationId === input.operationId).at(-1)?.idempotencyKey, signal: input.signal})];
    } catch {
      values.push(evidence({type: "external_inspection", source: "external_inspector", operationId: input.operationId, observedAt, summary: "El inspector externo no pudo aportar evidencia", confidence: "insufficient", finding: "unknown"}));
    }
  }
  const normalized = normalize(values, input.operationId);
  return {
    caseId: input.reviewCase.id,
    caseVersion: input.reviewCase.version,
    checkpointFingerprint: checkpoint.checkpointFingerprint,
    operationId: input.operationId,
    capability,
    reason: reasonOf(input.reviewCase, checkpoint, input.operationId),
    evidence: normalized,
    confidence: normalized.some((item) => item.confidence === "confirmed") ? "confirmed" : normalized.some((item) => item.confidence === "strong") ? "strong" : "insufficient",
    createdAt: observedAt,
  };
}

type AssessmentWithoutFingerprint = GlobalResolutionReconciliationAssessment extends infer Assessment
  ? Assessment extends GlobalResolutionReconciliationAssessment ? Omit<Assessment, "assessmentFingerprint"> : never
  : never;

function assessmentFingerprint(value: AssessmentWithoutFingerprint): string {
  return fp({
    caseId: value.reconciliationCase.caseId,
    caseVersion: value.reconciliationCase.caseVersion,
    checkpointFingerprint: value.reconciliationCase.checkpointFingerprint,
    operationId: value.reconciliationCase.operationId,
    status: value.status,
    evidence: value.evidence.map((item) => item.id),
    outcome: "outcome" in value ? value.outcome : undefined,
  } as unknown as ReviewJsonValue);
}

export function assessReconciliation(reconciliationCase: GlobalResolutionReconciliationCase, checkpoint: GlobalResolutionCheckpoint): GlobalResolutionReconciliationAssessment {
  const node = checkpoint.graph.nodes.find((item) => item.operationId === reconciliationCase.operationId);
  const externalConfirmed = reconciliationCase.evidence.filter((item) => item.type === "external_inspection" && item.finding === "effect_confirmed" && item.confidence === "confirmed");
  const externalAbsent = reconciliationCase.evidence.filter((item) => item.type === "external_inspection" && item.finding === "effect_not_found" && item.confidence === "confirmed");
  const conflicting = externalConfirmed.length > 0 && externalAbsent.length > 0;
  const documentEvidence = reconciliationCase.evidence.filter((item) => item.documentId && ["confirmed", "strong"].includes(item.confidence));
  const documentIds = [...new Set(documentEvidence.map((item) => item.documentId!))];
  const already = node?.state === "succeeded" && (checkpoint.phase === "completed" || reconciliationCase.capability !== "resume:external_news");
  let partial: AssessmentWithoutFingerprint;

  if (already) {
    partial = {...base("already_reconciled", reconciliationCase, []), outcome: checkpoint.execution?.operations.filter((item) => item.operationId === reconciliationCase.operationId).at(-1) ? {
      outcome: checkpoint.execution!.operations.filter((item) => item.operationId === reconciliationCase.operationId).at(-1)!.outcome ?? "succeeded",
      documentId: checkpoint.execution!.operations.filter((item) => item.operationId === reconciliationCase.operationId).at(-1)!.documentId,
    } : undefined, repairAllowed: false, retryAllowed: false, notification: "Reconciliación completada"};
  } else if (conflicting || documentIds.length > 1) {
    partial = {...base("conflicting_evidence", reconciliationCase, ["Las fuentes no identifican un único resultado real."]), repairAllowed: false, retryAllowed: false, notification: "Evidencia contradictoria"};
  } else if (reconciliationCase.capability === "resume:external_news") {
    const resume = checkpoint.resume;
    const result = reconciliationCase.evidence.find((item) => item.type === "resume_result" && item.source === "review_case" && item.outcome === "succeeded" && item.documentId);
    const matchingPreview = Boolean(result?.fingerprint && resume?.previewFingerprint === result.fingerprint);
    if ((result && matchingPreview && documentIds.length === 1) || externalConfirmed.length && documentIds.length === 1) {
      const outcome = {outcome: "resumed", documentId: documentIds[0], payloadFingerprint: resume?.payloadFingerprint, idempotencyKey: checkpoint.execution?.operations.filter((item) => item.operationId === reconciliationCase.operationId).at(-1)?.idempotencyKey ?? operationOf(checkpoint, reconciliationCase.operationId)?.idempotencyKey};
      reconciliationCase.proposedOutcome = outcome;
      partial = {...base("confirmed_succeeded", reconciliationCase, []), outcome, repairAllowed: true, retryAllowed: false, notification: "Reconciliación completada"};
    } else if (externalAbsent.length && !documentIds.length) {
      partial = {...base("confirmed_not_applied", reconciliationCase, []), repairAllowed: false, retryAllowed: true, notification: "Operación habilitada para nuevo intento"};
    } else {
      partial = {...base("insufficient_evidence", reconciliationCase, ["Faltan un resultado de resume exitoso, un draft ID y una preview equivalente, o una inspección externa concluyente."]), repairAllowed: false, retryAllowed: false, notification: "Reconciliación pendiente por falta de evidencia"};
    }
  } else {
    const executor = reconciliationCase.evidence.find((item) => item.type === "executor_outcome" && ["created", "reused_existing"].includes(item.outcome ?? "") && item.documentId);
    const reference = reconciliationCase.evidence.find((item) => item.type === "resolved_reference" && item.documentId && item.identityKey);
    if ((executor || reference || externalConfirmed.length) && documentIds.length === 1) {
      const source = reference ?? executor ?? externalConfirmed[0];
      const outcome = {outcome: source?.outcome === "reused_existing" ? "reused_existing" : "created", documentId: documentIds[0], identityKey: source?.identityKey, payloadFingerprint: source?.fingerprint, idempotencyKey: source?.idempotencyKey ?? operationOf(checkpoint, reconciliationCase.operationId)?.idempotencyKey};
      if (outcome.identityKey && outcome.payloadFingerprint) {
        reconciliationCase.proposedOutcome = outcome;
        partial = {...base("confirmed_succeeded", reconciliationCase, []), outcome, repairAllowed: true, retryAllowed: false, notification: "Reconciliación completada"};
      } else {
        partial = {...base("insufficient_evidence", reconciliationCase, ["Faltan identity key o fingerprint de payload para demostrar la equivalencia del luchador."]), repairAllowed: false, retryAllowed: false, notification: "Reconciliación pendiente por falta de evidencia"};
      }
    } else if (externalAbsent.length && !documentIds.length) {
      partial = {...base("confirmed_not_applied", reconciliationCase, []), repairAllowed: false, retryAllowed: true, notification: "Operación habilitada para nuevo intento"};
    } else {
      partial = {...base("insufficient_evidence", reconciliationCase, ["No existe evidencia local fuerte ni postinspección que confirme el luchador real."]), repairAllowed: false, retryAllowed: false, notification: "Reconciliación pendiente por falta de evidencia"};
    }
  }
  return {...partial, assessmentFingerprint: assessmentFingerprint(partial)} as GlobalResolutionReconciliationAssessment;
}

function base<Status extends GlobalResolutionReconciliationAssessment["status"]>(status: Status, reconciliationCase: GlobalResolutionReconciliationCase, missingEvidence: string[]) {
  return {status, reconciliationCase, evidence: reconciliationCase.evidence, missingEvidence};
}

const active = new Set<string>();

export async function applyConfirmedReconciliation(input: {
  assessment: GlobalResolutionReconciliationAssessment;
  expectedCaseVersion: number;
  expectedCheckpointFingerprint: string;
  expectedAssessmentFingerprint: string;
  inspector?: GlobalResolutionEffectInspector;
  includeExternalInspection?: boolean;
  signal?: AbortSignal;
  now?: () => string;
}): Promise<GlobalResolutionReconciliationApplyResult> {
  if (!["confirmed_succeeded", "confirmed_not_applied"].includes(input.assessment.status)) return {status: "not_allowed", reason: "reconciliation_assessment_not_actionable"};
  if (input.assessment.assessmentFingerprint !== input.expectedAssessmentFingerprint) return {status: "conflict", reason: "reconciliation_assessment_changed"};
  const key = `${input.assessment.reconciliationCase.caseId}:${input.assessment.reconciliationCase.operationId}`;
  if (active.has(key)) return {status: "conflict", reason: "reconciliation_already_in_progress"};
  active.add(key);
  try {
    const reviewCase = getReviewCase(input.assessment.reconciliationCase.caseId);
    const checkpoint = reviewCase?.globalResolution;
    if (!reviewCase || !checkpoint) return {status: "conflict", reason: "reconciliation_state_missing"};
    const storedNode = checkpoint.graph.nodes.find((item) => item.operationId === input.assessment.reconciliationCase.operationId);
    if (storedNode?.state === "succeeded" && (checkpoint.phase === "completed" || input.assessment.reconciliationCase.capability !== "resume:external_news")) {
      return {status: "already_reconciled", checkpointFingerprint: checkpoint.checkpointFingerprint, notification: "Reconciliación completada"};
    }
    if (reviewCase.version !== input.expectedCaseVersion || checkpoint.checkpointFingerprint !== input.expectedCheckpointFingerprint) return {status: "conflict", reason: "reconciliation_state_changed"};
    const freshCase = await collectReconciliationEvidence({
      reviewCase,
      operationId: input.assessment.reconciliationCase.operationId,
      inspector: input.inspector,
      includeExternalInspection: input.includeExternalInspection,
      signal: input.signal,
      now: input.now,
    });
    const freshAssessment = assessReconciliation(freshCase, checkpoint);
    if (freshAssessment.assessmentFingerprint !== input.expectedAssessmentFingerprint || freshAssessment.status !== input.assessment.status) return {status: "conflict", reason: "reconciliation_evidence_changed"};
    if (freshAssessment.status === "already_reconciled") return {status: "already_reconciled", checkpointFingerprint: checkpoint.checkpointFingerprint, notification: "Reconciliación completada"};
    if (freshAssessment.status !== "confirmed_succeeded" && freshAssessment.status !== "confirmed_not_applied") return {status: "conflict", reason: "reconciliation_assessment_no_longer_actionable"};
    const graph = deserializeResolutionGraph(checkpoint.graph, checkpoint.plan, checkpoint.createdAt);
    if (!graph.ok) return {status: "conflict", reason: "reconciliation_checkpoint_graph_invalid"};
    const plan = deserializeGlobalResolutionPlan(checkpoint.plan, graph.value, checkpoint.createdAt);
    if (!plan.ok) return {status: "conflict", reason: "reconciliation_checkpoint_plan_invalid"};
    const outcome = freshAssessment.status === "confirmed_succeeded" ? freshAssessment.outcome : undefined;
    const evolved = applyCheckpointReconciliation({
      reviewCase,
      checkpoint,
      plan: plan.value,
      catalog: buildCurrentGlobalResolutionCatalog(),
      operationId: freshCase.operationId,
      assessmentFingerprint: freshAssessment.assessmentFingerprint,
      outcome: freshAssessment.status,
      capability: freshCase.capability,
      idempotencyKey: outcome?.idempotencyKey ?? operationOf(checkpoint, freshCase.operationId)?.idempotencyKey ?? "reconciliation",
      documentId: outcome?.documentId,
      identityKey: outcome?.identityKey,
      operationOutcome: outcome?.outcome,
      payloadFingerprint: outcome?.payloadFingerprint,
      now: input.now,
    });
    const stored = updateGlobalResolutionCheckpoint(reviewCase.id, reviewCase.version, () => evolved, new Date((input.now ?? nowDefault)()), checkpoint.checkpointFingerprint);
    if (!stored?.globalResolution) return {status: "conflict", reason: "reconciliation_checkpoint_not_persisted"};
    return {status: "applied", checkpointFingerprint: stored.globalResolution.checkpointFingerprint, notification: freshAssessment.notification};
  } catch (error) {
    return {status: "conflict", reason: error instanceof Error ? error.message : "reconciliation_failed"};
  } finally {
    active.delete(key);
  }
}

export async function markConfirmedNotApplied(input: Parameters<typeof applyConfirmedReconciliation>[0]) {
  return applyConfirmedReconciliation(input);
}

export function preserveUnresolvedReconciliation(assessment: GlobalResolutionReconciliationAssessment): GlobalResolutionReconciliationAssessment {
  return structuredClone(assessment);
}

export function reconciliationOperationIds(reviewCase: ReviewCase): string[] {
  const checkpoint = reviewCase.globalResolution;
  if (!checkpoint) return [];
  const explicit = checkpoint.graph.nodes.filter((node) => node.state === "reconciliation_required").map((node) => node.operationId);
  if (reviewCase.status === "resumed" && checkpoint.phase !== "completed" && checkpoint.resume?.operationId) explicit.push(checkpoint.resume.operationId);
  return [...new Set(explicit)];
}

export function reconciliationHistoryPreview(checkpoint: GlobalResolutionCheckpoint): GlobalResolutionCheckpointHistoryEntry[] {
  return checkpoint.history.filter((item) => item.kind.startsWith("reconciliation_")).slice(-50);
}
