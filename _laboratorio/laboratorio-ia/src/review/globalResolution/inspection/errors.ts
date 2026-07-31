import type {GlobalResolutionInspectionFailure, GlobalResolutionInspectionFailureCode} from "./types";

const SAFE_MESSAGES: Record<GlobalResolutionInspectionFailureCode, string> = {
  invalid_request: "La solicitud de inspección no es válida.",
  checkpoint_conflict: "El checkpoint cambió antes de la inspección.",
  operation_conflict: "La operación cambió o ya no admite inspección.",
  inspector_not_found: "El inspector solicitado no está registrado.",
  inspector_ambiguous: "Existe más de un inspector igualmente específico.",
  unsupported: "Ningún inspector compatible puede comprobar este efecto.",
  inspection_failed: "La inspección de sólo lectura no pudo completarse.",
  incompatible_inspector: "La versión del inspector no coincide con el binding solicitado.",
  wrong_producer_evidence: "La evidencia pertenece a otro productor.",
  wrong_operation_evidence: "La evidencia pertenece a otra operación.",
  stale_generation: "La evidencia pertenece a una generación anterior.",
  aborted: "La inspección fue cancelada.",
};

export function inspectionFailure(code: GlobalResolutionInspectionFailureCode, retryable = false): GlobalResolutionInspectionFailure {
  return {code, message: SAFE_MESSAGES[code], retryable};
}

export function sanitizeInspectionText(value: unknown): string {
  if (typeof value !== "string") return "Detalle no disponible";
  return value
    .replace(/https?:\/\/[^\s?#]+[^\s]*/gi, "[url]")
    .replace(/(authorization|token|secret|password|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "Detalle no disponible";
}
