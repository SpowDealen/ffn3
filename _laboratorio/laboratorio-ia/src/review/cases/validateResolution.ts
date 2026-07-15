import type {
  ReviewCase,
  ReviewJsonValue,
  ReviewResolution,
} from "../types";

export function isSerializableReviewValue(
  value: unknown,
  seen = new Set<object>(),
): value is ReviewJsonValue {
  if (value === null) return true;
  if (["string", "boolean"].includes(typeof value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;

  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return false;
  }

  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isSerializableReviewValue(item, seen))
    : Object.entries(value).every(
        ([, item]) =>
          item === undefined || isSerializableReviewValue(item, seen),
      );
  seen.delete(value);
  return valid;
}

export function assertSerializableReviewValue(value: unknown): void {
  if (!isSerializableReviewValue(value)) {
    throw new Error(
      "Los datos de revisión deben contener únicamente valores JSON serializables.",
    );
  }
}

export type ReviewResolutionValidation =
  | {valid: true}
  | {valid: false; error: string};

const SENSITIVE_DRAFT_KEY = /(token|secret|password|authorization|cookie|api[_-]?key)/i;

function containsSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, child]) => SENSITIVE_DRAFT_KEY.test(key) || containsSensitiveKey(child),
  );
}

export function validateReviewResolution(
  reviewCase: ReviewCase,
  resolution: ReviewResolution,
): ReviewResolutionValidation {
  const issue = reviewCase.issues.find(
    (candidate) => candidate.id === resolution.issueId,
  );

  if (!issue) {
    return {valid: false, error: "La resolución no corresponde a un problema del caso."};
  }

  if (
    resolution.type === "select_candidate" &&
    !issue.candidates?.some(
      (candidate) => candidate.id === resolution.candidateId,
    )
  ) {
    return {valid: false, error: "El candidato seleccionado no existe en el problema."};
  }

  if (resolution.type === "set_value" && (issue.valueKind === "text" || issue.valueKind === undefined)) {
    if (typeof resolution.value !== "string") {
      return {valid: false, error: "La resolución debe contener texto."};
    }
    const longText = issue.kind === "insufficient_content" || String(issue.currentValue ?? "").length > 180;
    const limit = longText ? 50_000 : 5_000;
    if (resolution.value.length > limit) {
      return {valid: false, error: `El valor de texto no puede superar ${limit.toLocaleString("es-ES")} caracteres.`};
    }
  }

  if (resolution.type === "set_value" && issue.valueKind === "number") {
    if (typeof resolution.value !== "number" || !Number.isFinite(resolution.value)) {
      return {valid: false, error: "La resolución debe contener un número finito."};
    }
    const min = issue.expected?.min;
    const max = issue.expected?.max;
    if (typeof min === "number" && resolution.value < min) return {valid: false, error: `El valor mínimo es ${min}.`};
    if (typeof max === "number" && resolution.value > max) return {valid: false, error: `El valor máximo es ${max}.`};
  }

  if (resolution.type === "set_value" && issue.valueKind === "boolean" && typeof resolution.value !== "boolean") {
    return {valid: false, error: "La resolución debe contener un booleano real."};
  }

  if (resolution.type === "set_value" && issue.valueKind === "date") {
    if (typeof resolution.value !== "string" || !Number.isFinite(Date.parse(resolution.value))) {
      return {valid: false, error: "La resolución debe contener una fecha ISO válida."};
    }
  }

  if (resolution.type === "set_value" && issue.valueKind === "url") {
    if (typeof resolution.value !== "string" || resolution.value.length > 2_000) {
      return {valid: false, error: "La URL debe ser texto y no superar 2.000 caracteres."};
    }
    try {
      const url = new URL(resolution.value);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      return {valid: false, error: "La resolución debe contener una URL HTTP o HTTPS válida."};
    }
  }

  if (
    resolution.type === "set_value" &&
    !["text", "number", "boolean", "date", "url", undefined].includes(issue.valueKind)
  ) {
    return {valid: false, error: "Este tipo de incidencia requiere un modo de resolución específico."};
  }

  if (resolution.type === "select_image" && resolution.url) {
    if (resolution.url.length > 2_000) return {valid: false, error: "La URL no puede superar 2.000 caracteres."};
    try {
      const url = new URL(resolution.url);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      return {valid: false, error: "La imagen debe usar una URL HTTP o HTTPS válida."};
    }
  }

  if (resolution.type === "select_image" && resolution.url && resolution.assetId) {
    return {valid: false, error: "Selecciona una URL o un asset ID, no ambos."};
  }

  if (
    resolution.type === "select_image" &&
    !resolution.url?.trim() &&
    !resolution.assetId?.trim()
  ) {
    return {valid: false, error: "La imagen debe indicar una URL o un asset de Sanity."};
  }

  if (
    resolution.type === "set_value" &&
    (issue.required || issue.blocking) &&
    typeof resolution.value === "string" &&
    !resolution.value.trim()
  ) {
    return {valid: false, error: "Una incidencia obligatoria no admite un valor vacío."};
  }

  if (resolution.type === "link_reference" && !resolution.sanityId.trim()) {
    return {valid: false, error: "La referencia debe indicar un ID de Sanity."};
  }

  if (
    resolution.type === "create_entity" &&
    !resolution.entityType.trim()
  ) {
    return {valid: false, error: "La creación prevista debe indicar el tipo de entidad."};
  }

  if (resolution.type === "create_entity") {
    const serializedDraft = JSON.stringify(resolution.draft);
    if (new Blob([serializedDraft]).size > 100 * 1_024) {
      return {valid: false, error: "El borrador de entidad no puede superar 100 KB."};
    }
    if (containsSensitiveKey(resolution.draft)) {
      return {valid: false, error: "El borrador de entidad contiene claves sensibles no permitidas."};
    }
  }

  if (
    resolution.type === "confirm_duplicate" &&
    !resolution.duplicateId.trim()
  ) {
    return {valid: false, error: "Indica el identificador del duplicado confirmado."};
  }

  if (
    resolution.type === "discard" &&
    (issue.required === true || issue.blocking === true)
  ) {
    return {valid: false, error: "No se puede descartar una incidencia obligatoria o bloqueante."};
  }

  if (resolution.type === "discard" && !resolution.reason.trim()) {
    return {valid: false, error: "Indica el motivo para descartar la incidencia."};
  }


  if (
    "reason" in resolution &&
    typeof resolution.reason === "string" &&
    resolution.reason.length > 1_000
  ) {
    return {valid: false, error: "El motivo no puede superar 1.000 caracteres."};
  }

  try {
    assertSerializableReviewValue(resolution);
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Resolución no serializable.",
    };
  }

  return {valid: true};
}

