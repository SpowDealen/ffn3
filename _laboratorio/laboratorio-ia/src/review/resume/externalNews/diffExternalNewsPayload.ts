import type {ReviewJsonObject, ReviewJsonValue} from "../../types";
import type {ExternalNewsAppliedResolution, ExternalNewsPayloadChange} from "./types";

const FIELDS = ["titulo", "extracto", "contenido", "fechaPublicacion", "fuenteUrl", "imagenPrincipal", "disciplina", "organizacionRelacionada", "eventoRelacionado", "luchadoresRelacionados", "destacada", "fuente"] as const;
function summary(value: ReviewJsonValue | undefined): ReviewJsonValue | undefined {
  if (typeof value === "string" && value.length > 240) return `${value.slice(0, 237)}…`;
  if (Array.isArray(value) && value.length > 30) return [...value.slice(0, 30), `… ${value.length - 30} más`];
  return value;
}
export function diffExternalNewsPayload(before: ReviewJsonObject, after: ReviewJsonObject, applied: ExternalNewsAppliedResolution[] = []): ExternalNewsPayloadChange[] {
  return FIELDS.flatMap((field) => {
    const left = before[field]; const right = after[field];
    if (JSON.stringify(left) === JSON.stringify(right)) return [];
    const kind = left === undefined ? "added" : right === undefined ? "removed" : "changed";
    const issueId = applied.find((item) => item.path === `payload.${field}`)?.issueId;
    return [{path: `payload.${field}`, kind, before: summary(left), after: summary(right), issueId} as ExternalNewsPayloadChange];
  }).sort((left, right) => left.path.localeCompare(right.path));
}
