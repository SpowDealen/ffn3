import type {
  NotificationKind,
  NotificationLevel,
  NotificationLocation,
  NotificationPriority,
} from "../types";
import type {NotificationChannelName} from "./channels";

export type NotificationEventType =
  | "source.loaded"
  | "source.failed"
  | "review.required"
  | "draft.created"
  | "draft.updated"
  | "draft.published"
  | "telegram.sent"
  | "telegram.failed"
  | "system.info";

export interface NotificationEvent {
  type: NotificationEventType;
  title: string;
  message: string;
  source?: string;
  count?: number;
  location?: NotificationLocation;
  metadata?: Record<string, unknown>;
}

export type NormalizedNotificationEvent = {
  level: NotificationLevel;
  kind: NotificationKind;
  groupKey?: string;
  title: string;
  message: string;
  source?: string;
  count?: number;
  location?: NotificationLocation;
  priority: NotificationPriority;
};

export type {NotificationPriority} from "../types";

export type NotificationPolicy = {
  group: boolean;
  groupKey?: string;
  channels: Record<NotificationChannelName, boolean>;
};

export interface NotificationAudit {
  readonly receivedAt: string;
  readonly eventType: NotificationEventType;
  readonly priority: NotificationPriority;
  readonly channels: Readonly<{
    activityCenter: boolean;
    telegram: boolean;
  }>;
  readonly grouped: boolean;
  readonly groupKey?: string;
  readonly normalizedLevel: string;
  readonly normalizedKind?: string;
  readonly decisions: readonly string[];
}
