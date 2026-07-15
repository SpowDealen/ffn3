/// <reference types="vite/client" />

import type {
  testNotificationEngineActivityOnly,
  testNotificationEngineTelegram,
} from "./notifications/engine/development";
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
      testNotificationEngineActivityOnly: typeof testNotificationEngineActivityOnly;
      testNotificationEngineTelegram: typeof testNotificationEngineTelegram;
    };
  }
}

export {};
