import type {ReviewIssue} from "../../types";

export type ExternalNewsPayloadField = "titulo" | "extracto" | "contenido" | "fechaPublicacion" | "fuenteUrl" | "imagenPrincipal" | "disciplina" | "organizacionRelacionada" | "eventoRelacionado" | "luchadoresRelacionados";

const FIELD_MAP: Readonly<Record<string, ExternalNewsPayloadField>> = Object.freeze({title: "titulo", titulo: "titulo", summary: "extracto", extracto: "extracto", body: "contenido", contenido: "contenido", date: "fechaPublicacion", fechaPublicacion: "fechaPublicacion", "canonical-url": "fuenteUrl", fuenteUrl: "fuenteUrl", image: "imagenPrincipal", imagenPrincipal: "imagenPrincipal", discipline: "disciplina", disciplina: "disciplina", organization: "organizacionRelacionada", organizacion: "organizacionRelacionada", event: "eventoRelacionado", evento: "eventoRelacionado", fighter: "luchadoresRelacionados", luchador: "luchadoresRelacionados"});
const DANGEROUS = /(^|\.)(__proto__|prototype|constructor)(\.|$)/;

export function mapIssueToPayloadField(issue: ReviewIssue): ExternalNewsPayloadField | undefined {
  const raw = issue.fieldPath ?? issue.id.split(":").at(-1) ?? "";
  if (DANGEROUS.test(raw)) return undefined;
  if (FIELD_MAP[raw]) return FIELD_MAP[raw];
  return Object.entries(FIELD_MAP).find(([key]) => issue.id.includes(`:${key}`))?.[1];
}
