import type {
  LabNotification,
  NotificationLevel,
} from "./types";
import {apiUrl, getApiBaseUrl} from "../lib/apiUrl";

type RemoteNotificationInput = {
  level: NotificationLevel;
  title: string;
  message: string;
  source?: string;
  count?: number;
  location?: {
    label: string;
    url?: string;
  };
  occurredAt?: string;
};

export type RemoteNotificationResult =
  | {
      ok: true;
      skipped?: boolean;
      skipReason?: "disabled" | "sandbox";
      deliveryMode?: "production" | "sandbox";
      messageId?: number;
    }
  | {
      ok: false;
      error: string;
      status?: number;
    };

export {getApiBaseUrl};

export async function sendRemoteNotification(
  notification: RemoteNotificationInput,
): Promise<RemoteNotificationResult> {
  try {
    const response = await fetch(
      apiUrl("/api/notifications/telegram"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(notification),
      },
    );

    if (!response.ok) {
      const payload = (await response
        .json()
        .catch(() => null)) as {
          error?: string;
        } | null;

      return {
        ok: false,
        error:
          payload?.error ||
          `El servidor de notificaciones respondió con HTTP ${response.status}.`,
        status: response.status,
      };
    }

    const payload = (await response.json()) as {
      skipped?: boolean;
      skipReason?: unknown;
      deliveryMode?: unknown;
      messageId?: number;
    };

    return {
      ok: true,
      skipped: payload.skipped,
      skipReason:
        payload.skipReason === "sandbox" || payload.skipReason === "disabled"
          ? payload.skipReason
          : undefined,
      deliveryMode:
        payload.deliveryMode === "sandbox" || payload.deliveryMode === "production"
          ? payload.deliveryMode
          : undefined,
      messageId: payload.messageId,
    };
  } catch (error) {
    /*
     * Telegram nunca debe bloquear la acción principal del laboratorio.
     * El fallo se devuelve al caller, pero no invalida la acción ya creada.
     */
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido enviando la notificación remota.",
    };
  }
}

function toRemoteNotificationInput(
  notification: LabNotification,
): RemoteNotificationInput {
  return {
    level: notification.level,
    title: notification.title,
    message: notification.message,
    source: notification.source,
    count: notification.count,
    location: notification.location,
    occurredAt: notification.createdAt,
  };
}

export function sendLabNotificationToTelegram(
  notification: LabNotification,
): Promise<RemoteNotificationResult> {
  return sendRemoteNotification(
    toRemoteNotificationInput(notification),
  );
}
