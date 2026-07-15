/// <reference types="vite/client" />

import type {
  createNotification,
  getNotifications,
  retryNotificationDelivery,
} from "./notifications/store";

declare global {
  interface Window {
    LAB_NOTIFICATIONS?: {
      createNotification: typeof createNotification;
      getNotifications: typeof getNotifications;
      retryNotificationDelivery: typeof retryNotificationDelivery;
    };
  }
}

export {};
