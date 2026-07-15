/// <reference types="vite/client" />

import type {
  inspectNotification,
  testCriticalNotification,
  testLowNotification,
  testNotificationEngineActivityOnly,
  testNotificationEngineTelegram,
} from "./notifications/engine/development";
import type {
  createNotification,
  getNotifications,
  retryNotificationDelivery,
} from "./notifications/store";
import type {createTestReviewCase, createTestReviewCases, createUniversalEditorTestCase} from "./review/development";
import type {
  addReviewResolution,
  clearAllReviewCases,
  createReviewCase,
  getReviewCase,
  getReviewCases,
  transitionReviewCase,
} from "./review/store/reviewStore";

declare global {
  interface Window {
    LAB_NOTIFICATIONS?: {
      createNotification: typeof createNotification;
      getNotifications: typeof getNotifications;
      retryNotificationDelivery: typeof retryNotificationDelivery;
      inspectNotification: typeof inspectNotification;
      testCriticalNotification: typeof testCriticalNotification;
      testLowNotification: typeof testLowNotification;
      testNotificationEngineActivityOnly: typeof testNotificationEngineActivityOnly;
      testNotificationEngineTelegram: typeof testNotificationEngineTelegram;
    };
    LAB_REVIEWS?: {
      getReviewCases: typeof getReviewCases;
      getReviewCase: typeof getReviewCase;
      createReviewCase: typeof createReviewCase;
      transitionReviewCase: typeof transitionReviewCase;
      addReviewResolution: typeof addReviewResolution;
      clearAllReviewCases: typeof clearAllReviewCases;
      createTestCase: typeof createTestReviewCase;
      createTestCases: typeof createTestReviewCases;
      createUniversalEditorTestCase: typeof createUniversalEditorTestCase;
    };
  }
}

export {};
