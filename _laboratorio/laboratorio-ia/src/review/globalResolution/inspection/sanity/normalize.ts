import type {ReviewJsonObject, ReviewJsonValue} from "../../../types";
import {computeUniversalFingerprint} from "../../../universal";
import type {SanityFighterCandidate, SanityNewsDocumentCandidate} from "./types";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const referenceId = (value: unknown): string => record(value) ? baseSanityDocumentId(text(value._ref)) : "";

export function baseSanityDocumentId(value: string): string {
  return value.trim().replace(/^drafts\./, "");
}
export function draftSanityDocumentId(value: string): string {
  return `drafts.${baseSanityDocumentId(value)}`;
}

export function sanityDocumentIdVariants(value: string): {requestedId: string; draftId: string; publishedId: string} {
  const requestedId = value.trim();
  const publishedId = baseSanityDocumentId(requestedId);
  return {requestedId, draftId: draftSanityDocumentId(publishedId), publishedId};
}

export function fighterIdentityKeyFromName(value: unknown): string {
  const slug = text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96);
  return slug ? `fighter:${slug}` : "";
}

export function normalizeSanityFighterCandidate(value: unknown): SanityFighterCandidate | undefined {
  if (!record(value)) return undefined;
  const entityId = text(value._id);
  const nombre = text(value.nombre);
  const identityKey = fighterIdentityKeyFromName(nombre);
  const slug = record(value.slug) ? text(value.slug.current) : "";
  const disciplina = referenceId(value.disciplina);
  const organizacion = referenceId(value.organizacion);
  if (!entityId || !identityKey || !slug || !disciplina || !organizacion) return undefined;
  const payload: ReviewJsonObject = {
    _type: "luchador",
    nombre,
    slug: {_type: "slug", current: slug},
    disciplina: {_type: "reference", _ref: disciplina},
    organizacion: {_type: "reference", _ref: organizacion},
    activo: typeof value.activo === "boolean" ? value.activo : true,
    destacadoHome: typeof value.destacadoHome === "boolean" ? value.destacadoHome : false,
  };
  return {entityId, identityKey, payloadFingerprint: computeUniversalFingerprint(payload as ReviewJsonValue)};
}

function portableText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value.map((block) => {
    if (!record(block) || !Array.isArray(block.children)) return "";
    return block.children.map((child) => record(child) ? text(child.text) : "").join("");
  }).filter(Boolean).join("\n\n").trim();
}

function normalizedUrl(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch {
    return raw;
  }
}

function newsPayload(value: RecordValue, sortReferences: boolean): ReviewJsonObject {
  const references = Array.isArray(value.luchadoresRelacionados)
    ? [...new Set(value.luchadoresRelacionados.map(referenceId).filter(Boolean))]
    : [];
  if (sortReferences) references.sort();
  return {
    titulo: text(value.titulo),
    extracto: text(value.extracto),
    contenido: portableText(value.contenido),
    fechaPublicacion: text(value.fechaPublicacion),
    fuenteUrl: normalizedUrl(value.fuenteUrl),
    fuenteId: text(value.fuenteId),
    imagenPrincipal: normalizedUrl(value.imagenPrincipalUrl),
    disciplina: referenceId(value.disciplina),
    organizacionRelacionada: referenceId(value.organizacionRelacionada),
    eventoRelacionado: referenceId(value.eventoRelacionado),
    luchadoresRelacionados: references,
    destacada: value.destacada === true,
    fuente: text(value.fuente),
  };
}

export function normalizeSanityNewsDocumentCandidate(value: unknown): SanityNewsDocumentCandidate | undefined {
  if (!record(value) || !text(value._id)) return undefined;
  const semanticPayload = newsPayload(value, true);
  const au3Payload = newsPayload(value, false);
  return {
    entityId: text(value._id),
    payloadFingerprint: computeUniversalFingerprint(semanticPayload as ReviewJsonValue),
    au3PayloadFingerprint: computeUniversalFingerprint(au3Payload as ReviewJsonValue),
  };
}

export function normalizeSanityReferenceResult(value: unknown, fighterId: string): {documentId: string; referenceExists: boolean} | undefined {
  if (!record(value) || !text(value._id)) return undefined;
  const expected = baseSanityDocumentId(fighterId);
  const fighterIds = Array.isArray(value.fighterIds) ? value.fighterIds.map((item) => baseSanityDocumentId(text(item))).filter(Boolean) : [];
  return {documentId: text(value._id), referenceExists: fighterIds.includes(expected)};
}
