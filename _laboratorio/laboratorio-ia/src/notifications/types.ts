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
};

export type CreateNotificationInput = {
  level: NotificationLevel;
  kind?: NotificationKind;
  title: string;
  message: string;
  source?: string;
  count?: number;
  location?: NotificationLocation;
};
