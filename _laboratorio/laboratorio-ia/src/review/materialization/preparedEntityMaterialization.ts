import {buildExternalNewsResumePreview} from "../resume/externalNews";
import {getReviewCase, materializeReviewResolution, updateReviewCase} from "../store/reviewStore";
import type {ReviewEntityMaterialization} from "../types";
import {getEntityCreationExecutor} from "./entityCreationRegistry";
import type {MaterializationErrorCode, PreparedEntityDraft, PreparedEntityMaterializationPreview, PreparedEntityMaterializationResult, PreparedEntityPreviewItem, ValidatedPreparedEntity} from "./types";
import {validatePreparedEntity} from "./validatePreparedEntity";
import {observeMaterialization} from "../outcomes";

const active = new Map<string, Promise<PreparedEntityMaterializationResult>>();
const ALLOWED_STATES = new Set(["open", "in_review", "resolved", "resume_failed"]);
const slug = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96);
function prepared(caseId: string): PreparedEntityDraft[] { const reviewCase = getReviewCase(caseId); return reviewCase?.resolutions.filter((resolution) => resolution.type === "create_entity").map((resolution) => ({issueId: resolution.issueId, entityType: resolution.entityType, draft: resolution.draft})) ?? []; }

export async function previewPreparedEntityMaterialization(caseId: string, now = () => new Date().toISOString()): Promise<PreparedEntityMaterializationPreview> {
  const generatedAt = now();
  const reviewCase = getReviewCase(caseId);
  if (!reviewCase) return {caseId, status: "case_not_found", items: [], canExecute: false, entityCount: 0, generatedAt, warnings: ["El caso no existe."]};
  if (!ALLOWED_STATES.has(reviewCase.status)) return {caseId, status: "invalid_state", items: [], canExecute: false, entityCount: 0, generatedAt, warnings: [`El estado ${reviewCase.status} no permite materialización.`]};
  const executor = getEntityCreationExecutor();
  const items: PreparedEntityPreviewItem[] = [];
  for (const item of prepared(caseId)) {
    const validation = validatePreparedEntity(item);
    if (!validation.valid || !validation.entity) { items.push({issueId: item.issueId, entityType: item.entityType, name: typeof item.draft.name === "string" ? item.draft.name : undefined, identityKey: typeof item.draft.identityKey === "string" ? item.draft.identityKey : undefined, status: "invalid", omittedFields: [], evidence: [], errors: validation.errors, risks: []}); continue; }
    const entity = validation.entity;
    if (!executor) { items.push(toPreview(entity, "invalid", undefined, ["El executor de creación no está disponible."], ["No se puede repetir la búsqueda final de duplicados."])); continue; }
    try {
      const duplicate = await executor.checkDuplicate({entityType: entity.entityType, name: entity.name, aliases: entity.aliases, slug: slug(entity.name), identityKey: entity.identityKey, disciplineId: entity.disciplineId});
      items.push(toPreview(entity, duplicate.status === "ambiguous" ? "ambiguous" : duplicate.status === "existing" ? "existing" : "ready", duplicate, [], duplicate.status === "none" ? ["La creación escribirá un borrador real en Sanity tras confirmación."] : []));
    } catch { items.push(toPreview(entity, "invalid", undefined, ["Falló la búsqueda final de duplicados."], [])); }
  }
  const canExecute = items.length > 0 && items.every((item) => ["ready", "existing"].includes(item.status));
  return {caseId, status: canExecute ? "ready" : "not_ready", items, canExecute, entityCount: items.length, generatedAt, warnings: !items.length ? ["No existen entidades preparadas."] : []};
}

function toPreview(entity: ValidatedPreparedEntity, status: PreparedEntityPreviewItem["status"], duplicate?: PreparedEntityPreviewItem["duplicate"], errors: string[] = [], risks: string[] = []): PreparedEntityPreviewItem { return {issueId: entity.issueId, entityType: entity.entityType, name: entity.name, identityKey: entity.identityKey, status, sanityPayload: entity.sanityPayload, omittedFields: entity.omittedFields, evidence: entity.evidence, duplicate, errors, risks}; }

