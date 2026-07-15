import type {
  LabNotification,
  NotificationLevel,
} from "./types";

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

function getApiBaseUrl(): string {
  const raw =
    import.meta.env.VITE_FFN3_API_BASE_URL;

  if (
    typeof raw !== "string" ||
    !raw.trim()
  ) {
    return "http://localhost:3000";
  }

  return raw.trim().replace(/\/+$/, "");
}

export async function sendRemoteNotification(
  notification: RemoteNotificationInput,
): Promise<void> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/notifications/telegram`,
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

      console.error(
        "[Telegram notification]",
        payload?.error ||
          `HTTP ${response.status}`,
      );
    }
  } catch (error) {
    /*
     * Telegram nunca debe bloquear la acción principal del laboratorio.
     * Un fallo remoto se registra, pero no invalida un borrador ya creado.
     */
    console.error(
      "[Telegram notification]",
      error,
    );
  }
}

export function sendLabNotificationToTelegram(
  notification: LabNotification,
): void {
  void sendRemoteNotification({
    level: notification.level,
    title: notification.title,
    message: notification.message,
    source: notification.source,
    count: notification.count,
    location: notification.location,
    occurredAt: notification.createdAt,
  });
}
