import type {LabNotification} from "../types";
import {notificationEngine} from "./engine";

export function testNotificationEngine(): LabNotification {
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
