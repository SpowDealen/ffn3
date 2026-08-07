import {getReviewCase} from "../store/reviewStore";
import type {MaterializationErrorCode, PreparedEntityDraft, PreparedEntityMaterializationPreview, PreparedEntityMaterializationResult, PreparedEntityPreviewItem} from "./types";
import {validatePreparedEntity} from "./validatePreparedEntity";

const ALLOWED_STATES = new Set(["open", "in_review", "resolved", "resume_failed"]);
const BLOCK_REASON = "identity_resolution_unsupported";

function prepared(caseId: string): PreparedEntityDraft[] {
  return getReviewCase(caseId)?.resolutions
    .filter((resolution) => resolution.type === "create_entity")
    .map((resolution) => ({issueId: resolution.issueId, entityType: resolution.entityType, draft: resolution.draft})) ?? [];
}

function previewItem(item: PreparedEntityDraft): PreparedEntityPreviewItem {
  const validation = validatePreparedEntity(item);
  return {
    issueId: item.issueId,
    entityType: item.entityType,
    name: validation.entity?.name ?? (typeof item.draft.name === "string" ? item.draft.name : undefined),
    identityKey: validation.entity?.identityKey,
    status: "invalid",
    omittedFields: validation.entity?.omittedFields ?? [],
    evidence: validation.entity?.evidence ?? [],
    errors: validation.valid ? [BLOCK_REASON] : validation.errors,
    risks: ["La materialización heredada no puede crear sin un preflight y una autorización de identidad vinculada."],
  };
}

export async function previewPreparedEntityMaterialization(caseId: string, now = () => new Date().toISOString()): Promise<PreparedEntityMaterializationPreview> {
  const generatedAt = now();
  const reviewCase = getReviewCase(caseId);
  if (!reviewCase) return {caseId, status: "case_not_found", items: [], canExecute: false, entityCount: 0, generatedAt, warnings: ["El caso no existe."]};
  if (!ALLOWED_STATES.has(reviewCase.status)) return {caseId, status: "invalid_state", items: [], canExecute: false, entityCount: 0, generatedAt, warnings: [`El estado ${reviewCase.status} no permite materialización.`]};
  const items = prepared(caseId).map(previewItem);
  return {caseId, status: "not_ready", items, canExecute: false, entityCount: items.length, generatedAt, warnings: items.length ? ["identity_resolution_unsupported: usa el planner y el guard universal."] : ["No existen entidades preparadas."]};
}

export async function executePreparedEntityMaterialization(caseId: string, options: {confirmed?: boolean; expectedVersion?: number; now?: () => string} = {}): Promise<PreparedEntityMaterializationResult> {
  const generatedAt = (options.now ?? (() => new Date().toISOString()))();
  const reviewCase = getReviewCase(caseId);
  if (!reviewCase) return blocked(caseId, generatedAt, "case", "unknown", "El caso no existe.", "unknown_error");
  if (!options.confirmed) return blocked(caseId, generatedAt, "case", "unknown", "Falta confirmación explícita.", "invalid_state");
  if (options.expectedVersion !== undefined && options.expectedVersion !== reviewCase.version) return blocked(caseId, generatedAt, "case", "unknown", "La versión del caso cambió.", "stale_case");
  const items = prepared(caseId);
  if (!items.length) return blocked(caseId, generatedAt, "case", "unknown", "No quedan entidades preparadas por materializar.", "already_materialized");
  return {
    caseId,
    status: "blocked",
    items: items.map((item) => ({issueId: item.issueId, entityType: item.entityType, status: "failed", error: {code: "identity_guard_required", message: `${BLOCK_REASON}: la ruta heredada no puede crear; usa resolve_identity:<tipo> y el dispatcher universal.`}})),
    previewRegenerated: false,
    canResume: false,
    generatedAt,
    warnings: ["No se ejecutó discovery, dedupe ni escritura."],
  };
}

function blocked(caseId: string, generatedAt: string, issueId: string, entityType: string, message: string, code: MaterializationErrorCode): PreparedEntityMaterializationResult {
  return {caseId, status: "blocked", items: [{issueId, entityType, status: "failed", error: {code, message}}], previewRegenerated: false, canResume: false, generatedAt, warnings: []};
}
