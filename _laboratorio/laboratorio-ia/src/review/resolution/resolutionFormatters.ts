import type {ReviewResolution} from "../types";

export const REVIEW_RESOLUTION_LABELS: Record<ReviewResolution["type"], string> = {
  set_value: "Valor establecido",
  select_candidate: "Candidato seleccionado",
  link_reference: "Referencia enlazada",
  create_entity: "Creación de entidad preparada",
  select_image: "Imagen seleccionada",
  confirm_duplicate: "Duplicado confirmado",
  reject_duplicate: "Duplicado rechazado",
  accept_value: "Valor actual aceptado",
  discard: "Incidencia descartada",
  retry: "Reintento solicitado",
};

export function formatResolutionDetail(resolution: ReviewResolution): string {
  const truncate = (value: string): string => value.length > 180
    ? `${value.slice(0, 177)}…`
    : value;

  switch (resolution.type) {
    case "set_value": return truncate(typeof resolution.value === "string" ? resolution.value : JSON.stringify(resolution.value));
    case "select_candidate": return resolution.candidateId;
    case "link_reference": return resolution.sanityId;
    case "create_entity": return resolution.entityType;
    case "select_image": return resolution.assetId || resolution.url || "Sin imagen";
    case "confirm_duplicate": return resolution.duplicateId;
    case "reject_duplicate": return resolution.reason || "Sin motivo";
    case "accept_value": return resolution.reason || "Aceptado sin observaciones";
    case "discard": return resolution.reason;
    case "retry": return "Pendiente de una fase futura de ejecución";
  }
}
