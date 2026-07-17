import React from "react";
import ReactDOM from "react-dom/client";
import LaboratoryApp from "./app/LaboratoryApp";
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
import {executePreparedEntityMaterialization, previewPreparedEntityMaterialization, registerMockEntityCreationExecutor, runPreparedEntityAgent, unregisterMockEntityCreationExecutor} from "./review/materialization";
import {applyPreparedEntityEnrichment, createSchemaRequirementTestCase, inspectPreparedEntityRequirements, previewPreparedEntityEnrichment, runPreparedEntityRequirementAgent} from "./review/schemaRequirements";
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
import {exportOutcomeLedger, getOutcomeById, getOutcomeEvents, getOutcomeRecords, getOutcomesForCase, reconcileOutcome, validateOutcomeStore} from "./review/outcomes";
import {exportDecisionMemory, getConfirmedMemories, getContestedMemoryClusters, getDecisionMemories, getDecisionMemory, getDecisionMemoryById, getDecisionMemoriesForCase, getDecisionMemoriesForOutcome, getDecisionMemoryCluster, getDecisionMemoryClusters, getInvalidMemories, getMemoriesForCase, getMemoryClusters, getMemoryEvents, getRejectedMemories, getReusableMemoryCandidates, importDecisionMemoriesFromOutcomes, importExistingOutcomesToMemory, reconcileAllMemories, reconcileDecisionMemory, reconcileMemory, validateDecisionMemoryStore} from "./review/memory";
import {buildDecisionRetrievalQuery, clearDecisionRetrievalHistory, exportDecisionRetrieval, getRetrievalResult as getDecisionRetrievalResult, getRetrievalResults as getDecisionRetrievalResults, getRetrievalResultsForCase as getDecisionRetrievalResultsForCase, getRetrievalResultsForIssue as getDecisionRetrievalResultsForIssue, reconcileDecisionRetrieval, retrieveRelevantDecisionMemories, validateDecisionRetrievalStore} from "./review/retrieval";

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
    runReviewEditorialAgent: async (caseId: string) => {
      return runReviewEditorialAgent(caseId);
    },
    previewPreparedEntityMaterialization,
    executePreparedEntityMaterialization,
    registerMockEntityCreationExecutor,
    unregisterMockEntityCreationExecutor,
    runPreparedEntityAgent,
    inspectPreparedEntityRequirements,
    runPreparedEntityRequirementAgent,
    previewPreparedEntityEnrichment,
    applyPreparedEntityEnrichment,
    createSchemaRequirementTestCase,
    getOutcomeRecords,
    getOutcomeById,
    getOutcomesForCase,
    getOutcomeEvents,
    reconcileOutcome,
    validateOutcomeStore,
    exportOutcomeLedger,
    getDecisionMemories,
    getDecisionMemoryById,
    getMemoriesForCase,
    getMemoryEvents,
    getMemoryClusters,
    getConfirmedMemories,
    getRejectedMemories,
    getInvalidMemories,
    getReusableMemoryCandidates,
    getContestedMemoryClusters,
    reconcileMemory,
    reconcileAllMemories,
    validateDecisionMemoryStore,
    exportDecisionMemory,
    importExistingOutcomesToMemory,
    getDecisionMemory,
    getDecisionMemoriesForCase,
    getDecisionMemoriesForOutcome,
    getDecisionMemoryClusters,
    getDecisionMemoryCluster,
    reconcileDecisionMemory,
    importDecisionMemoriesFromOutcomes,
    buildDecisionRetrievalQuery,
    retrieveRelevantDecisionMemories,
    getDecisionRetrievalResults,
    getDecisionRetrievalResult,
    getDecisionRetrievalResultsForCase,
    getDecisionRetrievalResultsForIssue,
    validateDecisionRetrievalStore,
    reconcileDecisionRetrieval,
    exportDecisionRetrieval,
    clearDecisionRetrievalHistory,
  };
}

const container = document.getElementById("root");

if (!container) {
  throw new Error("No se encontró el elemento #root para montar el laboratorio IA.");
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <LaboratoryApp />
  </React.StrictMode>
);
