import {formatTelegramNotification} from "./formatter";
import type {
  ServerNotificationInput,
  TelegramConfigurationStatus,
  TelegramSendResult,
} from "./types";

type TelegramApiResponse = {
  ok?: boolean;
  description?: string;
  result?: {
    message_id?: number;
  };
};

function isTelegramEnabled(): boolean {
  return (
    process.env.TELEGRAM_NOTIFICATIONS_ENABLED !==
    "false"
  );
}

export function getTelegramConfigurationStatus(): TelegramConfigurationStatus {
  const enabled = isTelegramEnabled();
  const tokenConfigured = Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim(),
  );
  const chatIdConfigured = Boolean(
    process.env.TELEGRAM_CHAT_ID?.trim(),
  );

  return {
    enabled,
    configured: tokenConfigured && chatIdConfigured,
    tokenConfigured,
    chatIdConfigured,
  };
}

function getTelegramConfiguration(): {
  token: string;
  chatId: string;
} | null {
  const token =
    process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chatId =
    process.env.TELEGRAM_CHAT_ID?.trim() ?? "";

  if (!token || !chatId) {
    return null;
  }

  return {
    token,
    chatId,
  };
}

function isPrivateIpv4Address(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);

  if (
    octets.length !== 4 ||
    octets.some(
      (octet) =>
        !Number.isInteger(octet) ||
        octet < 0 ||
        octet > 255,
    )
  ) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function isPublicTelegramButtonUrl(
  value: string,
): boolean {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();

    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) {
      return false;
    }

    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "[::1]" ||
      isPrivateIpv4Address(hostname)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function getButtonLabel(
  notification: ServerNotificationInput,
): string {
  if (notification.level === "error") {
    return "🚨 Revisar error";
  }

  if (notification.level === "review") {
    return "⚠️ Abrir revisión";
  }

  if (
    notification.location?.label
      .toLowerCase()
      .includes("sanity")
  ) {
    return "📄 Abrir en Sanity";
  }

  return "🔗 Abrir ubicación";
}

function buildReplyMarkup(
  notification: ServerNotificationInput,
):
  | {
      inline_keyboard: Array<
        Array<{
          text: string;
          url: string;
        }>
      >;
    }
  | undefined {
  const url = notification.location?.url;

  if (!url || !isPublicTelegramButtonUrl(url)) {
    return undefined;
  }

  return {
    inline_keyboard: [
      [
        {
          text: getButtonLabel(notification),
          url,
        },
      ],
    ],
  };
}

export async function sendTelegramNotification(
  notification: ServerNotificationInput,
): Promise<TelegramSendResult> {
  if (!isTelegramEnabled()) {
    return {
      ok: true,
      skipped: true,
    };
  }

  const configuration =
    getTelegramConfiguration();

  if (!configuration) {
    return {
      ok: false,
      error:
        "Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en las variables de entorno.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    12_000,
  );

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${configuration.token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          chat_id: configuration.chatId,
          text:
            formatTelegramNotification(notification),
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup:
            buildReplyMarkup(notification),
        }),
        signal: controller.signal,
        cache: "no-store",
      },
    );

    const payload =
      (await response.json()) as TelegramApiResponse;

    if (!response.ok || payload.ok !== true) {
      return {
        ok: false,
        error:
          payload.description ||
          `Telegram respondió con HTTP ${response.status}.`,
      };
    }

    return {
      ok: true,
      messageId: payload.result?.message_id,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.name === "AbortError"
            ? "Telegram agotó el tiempo máximo de respuesta."
            : error.message
          : "Error desconocido enviando la notificación a Telegram.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
