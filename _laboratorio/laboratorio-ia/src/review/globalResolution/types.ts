import type {ContentTypeId} from "../../types";
import type {EntityOperation, EntityOperationRegistry, OperationEvidence, OperationRisk} from "../entityOperations";
import type {ReviewCase, ReviewJsonObject, ReviewJsonValue, ReviewResolution} from "../types";
import type {ReviewEffect} from "../universal/types";
import type {ResolutionGraph} from "../resolutionGraph";

export type GlobalResolutionPlanStatus = "ready" | "blocked" | "invalid";
export type GlobalResolutionBlockerCode =
  | "missing_required_evidence"
  | "ambiguous_entity_candidate"
  | "missing_entity_adapter"
  | "unsupported_operation"
  | "missing_required_reference"
  | "invalid_resolution"
  | "incompatible_entity_type"
  | "unsafe_resume"
  | "unresolved_dependency"
  | "insufficient_confidence"
  | "schema_requirement_missing"
  | "ambiguous_effect_mapping"
  | "missing_producer"
  | "missing_original_operation"
  | "missing_snapshot"
  | "missing_final_validation"
  | "risk_exceeds_policy"
  | "operation_not_executable"
  | "missing_required_capability"
  | "invalid_planning_input";

export type GlobalResolutionBlocker = {
  code: GlobalResolutionBlockerCode;
  severity: "blocking" | "warning";
  scope: "structure" | "execution";
  issueId?: string;
  operationId?: string;
  entityType?: ContentTypeId;
  message: string;
  evidence: OperationEvidence[];
  explanation: string;
  requiredAction: string;
};

export type GlobalResolutionWarning = {
  code: string;
  message: string;
  issueId?: string;
};

export type GlobalResolutionAssumption = {
  code: string;
  explanation: string;
  evidence: OperationEvidence[];
};

export type GlobalResolutionPlanningEvidence = OperationEvidence & {issueId?: string};

export type PreparedEntityPlanningInput = {
  issueId: string;
  entityType: string;
  draft: ReviewJsonObject;
  identityKey?: string;
  valid: boolean;
  evidence: OperationEvidence[];
  existingEntityId?: string;
  candidateEntityIds?: string[];
};

export type EntityOperationDependencyHint = {
  consumerEntityType: ContentTypeId;
  dependencyEntityType: ContentTypeId;
  reason: string;
};

export type GlobalResolutionPlanningPolicy = {
  minimumCreateConfidence: number;
  minimumReuseConfidence: number;
  ambiguity: "block" | "require_explicit_choice";
  allowSkipOperation: boolean;
  allowOptionalDependencySkip: boolean;
  allowSkippedDependencyForResume: boolean;
  maximumRisk: OperationRisk;
  requireAllNodesForResume: boolean;
  unsupportedOperation: "block" | "warn";
  insufficientInformation: "block" | "warn";
  availableCapabilities: string[];
};

export type GlobalResolutionPlanningInput = {
  reviewCase: ReviewCase;
  resolutions?: readonly ReviewResolution[];
  effects?: readonly ReviewEffect[];
  evidence?: readonly GlobalResolutionPlanningEvidence[];
  preparedEntities?: readonly PreparedEntityPlanningInput[];
  dependencyHints?: readonly EntityOperationDependencyHint[];
  producer?: string;
  originalOperation?: string;
  finalEntityType?: ContentTypeId;
  policy?: Partial<GlobalResolutionPlanningPolicy>;
  entityRegistry?: EntityOperationRegistry;
  now?: () => string;
};

export type GlobalResolutionPlan = {
  schemaVersion: 1;
  id: string;
  caseId: string;
  caseVersion: number;
  producer: string;
  originalOperation: string;
  operations: EntityOperation[];
  graph: ResolutionGraph;
  status: GlobalResolutionPlanStatus;
  structurallyValid: boolean;
  executable: boolean;
  blockers: GlobalResolutionBlocker[];
  warnings: GlobalResolutionWarning[];
  assumptions: GlobalResolutionAssumption[];
  policy: GlobalResolutionPlanningPolicy;
  fingerprint: string;
  idempotencyKey: string;
  createdAt: string;
  requiredCapabilities: string[];
};

export type GlobalResolutionPlanValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
  operationId?: string;
};

export type GlobalResolutionPlanValidationResult = {
  valid: boolean;
  errors: GlobalResolutionPlanValidationIssue[];
  warnings: GlobalResolutionPlanValidationIssue[];
};

export type BuildGlobalResolutionPlanResult =
  | {ok: true; plan: GlobalResolutionPlan}
  | {ok: false; issues: GlobalResolutionBlocker[]; partialPlan?: GlobalResolutionPlan};

export type DerivedEntityOperationsResult = {
  operations: EntityOperation[];
  blockers: GlobalResolutionBlocker[];
  warnings: GlobalResolutionWarning[];
  assumptions: GlobalResolutionAssumption[];
  hasFinalValidation: boolean;
};

export type EffectDerivationContext = {
  issueId?: string;
  entityType?: ContentTypeId;
  evidence: OperationEvidence[];
  source: EntityOperation["source"];
  policy: GlobalResolutionPlanningPolicy;
};

export type PlanningContext = {
  reviewCase: ReviewCase;
  resolutions: readonly ReviewResolution[];
  effects: readonly ReviewEffect[];
  evidence: readonly GlobalResolutionPlanningEvidence[];
  preparedEntities: readonly PreparedEntityPlanningInput[];
  dependencyHints: readonly EntityOperationDependencyHint[];
  producer: string;
  originalOperation: string;
  finalEntityType?: ContentTypeId;
  policy: GlobalResolutionPlanningPolicy;
  entityRegistry: EntityOperationRegistry;
  metadata: ReviewJsonObject;
};

export type PlanningValue = ReviewJsonValue;
