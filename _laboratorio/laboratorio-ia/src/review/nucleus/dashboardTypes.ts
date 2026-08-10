import type {KnowledgeValidityState} from "../knowledge";
import type {ReviewCaseStatus, ReviewPriority} from "../types";
import type {CrossCaseGraph, CrossCaseGroup, CrossCaseRelation} from "./crossCaseTypes";
import type {NucleusPrimaryAction, NucleusResolutionState, NucleusRisk, NucleusTimelineEvent} from "./types";

export const GLOBAL_RESOLUTION_DASHBOARD_VERSION = "1.0.0" as const;

export type GlobalDashboardHealth = "healthy" | "attention" | "degraded" | "critical";
export type GlobalDashboardActivityKind = "cases_created" | "decisions" | "transactions" | "reconciliations" | "outcomes" | "knowledge_updates";
export type GlobalDashboardBottleneckKind = "capability_blocked" | "missing_executor" | "repeated_authorization" | "recurring_reconciliation" | "stale_cases" | "unsupported_entity_type" | "shared_conflict" | "shared_blocker";

export type GlobalDashboardFilters = Readonly<{
  status?: ReviewCaseStatus | "all";
  producer?: string | "all";
  entityType?: string | "all";
  severity?: ReviewPriority | "all";
  autonomy?: string | "all";
  risk?: NucleusRisk | "all";
  capability?: string | "all";
  knowledgeState?: KnowledgeValidityState | "all";
}>;

export type GlobalDashboardLimits = Readonly<{priorityCases: number; activity: number; timeline: number; relations: number; bottlenecks: number}>;

export type GlobalDashboardCaseProjection = Readonly<{
  caseId: string;
  caseVersion: number;
  title: string;
  caseStatus: ReviewCaseStatus;
  nucleusState: NucleusResolutionState;
  severity: ReviewPriority;
  producer: string;
  entityType: string;
  autonomy: string;
  risk: NucleusRisk;
  capabilities: readonly string[];
  knowledgeStates: readonly KnowledgeValidityState[];
  action: NucleusPrimaryAction;
  blockers: readonly string[];
  createdAt: string;
  updatedAt: string;
  authorizationRequired: boolean;
  reconciliationRequired: boolean;
  compensationRequired: boolean;
  humanReviewRequired: boolean;
  blocked: boolean;
  stale: boolean;
  unsupported: boolean;
  missingExecutor: boolean;
  knowledge: Readonly<{current: number; underReview: number; contradictory: number; invalidated: number; recommendations: number; recentLearning: number}>;
  timeline: readonly NucleusTimelineEvent[];
  fingerprints: readonly string[];
}>;

export type GlobalDashboardSummary = Readonly<{
  totalCases: number;
  open: number;
  resolved: number;
  blocked: number;
  stale: number;
  unsupported: number;
  authorizationRequired: number;
  reconciliationRequired: number;
  compensationRequired: number;
  humanReviewRequired: number;
  autonomousSafe: number;
  autonomousSupervised: number;
}>;

export type GlobalDashboardHealthIndicator = Readonly<{state: GlobalDashboardHealth; reasonCodes: readonly string[]; safeExplanation: string}>;

export type GlobalDashboardActivityEvent = Readonly<{
  eventId: string;
  kind: GlobalDashboardActivityKind;
  caseId: string;
  caseTitle: string;
  safeSummary: string;
  occurredAt: string;
  fingerprint: string;
}>;

export type GlobalDashboardActivity = Readonly<{counts: Readonly<Record<GlobalDashboardActivityKind, number>>; recent: readonly GlobalDashboardActivityEvent[]}>;

export type GlobalDashboardBottleneck = Readonly<{
  bottleneckId: string;
  kind: GlobalDashboardBottleneckKind;
  severity: "attention" | "degraded" | "critical";
  affectedCaseIds: readonly string[];
  count: number;
  safeCause: string;
  requiredAction: string;
  evidenceFingerprints: readonly string[];
  bottleneckFingerprint: string;
  advisoryOnly: true;
}>;

