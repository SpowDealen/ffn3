export type NotificationLevel =
  | "success"
  | "review"
  | "error"
  | "info";

export type NotificationLocation = {
  label: string;
  url?: string;
};

export type ServerNotificationInput = {
  level: NotificationLevel;
  title: string;
  message: string;
  source?: string;
  count?: number;
  location?: NotificationLocation;
  occurredAt?: string;
};

export type TelegramSendResult = {
  ok: boolean;
  skipped?: boolean;
  messageId?: number;
  error?: string;
};
