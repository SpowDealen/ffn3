import assert from "node:assert/strict";
import {calculateDeliveryMetrics, calculateTelegramDeliveryHealth} from "../_laboratorio/laboratorio-ia/src/notifications/metrics";
import type {LabNotification} from "../_laboratorio/laboratorio-ia/src/notifications/types";
import {isPublicTelegramButtonUrl, sendTelegramNotification} from "../app/lib/notifications/telegram";

const storageKey = "ffn3-lab-notifications-v1";
class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
  snapshot() { return new Map(this.values); }
  restore(snapshot: Map<string, string>) { this.values = new Map(snapshot); }
}

const storage = new MemoryStorage();
const fakeWindow = {localStorage: storage};
Object.defineProperty(globalThis, "window", {value: fakeWindow, configurable: true, writable: true});

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));
const input = (overrides: Record<string, unknown> = {}) => ({
  level: "success" as const,
  kind: "source" as const,
  title: "Fuente cargada",
  message: "Contenido disponible",
  channels: {activityCenter: true, telegram: true},
  priority: "low" as const,
  ...overrides,
});

async function main() {
  const store = await import("../_laboratorio/laboratorio-ia/src/notifications/store");
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChat = process.env.TELEGRAM_CHAT_ID;
  const originalEnabled = process.env.TELEGRAM_NOTIFICATIONS_ENABLED;
  const originalConsoleError = console.error;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let restoreTransport: () => void = () => {};
  try {
    console.error = () => undefined;
    storage.setItem(storageKey, "{corrupt");
    assert.deepEqual(store.getNotifications(), [], "localStorage corrupto debe degradar a vacío");
    storage.clear();

    const skipped = store.createNotification(input({channels: {activityCenter: true, telegram: false}}));
    assert.equal(skipped.deliveryStatus, "skipped");
    assert.equal(skipped.deliveryAttempts, 0);
    const serialized = storage.getItem(storageKey)!;
    assert.deepEqual(JSON.parse(serialized), store.getNotifications());
    const snapshot = storage.snapshot();
    storage.clear();
    storage.restore(snapshot);
    assert.equal(store.getNotifications()[0].id, skipped.id, "recarga conserva identidad");
    assert.equal(storage.getItem(storageKey), serialized, "recarga es idempotente");

    store.clearNotifications();
    const timerCallbacks = new Map<number, () => void>();
    let timerId = 0;
    globalThis.setTimeout = ((callback: () => void) => { const id = ++timerId; timerCallbacks.set(id, () => { timerCallbacks.delete(id); callback(); }); return id; }) as typeof setTimeout;
    globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => { timerCallbacks.delete(Number(id)); }) as typeof clearTimeout;
    const deliveries: Array<(value: {ok: true; skipped?: boolean} | {ok: false; error: string}) => void> = [];
    restoreTransport = store.setNotificationTransportForTests(() => new Promise((resolve) => deliveries.push(resolve)));
    const first = store.createNotification(input({groupKey: "source:ufc", count: 1}));
    const second = store.createNotification(input({groupKey: "source:ufc", count: 2}));
    assert.equal(first.id, second.id);
    assert.equal(second.updateCount, 1);
    assert.equal(timerCallbacks.size, 1, "debounce conserva un solo timer");
    timerCallbacks.values().next().value?.();
    assert.equal(deliveries.length, 1);
    const third = store.createNotification(input({groupKey: "source:ufc", count: 3}));
    assert.equal(third.updateCount, 2);
    deliveries[0]({ok: true});
    await tick();
    assert.equal(store.getNotifications()[0].deliveryStatus, "pending", "respuesta antigua no pisa versión nueva");
    assert.equal(store.getNotifications()[0].deliveryAttempts, 0);
    timerCallbacks.values().next().value?.();
    deliveries[1]({ok: true, skipped: true});
    await tick();
    assert.equal(store.getNotifications()[0].deliveryStatus, "skipped");
    assert.equal(store.getNotifications()[0].deliveryAttempts, 1);
    assert.equal(store.getNotifications()[0].updateCount, 2);
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    restoreTransport();

    store.clearNotifications();
    restoreTransport = store.setNotificationTransportForTests(async () => ({ok: false, error: "controlled_failure"}));
    const failed = store.createNotification(input({groupKey: undefined}));
    await tick();
    assert.equal(store.getNotifications()[0].deliveryStatus, "failed");
    assert.equal(store.getNotifications()[0].deliveryAttempts, 1);
    assert.equal(store.getNotifications()[0].deliveryError, "controlled_failure");
    restoreTransport();
    restoreTransport = store.setNotificationTransportForTests(async () => ({ok: true}));
    await store.retryNotificationDelivery(failed.id);
    const retried = store.getNotifications()[0];
    assert.equal(retried.deliveryStatus, "sent");
    assert.equal(retried.deliveryAttempts, 2);
    assert.equal(retried.deliveryError, undefined);
    assert.ok(retried.deliveredAt);

    const fixture: LabNotification[] = [
      retried,
      {...retried, id: "failed", deliveryStatus: "failed", deliveryError: "last failure", updatedAt: "2026-07-18T12:00:00.000Z", deliveredAt: undefined},
      {...retried, id: "pending", deliveryStatus: "pending", deliveredAt: undefined},
      {...retried, id: "skipped", deliveryStatus: "skipped", updateCount: 3},
    ];
    assert.deepEqual(calculateDeliveryMetrics(fixture), {sent: 1, failed: 1, pending: 1, skipped: 1, grouped: 1, critical: 0, high: 0, normal: 0, low: 4});
    assert.equal(calculateTelegramDeliveryHealth([]).channelStatus, "Sin datos");
    assert.equal(calculateTelegramDeliveryHealth([retried]).channelStatus, "Operativo");
    const health = calculateTelegramDeliveryHealth(fixture);
    assert.equal(health.channelStatus, "Con incidencias");
    assert.equal(health.successRate, 50);
    assert.notEqual(health.averageDeliveryMs, null);
    assert.equal(health.latestFailedAt, "2026-07-18T12:00:00.000Z");
    assert.equal(health.latestFailureError, "last failure");

    for (const url of ["http://localhost:5173/", "http://127.0.0.1/", "http://10.0.0.1/", "http://192.168.1.2/", "file:///tmp/a"]) assert.equal(isPublicTelegramButtonUrl(url), false);
    assert.equal(isPublicTelegramButtonUrl("https://ffn3.example/review/1"), true);
    process.env.TELEGRAM_NOTIFICATIONS_ENABLED = "true";
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "test-chat";
    let telegramBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_url, options) => {
      telegramBody = JSON.parse(String(options?.body));
      return new Response(JSON.stringify({ok: true, result: {message_id: 1}}), {status: 200, headers: {"Content-Type": "application/json"}});
    }) as typeof fetch;
    const sent = await sendTelegramNotification({level: "review", title: "Revisión segura", message: "El texto debe conservarse", location: {label: "Laboratorio", url: "http://localhost:5173/"}});
    assert.equal(sent.ok, true);
    assert.match(String(telegramBody?.text), /El texto debe conservarse/);
    assert.equal(telegramBody?.reply_markup, undefined, "botón privado debe eliminarse");

    console.log(`Phase 6C notifications summary: ${JSON.stringify({persistence: true, corruptFallback: true, grouping: true, debounce: true, staleResponseRejected: true, retry: true, transitions: ["pending", "sent", "failed", "skipped"], metrics: true, health: true, privateUrlsRejected: true, realTelegramCalls: 0, realBrowserStorageWrites: 0})}`);
    console.log("Phase 6C notification regression tests: OK");
  } finally {
    restoreTransport();
    store.clearNotifications();
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
    if (originalChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = originalChat;
    if (originalEnabled === undefined) delete process.env.TELEGRAM_NOTIFICATIONS_ENABLED;
    else process.env.TELEGRAM_NOTIFICATIONS_ENABLED = originalEnabled;
    console.error = originalConsoleError;
    Reflect.deleteProperty(globalThis, "window");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
