import type {AutonomousEditorialDecision, EditorialEvidenceSufficiencyEvaluation} from "../editorialDecision";
import type {AutonomyPolicyResult} from "../editorialDecision/autonomy";
import type {AutonomousResolutionStrategy} from "../editorialDecision/strategy";
import type {AutonomousSupervisedLoopResult} from "../editorialDecision/supervisedLoop";
import type {GlobalResolutionReconciliationAssessment} from "../globalResolution/reconciliation";
import type {DecisionOutcomeRecord} from "../outcomes";
import type {PersistedTransactionRecoveryResult, UniversalTransactionPlan} from "../transactions";
import type {KnowledgeConsolidationResult, KnowledgeExtractionResult} from "./extractionTypes";
import type {KnowledgeGovernanceResult} from "./governanceTypes";
import type {GovernedKnowledgeRetrievalResult} from "./retrievalTypes";
import type {KnowledgeFingerprint} from "./types";

export const LEARNING_FEEDBACK_LOOP_VERSION = "1.0.0" as const;

export type FeedbackStatus = "confirmed_success" | "confirmed_failure" | "partial_success" | "contradicted" | "superseded" | "uncertain" | "no_learning";
export type LearningClassification = "reinforce" | "weaken" | "contradict" | "invalidate" | "supersede" | "no_change" | "under_review";
export type FeedbackPart = "decision" | "strategy" | "execution" | "reconciliation";
export type FeedbackPartVerdict = "correct" | "incorrect" | "partial" | "unverified" | "not_applicable";

export type FeedbackPartAssessment = Readonly<{
  part: FeedbackPart;
  verdict: FeedbackPartVerdict;
  referenceFingerprint?: KnowledgeFingerprint;
  reasonCodes: readonly string[];
  assessmentFingerprint: KnowledgeFingerprint;
}>;

export type FeedbackRecord = Readonly<{
  schemaVersion: typeof LEARNING_FEEDBACK_LOOP_VERSION;
  feedbackId: string;
  caseId: string;
  caseVersion: number;
  status: FeedbackStatus;
  classification: LearningClassification;
  decisionFingerprint: KnowledgeFingerprint;
  sufficiencyFingerprint: KnowledgeFingerprint;
  autonomyFingerprint: KnowledgeFingerprint;
  strategyFingerprint: KnowledgeFingerprint;
  transactionFingerprint: KnowledgeFingerprint;
  outcomeFingerprint: KnowledgeFingerprint;
  reconciliationFingerprint?: KnowledgeFingerprint;
  loopFingerprint?: KnowledgeFingerprint;
  knowledgeFingerprints: readonly KnowledgeFingerprint[];
  parts: readonly FeedbackPartAssessment[];
  reasonCodes: readonly string[];
  observedAt: string;
  feedbackFingerprint: KnowledgeFingerprint;
  learningEligible: boolean;
  outcomeAuthorityConfirmed: boolean;
  advisoryOnly: true;
  requiresCurrentEvidence: true;
  replacesCurrentEvidence: false;
}>;

export type LearningObservation = Readonly<{
  observationId: string;
  feedbackId: string;
  feedbackFingerprint: KnowledgeFingerprint;
  type: "positive" | "negative" | "mixed" | "safety_review" | "no_learning";
  classification: LearningClassification;
  outcomeFingerprint: KnowledgeFingerprint;
  knowledgeObservationFingerprint?: KnowledgeFingerprint;
  extractionFingerprint?: KnowledgeFingerprint;
  reasonCodes: readonly string[];
  observedAt: string;
  observationFingerprint: KnowledgeFingerprint;
  learningEligible: boolean;
  createsPolicy: false;
  elevatesAuthority: false;
  advisoryOnly: true;
  requiresCurrentEvidence: true;
  replacesCurrentEvidence: false;
}>;

export type LearningKnowledgeContext = Readonly<{
  governance?: KnowledgeGovernanceResult;
  retrieval?: GovernedKnowledgeRetrievalResult;
  targetKnowledgeIds?: readonly string[];
  supersededByKnowledgeId?: string;
}>;

export type LearningFeedbackInput = Readonly<{
  caseVersion: number;
  decision: AutonomousEditorialDecision;
  sufficiency: EditorialEvidenceSufficiencyEvaluation;
  autonomy: AutonomyPolicyResult;
  strategy: AutonomousResolutionStrategy;
  transaction: UniversalTransactionPlan;
  transactionRecovery?: PersistedTransactionRecoveryResult;
  outcome: DecisionOutcomeRecord;
  reconciliation?: readonly GlobalResolutionReconciliationAssessment[];
  loop?: AutonomousSupervisedLoopResult;
  knowledge?: LearningKnowledgeContext;
  temporal?: Readonly<{validFrom: string; validUntil?: string}>;
}>;

export type LearningFeedbackResult = Readonly<{
  schemaVersion: typeof LEARNING_FEEDBACK_LOOP_VERSION;
  feedback: FeedbackRecord;
  observations: readonly LearningObservation[];
  extraction?: KnowledgeExtractionResult;
  consolidation?: KnowledgeConsolidationResult;
  governance?: KnowledgeGovernanceResult;
  replayDeduplicated: boolean;
  resultFingerprint: KnowledgeFingerprint;
  advisoryOnly: true;
  requiresCurrentEvidence: true;
  replacesCurrentEvidence: false;
  modifiesFutureDecisions: false;
  createsPolicy: false;
  autoAppliesRecommendations: false;
  writes: false;
}>;

export const learningFeedbackSecurity = Object.freeze({
  pure: true,
  deterministic: true,
  versioned: true,
  requiresRealOutcome: true,
  requiresReconciliationWhenUncertain: true,
  learnsFromSimulation: false,
  learnsFromUnexecutedDecision: false,
  learnsFromStaleTransaction: false,
  createsPolicy: false,
  elevatesKnowledgeAuthority: false,
  modifiesFutureDecisions: false,
  createsMemoryEngine: false,
  createsStores: false,
  launchesPlanners: false,
  invokesExecutors: false,
  launchesSchedulers: false,
  createsParallelRuntime: false,
  accessesSanity: false,
  accessesNetwork: false,
  autoAppliesRecommendations: false,
  persists: false,
  writes: false,
  storesPayloads: false,
  storesSecrets: false,
  advisoryOnly: true,
  requiresCurrentEvidence: true,
  replacesCurrentEvidence: false,
} as const);
