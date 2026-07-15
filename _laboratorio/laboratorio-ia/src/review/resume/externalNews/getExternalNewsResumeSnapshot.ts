import type {ReviewJsonObject, ReviewJsonValue} from "../../types";
import {isSerializableReviewValue} from "../../cases/validateResolution";
import type {ExternalNewsResumeSnapshot, ExternalNewsSnapshotResult} from "./types";

const object = (value: unknown): ReviewJsonObject | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as ReviewJsonObject : undefined;
const string = (value: ReviewJsonValue | undefined): string | undefined => typeof value === "string" && value.trim() ? value : undefined;

export function getExternalNewsResumeSnapshot(context: ReviewJsonObject): ExternalNewsSnapshotResult {
  if (context.producer !== "external_news") return {complete: false, missingFields: ["context.producer"], warnings: ["El caso no procede del productor external_news."]};
  const payloadSnapshot = object(context.payloadSnapshot);
  const analysisSnapshot = object(context.analysisSnapshot);
  const analysis = object(analysisSnapshot?.analysis) ?? {};
  const resolved = object(analysisSnapshot?.resolved) ?? {};
  if (!payloadSnapshot || !analysisSnapshot) return {complete: false, missingFields: [!payloadSnapshot ? "context.payloadSnapshot" : "", !analysisSnapshot ? "context.analysisSnapshot" : ""].filter(Boolean), warnings: ["El caso 4B no conserva todos los snapshots necesarios."]};
  const discipline = object(resolved.disciplina);
  const organization = object(resolved.organizacion);
  const event = object(resolved.evento);
  const primary = Array.isArray(resolved.luchadoresPrincipales) ? resolved.luchadoresPrincipales : [];
  const secondary = Array.isArray(resolved.luchadoresSecundarios) ? resolved.luchadoresSecundarios : [];
  const fighterIds = [...primary, ...secondary].map((item) => object(item)).map((item) => string(item?.id)).filter((item): item is string => Boolean(item));
  const image = object(payloadSnapshot.image);
  const payload: ReviewJsonObject = {
    titulo: string(payloadSnapshot.title) ?? "",
    extracto: string(payloadSnapshot.excerpt) ?? "",
    contenido: string(payloadSnapshot.bodyText) ?? string(payloadSnapshot.excerpt) ?? "",
    fechaPublicacion: string(payloadSnapshot.publishedAt) ?? "",
    fuenteUrl: string(payloadSnapshot.canonicalUrl) ?? string(context.canonicalUrl) ?? string(context.sourceUrl) ?? "",
    fuenteId: string(payloadSnapshot.id) ?? string(context.externalItemId) ?? "",
    imagenPrincipal: string(image?.url) ?? "",
    disciplina: string(discipline?.id) ?? "",
    organizacionRelacionada: string(organization?.id) ?? "",
    eventoRelacionado: string(event?.id) ?? "",
    luchadoresRelacionados: [...new Set(fighterIds)],
    destacada: analysis.relevancia === "alta",
    fuente: "otra",
  };
  const missingFields = [["source.id", context.sourceId], ["source.name", context.sourceName], ["capturedAt", context.createdAt], ["payload.titulo", payload.titulo], ["payload.contenido", payload.contenido], ["payload.fuenteUrl", payload.fuenteUrl], ["payload.disciplina", payload.disciplina]].filter(([, value]) => !value).map(([path]) => String(path));
  const snapshot: ExternalNewsResumeSnapshot = {producer: "external_news", source: {id: string(context.sourceId) ?? "", name: string(context.sourceName) ?? "", url: string(context.sourceUrl)}, item: {id: string(context.externalItemId), title: string(context.title), canonicalUrl: string(context.canonicalUrl), sourceUrl: string(context.sourceUrl), publishedAt: string(payloadSnapshot.publishedAt), imageUrl: string(image?.url)}, analysis, resolved, payload, operation: ["analyze", "prepare", "resolve", "create_draft"].includes(String(context.operation)) ? context.operation as ExternalNewsResumeSnapshot["operation"] : "analyze", capturedAt: string(context.createdAt) ?? "", schemaVersion: 1};
  if (!isSerializableReviewValue(snapshot)) return {complete: false, missingFields: ["snapshot.serializable"], warnings: ["El snapshot contiene datos no serializables."]};
  return {snapshot, complete: missingFields.length === 0, missingFields, warnings: missingFields.length ? ["El snapshot no permite reconstruir todos los campos obligatorios."] : []};
}