async function run(caseId: string, options: {confirmed: boolean; expectedVersion?: number; now?: () => string}): Promise<PreparedEntityMaterializationResult> {
  const now = options.now ?? (() => new Date().toISOString()); const generatedAt = now();
  const initial = getReviewCase(caseId);
  if (!initial) return failure(caseId, generatedAt, "unknown_error", "El caso no existe.");
  if (!options.confirmed) return failure(caseId, generatedAt, "invalid_state", "Falta confirmación explícita.");
  if (!ALLOWED_STATES.has(initial.status)) return failure(caseId, generatedAt, "invalid_state", `El estado ${initial.status} no permite materialización.`);
  if (options.expectedVersion !== undefined && options.expectedVersion !== initial.version) return failure(caseId, generatedAt, "stale_case", "La versión del caso cambió.");
  if (!prepared(caseId).length) return failure(caseId, generatedAt, "already_materialized", "No quedan entidades preparadas por materializar.");
  const executor = getEntityCreationExecutor();
  if (!executor) return failure(caseId, generatedAt, "create_executor_unavailable", "El executor no está disponible.");
  const attemptCount = (initial.entityMaterialization?.attemptCount ?? 0) + 1;
  updateReviewCase(caseId, {entityMaterialization: {status: "running", attemptCount, startedAt: generatedAt, issueResults: []}});
  const items: PreparedEntityMaterializationResult["items"] = [];
  const preparedItems = prepared(caseId);
  for (const item of preparedItems) observeMaterialization(initial, {type: "materialization_started", issueId: item.issueId, idempotencyKey: `materialization:${caseId}:${attemptCount}:${item.issueId}:started`, entityType: item.entityType, status: "started", occurredAt: generatedAt});
  for (const item of preparedItems) {
    const validation = validatePreparedEntity(item);
    if (!validation.valid || !validation.entity) { items.push({issueId: item.issueId, entityType: item.entityType, status: "failed", error: {code: "prepared_entity_invalid", message: validation.errors.join(" ")}}); continue; }
    const entity = validation.entity;
    try {
      const duplicate = await executor.checkDuplicate({entityType: entity.entityType, name: entity.name, aliases: entity.aliases, slug: slug(entity.name), identityKey: entity.identityKey, disciplineId: entity.disciplineId});
      if (duplicate.status === "ambiguous") { items.push({issueId: item.issueId, entityType: item.entityType, identityKey: entity.identityKey, status: "failed", error: {code: "ambiguous_duplicate", message: "Existen varios duplicados plausibles."}}); continue; }
      let entityId = duplicate.status === "existing" && duplicate.candidates.length === 1 ? duplicate.candidates[0].entityId : undefined;
      let status: "created" | "existing" = entityId ? "existing" : "created";
      if (!entityId) { const creation = await executor.createEntity({entityType: entity.entityType, payload: entity.sanityPayload, idempotencyKey: `editorial-agent:create:${entity.entityType}:${entity.identityKey}`}); if (!creation.success || !creation.entityId) { items.push({issueId: item.issueId, entityType: item.entityType, identityKey: entity.identityKey, status: "failed", error: {code: "create_failed", message: creation.error || "La creación no devolvió un ID real."}}); continue; } entityId = creation.entityId; status = creation.alreadyExisted ? "existing" : "created"; }
      const current = getReviewCase(caseId); const resolution = current?.resolutions.find((candidate) => candidate.issueId === item.issueId);
      if (!current || resolution?.type !== "create_entity") { const reconciliation = buildMetadata(attemptCount, "reconciliation_required", items, {issueId: item.issueId, entityType: item.entityType, identityKey: entity.identityKey, entityId, status: "reconciliation_required", error: {code: "create_succeeded_resolution_failed", message: "La entidad existe pero la resolución cambió antes de reemplazarla."}}, now()); updateReviewCase(caseId, {entityMaterialization: reconciliation}); observeMaterialization(initial, {type: "materialization_failed", issueId: item.issueId, idempotencyKey: `materialization:${caseId}:${attemptCount}:${item.issueId}:reconciliation`, entityId, entityType: item.entityType, status: "reconciliation_required", error: {code: "create_succeeded_resolution_failed", message: "La entidad existe, pero el store no confirmó el reemplazo.", reconciliationRequired: true}, occurredAt: now()}); return {caseId, status: "failed", items: [...items, {issueId: item.issueId, entityType: item.entityType, identityKey: entity.identityKey, entityId, status: "reconciliation_required", error: {code: "create_succeeded_resolution_failed", message: "Requiere reconciliación."}}], previewRegenerated: false, canResume: false, generatedAt, warnings: ["No se volverá a crear la entidad registrada."]}; }
      const nextItem = {issueId: item.issueId, entityType: item.entityType, identityKey: entity.identityKey, entityId, status} as const;
      const metadata = buildMetadata(attemptCount, "running", items, nextItem, now());
      materializeReviewResolution(caseId, {type: "link_reference", issueId: item.issueId, sanityId: entityId}, metadata);
      items.push(nextItem);
    } catch (error) { items.push({issueId: item.issueId, entityType: item.entityType, identityKey: entity.identityKey, status: "failed", error: {code: "unknown_error", message: error instanceof Error ? error.message : "Error desconocido."}}); }
  }
  let canResume = false; let previewRegenerated = false;
  try { const preview = buildExternalNewsResumePreview(caseId, {now}); canResume = preview.canResume; previewRegenerated = true; } catch { /* se registra abajo */ }
  const status = items.every((item) => ["created", "existing"].includes(item.status)) ? "completed" : items.some((item) => ["created", "existing"].includes(item.status)) ? "partially_completed" : "failed";
  for (const item of items) observeMaterialization(initial, {type: ["created", "existing"].includes(item.status) ? "materialization_succeeded" : "materialization_failed", issueId: item.issueId, idempotencyKey: `materialization:${caseId}:${attemptCount}:${item.issueId}:terminal`, entityId: item.entityId, entityType: item.entityType, status: item.status, error: item.error ? {code: item.error.code, message: item.error.message, reconciliationRequired: item.status === "reconciliation_required"} : undefined, occurredAt: now()});
  updateReviewCase(caseId, {entityMaterialization: buildMetadata(attemptCount, status === "completed" ? "succeeded" : "failed", items, undefined, now())});
  return {caseId, status, items, previewRegenerated, canResume, generatedAt, warnings: previewRegenerated ? [] : ["No se pudo regenerar la preview."]};
}

