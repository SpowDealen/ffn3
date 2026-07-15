import type {LabNotification} from "../types";
import {deliverThroughCurrentNotificationSystem} from "./adapter";
import {normalizeNotificationEvent} from "./normalizer";
import {resolveNotificationPolicy} from "./policies";
import type {NotificationEvent} from "./types";

export const notificationEngine = {
  notify(event: NotificationEvent): LabNotification {
    const normalizedEvent = normalizeNotificationEvent(event);
    const policy = resolveNotificationPolicy(event);

    return deliverThroughCurrentNotificationSystem(
      normalizedEvent,
      policy,
    );
  },
};
