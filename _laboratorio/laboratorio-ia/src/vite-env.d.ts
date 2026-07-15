/// <reference types="vite/client" />

import type {
  getNotifications,
  retryNotificationDelivery,
} from "./notifications/store";

declare global {
  interface Window {
    LAB_NOTIFICATIONS?: {
      getNotifications: typeof getNotifications;
      retryNotificationDelivery: typeof retryNotificationDelivery;
    };
  }
}

export {};