function buildMetadata(attemptCount: number, status: ReviewEntityMaterialization["status"], items: PreparedEntityMaterializationResult["items"], extra?: PreparedEntityMaterializationResult["items"][number], timestamp = new Date().toISOString()): ReviewEntityMaterialization { const all = extra ? [...items, extra] : items; return {status, attemptCount, ...(status === "succeeded" ? {completedAt: timestamp} : status === "failed" || status === "reconciliation_required" ? {failedAt: timestamp} : {}), issueResults: all.map((item) => ({issueId: item.issueId, entityType: item.entityType, identityKey: item.identityKey, entityId: item.entityId, status: item.status, error: item.error ? {code: item.error.code, message: item.error.message} : undefined}))}; }
function failure(caseId: string, generatedAt: string, code: MaterializationErrorCode, message: string): PreparedEntityMaterializationResult { return {caseId, status: "blocked", items: [{issueId: "case", entityType: "unknown", status: "failed", error: {code, message}}], previewRegenerated: false, canResume: false, generatedAt, warnings: []}; }

export function executePreparedEntityMaterialization(caseId: string, options: {confirmed?: boolean; expectedVersion?: number; now?: () => string} = {}): Promise<PreparedEntityMaterializationResult> { const running = active.get(caseId); if (running) return running; const execution = run(caseId, {confirmed: options.confirmed ?? false, expectedVersion: options.expectedVersion, now: options.now}).finally(() => active.delete(caseId)); active.set(caseId, execution); return execution; }
