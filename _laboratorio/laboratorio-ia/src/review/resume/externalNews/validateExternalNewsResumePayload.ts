import {isSerializableReviewValue} from "../../cases/validateResolution";
import type {ReviewCase, ReviewJsonObject, ReviewJsonValue} from "../../types";
import type {ExternalNewsResolutionApplicationResult, ExternalNewsResumeValidation} from "./types";

const SENSITIVE = /(token|secret|password|authorization|cookie|api[_-]?key|headers?)/i;
const DANGEROUS = new Set(["__proto__", "prototype", "constructor"]);
function inspect(value: ReviewJsonValue, path: string, validation: ExternalNewsResumeValidation): void {
  if (Array.isArray(value)) { value.forEach((item, index) => inspect(item, `${path}[${index}]`, validation)); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (DANGEROUS.has(key)) validation.errors.push({path: `${path}.${key}`, code: "dangerous_key", message: "El payload contiene una propiedad peligrosa."});
    if (SENSITIVE.test(key)) validation.errors.push({path: `${path}.${key}`, code: "sensitive_key", message: "El payload contiene una clave sensible."});
    inspect(child, `${path}.${key}`, validation);
  }
}
function validUrl(value: unknown): boolean { try { return typeof value === "string" && ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } }

export function validateExternalNewsResumePayload(payload: ReviewJsonObject, reviewCase: ReviewCase, application: ExternalNewsResolutionApplicationResult): ExternalNewsResumeValidation {
  const validation: ExternalNewsResumeValidation = {valid: true, errors: [], warnings: [], blockingReasons: []};
  if (!isSerializableReviewValue(payload)) validation.errors.push({code: "not_serializable", message: "El payload no es JSON serializable."});
  inspect(payload, "payload", validation);
  if (typeof payload.titulo !== "string" || !payload.titulo.trim()) validation.errors.push({path: "payload.titulo", code: "required_title", message: "El título es obligatorio."});
  else if (payload.titulo.length > 5_000) validation.errors.push({path: "payload.titulo", code: "title_too_long", message: "El título supera 5.000 caracteres."});
  if (typeof payload.contenido !== "string" || !payload.contenido.trim()) validation.errors.push({path: "payload.contenido", code: "required_body", message: "El cuerpo es obligatorio."});
  else if (payload.contenido.length > 50_000) validation.errors.push({path: "payload.contenido", code: "body_too_long", message: "El cuerpo supera 50.000 caracteres."});
  if (!validUrl(payload.fuenteUrl)) validation.errors.push({path: "payload.fuenteUrl", code: "unsafe_url", message: "La URL canónica debe ser HTTP o HTTPS."});
  if (payload.fechaPublicacion && (typeof payload.fechaPublicacion !== "string" || !Number.isFinite(Date.parse(payload.fechaPublicacion)))) validation.errors.push({path: "payload.fechaPublicacion", code: "invalid_date", message: "La fecha debe ser ISO válida."});
  if (typeof payload.disciplina !== "string" || !payload.disciplina.trim()) validation.errors.push({path: "payload.disciplina", code: "required_discipline", message: "La disciplina requiere un ID."});
  for (const field of ["organizacionRelacionada", "eventoRelacionado"] as const) if (payload[field] !== "" && (typeof payload[field] !== "string" || !payload[field].trim())) validation.errors.push({path: `payload.${field}`, code: "invalid_reference", message: "La referencia debe contener un ID."});
  if (!Array.isArray(payload.luchadoresRelacionados) || payload.luchadoresRelacionados.some((item) => typeof item !== "string" || !item.trim())) validation.errors.push({path: "payload.luchadoresRelacionados", code: "invalid_reference_array", message: "Los luchadores deben ser IDs válidos."});
  else if (new Set(payload.luchadoresRelacionados).size !== payload.luchadoresRelacionados.length) validation.errors.push({path: "payload.luchadoresRelacionados", code: "duplicate_references", message: "El array contiene referencias duplicadas."});
  if (payload.imagenPrincipal) {
    if (typeof payload.imagenPrincipal === "string") { if (!validUrl(payload.imagenPrincipal)) validation.errors.push({path: "payload.imagenPrincipal", code: "unsafe_image_url", message: "La imagen debe usar HTTP o HTTPS."}); }
    else if (typeof payload.imagenPrincipal !== "object" || Array.isArray(payload.imagenPrincipal)) validation.errors.push({path: "payload.imagenPrincipal", code: "invalid_image", message: "La imagen debe contener URL o asset ID."});
    else { const url = payload.imagenPrincipal.url; const asset = payload.imagenPrincipal.assetId; if (url && asset) validation.errors.push({path: "payload.imagenPrincipal", code: "contradictory_image", message: "La imagen no puede contener URL y asset ID simultáneamente."}); else if (url && !validUrl(url)) validation.errors.push({path: "payload.imagenPrincipal.url", code: "unsafe_image_url", message: "La imagen debe usar HTTP o HTTPS."}); else if (!url && (typeof asset !== "string" || !asset.trim())) validation.errors.push({path: "payload.imagenPrincipal", code: "empty_image", message: "La imagen no contiene un origen válido."}); }
  }
  const resolvedIds = new Set(reviewCase.resolutions.map((item) => item.issueId));
  const pending = reviewCase.issues.filter((issue) => (issue.required || issue.blocking) && !resolvedIds.has(issue.id));
  if (pending.length) validation.blockingReasons.push(`Quedan ${pending.length} incidencias obligatorias o bloqueantes sin resolución.`);
  const retry = reviewCase.resolutions.filter((item) => item.type === "retry" && reviewCase.issues.some((issue) => issue.id === item.issueId && (issue.required || issue.blocking)));
  if (retry.length) validation.blockingReasons.push("Existe un retry pendiente en una incidencia obligatoria o bloqueante.");
  if (application.duplicateDecision?.confirmed) validation.blockingReasons.push("La noticia está bloqueada por un duplicado confirmado.");
  if (application.preparedEntities.length) validation.blockingReasons.push("Existen entidades preparadas pendientes de una política de creación.");
  if (application.failed.length) validation.blockingReasons.push("Una o más resoluciones no pudieron aplicarse.");
  validation.valid = validation.errors.length === 0 && validation.blockingReasons.length === 0;
  return validation;
}
