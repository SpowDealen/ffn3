import type {
  CreateNotificationInput,
  LabNotification,
} from "./types";
import {sendLabNotificationToTelegram} from "./remote";

const STORAGE_KEY = "ffn3-lab-notifications-v1";
const MAX_NOTIFICATIONS = 100;

const listeners = new Set<() => void>();

function canUseBrowser(): boolean {
  return typeof window !== "undefined";
}

function emitChange(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error(
        "[FFN3 notifications] Error actualizando un suscriptor.",
        error,
      );
    }
  }
}

function validateNotification(
  input: CreateNotificationInput,
): CreateNotificationInput {
  if (
    (input.level === "review" || input.level === "error") &&
    (!input.location?.label || !input.location?.url)
  ) {
    throw new Error(
      "Las notificaciones de revisión o error deben indicar dónde localizar el problema.",
    );
  }

  return input;
}

export function getNotifications(): LabNotification[] {
  if (!canUseBrowser()) return [];

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (!stored) return [];

    const parsed = JSON.parse(stored) as unknown;

    if (!Array.isArray(parsed)) return [];

    return parsed as LabNotification[];
  } catch (error) {
    console.error(
      "[FFN3 notifications] No se pudo leer el historial.",
      error,
    );

    return [];
  }
}

function saveNotifications(
  notifications: LabNotification[],
): void {
  if (!canUseBrowser()) return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        notifications.slice(0, MAX_NOTIFICATIONS),
      ),
    );
  } catch (error) {
    console.error(
      "[FFN3 notifications] No se pudo guardar el historial.",
      error,
    );
  }

  // Actualización inmediata dentro de la misma pestaña.
  emitChange();
}

export function createNotification(
  rawInput: CreateNotificationInput,
): LabNotification {
  const input = validateNotification(rawInput);

  const notification: LabNotification = {
    id:
      typeof crypto !== "undefined" &&
      "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()
            .toString(16)
            .slice(2)}`,
    level: input.level,
    kind: input.kind,
    title: input.title.trim(),
    message: input.message.trim(),
    source: input.source?.trim(),
    count: input.count,
    location: input.location,
    createdAt: new Date().toISOString(),
    read: false,
  };

  saveNotifications([
    notification,
    ...getNotifications(),
  ]);

  sendLabNotificationToTelegram(notification);

  return notification;
}

export function markNotificationAsRead(
  id: string,
): void {
  saveNotifications(
    getNotifications().map((notification) =>
      notification.id === id
        ? {...notification, read: true}
        : notification,
    ),
  );
}

export function markAllNotificationsAsRead(): void {
  saveNotifications(
    getNotifications().map((notification) => ({
      ...notification,
      read: true,
    })),
  );
}

export function clearNotifications(): void {
  saveNotifications([]);
}

export function subscribeToNotifications(
  listener: () => void,
): () => void {
  listeners.add(listener);

  if (!canUseBrowser()) {
    return () => {
      listeners.delete(listener);
    };
  }

  function handleStorage(event: StorageEvent): void {
    if (event.key === STORAGE_KEY) {
      listener();
    }
  }

  function handleFocus(): void {
    listener();
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === "visible") {
      listener();
    }
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener("focus", handleFocus);
  document.addEventListener(
    "visibilitychange",
    handleVisibilityChange,
  );

  return () => {
    listeners.delete(listener);

    window.removeEventListener(
      "storage",
      handleStorage,
    );
    window.removeEventListener(
      "focus",
      handleFocus,
    );
    document.removeEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );
  };
}
