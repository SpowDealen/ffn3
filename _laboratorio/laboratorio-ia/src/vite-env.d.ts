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
import type {buildEditorialAgentPlan, listEditorialCapabilities, runEditorialAgent} from "./review/agent";
import type {runReviewEditorialAgent} from "./integrations/reviewEditorialAgentCapabilities";
import type {executePreparedEntityMaterialization, previewPreparedEntityMaterialization, registerMockEntityCreationExecutor, runPreparedEntityAgent, unregisterMockEntityCreationExecutor} from "./review/materialization";
import type {applyPreparedEntityEnrichment, createSchemaRequirementTestCase, inspectPreparedEntityRequirements, previewPreparedEntityEnrichment, runPreparedEntityRequirementAgent} from "./review/schemaRequirements";
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
import type {exportOutcomeLedger, getOutcomeById, getOutcomeEvents, getOutcomeRecords, getOutcomesForCase, reconcileOutcome, validateOutcomeStore} from "./review/outcomes";
import type {exportDecisionMemory, getConfirmedMemories, getContestedMemoryClusters, getDecisionMemories, getDecisionMemory, getDecisionMemoryById, getDecisionMemoriesForCase, getDecisionMemoriesForOutcome, getDecisionMemoryCluster, getDecisionMemoryClusters, getInvalidMemories, getMemoriesForCase, getMemoryClusters, getMemoryEvents, getRejectedMemories, getReusableMemoryCandidates, importDecisionMemoriesFromOutcomes, importExistingOutcomesToMemory, reconcileAllMemories, reconcileDecisionMemory, reconcileMemory, validateDecisionMemoryStore} from "./review/memory";

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
      listEditorialCapabilities: typeof listEditorialCapabilities;
      buildEditorialAgentPlan: typeof buildEditorialAgentPlan;
      runEditorialAgent: typeof runEditorialAgent;
      runReviewEditorialAgent: typeof runReviewEditorialAgent;
      previewPreparedEntityMaterialization: typeof previewPreparedEntityMaterialization;
      executePreparedEntityMaterialization: typeof executePreparedEntityMaterialization;
      registerMockEntityCreationExecutor: typeof registerMockEntityCreationExecutor;
      unregisterMockEntityCreationExecutor: typeof unregisterMockEntityCreationExecutor;
      runPreparedEntityAgent: typeof runPreparedEntityAgent;
      inspectPreparedEntityRequirements: typeof inspectPreparedEntityRequirements;
      runPreparedEntityRequirementAgent: typeof runPreparedEntityRequirementAgent;
      previewPreparedEntityEnrichment: typeof previewPreparedEntityEnrichment;
      applyPreparedEntityEnrichment: typeof applyPreparedEntityEnrichment;
      createSchemaRequirementTestCase: typeof createSchemaRequirementTestCase;
      getOutcomeRecords: typeof getOutcomeRecords;
      getOutcomeById: typeof getOutcomeById;
      getOutcomesForCase: typeof getOutcomesForCase;
      getOutcomeEvents: typeof getOutcomeEvents;
      reconcileOutcome: typeof reconcileOutcome;
      validateOutcomeStore: typeof validateOutcomeStore;
      exportOutcomeLedger: typeof exportOutcomeLedger;
      getDecisionMemories: typeof getDecisionMemories;
      getDecisionMemoryById: typeof getDecisionMemoryById;
      getMemoriesForCase: typeof getMemoriesForCase;
      getMemoryEvents: typeof getMemoryEvents;
      getMemoryClusters: typeof getMemoryClusters;
      getConfirmedMemories: typeof getConfirmedMemories;
      getRejectedMemories: typeof getRejectedMemories;
      getInvalidMemories: typeof getInvalidMemories;
      getReusableMemoryCandidates: typeof getReusableMemoryCandidates;
      getContestedMemoryClusters: typeof getContestedMemoryClusters;
      reconcileMemory: typeof reconcileMemory;
      reconcileAllMemories: typeof reconcileAllMemories;
      validateDecisionMemoryStore: typeof validateDecisionMemoryStore;
      exportDecisionMemory: typeof exportDecisionMemory;
      importExistingOutcomesToMemory: typeof importExistingOutcomesToMemory;
      getDecisionMemory: typeof getDecisionMemory;
      getDecisionMemoriesForCase: typeof getDecisionMemoriesForCase;
      getDecisionMemoriesForOutcome: typeof getDecisionMemoriesForOutcome;
      getDecisionMemoryClusters: typeof getDecisionMemoryClusters;
      getDecisionMemoryCluster: typeof getDecisionMemoryCluster;
      reconcileDecisionMemory: typeof reconcileDecisionMemory;
      importDecisionMemoriesFromOutcomes: typeof importDecisionMemoriesFromOutcomes;
    };
  }
}

export {};
