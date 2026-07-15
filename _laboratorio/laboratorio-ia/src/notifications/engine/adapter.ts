import {createNotification} from "../store";
import type {LabNotification} from "../types";
import type {
  NormalizedNotificationEvent,
  NotificationPolicy,
} from "./types";

export function deliverThroughCurrentNotificationSystem(
  notification: NormalizedNotificationEvent,
  policy: NotificationPolicy,
): LabNotification {
  return createNotification({
    ...notification,
    groupKey: policy.group
      ? policy.groupKey ?? notification.groupKey
      : undefined,
  });
}
