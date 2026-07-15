import {createNotification} from "../store";
import type {LabNotification} from "../types";
import type {
  NormalizedNotificationEvent,
  NotificationAudit,
  NotificationPolicy,
} from "./types";

export function deliverThroughCurrentNotificationSystem(
  notification: NormalizedNotificationEvent,
  policy: NotificationPolicy,
  audit: NotificationAudit,
): LabNotification {
  return createNotification({
    ...notification,
    groupKey: policy.group
      ? policy.groupKey ?? notification.groupKey
      : undefined,
    channels: policy.channels,
    audit,
  });
}
