import type {
  CreateNotificationInput,
  LabNotification,
  NotificationChannels,
} from "./types";
import {
  sendLabNotificationToTelegram,
  type RemoteNotificationResult,
} from "./remote";

const STORAGE_KEY = "ffn3-lab-notifications-v1";
const MAX_NOTIFICATIONS = 100;
const GROUP_DELIVERY_DEBOUNCE_MS = 1_500;

const listeners = new Set<() => void>();
const groupedDeliveryTimers = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

type ResolvedNotificationChannels = {
  activityCenter: boolean;
  telegram: boolean;
};

function resolveNotificationChannels(
  channels: NotificationChannels | undefined,
): ResolvedNotificationChannels {
  return {
    activityCenter: channels?.activityCenter ?? true,
    telegram: channels?.telegram ?? true,
  };
}

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

function updateNotificationById(
  id: string,
  update: (notification: LabNotification) => LabNotification,
): LabNotification | undefined {
  const notifications = getNotifications();
  const index = notifications.findIndex(
    (notification) => notification.id === id,
  );

  if (index === -1) return undefined;

  const updatedNotification = update(notifications[index]);
  const updatedNotifications = [...notifications];
  updatedNotifications[index] = updatedNotification;
  saveNotifications(updatedNotifications);

  return updatedNotification;
}

function findNotificationIndexByGroupKey(
  notifications: LabNotification[],
  groupKey: string,
): number {
  return notifications.findIndex(
    (notification) => notification.groupKey === groupKey,
  );
}

function resetNotificationDelivery(
  notification: LabNotification,
  telegramEnabled: boolean,
  timestamp: string,
): LabNotification {
  if (!telegramEnabled) {
    return {
      ...notification,
      deliveryStatus: "skipped",
      deliveryAttempts: 0,
      deliveryError: undefined,
      deliveredAt: timestamp,
      deliverySkipReason: "policy",
    };
  }

  return {
    ...notification,
    deliveryStatus: "pending",
    deliveryAttempts: 0,
    deliveryError: undefined,
    deliveredAt: undefined,
    deliverySkipReason: undefined,
  };
}

function updateGroupedNotification(
  notification: LabNotification,
  input: CreateNotificationInput,
  groupKey: string,
  updatedAt: string,
  channels: ResolvedNotificationChannels,
): LabNotification {
  return resetNotificationDelivery(
    {
      ...notification,
      level: input.level,
      kind: input.kind,
      title: input.title.trim(),
      message: input.message.trim(),
      source: input.source?.trim(),
      count: input.count,
      location: input.location,
      groupKey,
      updatedAt,
      updateCount: (notification.updateCount ?? 0) + 1,
      channels: input.channels,
    },
    channels.telegram,
    updatedAt,
  );
}

function getNotificationVersion(
  notification: LabNotification,
): string {
  return `${notification.updatedAt ?? notification.createdAt}:${notification.updateCount ?? 0}`;
}

function applyDeliveryResult(
  id: string,
  version: string,
  result: RemoteNotificationResult,
): void {
  updateNotificationById(id, (notification) => {
    if (getNotificationVersion(notification) !== version) {
      return notification;
    }

    if (!resolveNotificationChannels(notification.channels).telegram) {
      return notification;
    }

    const deliveryAttempts =
      (notification.deliveryAttempts ?? 0) + 1;

    if (!result.ok) {
      return {
        ...notification,
        deliveryStatus: "failed",
        deliveryAttempts,
        deliveryError: result.error,
        deliveredAt: undefined,
        deliverySkipReason: undefined,
      };
    }

    return {
      ...notification,
      deliveryStatus: result.skipped
        ? "skipped"
        : "sent",
      deliveryAttempts,
      deliveryError: undefined,
      deliveredAt: new Date().toISOString(),
      deliverySkipReason: result.skipped
        ? "disabled"
        : undefined,
    };
  });
}

async function executeNotificationDelivery(
  notification: LabNotification,
): Promise<void> {
  if (!resolveNotificationChannels(notification.channels).telegram) {
    return;
  }

  const result =
    await sendLabNotificationToTelegram(notification);
  applyDeliveryResult(
    notification.id,
    getNotificationVersion(notification),
    result,
  );
}

