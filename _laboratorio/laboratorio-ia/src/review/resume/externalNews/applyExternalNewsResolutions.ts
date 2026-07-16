import {validateReviewResolution} from "../../cases/validateResolution";
import type {ReviewJsonObject, ReviewJsonValue, ReviewResolution} from "../../types";
import {mapIssueToPayloadField, type ExternalNewsPayloadField} from "./mapResolutionToPayloadPatch";
import type {ExternalNewsApplicationInput, ExternalNewsResolutionApplicationResult} from "./types";

const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);
function safeClone(value: ReviewJsonValue, seen = new Set<object>()): ReviewJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("Número no finito."); return value; }
  if (typeof value !== "object" || seen.has(value)) throw new Error("Valor no serializable o cíclico.");
  seen.add(value);
  if (Array.isArray(value)) { const result = value.map((item) => safeClone(item, seen)); seen.delete(value); return result; }
  const result: ReviewJsonObject = {};
  for (const [key, child] of Object.entries(value)) { if (FORBIDDEN.has(key)) throw new Error(`Propiedad peligrosa rechazada: ${key}.`); result[key] = safeClone(child, seen); }
  seen.delete(value); return result;
}

const asId = (value: ReviewJsonValue): string | undefined => typeof value === "string" ? value.trim() || undefined : value && typeof value === "object" && !Array.isArray(value) && typeof value.id === "string" ? value.id.trim() || undefined : undefined;
function nextValue(resolution: ReviewResolution, issue: ExternalNewsApplicationInput["reviewCase"]["issues"][number]): ReviewJsonValue | undefined {
  if (resolution.type === "set_value") return resolution.value;
  if (resolution.type === "accept_value") return issue.currentValue;
  if (resolution.type === "link_reference") return resolution.sanityId;
  if (resolution.type === "select_image") return resolution.url ? {url: resolution.url} : {assetId: resolution.assetId ?? ""};
  if (resolution.type === "select_candidate") {
    const candidate = issue.candidates?.find((item) => item.id === resolution.candidateId);
    if (!candidate) throw new Error("El candidato ya no existe en la incidencia.");
    return candidate.sanityId ?? candidate.value;
  }
  return undefined;
}

function applyField(payload: ReviewJsonObject, field: ExternalNewsPayloadField, value: ReviewJsonValue, issueId: string): {previousValue?: ReviewJsonValue; nextValue: ReviewJsonValue} {
  const previousValue = payload[field];
  if (["disciplina", "organizacionRelacionada", "eventoRelacionado"].includes(field)) {
    const id = asId(value); if (!id) throw new Error("La referencia no contiene un ID válido."); payload[field] = id; return {previousValue, nextValue: id};
  }
  if (field === "luchadoresRelacionados") {
    const id = asId(value); if (!id) throw new Error("El luchador no contiene un ID válido.");
    const current = Array.isArray(previousValue) ? previousValue.filter((item): item is string => typeof item === "string") : [];
    const marker = issueId.split(":fighter:")[1];
    const candidates = marker ? current.filter((item) => item !== marker) : current;
    const next = [...new Set([...candidates, id])]; payload[field] = next; return {previousValue, nextValue: next};
  }
  if (field === "imagenPrincipal") {
    if (typeof value === "string") payload[field] = {url: value};
    else payload[field] = value;
    return {previousValue, nextValue: payload[field]};
  }
  payload[field] = value; return {previousValue, nextValue: value};
}

export function applyExternalNewsResolutions({reviewCase, snapshot, options = {}}: ExternalNewsApplicationInput): ExternalNewsResolutionApplicationResult {
  const generatedAt = options.now?.() ?? new Date().toISOString();
  let originalPayload: ReviewJsonObject;
  try { originalPayload = safeClone(snapshot.payload) as ReviewJsonObject; }
  catch (error) { return {caseId: reviewCase.id, originalPayload: {}, resultingPayload: {}, applied: [], metadata: [], skipped: [], failed: [{issueId: "snapshot", error: error instanceof Error ? error.message : "Snapshot inválido."}], warnings: [], preparedEntities: [], generatedAt}; }
  const resultingPayload = safeClone(originalPayload) as ReviewJsonObject;
  const result: ExternalNewsResolutionApplicationResult = {caseId: reviewCase.id, originalPayload, resultingPayload, applied: [], metadata: [], skipped: [], failed: [], warnings: [], preparedEntities: [], generatedAt};
  for (const resolution of reviewCase.resolutions) {
    const issue = reviewCase.issues.find((item) => item.id === resolution.issueId);
    if (!issue) { result.skipped.push({issueId: resolution.issueId, reason: "La resolución ya no corresponde a una incidencia vigente."}); continue; }
    const validation = validateReviewResolution(reviewCase, resolution);
    if (!validation.valid) { result.failed.push({issueId: issue.id, error: validation.error}); continue; }
    try {
      if (resolution.type === "retry") { result.skipped.push({issueId: issue.id, reason: "Retry pendiente; no modifica el payload."}); continue; }
      if (resolution.type === "discard") { result.metadata.push({issueId: issue.id, resolutionType: resolution.type, status: "skipped_non_payload", reason: "La resolución cierra una incidencia opcional y no modifica el payload."}); continue; }
      if (resolution.type === "confirm_duplicate") { result.duplicateDecision = {confirmed: true, targetId: resolution.duplicateId}; result.applied.push({issueId: issue.id, resolutionType: resolution.type, path: "metadata.duplicateDecision", nextValue: resolution.duplicateId}); continue; }
      if (resolution.type === "reject_duplicate") { result.duplicateDecision = {confirmed: false}; result.applied.push({issueId: issue.id, resolutionType: resolution.type, path: "metadata.duplicateDecision", nextValue: false}); continue; }
      if (resolution.type === "create_entity") { const prepared = safeClone({issueId: issue.id, entityType: resolution.entityType, draft: resolution.draft}) as ReviewJsonObject; result.preparedEntities.push(prepared); result.applied.push({issueId: issue.id, resolutionType: resolution.type, path: "metadata.preparedEntities", nextValue: prepared}); continue; }
      const field = mapIssueToPayloadField(issue);
      if (!field && (issue.kind === "contradictory_data" && !issue.fieldPath || issue.expected?.controlOnly === true)) { result.metadata.push({issueId: issue.id, resolutionType: resolution.type, status: "applied_metadata", reason: "La resolución cierra una incidencia de control y no modifica el payload."}); continue; }
      if (!field) { result.failed.push({issueId: issue.id, error: "La incidencia no tiene un campo permitido en el payload."}); continue; }
      const value = nextValue(resolution, issue);
      if (value === undefined) { result.failed.push({issueId: issue.id, error: "La resolución no aporta un valor aplicable."}); continue; }
      const change = applyField(resultingPayload, field, safeClone(value), issue.id);
      result.applied.push({issueId: issue.id, resolutionType: resolution.type, path: `payload.${field}`, ...change});
    } catch (error) { result.failed.push({issueId: issue.id, error: error instanceof Error ? error.message : "Fallo controlado aplicando la resolución."}); }
  }
  return result;
}
