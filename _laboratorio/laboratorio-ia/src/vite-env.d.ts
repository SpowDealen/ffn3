/// <reference types="vite/client" />

import type {testNotificationEngine} from "./notifications/engine/development";
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
      testNotificationEngine: typeof testNotificationEngine;
    };
  }
}

export {};
