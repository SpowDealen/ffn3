import {timingSafeEqual} from "node:crypto";
import {NextResponse} from "next/server";
import {
  getTelegramConfigurationStatus,
  sendTelegramNotification,
} from "@/app/lib/notifications/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEALTH_TEST_COOLDOWN_MS = 30_000;
const LOCAL_DEVELOPMENT_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
let lastHealthTestStartedAt = 0;

function withCors(
  response: NextResponse,
  request: Request,
): NextResponse {
  const origin = request.headers.get("origin")?.trim();

  if (process.env.NODE_ENV === "development" && origin && LOCAL_DEVELOPMENT_ORIGINS.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.append("Vary", "Origin");
  }

  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, x-ffn-health-secret",
  );
  response.headers.set("Cache-Control", "no-store");

  return response;
}

function createResponse(
  request: Request,
  body: unknown,
  status = 200,
): NextResponse {
  return withCors(NextResponse.json(body, {status}), request);
}

function getSafeStatus(checkedAt: string) {
  const status = getTelegramConfigurationStatus();

  return {
    ok: status.enabled && status.configured,
    ...status,
    checkedAt,
  };
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "");

  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

function isLocalDevelopmentRequest(request: Request): boolean {
  if (process.env.NODE_ENV !== "development") return false;

  const origin = request.headers.get("origin");

  try {
    return isLocalHostname(
      new URL(origin ?? request.url).hostname,
    );
  } catch {
    return false;
  }
}

function secretsMatch(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(received, "utf8");

  return (
    expectedBytes.length === receivedBytes.length &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

function authorizeHealthTest(request: Request):
  | {ok: true}
  | {ok: false; status: 401 | 503; error: string} {
  const configuredSecret =
    process.env.TELEGRAM_HEALTH_CHECK_SECRET;

  if (configuredSecret) {
    const receivedSecret =
      request.headers.get("x-ffn-health-secret") ?? "";

    return secretsMatch(configuredSecret, receivedSecret)
      ? {ok: true}
      : {
          ok: false,
          status: 401,
          error: "No autorizado para ejecutar la prueba de Telegram.",
        };
  }

  return isLocalDevelopmentRequest(request)
    ? {ok: true}
    : {
        ok: false,
        status: 503,
        error: "La prueba remota de Telegram no está habilitada.",
      };
}

export async function GET(
  request: Request,
): Promise<NextResponse> {
  try {
    return createResponse(
      request,
      getSafeStatus(new Date().toISOString()),
    );
  } catch {
    return createResponse(
      request,
      {
        ok: false,
        enabled: false,
        configured: false,
        tokenConfigured: false,
        chatIdConfigured: false,
        deliveryMode: "production",
        externalDispatchesAllowed: false,
        checkedAt: new Date().toISOString(),
        error: "El estado de Telegram no está disponible temporalmente.",
      },
      503,
    );
  }
}

export async function OPTIONS(
  request: Request,
): Promise<NextResponse> {
  return withCors(new NextResponse(null, {status: 204}), request);
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  const checkedAt = new Date().toISOString();

  try {
    const authorization = authorizeHealthTest(request);
    const status = getTelegramConfigurationStatus();

    if (!authorization.ok) {
      return createResponse(
        request,
        {
          ok: false,
          ...status,
          checkedAt,
          error: authorization.error,
        },
        authorization.status,
      );
    }

    if (!status.enabled) {
      return createResponse(request, {
        ok: true,
        ...status,
        checkedAt,
        skipped: true,
      });
    }

    if (!status.configured) {
      return createResponse(
        request,
        {
          ok: false,
          ...status,
          checkedAt,
          error: "La configuración de Telegram está incompleta.",
        },
        503,
      );
    }

    const now = Date.now();
    const elapsed = now - lastHealthTestStartedAt;

    if (elapsed < HEALTH_TEST_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil(
        (HEALTH_TEST_COOLDOWN_MS - elapsed) / 1_000,
      );
      const response = createResponse(
        request,
        {
          ok: false,
          ...status,
          checkedAt,
          error:
            "La prueba de Telegram se ha ejecutado recientemente.",
          retryAfterSeconds,
        },
        429,
      );
      response.headers.set(
        "Retry-After",
        String(retryAfterSeconds),
      );

      return response;
    }

    lastHealthTestStartedAt = now;

    const result = await sendTelegramNotification({
      level: "info",
      title: "Prueba de Telegram",
      message:
        "El canal de notificaciones de FFN3 funciona correctamente.",
      occurredAt: checkedAt,
    });

    if (!result.ok) {
      return createResponse(
        request,
        {
          ok: false,
          ...status,
          checkedAt,
          error:
            result.error ===
            "Telegram agotó el tiempo máximo de respuesta."
              ? result.error
              : "Telegram rechazó el mensaje de prueba.",
        },
        502,
      );
    }

    return createResponse(request, {
      ok: true,
      ...status,
      checkedAt,
      messageId: result.messageId,
      skipped: result.skipped ?? false,
    });
  } catch {
    const status = getTelegramConfigurationStatus();

    return createResponse(
      request,
      {
        ok: false,
        ...status,
        checkedAt,
        error: "No se pudo ejecutar la prueba de Telegram.",
      },
      500,
    );
  }
}