function cancelGroupedNotificationDelivery(
  groupKey: string | undefined,
): void {
  if (!groupKey) return;

  const timer = groupedDeliveryTimers.get(groupKey);

  if (timer === undefined) return;

  clearTimeout(timer);
  groupedDeliveryTimers.delete(groupKey);
}

function scheduleGroupedNotificationDelivery(
  notification: LabNotification,
): void {
  const groupKey = notification.groupKey;

  if (!groupKey) {
    void executeNotificationDelivery(notification);
    return;
  }

  cancelGroupedNotificationDelivery(groupKey);

  const timer = setTimeout(() => {
    groupedDeliveryTimers.delete(groupKey);

    const currentNotification = getNotifications().find(
      (storedNotification) =>
        storedNotification.id === notification.id &&
        storedNotification.groupKey === groupKey,
    );

    if (!currentNotification) return;
    if (
      !resolveNotificationChannels(
        currentNotification.channels,
      ).telegram
    ) {
      return;
    }

    void executeNotificationDelivery(currentNotification);
  }, GROUP_DELIVERY_DEBOUNCE_MS);

  groupedDeliveryTimers.set(groupKey, timer);
}

function startNotificationDelivery(
  notification: LabNotification,
  channels: ResolvedNotificationChannels,
): void {
  if (!channels.telegram) {
    cancelGroupedNotificationDelivery(notification.groupKey);
    return;
  }

  if (!channels.activityCenter && notification.groupKey) {
    void executeNotificationDelivery(notification);
    return;
  }

  scheduleGroupedNotificationDelivery(notification);
}

export function createNotification(
  rawInput: CreateNotificationInput,
): LabNotification {
  const input = validateNotification(rawInput);
  const groupKey = input.groupKey?.trim() || undefined;
  const channels = resolveNotificationChannels(input.channels);
  const notifications = getNotifications();

  if (groupKey && channels.activityCenter) {
    const groupedIndex = findNotificationIndexByGroupKey(
      notifications,
      groupKey,
    );

    if (groupedIndex !== -1) {
      const notification = updateGroupedNotification(
        notifications[groupedIndex],
        input,
        groupKey,
        new Date().toISOString(),
        channels,
      );
      const updatedNotifications = [...notifications];
      updatedNotifications[groupedIndex] = notification;
      saveNotifications(updatedNotifications);
      startNotificationDelivery(notification, channels);

      return notification;
    }
  }

  const createdAt = new Date().toISOString();
  const notification = resetNotificationDelivery(
    {
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
      createdAt,
      read: false,
      groupKey,
      updateCount: groupKey ? 0 : undefined,
      channels: input.channels,
    },
    channels.telegram,
    createdAt,
  );

  if (channels.activityCenter) {
    saveNotifications([
      notification,
      ...notifications,
    ]);
  }

  startNotificationDelivery(notification, channels);

  return notification;
}

export async function retryNotificationDelivery(
  id: string,
): Promise<void> {
  const existingNotification = getNotifications().find(
    (notification) => notification.id === id,
  );

  if (!existingNotification) return;

  const channels = resolveNotificationChannels(
    existingNotification.channels,
  );

  cancelGroupedNotificationDelivery(
    existingNotification.groupKey,
  );

  if (!channels.telegram) {
    updateNotificationById(id, (currentNotification) => ({
      ...currentNotification,
      deliveryStatus: "skipped",
      deliveryAttempts: 0,
      deliveryError: undefined,
      deliveredAt:
        currentNotification.deliveredAt ??
        new Date().toISOString(),
      deliverySkipReason: "policy",
    }));
    return;
  }

  const notification = updateNotificationById(
    id,
    (currentNotification) => ({
      ...currentNotification,
      deliveryStatus: "pending",
      deliveryError: undefined,
      deliverySkipReason: undefined,
    }),
  );

  if (!notification) return;

  await executeNotificationDelivery(notification);
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
  for (const timer of groupedDeliveryTimers.values()) {
    clearTimeout(timer);
  }

  groupedDeliveryTimers.clear();
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
