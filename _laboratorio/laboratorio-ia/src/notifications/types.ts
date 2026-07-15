export type NotificationLevel = "success" | "review" | "error";

export type NotificationKind =
  | "analysis"
  | "news"
  | "draft"
  | "event"
  | "fighter"
  | "fight"
  | "organization"
  | "category"
  | "image"
  | "sanity"
  | "source"
  | "system";

export type NotificationLocation = {
  label: string;
  url: string;
};

export type NotificationDeliveryStatus =
  | "pending"
  | "sent"
  | "failed"
  | "skipped";

export type NotificationChannels = {
  activityCenter?: boolean;
  telegram?: boolean;
};

export type NotificationDeliverySkipReason =
  | "policy"
  | "disabled";

export type NotificationPriority =
  | "critical"
  | "high"
  | "normal"
  | "low";

export type LabNotification = {
  id: string;
  level: NotificationLevel;
  kind?: NotificationKind;
  title: string;
  message: string;
  source?: string;
  count?: number;
  createdAt: string;
  read: boolean;
  location?: NotificationLocation;
  deliveryStatus?: NotificationDeliveryStatus;
  deliveryAttempts?: number;
  deliveryError?: string;
  deliveredAt?: string;
  groupKey?: string;
  updatedAt?: string;
  updateCount?: number;
  channels?: NotificationChannels;
  deliverySkipReason?: NotificationDeliverySkipReason;
  priority?: NotificationPriority;
};

export type CreateNotificationInput = {
  level: NotificationLevel;
  kind?: NotificationKind;
  title: string;
  message: string;
  source?: string;
  count?: number;
  location?: NotificationLocation;
  groupKey?: string;
  updatedAt?: string;
  updateCount?: number;
  channels?: NotificationChannels;
  priority?: NotificationPriority;
};
