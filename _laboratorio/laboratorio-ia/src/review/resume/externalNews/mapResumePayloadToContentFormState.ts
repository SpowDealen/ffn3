import type {ContentFormState, ReferenceValue} from "../../../types";
import type {ReviewJsonObject, ReviewJsonValue} from "../../types";

const text = (value: ReviewJsonValue | undefined): string => typeof value === "string" ? value : "";
const reference = (value: ReviewJsonValue | undefined): ReferenceValue | undefined => { const id = text(value).trim(); return id ? {_type: "reference", _ref: id} : undefined; };

export function mapResumePayloadToContentFormState(payload: ReviewJsonObject): ContentFormState {
  const fighters = Array.isArray(payload.luchadoresRelacionados) ? [...new Set(payload.luchadoresRelacionados.filter((item): item is string => typeof item === "string" && Boolean(item.trim())))] : [];
  const form: ContentFormState = {titulo: text(payload.titulo), extracto: text(payload.extracto), contenido: text(payload.contenido), fechaPublicacion: text(payload.fechaPublicacion), fuenteUrl: text(payload.fuenteUrl), fuenteId: text(payload.fuenteId), imagenPrincipal: payload.imagenPrincipal as Record<string, unknown> | string | undefined, disciplina: reference(payload.disciplina), organizacionRelacionada: reference(payload.organizacionRelacionada), eventoRelacionado: reference(payload.eventoRelacionado), luchadoresRelacionados: fighters.map((id): ReferenceValue => ({_type: "reference", _ref: id})), destacada: typeof payload.destacada === "boolean" ? payload.destacada : false, fuente: text(payload.fuente)};
  return Object.fromEntries(Object.entries(form).filter(([, value]) => value !== undefined));
}
