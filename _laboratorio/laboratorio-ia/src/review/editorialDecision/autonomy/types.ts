import type {EntityResolutionResult, UniversalEntityType} from "../../entityIdentity";
import type {EntityOperationKind} from "../../entityOperations";
import type {GlobalResolutionReconciliationAssessment} from "../../globalResolution/reconciliation";
import type {GlobalResolutionCapabilityManifest, RegisteredGlobalResolutionProducer} from "../../globalResolution/producers";
import type {TransversalResolutionPlan} from "../../globalResolution/transversalPlanning";
import type {
  ControlledTransactionCompensationPlan,
  TransactionAuthorizationPolicy,
  TransactionCompensationPolicy,
  TransactionEffectOwnership,
  TransactionReconciliationPolicy,
  TransactionRisk,
  TransactionStepMode,
  UniversalTransactionPlan,
} from "../../transactions/types";
import type {TransactionOperationalView} from "../../transactions/orchestrator";
import type {AutonomousEditorialDecision, AutonomousEditorialDecisionInput, AutonomousEditorialDecisionKind, EditorialEvidenceSufficiencyClassification} from "../types";

export const AUTONOMY_RISK_POLICY_VERSION = "1.0.0" as const;

export type AutonomyLevel = "autonomous_safe" | "autonomous_supervised" | "authorization_required" | "human_required" | "blocked";
export type AggregatedAutonomyRisk = TransactionRisk | "unknown";

export type AutonomyReasonCode =
  | "evidence_sufficient"
  | "evidence_not_sufficient"
  | "contradictory_evidence"
  | "stale_context"
  | "high_risk"
  | "destructive_effect"
  | "identity_ambiguity"
  | "unsupported_capability"
  | "unknown_capability"
  | "unknown_risk"
  | "manual_compensation"
  | "safe_compensation_requires_authorization"
  | "reconciliation_required"
  | "reconciliation_resolved"
  | "policy_conflict"
  | "producer_policy_missing"
  | "capability_allowed"
  | "capability_supervised"
  | "capability_requires_authorization"
  | "capability_forbidden"
  | "creation_guard_valid"
  | "creation_guard_missing"
  | "authorization_required"
  | "read_only_low_risk"
  | "pure_reversible_transform"
  | "external_effect"
  | "unknown_ownership"
  | "insufficient_authority"
  | "decision_non_executable";

export type AutonomyReason = Readonly<{
  code: AutonomyReasonCode;
  summary: string;
  source: "decision" | "sufficiency" | "transaction" | "resolution" | "identity" | "producer" | "capability" | "reconciliation" | "compensation" | "policy";
}>;

export type AutonomyBlocker = Readonly<{
  code: AutonomyReasonCode;
  severity: "blocking" | "critical";
  summary: string;
}>;

export type AutonomyRiskDriver = Readonly<{
  operationId: string;
  operationKind: EntityOperationKind;
  capability: string;
  mode: TransactionStepMode;
  risk: AggregatedAutonomyRisk;
  reversible: boolean;
  externalEffect: boolean;
}>;

export type SafeRiskDescriptor = Readonly<{
  aggregate: AggregatedAutonomyRisk;
  drivers: readonly AutonomyRiskDriver[];
  hasExternalEffects: boolean;
  allReversible: boolean;
  uncertaintyCodes: readonly string[];
  fingerprint: string;
}>;

export type SafeAuthorizationRequirement = Readonly<{
  policy: Exclude<TransactionAuthorizationPolicy, "none">;
  operationIds: readonly string[];
  capabilities: readonly string[];
  bindsDecisionFingerprint: string;
  bindsSufficiencyFingerprint: string;
  ephemeral: true;
  persistedApproval: false;
  tokenStored: false;
}>;

export type HumanReviewReason =
  | "contradictory_evidence"
  | "high_risk"
  | "destructive_effect"
  | "identity_ambiguity"
  | "unsupported_capability"
  | "manual_compensation"
  | "policy_conflict"
  | "unknown_ownership"
  | "insufficient_authority"
  | "unknown_risk";

