import type {InteractionIntent} from "../interactions/model";
import type {OperatorSignalKind, OperatorSignalPriority, OperatorSignalSource} from "../operator/model";
import type {NotificationDeliveryStatus, NotificationPriority} from "../notifications/types";
import type {ProcessExperienceState} from "../processes/presentation";
import type {ReviewPriority, ReviewCaseStatus} from "../review/types";
import type {GlobalStatusEffect, GlobalStatusState, SubsystemStatusState} from "../status/model";

export const AGENT_READY_CONTRACT_VERSION = "les8-agent-ready/1" as const;
export type AgentTemporal = "current" | "recent" | "historical";
export type AgentAuthorityOwner = "ui_navigation" | "les4_live_checks" | "notification_store" | "process_origin" | "review_center" | "au7_transaction" | "au8_supervised" | "existing_authority";
export type AgentCapabilityAvailability = "available" | "blocked" | "busy" | "unavailable";

export type AgentReason = Readonly<{code: string; text?: string}>;
export type AgentAuthority = Readonly<{owner: AgentAuthorityOwner; source: string}>;

export type AgentCapability = Readonly<{
  id: string;
  intent: InteractionIntent;
  label: string;
  availability: AgentCapabilityAvailability;
  available: boolean;
  blocked: boolean;
  busy: boolean;
  requiresAuthorization: boolean;
  destructive: boolean;
  authority: AgentAuthority;
  reason?: AgentReason;
  destination?: string;
  reevaluate: readonly ("global_status" | "operator_signals" | "processes" | "notifications" | "review")[];
}>;

export type AgentDependency = Readonly<{
  id: string;
  label: string;
  state: SubsystemStatusState;
  effect: GlobalStatusEffect;
  current: boolean;
  live: boolean;
  reason?: AgentReason;
  destination?: string;
  checkedAt?: string;
  activeCount: number;
  currentIncidentCount: number;
  historicalCount: number;
}>;

export type AgentOperatorSignal = Readonly<{
  id: string;
  source: OperatorSignalSource;
  kind: OperatorSignalKind;
  priority: OperatorSignalPriority;
  temporal: AgentTemporal;
  title: string;
  actionable: boolean;
  authority: AgentAuthority;
  reason?: AgentReason;
  destination?: string;
}>;

export type AgentProcess = Readonly<{
  id: string;
  title: string;
  state: ProcessExperienceState;
  temporal: AgentTemporal;
  active: boolean;
  source: string;
  authority: AgentAuthority;
  reason?: AgentReason;
  updatedAt?: string;
  progress: Readonly<{kind: "determinate" | "indeterminate" | "none"; current?: number; total?: number}>;
  actions: Readonly<{retryAuthorized: boolean; cancelAuthorized: boolean}>;
  destination: "/actividad";
}>;

export type AgentNotification = Readonly<{
  id: string;
  title: string;
  temporal: "current" | "historical";
  unread: boolean;
  priority?: NotificationPriority;
  tone: "critical" | "error" | "warning" | "success";
  source: string;
  effectiveAt: string;
  deliveryStatus?: NotificationDeliveryStatus;
  retryAvailable: boolean;
  authority: AgentAuthority;
  destination: "/actividad";
}>;

export type AgentReviewCheckpoint = Readonly<{
  id: string;
  schemaVersion: number;
  caseVersion: number;
  phase: string;
  checkpointFingerprint: string;
  planFingerprint: string;
  graphFingerprint: string;
  snapshotFingerprint?: string;
  updatedAt: string;
  transaction?: Readonly<{id: string; phase: string; fingerprint: string; checkpointFingerprint: string}>;
  supervisedLoop?: Readonly<{id: string; phase: string; fingerprint: string; iteration: number; stopReason?: string}>;
}>;

export type AgentReview = Readonly<{
  id: string;
  title: string;
  version: number;
  status: ReviewCaseStatus;
  priority: ReviewPriority;
  temporal: "current" | "historical";
  blocked: boolean;
  unresolvedIssueCount: number;
  unresolvedBlockingCount: number;
  reasonCodes: readonly string[];
  evidenceReferences: readonly string[];
  updatedAt: string;
  authority: readonly AgentAuthority[];
  destination: "/revision";
  checkpoint?: AgentReviewCheckpoint;
}>;

export type AgentSnapshot = Readonly<{
  schemaVersion: 1;
  contractVersion: typeof AGENT_READY_CONTRACT_VERSION;
  observationId: string;
  observationFingerprint: string;
  observedAt: string;
  globalStatus: Readonly<{
    state: GlobalStatusState;
    label: string;
    evaluatedAt: string;
    currentIncidentCount: number;
    activeProcessCount: number;
    historicalRecordCount: number;
  }>;
  operator: Readonly<{
    state: "attention" | "active" | "clear" | "unknown";
    nextBestSignalId?: string;
    attention: readonly AgentOperatorSignal[];
    active: readonly AgentOperatorSignal[];
  }>;
  dependencies: readonly AgentDependency[];
  processes: readonly AgentProcess[];
  notifications: readonly AgentNotification[];
  review: readonly AgentReview[];
  capabilities: readonly AgentCapability[];
  boundary: Readonly<{readOnly: true; projectionOnly: true; executes: false; persists: false; plans: false; decidesAutonomy: false}>;
}>;

export type AgentSnapshotChangeKind = "blocker_added" | "blocker_resolved" | "process_started" | "process_finished" | "review_added" | "review_resolved" | "health_degraded" | "health_recovered" | "capability_changed";
export type AgentSnapshotChange = Readonly<{id: string; kind: AgentSnapshotChangeKind; entityId: string; from?: string; to?: string}>;
export type AgentSnapshotDiff = Readonly<{fromFingerprint: string; toFingerprint: string; changed: boolean; changes: readonly AgentSnapshotChange[]}>;

export const agentReadyModelSecurity = Object.freeze({createsStore: false, persists: false, writes: false, fetches: false, executes: false, plans: false, decidesAutonomy: false, createsCheckpoint: false, createsAuthority: false} as const);
