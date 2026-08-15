import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {notificationEngine, resolveNotificationPolicy} from "../_laboratorio/laboratorio-ia/src/notifications/engine";
import {notifyEventsLoaded, notifyReadError, notifySourceLoaded} from "../_laboratorio/laboratorio-ia/src/notifications/notify";
import {clearNotifications, createNotification, getNotifications, retryNotificationDelivery, setNotificationTransportForTests} from "../_laboratorio/laboratorio-ia/src/notifications/store";
import {universalEditorialKnowledgeSecurity, universalTransactionSecurity} from "../_laboratorio/laboratorio-ia/src/review";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
  get length(): number { return this.values.size; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
}

let assertions = 0;
const equal = <T>(actual: T, expected: T): void => { assert.equal(actual, expected); assertions += 1; };
const check = (value: unknown): void => { assert.ok(value); assertions += 1; };
const tick = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

async function main(): Promise<void> {
  Object.defineProperty(globalThis, "window", {value: {localStorage: new MemoryStorage()}, configurable: true, writable: true});
  let calls = 0;
  const restoreTransport = setNotificationTransportForTests(async () => {
    calls += 1;
    return calls === 2 ? {ok: false, error: "controlled"} : {ok: true};
  });

  try {
    clearNotifications();
    notifySourceLoaded({source: "UFC", count: 8});
    notifySourceLoaded({source: "UFC", count: 9}); // refresh uses the same read boundary
    notifyEventsLoaded({source: "BKFC", count: 2});
    notifyReadError({source: "Reference entities", action: "cargar referencias", message: "backend_unavailable", location: {label: "Laboratorio", url: "http://localhost:5173/"}});
    notifyReadError({source: "UFC", action: "cargar las noticias", message: "source_unavailable", location: {label: "Laboratorio", url: "http://localhost:5173/"}});
    await tick();

    equal(calls, 0);
    check(getNotifications().every((entry) => entry.channels?.telegram === false));
    check(getNotifications().every((entry) => entry.deliveryStatus === "skipped"));
    equal(resolveNotificationPolicy({type: "source.loaded", title: "x", message: "x"}).channels.telegram, false);
    equal(resolveNotificationPolicy({type: "source.failed", title: "x", message: "x"}).channels.telegram, false);
    equal(resolveNotificationPolicy({type: "draft.published", title: "x", message: "x"}).channels.telegram, true);

    clearNotifications();
    const legitimate = notificationEngine.notify({type: "draft.published", title: "Borrador publicado", message: "Evento explícito", source: "editor"});
    await tick();
    equal(calls, 1);
    equal(getNotifications()[0].id, legitimate.id);
    equal(getNotifications()[0].deliveryStatus, "sent");

    const failed = createNotification({level: "review", kind: "draft", title: "Reintento manual", message: "Evento de dominio", location: {label: "Laboratorio", url: "http://localhost:5173/"}, channels: {activityCenter: true, telegram: true}});
    await tick();
    equal(getNotifications().find((entry) => entry.id === failed.id)?.deliveryStatus, "failed");
    await retryNotificationDelivery(failed.id);
    equal(getNotifications().find((entry) => entry.id === failed.id)?.deliveryStatus, "sent");
    equal(calls, 3);

    equal(universalTransactionSecurity.invokesExecutors, false);
    equal(universalEditorialKnowledgeSecurity.replacesCurrentEvidence, false);

    const panel = readFileSync("_laboratorio/laboratorio-ia/src/components/PanelIA.tsx", "utf8");
    equal((panel.match(/notifyReadError\(/g) ?? []).length, 6);
    const health = readFileSync("_laboratorio/laboratorio-ia/src/notifications/telegramHealth.ts", "utf8");
    check(health.includes('apiUrl("/api/notifications/telegram/health")'));
    check(!health.includes("sendRemoteNotification"));

    console.log(`AU10 B6.2 source-load notification boundary: OK (${assertions} assertions; reads stay local, domain events retain policy, dedupe/retry and AU7/AU9 boundaries intact; real Telegram writes: 0)`);
  } finally {
    restoreTransport();
    clearNotifications();
    Reflect.deleteProperty(globalThis, "window");
  }
}

void main();