export type GlobalDashboardCrossCase = Readonly<{
  graphFingerprint: string;
  clusters: readonly CrossCaseGroup[];
  relations: readonly CrossCaseRelation[];
  relatedCaseCount: number;
  sharedBlockerCount: number;
  duplicateCandidateCount: number;
  coordinatedResolutionOpportunities: number;
  advisoryOnly: true;
}>;

export type GlobalDashboardKnowledge = Readonly<{
  current: number;
  underReview: number;
  contradictory: number;
  invalidated: number;
  recommendationsRelevant: number;
  recentLearning: number;
  advisoryOnly: true;
  replacesCurrentEvidence: false;
}>;

export type GlobalDashboardRankingComponents = Readonly<{severity: number; blockingStatus: number; age: number; dependencyImpact: number; crossCaseImpact: number; risk: number; actionRequired: number}>;
export type GlobalDashboardPriorityCase = Readonly<{
  caseId: string;
  title: string;
  state: NucleusResolutionState;
  severity: ReviewPriority;
  actionRequired: string;
  impact: number;
  relatedCases: number;
  blockers: readonly string[];
  components: GlobalDashboardRankingComponents;
  explanation: readonly string[];
  priorityFingerprint: string;
}>;

export type GlobalDashboardTimelineEvent = Readonly<GlobalDashboardActivityEvent & {order: number}>;

export type GlobalDashboardFacets = Readonly<{statuses: readonly string[]; producers: readonly string[]; entityTypes: readonly string[]; severities: readonly string[]; autonomies: readonly string[]; risks: readonly string[]; capabilities: readonly string[]; knowledgeStates: readonly string[]}>;

export type GlobalResolutionDashboardViewModel = Readonly<{
  version: typeof GLOBAL_RESOLUTION_DASHBOARD_VERSION;
  snapshotFingerprint: string;
  dashboardFingerprint: string;
  evaluatedAt: string;
  summary: GlobalDashboardSummary;
  scopedSummary: GlobalDashboardSummary;
  health: GlobalDashboardHealthIndicator;
  filters: GlobalDashboardFilters;
  facets: GlobalDashboardFacets;
  filteredCaseCount: number;
  priorityCases: readonly GlobalDashboardPriorityCase[];
  activity: GlobalDashboardActivity;
  bottlenecks: readonly GlobalDashboardBottleneck[];
  crossCase: GlobalDashboardCrossCase;
  knowledge: GlobalDashboardKnowledge;
  timeline: readonly GlobalDashboardTimelineEvent[];
  limits: GlobalDashboardLimits;
  performance: Readonly<{memoizable: true; outputLimited: true; fullSortComplexity: "O(n log n)"; crossCaseComplexity: "output-sensitive O(signals + relations)"; lazyHeavySections: true; persistsFilters: false}>;
  advisoryOnly: true;
  replacesCurrentEvidence: false;
  presentationOnly: true;
  persistsState: false;
  invokesExecutors: false;
  writes: false;
}>;

export type BuildGlobalResolutionDashboardInput = Readonly<{cases: readonly import("../types").ReviewCase[]; evaluatedAt: string; filters?: GlobalDashboardFilters; limits?: Partial<GlobalDashboardLimits>}>;
export type AssembleGlobalResolutionDashboardInput = Readonly<{projections: readonly GlobalDashboardCaseProjection[]; crossCaseGraph: CrossCaseGraph; evaluatedAt: string; filters?: GlobalDashboardFilters; limits?: Partial<GlobalDashboardLimits>}>;

export const globalResolutionDashboardSecurity = Object.freeze({pure: true, derivesSnapshotsOnly: true, createsStores: false, createsEngines: false, createsPlanners: false, createsExecutors: false, createsSchedulers: false, createsAuthority: false, persistsFilters: false, persistsTimeline: false, accessesSanity: false, accessesNetwork: false, invokesExecutors: false, mutatesCases: false, autoAppliesKnowledge: false, autoExecutes: false, exposesPayloads: false, exposesTokens: false, advisoryOnly: true, replacesCurrentEvidence: false, writes: false} as const);
