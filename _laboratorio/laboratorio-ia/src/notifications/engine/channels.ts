export const NOTIFICATION_CHANNELS = {
  activityCenter: "activityCenter",
  telegram: "telegram",
} as const;

export type NotificationChannelName =
  (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];
