import {NextResponse} from "next/server";
import {sendTelegramNotification} from "@/app/lib/notifications/telegram";
import type {
  NotificationLevel,
  ServerNotificationInput,
} from "@/app/lib/notifications/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withCors(response: NextResponse): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type",
  );
  response.headers.set("Cache-Control", "no-store");

  return response;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isNotificationLevel(
  value: unknown,
): value is NotificationLevel {
  return (
    value === "success" ||
    value === "review" ||
    value === "error" ||
    value === "info"
  );
}

function parseNotification(
  value: unknown,
): ServerNotificationInput {
  if (!isRecord(value)) {
    throw new Error("La notificación no es válida.");
  }

  const title = getString(value.title);
  const message = getString(value.message);

  if (!title) {
    throw new Error("La notificación necesita title.");
  }

  if (!message) {
    throw new Error("La notificación necesita message.");
  }

  const level = isNotificationLevel(value.level)
    ? value.level
    : "info";

  const location = isRecord(value.location)
    ? {
        label: getString(value.location.label),
        url: getString(value.location.url) || undefined,
      }
    : undefined;

  return {
    level,
    title,
    message,
    source: getString(value.source) || undefined,
    count:
      typeof value.count === "number" &&
      Number.isFinite(value.count)
        ? value.count
        : undefined,
    location:
      location?.label
        ? location
        : undefined,
    occurredAt:
      getString(value.occurredAt) || new Date().toISOString(),
  };
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(
    new NextResponse(null, {
      status: 204,
    }),
  );
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const notification = parseNotification(body);

    const result =
      await sendTelegramNotification(notification);

    if (!result.ok) {
      console.error(
        "[Telegram notification]",
        result.error,
      );

      return withCors(
        NextResponse.json(
          {
            ok: false,
            error:
              result.error ||
              "No se pudo enviar la notificación a Telegram.",
          },
          {
            status: 502,
          },
        ),
      );
    }

    return withCors(
      NextResponse.json({
        ok: true,
        skipped: result.skipped ?? false,
        messageId: result.messageId,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido procesando la notificación.";

    console.error(
      "[Telegram notification route]",
      error,
    );

    return withCors(
      NextResponse.json(
        {
          ok: false,
          error: message,
        },
        {
          status: 400,
        },
      ),
    );
  }
}
