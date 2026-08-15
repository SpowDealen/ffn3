import type {LabNotification} from "../types";
import {getNotifications} from "../store";
import {notificationEngine} from "./engine";
import type {NotificationAudit} from "./types";

export function inspectNotification(
  id: string,
): NotificationAudit | null {
  return (
    getNotifications().find(
      (notification) => notification.id === id,
    )?.audit ?? null
  );
}

export function testNotificationEngineTelegram(): LabNotification {
  return notificationEngine.notify({
    type: "draft.published",
    title: "Motor NIE",
    message: "Primera notificación generada por el motor",
    source: "UFC",
    count: 12,
    metadata: {
      groupKey: "dev-nie-source-loaded",
    },
  });
}

export function testNotificationEngineActivityOnly(): LabNotification {
  return notificationEngine.notify({
    type: "draft.created",
    title: "Motor NIE · Solo actividad",
    message: "Notificación local sin envío a Telegram",
    source: "Laboratorio",
    count: 1,
  });
}

export function testCriticalNotification(): LabNotification {
  return notificationEngine.notify({
    type: "telegram.failed",
    title: "Motor NIE · Prioridad crítica",
    message: "Prueba manual de resolución de prioridad crítica",
    source: "Telegram",
    location: {
      label: "Diagnóstico de Telegram",
      url: "http://localhost:5173/",
    },
  });
}

export function testLowNotification(): LabNotification {
  return notificationEngine.notify({
    type: "source.loaded",
    title: "Motor NIE · Lectura local",
    message: "Prueba manual de una lectura que no entrega por Telegram",
    source: "UFC",
    count: 12,
    metadata: {
      groupKey: "dev-nie-priority-low",
    },
  });
}
