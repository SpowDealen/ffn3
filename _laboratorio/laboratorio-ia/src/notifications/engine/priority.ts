import type {NotificationPriority} from "../types";
import type {NotificationEvent} from "./types";

export function resolveNotificationPriority(
  event: NotificationEvent,
): NotificationPriority {
  switch (event.type) {
    case "telegram.failed":
    case "source.failed":
      return "critical";

    case "review.required":
      return "high";

    case "draft.published":
    case "telegram.sent":
      return "normal";

    case "source.loaded":
    case "draft.created":
    case "draft.updated":
    case "system.info":
      return "low";
  }
}
