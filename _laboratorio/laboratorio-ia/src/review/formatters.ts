import type {
  ReviewCaseStatus,
  ReviewIssueKind,
  ReviewModule,
  ReviewPriority,
  ReviewValueKind,
} from "./types";

export const REVIEW_STATUS_LABELS: Record<ReviewCaseStatus, string> = {
  open: "Abierto",
  in_review: "En revisión",
  resolved: "Resuelto",
  resuming: "Reanudando",
  resumed: "Reanudado",
  resume_failed: "Reanudación fallida",
  stale: "Obsoleto",
  dismissed: "Descartado",
};

export const REVIEW_PRIORITY_LABELS: Record<ReviewPriority, string> = {
  critical: "CRÍTICA",
  high: "ALTA",
  normal: "NORMAL",
  low: "BAJA",
};

export const REVIEW_MODULE_LABELS: Record<ReviewModule, string> = {
  "ufc.news": "UFC Noticias",
  "ufc.events": "UFC Eventos",
  "bkfc.news": "BKFC Noticias",
  "bkfc.events": "BKFC Eventos",
  "one.news": "ONE Noticias",
  "one.events": "ONE Eventos",
  "fekm.participants": "FEKM Participantes",
  "external.news": "Fuentes externas",
  "editorial.builder": "Builder editorial",
  "entity.reconciliation": "Reconciliación de entidades",
  sanity: "Sanity",
};

export const REVIEW_ISSUE_KIND_LABELS: Record<ReviewIssueKind, string> = {
  required_field: "Campo obligatorio",
  invalid_value: "Valor inválido",
  missing_image: "Imagen ausente",
  invalid_url: "URL inválida",
  missing_reference: "Referencia ausente",
  ambiguous_reference: "Referencia ambigua",
  missing_entity: "Entidad ausente",
  duplicate_candidate: "Posible duplicado",
  contradictory_data: "Datos contradictorios",
  low_confidence: "Confianza baja",
  insufficient_content: "Contenido insuficiente",
  recoverable_error: "Error recuperable",
  partial_creation: "Creación parcial",
  blocked_dependency: "Dependencia bloqueada",
};

export const REVIEW_VALUE_KIND_LABELS: Record<ReviewValueKind, string> = {
  text: "Texto",
  date: "Fecha",
  number: "Número",
  boolean: "Booleano",
  image: "Imagen",
  url: "URL",
  sanityReference: "Referencia Sanity",
  discipline: "Disciplina",
  organization: "Organización",
  event: "Evento",
  fighter: "Luchador",
  fight: "Combate",
  category: "Categoría",
};

export function getKnownLabel<T extends string>(
  labels: Partial<Record<T, string>>,
  value: T,
): string {
  return labels[value] ?? value;
}

export function formatRelativeReviewTime(value: string, now: number): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Fecha no disponible";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  if (seconds < 45) return "hace unos segundos";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  if (hours < 48) return "ayer";
  return `hace ${Math.floor(hours / 24)} días`;
}

export function formatReviewDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(date);
}

export function formatConfidence(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 100) return String(value);
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(0)}%`;
}

export function normalizeConfidenceForDisplay(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return -1;
  return value >= 0 && value <= 1 ? value * 100 : value;
}

export function getConfidenceLevel(value: number): "Baja" | "Media" | "Alta" {
  const normalized = normalizeConfidenceForDisplay(value);
  return normalized < 60 ? "Baja" : normalized < 80 ? "Media" : "Alta";
}
