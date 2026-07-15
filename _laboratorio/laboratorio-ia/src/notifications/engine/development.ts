import type {LabNotification} from "../types";
import {notificationEngine} from "./engine";

export function testNotificationEngineTelegram(): LabNotification {
  return notificationEngine.notify({
    type: "source.loaded",
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
