export type EditorialReadErrorKind = "network" | "timeout" | "service_unavailable" | "not_found" | "permission" | "unknown";

export type EditorialReadError = Readonly<{
  kind: EditorialReadErrorKind;
  message: string;
  retryable: boolean;
}>;

const messages: Readonly<Record<EditorialReadErrorKind, string>> = Object.freeze({
  network: "No se pudo conectar con el servicio editorial.",
  timeout: "El servicio editorial tardó demasiado en responder.",
  service_unavailable: "El servicio no está disponible temporalmente.",
  not_found: "La información solicitada ya no está disponible.",
  permission: "No tienes permiso para consultar esta información.",
  unknown: "Ha ocurrido un problema al recuperar la información.",
});

const technicalErrorPattern = /failed to fetch|networkerror|network request failed|load failed|typeerror|syntaxerror|aborterror|timeout|timed out|agot[óo] el tiempo|internal server error|server error|\b(?:http|status)\s*5\d\d\b|\b5\d\d\b|econn|enotfound|offline|cors|network/i;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") return `HTTP ${error.status}`;
  return "";
}

/**
 * Maps transport/parsing failures to operator-safe copy. Raw transport data is
 * intentionally not returned; callers may retain it in console diagnostics.
 */
export function classifyEditorialReadError(error: unknown): EditorialReadError {
  const text = errorText(error).trim().toLocaleLowerCase("es");
  const status = /\b(?:http|status)?\s*(\d{3})\b/.exec(text)?.[1];
  const kind: EditorialReadErrorKind = error instanceof DOMException && error.name === "AbortError"
    || /timeout|timed out|agot[óo] el tiempo|abort/.test(text) ? "timeout"
    : /failed to fetch|networkerror|network request failed|load failed|econn|enotfound|offline|cors|network/.test(text) ? "network"
    : status === "401" || status === "403" || /unauthoriz|forbidden|permission|permiso/.test(text) ? "permission"
    : status === "404" || /not found|no encontrado/.test(text) ? "not_found"
    : /^5\d\d$/.test(status ?? "") || /service unavailable|unavailable|backend|gateway|internal server error|server error/.test(text) ? "service_unavailable"
    : "unknown";
  return Object.freeze({kind, message: messages[kind], retryable: kind === "network" || kind === "timeout" || kind === "service_unavailable" || kind === "unknown"});
}

/**
 * Legacy notifications retain their original fields in storage. This helper is
 * deliberately presentation-only: it replaces recognisable transport/runtime
 * failures with the B6.5 operator copy, while leaving editorial domain text
 * unchanged.
 */
export function presentHistoricalEditorialCopy(
  value: unknown,
  fallback = "Ha ocurrido un problema al recuperar la información.",
): string {
  const raw = errorText(value).trim();

  if (!raw) return fallback;
  return technicalErrorPattern.test(raw)
    ? classifyEditorialReadError(raw).message
    : raw;
}

/** Delivery failures are transport diagnostics, never operator-facing copy. */
export function presentTelegramDeliveryFailure(
  value: unknown,
): string | undefined {
  return errorText(value).trim()
    ? "No se pudo completar la entrega por Telegram."
    : undefined;
}
