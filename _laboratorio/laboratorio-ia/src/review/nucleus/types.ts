import type {KnowledgeCenterViewModel} from "../knowledge";
import type {ReviewCase, ReviewPriority} from "../types";

export const NUCLEUS_RESOLUTION_VERSION = "1.0.0" as const;

export type NucleusResolutionState = "idle" | "analyzing" | "investigating" | "resolving_identity" | "planning" | "awaiting_authorization" | "executing" | "observing" | "reconciliation_required" | "compensation_required" | "human_review_required" | "blocked" | "completed" | "stale" | "unsupported";
export type NucleusPrimaryActionKind = "analyze" | "investigate" | "resolve_identity" | "generate_strategy" | "continue" | "authorize" | "reconcile" | "compensate" | "human_review" | "regenerate" | "finish" | "none";
export type NucleusActionClass = "read_only" | "pure_transform" | "external_effect" | "human_decision";
export type NucleusRisk = "low" | "medium" | "high" | "destructive";

export type NucleusAuthorityFacts = Readonly<{
  supported: boolean;
  stale: boolean;
  hasAnalysis: boolean;
  analyzing: boolean;
  investigating: boolean;
  identityResolved: boolean;
  planReady: boolean;
  authorizationPending: boolean;
  transactionRequired: boolean;
  transactionStarted: boolean;
  transactionExecuting: boolean;
  transactionCompleted: boolean;
  observing: boolean;
  reconciliationPending: boolean;
  compensationPending: boolean;
  humanReviewPending: boolean;
  blocked: boolean;
  caseMarkedResolved: boolean;
  evidenceSufficient: boolean;
  contradiction: boolean;
  strategyCompleted: boolean;
  outcomeVerifiable: boolean;
}>;

export type NucleusPrimaryAction = Readonly<{
  kind: NucleusPrimaryActionKind;
  label: string;
  actionClass: NucleusActionClass;
  risk: NucleusRisk;
  target: "evidence" | "resolution" | "execution" | "knowledge" | "history" | "case" | "none";
  reasonCodes: readonly string[];
  enabled: boolean;
}>;

export type NucleusTimelineEvent = Readonly<{
  id: string;
  order: number;
  kind: string;
  label: string;
  safeSummary: string;
  occurredAt?: string;
  fingerprint: string;
}>;

export type NucleusCompletion = Readonly<{
  eligible: boolean;
  completed: boolean;
  gates: Readonly<{
    supported: boolean;
    freshContext: boolean;
    evidenceSufficient: boolean;
    noContradiction: boolean;
    identityResolved: boolean;
    strategyCompleted: boolean;
    transactionCompletedOrNotRequired: boolean;
    noReconciliation: boolean;
    noCompensation: boolean;
    noAuthorization: boolean;
    noBlocker: boolean;
    outcomeVerifiable: boolean;
  }>;
  blockers: readonly string[];
}>;

export type NucleusResolutionViewModel = Readonly<{
  version: typeof NUCLEUS_RESOLUTION_VERSION;
  caseId: string;
  caseVersion: number;
  state: NucleusResolutionState;
  severity: ReviewPriority;
  progress: Readonly<{completed: number; total: number; percent: number}>;
  primaryAction: NucleusPrimaryAction;
  facts: NucleusAuthorityFacts;
  case: Readonly<{title: string; problem: string; pendingIssues: number; resolvedIssues: number}>;
  evidence: Readonly<{status: "sufficient" | "partial" | "insufficient" | "contradictory" | "stale" | "unavailable"; safeSummary: string; sourceCount: number; contradictionCount: number; fingerprints: readonly string[]}>
  identity: Readonly<{resolved: boolean; pending: number; safeSummary: string}>;
  resolution: Readonly<{status: string; reuse: number; create: number; investigate: number; blockers: readonly string[]; fingerprint?: string}>;
  autonomy: Readonly<{visibility: "Autónomo seguro" | "Autónomo supervisado" | "Requiere autorización" | "Requiere humano" | "Bloqueado"; risk: NucleusRisk; reasonCodes: readonly string[]}>;
  strategy: Readonly<{status: string; stepCount: number; completed: boolean; fingerprint?: string}>;
  execution: Readonly<{state: string; completed: number; total: number; incidents: number; authorization: number; reconciliation: number; compensation: number; fingerprint?: string}>;
  knowledge: Readonly<{availability: KnowledgeCenterViewModel["availability"]; relevant: number; recommendations: number; conflicts: number; feedback: number; advisoryOnly: true; currentEvidencePrevails: true}>;
  completion: NucleusCompletion;
  completionSummary: Readonly<{problem: string; corrected: number; reused: number; created: number; validated: number; executed: number; learned: number; unsupported: readonly string[]}>;
  timeline: readonly NucleusTimelineEvent[];
  unsupported: readonly string[];
  reasonCodes: readonly string[];
  fingerprints: readonly string[];
  sourceAuthorities: readonly ["AU2", "AU3", "AU4", "AU5", "AU6", "AU7", "AU8", "AU9"];
  presentationOnly: true;
  persistsState: false;
  invokesExecutors: false;
  writes: false;
}>;

export type BuildNucleusResolutionInput = Readonly<{reviewCase: ReviewCase; evaluatedAt?: string}>;

export const nucleusResolutionSecurity = Object.freeze({pure: true, presentationOnly: true, createsEngines: false, createsPlanners: false, createsExecutors: false, createsStores: false, persistsState: false, accessesSanity: false, accessesNetwork: false, invokesExecutors: false, bypassesAuthorization: false, autoAppliesKnowledge: false, exposesPayloads: false, exposesTokens: false, exposesRawErrors: false, exposesChainOfThought: false, writes: false} as const);
