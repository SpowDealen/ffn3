import assert from "node:assert/strict";
import {
  getTelegramConfigurationStatus,
  sendTelegramNotification,
} from "../app/lib/notifications/telegram";
import {POST as postTelegramNotification} from "../app/api/notifications/telegram/route";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

const environmentKeys = [
  "TELEGRAM_NOTIFICATIONS_ENABLED",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_DELIVERY_MODE",
] as const;

type EnvironmentKey = (typeof environmentKeys)[number];

const originalEnvironment = new Map<EnvironmentKey, string | undefined>(
  environmentKeys.map((key) => [key, process.env[key]]),
);
const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

let assertions = 0;

function equal<T>(actual: T, expected: T, message: string): void {
  assert.equal(actual, expected, message);
  assertions += 1;
}

function restoreEnvironment(): void {
  for (const key of environmentKeys) {
    const value = originalEnvironment.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const notification = {
  level: "success" as const,
  title: "Carga editorial",
  message: "La lectura de la fuente se completó.",
};

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

async function main(): Promise<void> {
  let externalFetchCalls = 0;
  let restoreTransport: (() => void) | undefined;

  try {
    process.env.TELEGRAM_NOTIFICATIONS_ENABLED = "true";
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "test-chat";
    process.env.TELEGRAM_DELIVERY_MODE = "production";
    globalThis.fetch = (async () => {
      externalFetchCalls += 1;
      return new Response(
        JSON.stringify({ok: true, result: {message_id: 42}}),
        {status: 200, headers: {"Content-Type": "application/json"}},
      );
    }) as typeof fetch;

    const production = await sendTelegramNotification(notification);
    equal(production.ok, true, "producción conserva el transporte existente");
    equal(production.deliveryMode, "production", "producción informa su modo");
    equal(production.messageId, 42, "producción conserva el resultado remoto");
    equal(externalFetchCalls, 1, "producción realiza exactamente el dispatch esperado");

    process.env.TELEGRAM_DELIVERY_MODE = "sandbox";
    const sandbox = await sendTelegramNotification(notification);
    equal(sandbox.ok, true, "sandbox acepta el intento");
    equal(sandbox.skipped, true, "sandbox conserva el estado de entrega omitida");
    equal(sandbox.skipReason, "sandbox", "sandbox identifica el motivo seguro");
    equal(sandbox.deliveryMode, "sandbox", "sandbox es observable");
    equal(externalFetchCalls, 1, "sandbox no hace dispatch externo");

    const sandboxStatus = getTelegramConfigurationStatus();
    equal(sandboxStatus.deliveryMode, "sandbox", "health expone sandbox sin secretos");
    equal(sandboxStatus.externalDispatchesAllowed, false, "sandbox bloquea dispatches externos");
    equal(sandboxStatus.configured, true, "sandbox conserva el diagnóstico de configuración");

    process.env.TELEGRAM_DELIVERY_MODE = "noop";
    const noop = await sendTelegramNotification(notification);
    equal(noop.deliveryMode, "sandbox", "noop se normaliza al contrato sandbox");
    equal(noop.skipReason, "sandbox", "noop no crea un segundo pipeline");
    equal(externalFetchCalls, 1, "noop tampoco hace dispatch externo");

    process.env.TELEGRAM_DELIVERY_MODE = "sandbox";
    const routeResponse = await postTelegramNotification(
      new Request("http://localhost/api/notifications/telegram", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(notification),
      }),
    );
    const routePayload = await routeResponse.json() as Record<string, unknown>;
    equal(routeResponse.status, 200, "la ruta conserva una respuesta satisfactoria");
    equal(routePayload.skipped, true, "la ruta conserva el pipeline de entrega omitida");
    equal(routePayload.skipReason, "sandbox", "la ruta expone el motivo seguro");
    equal(routePayload.deliveryMode, "sandbox", "la ruta expone el modo sin secretos");
    equal(externalFetchCalls, 1, "la ruta sandbox no toca Telegram");

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: {localStorage: new MemoryStorage()},
    });
    const store = await import("../_laboratorio/laboratorio-ia/src/notifications/store");
    const callbacks = new Map<number, () => void>();
    let timerId = 0;
    let pipelineCalls = 0;
    globalThis.setTimeout = ((callback: () => void) => {
      const id = ++timerId;
      callbacks.set(id, () => {
        callbacks.delete(id);
        callback();
      });
      return id;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
      callbacks.delete(Number(id));
    }) as typeof clearTimeout;
    restoreTransport = store.setNotificationTransportForTests(async () => {
      pipelineCalls += 1;
      return {
        ok: true,
        skipped: true,
        skipReason: "sandbox",
        deliveryMode: "sandbox",
      };
    });

    const first = store.createNotification({
      ...notification,
      kind: "source",
      groupKey: "sandbox:source",
      channels: {activityCenter: true, telegram: true},
    });
    const grouped = store.createNotification({
      ...notification,
      message: "La lectura se refrescó.",
      kind: "source",
      groupKey: "sandbox:source",
      channels: {activityCenter: true, telegram: true},
    });
    equal(grouped.id, first.id, "dedupe conserva una única actividad");
    equal(callbacks.size, 1, "grouping conserva un único dispatch pendiente");
    callbacks.values().next().value?.();
    await tick();
    const stored = store.getNotifications()[0];
    equal(pipelineCalls, 1, "el pipeline registra un único intento sandbox");
    equal(stored.deliveryStatus, "skipped", "sandbox conserva un delivery state coherente");
    equal(stored.deliverySkipReason, "sandbox", "la métrica local distingue sandbox");
    equal(stored.deliveryAttempts, 1, "sandbox conserva la métrica de intentos");

    await store.retryNotificationDelivery(first.id);
    const retried = store.getNotifications()[0];
    equal(pipelineCalls, 2, "retry reutiliza el mismo pipeline sandbox");
    equal(retried.deliveryStatus, "skipped", "retry sandbox sigue sin enviar externamente");
    equal(retried.deliveryAttempts, 2, "retry conserva el contador de intentos");
    equal(externalFetchCalls, 1, "pipeline local sandbox no provoca red externa");

    process.env.TELEGRAM_DELIVERY_MODE = "production";
    process.env.TELEGRAM_NOTIFICATIONS_ENABLED = "false";
    const disabled = await sendTelegramNotification(notification);
    equal(disabled.skipReason, "disabled", "deshabilitado conserva el comportamiento previo");
    equal(externalFetchCalls, 1, "deshabilitado no envía externamente");

    console.log(
      `AU10 B6.12 Telegram sandbox: OK (${assertions} assertions; production transport preserved, sandbox/noop external dispatches: 0, grouping/retry/delivery state preserved, writes: 0)`,
    );
  } finally {
    restoreTransport?.();
    restoreEnvironment();
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

void main();
