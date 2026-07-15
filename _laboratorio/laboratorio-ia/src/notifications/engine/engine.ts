import type {LabNotification} from "../types";
import {deliverThroughCurrentNotificationSystem} from "./adapter";
import {buildNotificationAudit} from "./audit";
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
    const audit = buildNotificationAudit(
      event,
      priority,
      normalizedEvent,
      policy,
    );

    return deliverThroughCurrentNotificationSystem(
      normalizedEvent,
      policy,
      audit,
    );
  },
};
