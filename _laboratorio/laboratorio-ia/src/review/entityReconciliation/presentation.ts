import type {CorpusReadStatus, EntityKind, ReconciliationState} from "./types";

export const ENTITY_KIND_LABELS: Readonly<Record<EntityKind, string>> = Object.freeze({fighter: "Luchador", event: "Evento", organization: "Organización", weight_category: "Categoría de peso"});
export const RECONCILIATION_STATE_LABELS: Readonly<Record<ReconciliationState, string>> = Object.freeze({candidate: "Posible duplicado", needs_review: "Pendiente de revisión", inconclusive: "No concluyente", blocked: "Bloqueado", confirmed_duplicate: "Confirmado por un revisor", not_duplicate: "Descartado como duplicado", deferred: "Aplazado", stale: "Evidencia obsoleta"});
export const CORPUS_READ_STATUS_LABELS: Readonly<Record<CorpusReadStatus, string>> = Object.freeze({complete: "Lectura completa", partial: "Lectura parcial", truncated: "Lectura truncada", unavailable: "Lectura no disponible", cancelled: "Lectura cancelada"});
export const reconciliationNoMutationMessage = "No se ha realizado ninguna mutación ni reconciliación automática.";
