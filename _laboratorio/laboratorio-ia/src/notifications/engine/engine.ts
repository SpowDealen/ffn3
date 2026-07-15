import type {LabNotification} from "../types";
import {deliverThroughCurrentNotificationSystem} from "./adapter";
import {normalizeNotificationEvent} from "./normalizer";
import {resolveNotificationPolicy} from "./policies";
import {resolveNotificationPriority} from "./priority";
import type {NotificationEvent} from "./types";

export const notificationEngine = {
  notify(event: NotificationEvent): LabNotification {
    const priority = resolveNotificationPriority(event);
    const normalizedEvent = normalizeNotificationEvent(
      event,
      priority,
    );
    const policy = resolveNotificationPolicy(event);

    return deliverThroughCurrentNotificationSystem(
      normalizedEvent,
      policy,
    );
  },
};
