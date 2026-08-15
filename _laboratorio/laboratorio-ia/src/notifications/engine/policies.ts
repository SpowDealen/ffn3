import type {
  NotificationEvent,
  NotificationPolicy,
} from "./types";

export function getNotificationGroupKey(
  event: NotificationEvent,
): string | undefined {
  const metadataGroupKey = event.metadata?.groupKey;

  if (
    typeof metadataGroupKey === "string" &&
    metadataGroupKey.trim()
  ) {
    return metadataGroupKey.trim();
  }

  if (event.type !== "source.loaded") return undefined;

  const source = event.source?.trim().toLocaleLowerCase("es-ES");

  return source
    ? `source.loaded:${source}`
    : "source.loaded";
}

export function resolveNotificationPolicy(
  event: NotificationEvent,
): NotificationPolicy {
  switch (event.type) {
    case "source.loaded":
      return {
        group: true,
        groupKey: getNotificationGroupKey(event),
        channels: {
          activityCenter: true,
          telegram: false,
        },
      };

    case "source.failed":
      return {
        group: false,
        channels: {
          activityCenter: true,
          telegram: false,
        },
      };

    case "review.required":
    case "draft.published":
      return {
        group: false,
        channels: {
          activityCenter: true,
          telegram: true,
        },
      };

    case "draft.created":
    case "draft.updated":
    case "telegram.sent":
    case "telegram.failed":
    case "system.info":
      return {
        group: false,
        channels: {
          activityCenter: true,
          telegram: false,
        },
      };
  }
}
