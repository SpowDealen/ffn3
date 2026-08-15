import {apiUrl} from "../lib/apiUrl";
import {readEditorialJsonResponse} from "../lib/editorialJsonResponse";

export type TelegramHealthResponse = {
  ok: boolean;
  enabled: boolean;
  configured: boolean;
  tokenConfigured: boolean;
  chatIdConfigured: boolean;
  deliveryMode: "production" | "sandbox";
  externalDispatchesAllowed: boolean;
  checkedAt: string;
  messageId?: number;
  skipped?: boolean;
  retryAfterSeconds?: number;
  error?: string;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseHealthResponse(
  value: unknown,
): TelegramHealthResponse {
  if (
    !isRecord(value) ||
    typeof value.ok !== "boolean" ||
    typeof value.enabled !== "boolean" ||
    typeof value.configured !== "boolean" ||
    typeof value.tokenConfigured !== "boolean" ||
    typeof value.chatIdConfigured !== "boolean" ||
    typeof value.checkedAt !== "string"
  ) {
    throw new Error(
      "El servidor devolvió una respuesta de diagnóstico no válida.",
    );
  }

  return {
    ok: value.ok,
    enabled: value.enabled,
    configured: value.configured,
    tokenConfigured: value.tokenConfigured,
    chatIdConfigured: value.chatIdConfigured,
    deliveryMode:
      value.deliveryMode === "sandbox" ? "sandbox" : "production",
    externalDispatchesAllowed:
      typeof value.externalDispatchesAllowed === "boolean"
        ? value.externalDispatchesAllowed
        : value.deliveryMode !== "sandbox" &&
          value.enabled &&
          value.configured,
    checkedAt: value.checkedAt,
    messageId:
      typeof value.messageId === "number"
        ? value.messageId
        : undefined,
    skipped:
      typeof value.skipped === "boolean"
        ? value.skipped
        : undefined,
    retryAfterSeconds:
      typeof value.retryAfterSeconds === "number"
        ? value.retryAfterSeconds
        : undefined,
    error:
      typeof value.error === "string"
        ? value.error
        : undefined,
  };
}

async function requestTelegramHealth(
  method: "GET" | "POST",
): Promise<TelegramHealthResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    15_000,
  );
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const healthSecret =
    import.meta.env.VITE_TELEGRAM_HEALTH_CHECK_SECRET;

  if (
    method === "POST" &&
    typeof healthSecret === "string" &&
    healthSecret.length > 0
  ) {
    headers["x-ffn-health-secret"] = healthSecret;
  }

  try {
    const response = await fetch(
      apiUrl("/api/notifications/telegram/health"),
      {
        method,
        headers,
        signal: controller.signal,
        cache: "no-store",
      },
    );
    const payload = parseHealthResponse(
      await readEditorialJsonResponse(response),
    );

    if (!response.ok && !payload.error) {
      return {
        ...payload,
        error: `El diagnóstico respondió con HTTP ${response.status}.`,
      };
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "La comprobación de Telegram agotó el tiempo de espera.",
      );
    }

    throw new Error(
      error instanceof Error
        ? error.message
        : "No se pudo conectar con el diagnóstico de Telegram.",
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export function getTelegramHealth(): Promise<TelegramHealthResponse> {
  return requestTelegramHealth("GET");
}

export function testTelegramHealth(): Promise<TelegramHealthResponse> {
  return requestTelegramHealth("POST");
}
