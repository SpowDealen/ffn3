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
import type {createAutonomousResolverTestCase, createTestReviewCase, createTestReviewCases, createUniversalEditorTestCase} from "./review/development";
import type {applyAutonomousReview, previewAutonomousReview, runAutonomousReview} from "./review/autonomous";
import type {applyAutonomousInvestigation, createMissingFightersInvestigationTestCase, previewAutonomousInvestigation, registerMockInvestigationSources, runAutonomousInvestigation, unregisterMockInvestigationSources} from "./review/investigation";
import type {createExternalNewsReviewTestCase, createOrUpdateExternalNewsReviewCase, detectExternalNewsIssues, runExternalNewsReviewPilot} from "./review/producers/externalNews";
import type {applyExternalNewsResolutionsPreview, buildExternalNewsResumePreview, createExternalNewsResumeExecutionTestCase, createExternalNewsResumeTestCase, executeExternalNewsResumeWithRegisteredExecutor, registerMockExternalNewsResumeExecutor, unregisterMockExternalNewsResumeExecutor} from "./review/resume/externalNews";
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
      runAutonomousReview: typeof runAutonomousReview;
      previewAutonomousReview: typeof previewAutonomousReview;
      applyAutonomousReview: typeof applyAutonomousReview;
      createAutonomousResolverTestCase: typeof createAutonomousResolverTestCase;
      createExternalNewsReviewTestCase: typeof createExternalNewsReviewTestCase;
      detectExternalNewsIssues: typeof detectExternalNewsIssues;
      createExternalNewsReviewCase: typeof createOrUpdateExternalNewsReviewCase;
      runExternalNewsReviewPilot: typeof runExternalNewsReviewPilot;
      buildExternalNewsResumePreview: typeof buildExternalNewsResumePreview;
      applyExternalNewsResolutionsPreview: typeof applyExternalNewsResolutionsPreview;
      createExternalNewsResumeTestCase: typeof createExternalNewsResumeTestCase;
      executeExternalNewsResume: typeof executeExternalNewsResumeWithRegisteredExecutor;
      registerMockExternalNewsResumeExecutor: typeof registerMockExternalNewsResumeExecutor;
      unregisterMockExternalNewsResumeExecutor: typeof unregisterMockExternalNewsResumeExecutor;
      createExternalNewsResumeExecutionTestCase: typeof createExternalNewsResumeExecutionTestCase;
      runAutonomousInvestigation: typeof runAutonomousInvestigation;
      previewAutonomousInvestigation: typeof previewAutonomousInvestigation;
      applyAutonomousInvestigation: typeof applyAutonomousInvestigation;
      registerMockInvestigationSources: typeof registerMockInvestigationSources;
      unregisterMockInvestigationSources: typeof unregisterMockInvestigationSources;
      createMissingFightersInvestigationTestCase: typeof createMissingFightersInvestigationTestCase;
    };
  }
}

export {};
