import type {ReviewCase, ReviewJsonObject} from "../types";
import {readReconciliationCheckpoint} from "./cases";
import {ENTITY_RECONCILIATION_RULES_VERSION, type ProposedReconciliationPlan, type ReconciliationCheckpoint, type ReconciliationDecisionRequest} from "./types";
import {reconciliationFailure} from "./errors";

export function validateReconciliationDecisionRequest(value: unknown): ReconciliationDecisionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) reconciliationFailure("invalid_decision_request");
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) if (!["version", "caseId", "entityKind", "expectedCaseVersion", "expectedRulesVersion", "expectedGroupFingerprint", "decision", "actor", "canonicalLogicalId", "reason"].includes(key)) reconciliationFailure("unexpected_decision_field");
  if (input.version !== 1 || typeof input.caseId !== "string" || input.caseId.length < 8 || input.caseId.length > 180 || !["fighter", "event", "organization", "weight_category"].includes(String(input.entityKind)) || !Number.isSafeInteger(input.expectedCaseVersion) || typeof input.expectedRulesVersion !== "string" || input.expectedRulesVersion.length > 40 || typeof input.expectedGroupFingerprint !== "string" || input.expectedGroupFingerprint.length < 8) reconciliationFailure("invalid_decision_binding");
  if (!["confirm_duplicate", "mark_not_duplicate", "defer", "request_rescan"].includes(String(input.decision)) || typeof input.actor !== "string" || input.actor.trim().length < 2 || input.actor.length > 120) reconciliationFailure("invalid_decision");
  if (input.canonicalLogicalId !== undefined && (typeof input.canonicalLogicalId !== "string" || input.canonicalLogicalId.length > 180)) reconciliationFailure("invalid_canonical_id");
  if (input.reason !== undefined && (typeof input.reason !== "string" || input.reason.length > 500)) reconciliationFailure("invalid_decision_reason");
  return input as unknown as ReconciliationDecisionRequest;
}

function proposedPlan(checkpoint: ReconciliationCheckpoint, canonicalLogicalId: string): ProposedReconciliationPlan {
  const conflicts = checkpoint.group.pairs.flatMap((pair) => pair.conflicts);
  const blocked = checkpoint.scanStatus !== "complete" || checkpoint.group.referenceImpact.status !== "known" || conflicts.some((item) => item.blocking);
  return {status: blocked ? "blocked" : "proposed", canonicalLogicalId, memberLogicalIds: checkpoint.group.members.map((item) => item.logicalId).filter((id) => id !== canonicalLogicalId).sort(), conflicts, referenceImpact: checkpoint.group.referenceImpact, requiredFutureApprovals: ["Validar impacto relacional completo", "Aprobar estrategia de conservación de campos", "Autorizar cualquier escritura en un bloque futuro separado"], steps: ["Revalidar snapshots y revisiones de todos los miembros", "Definir la conservación de valores campo a campo", "Revisar todas las referencias entrantes", "Preparar una operación futura con rollback y aprobación independiente"]};
}

export function applyReconciliationDecision(reviewCase: ReviewCase, rawRequest: unknown, now = new Date()): ReviewJsonObject {
  const request = validateReconciliationDecisionRequest(rawRequest); const checkpoint = readReconciliationCheckpoint(reviewCase);
  if (request.caseId !== reviewCase.id || request.expectedCaseVersion !== reviewCase.version) reconciliationFailure("reconciliation_case_changed");
  if (request.entityKind !== checkpoint.group.kind || reviewCase.subject.type !== checkpoint.group.kind) reconciliationFailure("reconciliation_entity_kind_changed");
  if (request.expectedRulesVersion !== checkpoint.rulesVersion || (checkpoint.rulesVersion !== ENTITY_RECONCILIATION_RULES_VERSION && request.decision !== "request_rescan")) reconciliationFailure("reconciliation_rules_changed");
  if (request.expectedGroupFingerprint !== checkpoint.groupFingerprint) reconciliationFailure("reconciliation_evidence_changed");
  if (checkpoint.state === "stale" && request.decision !== "request_rescan") reconciliationFailure("reconciliation_evidence_stale");
  const memberIds = checkpoint.group.members.map((item) => item.logicalId);
  if (request.canonicalLogicalId && !memberIds.includes(request.canonicalLogicalId)) reconciliationFailure("canonical_not_in_group");
  if (request.decision === "confirm_duplicate" && !request.canonicalLogicalId) reconciliationFailure("canonical_required");
  if (request.decision !== "confirm_duplicate" && request.canonicalLogicalId) reconciliationFailure("canonical_not_allowed");
  if (request.decision === "confirm_duplicate" && checkpoint.scanStatus !== "complete") reconciliationFailure("incomplete_scan_cannot_confirm");
  if (request.decision === "confirm_duplicate" && !["candidate", "needs_review"].includes(checkpoint.state)) reconciliationFailure("reconciliation_state_cannot_confirm");
  const decision = {kind: request.decision, actor: request.actor.trim(), decidedAt: now.toISOString(), expectedGroupFingerprint: request.expectedGroupFingerprint, canonicalLogicalId: request.canonicalLogicalId, reason: request.reason?.trim() || undefined};
  const state = request.decision === "confirm_duplicate" ? "confirmed_duplicate" : request.decision === "mark_not_duplicate" ? "not_duplicate" : request.decision === "defer" ? "deferred" : "stale";
  const next: ReconciliationCheckpoint = {...checkpoint, state, decision, proposedPlan: request.decision === "confirm_duplicate" ? proposedPlan(checkpoint, request.canonicalLogicalId!) : undefined};
  return {...reviewCase.context, entityReconciliation: structuredClone(next) as unknown as ReviewJsonObject};
}

export function assessReconciliationFreshness(reviewCase: ReviewCase, currentGroupFingerprint: string, rulesVersion = ENTITY_RECONCILIATION_RULES_VERSION): "fresh" | "stale" {
  const checkpoint = readReconciliationCheckpoint(reviewCase); return checkpoint.groupFingerprint === currentGroupFingerprint && checkpoint.rulesVersion === rulesVersion ? "fresh" : "stale";
}
