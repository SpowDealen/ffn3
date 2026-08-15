export type NotificationLevel =
  | "success"
  | "review"
  | "error"
  | "info";

export type NotificationLocation = {
  label: string;
  url?: string;
};

export type TelegramDeliveryMode = "production" | "sandbox";
export type TelegramDeliverySkipReason = "disabled" | "sandbox";

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
  skipReason?: TelegramDeliverySkipReason;
  deliveryMode?: TelegramDeliveryMode;
  messageId?: number;
  error?: string;
};

export type TelegramConfigurationStatus = {
  enabled: boolean;
  configured: boolean;
  tokenConfigured: boolean;
  chatIdConfigured: boolean;
  deliveryMode: TelegramDeliveryMode;
  externalDispatchesAllowed: boolean;
};