export type HumanReviewRequirement = Readonly<{
  reasons: readonly HumanReviewReason[];
  safeSummary: string;
  requiredBeforeContinuation: true;
}>;

export type AutonomyOperationDescriptor = Readonly<{
  operationId: string;
  operationKind: EntityOperationKind;
  capability: string;
  entityType?: UniversalEntityType;
  mode: TransactionStepMode;
  risk?: TransactionRisk;
  authorization: TransactionAuthorizationPolicy;
  compensation: TransactionCompensationPolicy;
  reconciliation: TransactionReconciliationPolicy;
  reversible: boolean;
  creationGuardFingerprint?: string;
  ownership?: TransactionEffectOwnership;
}>;

export type AutonomyCapabilityBinding = Readonly<{
  manifest: GlobalResolutionCapabilityManifest;
  fingerprint: string;
}>;

export type AutonomySufficiencyDescriptor = Readonly<{
  classification: EditorialEvidenceSufficiencyClassification;
  canDecideNow: boolean;
  evaluationFingerprint: string;
  authorityAdequate?: boolean;
  contradictionCodes?: readonly string[];
}>;

export type AutonomyExpectedContext = Readonly<{
  decisionFingerprint?: string;
  sufficiencyFingerprint?: string;
  transactionRiskFingerprint?: string;
  producerManifestFingerprint?: string;
  capabilityManifestFingerprints?: Readonly<Record<string, string>>;
  creationGuardFingerprints?: Readonly<Record<string, string>>;
  reconciliationFingerprint?: string;
}>;

export type AutonomyPolicyInput = Readonly<{
  decision: AutonomousEditorialDecision;
  sufficiency: AutonomySufficiencyDescriptor;
  operations?: readonly AutonomyOperationDescriptor[];
  transaction?: UniversalTransactionPlan;
  transactionView?: TransactionOperationalView;
  resolution?: TransversalResolutionPlan;
  identities?: readonly EntityResolutionResult[];
  reconciliation?: readonly GlobalResolutionReconciliationAssessment[];
  compensation?: ControlledTransactionCompensationPlan;
  producer?: RegisteredGlobalResolutionProducer;
  capabilities?: readonly AutonomyCapabilityBinding[];
  expectedContext?: AutonomyExpectedContext;
}>;

export type AutonomyPolicyResult = Readonly<{
  schemaVersion: typeof AUTONOMY_RISK_POLICY_VERSION;
  level: AutonomyLevel;
  decisionKind: AutonomousEditorialDecisionKind;
  decisionFingerprint: string;
  sufficiencyFingerprint: string;
  capabilities: readonly string[];
  entityType?: UniversalEntityType;
  risk: SafeRiskDescriptor;
  reasons: readonly AutonomyReason[];
  blockers: readonly AutonomyBlocker[];
  requiredAuthorization?: SafeAuthorizationRequirement;
  humanReview?: HumanReviewRequirement;
  canPreparePlan: boolean;
  canPrepareTransaction: boolean;
  canExecuteAutonomously: boolean;
  canContinueAfterStep: boolean;
  stale: boolean;
  staleReasonCodes: readonly string[];
  policyFingerprint: string;
  executionAllowed: false;
  writes: false;
}>;

export type AutonomousEditorialGovernanceInput = Readonly<{
  decisionInput: AutonomousEditorialDecisionInput;
  autonomy: Omit<AutonomyPolicyInput, "decision" | "sufficiency">;
}>;

export type AutonomousEditorialGovernanceResult = Readonly<{
  decision: AutonomousEditorialDecision;
  sufficiency: AutonomySufficiencyDescriptor;
  autonomy: AutonomyPolicyResult;
  fingerprint: string;
  executionAllowed: false;
  writes: false;
}>;

export const autonomyRiskPolicySecurity = Object.freeze({
  pure: true,
  failClosed: true,
  executesOperations: false,
  launchesTransactions: false,
  invokesExecutors: false,
  accessesSanity: false,
  fetchesExternalData: false,
  persistsAuthorization: false,
  persistsTokens: false,
  persistsPayloads: false,
  writes: false,
  confidenceGrantsAutonomy: false,
} as const);
