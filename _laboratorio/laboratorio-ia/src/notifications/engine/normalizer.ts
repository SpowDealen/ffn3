import type {
  NormalizedNotificationEvent,
  NotificationEvent,
} from "./types";
import {getNotificationGroupKey} from "./policies";

const EVENT_PRESENTATION = {
  "source.loaded": {level: "success", kind: "source"},
  "source.failed": {level: "error", kind: "source"},
  "review.required": {level: "review", kind: "system"},
  "draft.created": {level: "success", kind: "draft"},
  "draft.updated": {level: "success", kind: "draft"},
  "draft.published": {level: "success", kind: "draft"},
  "telegram.sent": {level: "success", kind: "system"},
  "telegram.failed": {level: "error", kind: "system"},
  "system.info": {level: "success", kind: "system"},
} as const;

export function normalizeNotificationEvent(
  event: NotificationEvent,
): NormalizedNotificationEvent {
  const presentation = EVENT_PRESENTATION[event.type];

  return {
    level: presentation.level,
    kind: presentation.kind,
    groupKey: getNotificationGroupKey(event),
    title: event.title.trim(),
    message: event.message.trim(),
    source: event.source?.trim(),
    count: event.count,
    location: event.location,
  };
}
