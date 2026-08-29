import type {AgentAuthorityOwner, AgentSnapshot} from "../agent-ready/model";

export const AGENT_REASONING_CONTRACT_VERSION = "ag1-observation-reasoning/1" as const;

export type AgentObservationEntity = "operator_signal" | "process" | "review" | "dependency" | "capability" | "notification";
export type AgentObservationEventType =
  | "blocker_added"
  | "blocker_resolved"
  | "process_added"
  | "process_finished"
  | "review_pending"
  | "review_resolved"
  | "dependency_degraded"
  | "dependency_recovered"
  | "capability_available"
  | "capability_blocked"
  | "priority_changed"
  | "temporal_changed";
export type AgentObservationSeverity = "critical" | "high" | "medium" | "low" | "info";
export type AgentDiagnosisConfidence = "low" | "medium" | "high";
export type AgentProposalAuthority = "Notification Store" | "Review Center" | "AU7" | "AU8" | "LES 4 live checks" | "Process origin" | "UI navigation" | "Existing authority";
export type AgentReevaluationTarget =
  | "notification_delivery"
  | "global_status"
  | "review_case"
  | "process_state"
  | "dependencies"
  | "transaction_result"
  | "checkpoint"
  | "reconciliation"
  | "supervised_loop_state"
  | "observed_effects"
  | "operator_signals"
  | "capability_availability";

export type AgentObservationValue = Readonly<{
  entity: AgentObservationEntity;
  id: string;
  state?: string;
  priority?: string;
  temporal?: "current" | "recent" | "historical";
  authorityOwner?: AgentAuthorityOwner;
  destination?: string;
  reasonCode?: string;
  evidenceReferences?: readonly string[];
  checkpointId?: string;
  checkpointFingerprint?: string;
  transactionId?: string;
  supervisedLoopId?: string;
  requiresAuthorization?: boolean;
  destructive?: boolean;
}>;

export type AgentObservationEvent = Readonly<{
  id: string;
  type: AgentObservationEventType;
  entity: AgentObservationEntity;
  entityId: string;
  source: string;
  severity: AgentObservationSeverity;
  temporal: "current" | "historical";
  previous?: AgentObservationValue;
  current?: AgentObservationValue;
  authority?: AgentAuthorityOwner;
  reason?: string;
}>;

export type AgentObservationDiff = Readonly<{
  contractVersion: typeof AGENT_REASONING_CONTRACT_VERSION;
  fromObservationId: string;
  fromFingerprint: string;
  toObservationId: string;
  toFingerprint: string;
  changed: boolean;
  events: readonly AgentObservationEvent[];
}>;

export type AgentReasoningFact = Readonly<{
  id: string;
  kind: "change" | "current_state";
  subject: AgentObservationEntity;
  subjectId: string;
  predicate: string;
  value: string;
  severity: AgentObservationSeverity;
  temporal: "current" | "historical";
  source: string;
  authority?: AgentAuthorityOwner;
  evidenceIds: readonly string[];
}>;

export type AgentReasoningPattern = Readonly<{
  id: string;
  kind: "dependency_blocks_review" | "blocked_capability" | "state_change";
  factIds: readonly string[];
  statement: string;
}>;

export type AgentReasoningContext = Readonly<{
  contractVersion: typeof AGENT_REASONING_CONTRACT_VERSION;
  observationId: string;
  observationFingerprint: string;
  diff: AgentObservationDiff;
  facts: readonly AgentReasoningFact[];
  patterns: readonly AgentReasoningPattern[];
  snapshot: AgentSnapshot;
  boundary: Readonly<{readOnly: true; executes: false; persists: false}>;
}>;

export type AgentDiagnosis = Readonly<{
  id: string;
  category: string;
  severity: AgentObservationSeverity;
  title: string;
  summary: string;
  evidence: readonly Readonly<{id: string; source: string}>[];
  confidence: AgentDiagnosisConfidence;
  authority?: AgentAuthorityOwner;
  actionable: boolean;
  conclusive: boolean;
}>;

export type AgentProposal = Readonly<{
  id: string;
  diagnosisId: string;
  action: string;
  authority: AgentProposalAuthority;
  destination?: string;
  requiresAuthorization: boolean;
  destructive: boolean;
  blocked: boolean;
  reason?: string;
  reevaluateAfter: readonly AgentReevaluationTarget[];
}>;

export const agentReasoningModelSecurity = Object.freeze({
  readOnly: true,
  pureContracts: true,
  createsStore: false,
  persists: false,
  fetches: false,
  writes: false,
  executes: false,
  retries: false,
  plans: false,
  schedules: false,
  watches: false,
  polls: false,
  decidesAutonomy: false,
  createsCheckpoint: false,
} as const);
