import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  inspectNotification,
  testCriticalNotification,
  testLowNotification,
  testNotificationEngineActivityOnly,
  testNotificationEngineTelegram,
} from "./notifications/engine/development";
import {
  createNotification,
  getNotifications,
  retryNotificationDelivery,
} from "./notifications/store";
import {createAutonomousResolverTestCase, createTestReviewCase, createTestReviewCases, createUniversalEditorTestCase} from "./review/development";
import {applyAutonomousReview, previewAutonomousReview, runAutonomousReview} from "./review/autonomous";
import {applyAutonomousInvestigation, createMissingFightersInvestigationTestCase, previewAutonomousInvestigation, registerMockInvestigationSources, runAutonomousInvestigation, unregisterMockInvestigationSources} from "./review/investigation";
import {buildEditorialAgentPlan, listEditorialCapabilities, runEditorialAgent} from "./review/agent";
import {runReviewEditorialAgent} from "./integrations/reviewEditorialAgentCapabilities";
import {createExternalNewsReviewTestCase, createOrUpdateExternalNewsReviewCase, detectExternalNewsIssues, runExternalNewsReviewPilot} from "./review/producers/externalNews";
import {applyExternalNewsResolutionsPreview, buildExternalNewsResumePreview, createExternalNewsResumeExecutionTestCase, createExternalNewsResumeTestCase, executeExternalNewsResumeWithRegisteredExecutor, registerMockExternalNewsResumeExecutor, unregisterMockExternalNewsResumeExecutor} from "./review/resume/externalNews";
import {
  addReviewResolution,
  clearAllReviewCases,
  createReviewCase,
  getReviewCase,
  getReviewCases,
  transitionReviewCase,
} from "./review/store/reviewStore";

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.LAB_NOTIFICATIONS = {
    createNotification,
    getNotifications,
    retryNotificationDelivery,
    inspectNotification,
    testCriticalNotification,
    testLowNotification,
    testNotificationEngineActivityOnly,
    testNotificationEngineTelegram,
  };
  window.LAB_REVIEWS = {
    getReviewCases,
    getReviewCase,
    createReviewCase,
    transitionReviewCase,
    addReviewResolution,
    clearAllReviewCases,
    createTestCase: createTestReviewCase,
    createTestCases: createTestReviewCases,
    createUniversalEditorTestCase,
    runAutonomousReview,
    previewAutonomousReview,
    applyAutonomousReview,
    createAutonomousResolverTestCase,
    createExternalNewsReviewTestCase,
    detectExternalNewsIssues,
    createExternalNewsReviewCase: createOrUpdateExternalNewsReviewCase,
    runExternalNewsReviewPilot,
    buildExternalNewsResumePreview,
    applyExternalNewsResolutionsPreview,
    createExternalNewsResumeTestCase,
    executeExternalNewsResume: executeExternalNewsResumeWithRegisteredExecutor,
    registerMockExternalNewsResumeExecutor,
    unregisterMockExternalNewsResumeExecutor,
    createExternalNewsResumeExecutionTestCase,
    runAutonomousInvestigation,
    previewAutonomousInvestigation,
    applyAutonomousInvestigation,
    registerMockInvestigationSources,
    unregisterMockInvestigationSources,
    createMissingFightersInvestigationTestCase,
    listEditorialCapabilities,
    buildEditorialAgentPlan,
    runEditorialAgent,
    runReviewEditorialAgent,
  };
}

const container = document.getElementById("root");

if (!container) {
  throw new Error("No se encontró el elemento #root para montar el laboratorio IA.");
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