export function hasResolutionForIssue(
  reviewCase: ReviewCase,
  issueId: string,
): boolean {
  return reviewCase.resolutions.some(
    (resolution) => resolution.issueId === issueId,
  );
}

export function canResolveReviewCase(reviewCase: ReviewCase): boolean {
  return validateResolution(reviewCase).valid;
}

export function validateResolution(reviewCase: ReviewCase): {
  valid: boolean;
  pendingIssues: ReviewCase["issues"];
  pendingBlockingIssues: ReviewCase["issues"];
  pendingRequiredIssues: ReviewCase["issues"];
  totalIssues: number;
  resolvedIssues: number;
  completionPercentage: number;
} {
  const pendingIssues = reviewCase.issues.filter((issue) =>
    !hasResolutionForIssue(reviewCase, issue.id),
  );
  const pendingBlockingIssues = pendingIssues.filter((issue) => issue.blocking === true);
  const pendingRequiredIssues = pendingIssues.filter((issue) => issue.required === true);
  const blockingOrRequiredPending = pendingIssues.filter(
    (issue) => issue.blocking === true || issue.required === true,
  );
  const totalIssues = reviewCase.issues.length;
  const resolvedIssues = totalIssues - pendingIssues.length;

  return {
    valid: blockingOrRequiredPending.length === 0,
    pendingIssues,
    pendingBlockingIssues,
    pendingRequiredIssues,
    totalIssues,
    resolvedIssues,
    completionPercentage: totalIssues === 0 ? 100 : Math.round((resolvedIssues / totalIssues) * 100),
  };
}
