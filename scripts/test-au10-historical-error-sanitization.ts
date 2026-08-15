import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  presentHistoricalEditorialCopy,
  presentTelegramDeliveryFailure,
} from "../_laboratorio/laboratorio-ia/src/lib/editorialReadError";

const storageKey = "ffn3-lab-notifications-v1";

class MemoryStorage {
  private values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  value: {localStorage: storage},
  configurable: true,
  writable: true,
});

const tick = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

async function main(): Promise<void> {
  let assertions = 0;
  const equal = <T>(actual: T, expected: T, message?: string): void => {
    assert.equal(actual, expected, message);
    assertions += 1;
  };
  const check = (value: unknown, message?: string): void => {
    assert.ok(value, message);
    assertions += 1;
  };

  const historicalNetwork = "Failed to fetch";
  equal(
    presentHistoricalEditorialCopy(historicalNetwork),
    "No se pudo conectar con el servicio editorial.",
  );
  equal(
    presentHistoricalEditorialCopy("NetworkError: request failed"),
    "No se pudo conectar con el servicio editorial.",
  );
  equal(
    presentHistoricalEditorialCopy("HTTP 500 Internal Server Error"),
    "El servicio no está disponible temporalmente.",
  );
  equal(
    presentHistoricalEditorialCopy("AbortError: timeout"),
    "El servicio editorial tardó demasiado en responder.",
  );
  equal(
    presentHistoricalEditorialCopy("La fuente requiere revisión manual."),
    "La fuente requiere revisión manual.",
    "el copy editorial de dominio no debe cambiar",
  );
  equal(
    presentTelegramDeliveryFailure(historicalNetwork),
    "No se pudo completar la entrega por Telegram.",
  );
  equal(historicalNetwork, "Failed to fetch", "el valor raw no se reescribe");

  const store = await import("../_laboratorio/laboratorio-ia/src/notifications/store");
  let restoreTransport = store.setNotificationTransportForTests(async () => ({
    ok: false as const,
    error: historicalNetwork,
  }));

  try {
    const failed = store.createNotification({
      level: "error",
      kind: "system",
      title: historicalNetwork,
      message: historicalNetwork,
      location: {label: "Actividad", url: "/activity"},
      channels: {activityCenter: true, telegram: true},
    });
    await tick();

    const persistedFailure = store.getNotifications().find(
      (notification) => notification.id === failed.id,
    );
    equal(persistedFailure?.deliveryStatus, "failed");
    equal(persistedFailure?.deliveryError, historicalNetwork);
    equal(
      presentHistoricalEditorialCopy(persistedFailure?.message),
      "No se pudo conectar con el servicio editorial.",
    );
    equal(
      presentTelegramDeliveryFailure(persistedFailure?.deliveryError),
      "No se pudo completar la entrega por Telegram.",
    );
    check(
      JSON.parse(storage.getItem(storageKey) ?? "[]")[0].deliveryError === historicalNetwork,
      "el detalle técnico debe permanecer en el historial persistido",
    );

    restoreTransport();
    restoreTransport = store.setNotificationTransportForTests(async () => ({ok: true as const}));
    await store.retryNotificationDelivery(failed.id);
    const retried = store.getNotifications().find(
      (notification) => notification.id === failed.id,
    );
    equal(retried?.deliveryStatus, "sent", "el reintento manual debe conservarse");
    equal(retried?.deliveryError, undefined);

    const groupedFirst = store.createNotification({
      level: "success",
      title: "Carga editorial",
      message: "Entrada de dominio",
      groupKey: "historical-sanitization",
      channels: {activityCenter: true, telegram: false},
    });
    const groupedSecond = store.createNotification({
      level: "success",
      title: "Carga editorial",
      message: "Entrada actualizada",
      groupKey: "historical-sanitization",
      channels: {activityCenter: true, telegram: false},
    });
    equal(groupedFirst.id, groupedSecond.id, "la deduplicación debe conservarse");
  } finally {
    restoreTransport();
    store.clearNotifications();
    Reflect.deleteProperty(globalThis, "window");
  }

  const activity = readFileSync(
    "_laboratorio/laboratorio-ia/src/notifications/ActivityCenter.tsx",
    "utf8",
  );
  const bell = readFileSync(
    "_laboratorio/laboratorio-ia/src/notifications/NotificationBell.tsx",
    "utf8",
  );
  const delivery = readFileSync(
    "_laboratorio/laboratorio-ia/src/notifications/NotificationDeliveryStatus.tsx",
    "utf8",
  );
  check(activity.includes("presentHistoricalEditorialCopy(notification.message)"));
  check(activity.includes("presentTelegramDeliveryFailure("));
  check(!activity.includes("title={telegramHealth.latestFailureError}"));
  check(bell.includes("presentHistoricalEditorialCopy(notification.message)"));
  check(delivery.includes("presentTelegramDeliveryFailure("));

  console.log(
    `AU10 B6.9 historical error sanitization: OK (${assertions} assertions; safe presentation, preserved diagnostics, delivery/retry/dedupe intact and real writes: 0)`,
  );
}

void main();
