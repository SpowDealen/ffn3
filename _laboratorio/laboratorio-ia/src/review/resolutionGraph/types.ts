import type {EntityOperation, OperationCondition, OperationEvidence, OperationRisk} from "../entityOperations";
import type {ReviewJsonObject, ReviewJsonValue} from "../types";
import type {UniversalFingerprint} from "../universal/fingerprints";

export type ResolutionNodeState =
  | "pending"
  | "ready"
  | "simulated"
  | "executing"
  | "succeeded"
  | "blocked"
  | "failed"
  | "compensated"
  | "reconciliation_required"
  | "skipped";

export type ResolutionGraphState =
  | "draft"
  | "invalid"
  | "ready"
  | "simulated"
  | "executing"
  | "succeeded"
  | "blocked"
  | "failed"
  | "reconciliation_required";

export type ResolutionDependencyPolicy = {
  acceptedStates: Array<"succeeded" | "skipped">;
  explanation: string;
};

export type ResolutionNodeResult = {
  references?: Array<{type: string; id: string}>;
  output?: ReviewJsonValue;
};

export type ResolutionNodeError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type ResolutionNode = {
  id: string;
  operation: EntityOperation;
  dependencyIds: string[];
  state: ResolutionNodeState;
  evidence: OperationEvidence[];
  risk: OperationRisk;
  confidence: number;
  preconditions: OperationCondition[];
  postconditions: OperationCondition[];
  result?: ResolutionNodeResult;
  error?: ResolutionNodeError;
  idempotencyKey: string;
  isResumeNode: boolean;
  requiredForCompletion: boolean;
  dependencyPolicy?: ResolutionDependencyPolicy;
};

export type ResolutionGraph = {
  schemaVersion: 1;
  id: string;
  caseId: string;
  caseVersion: number;
  producerId: string;
  originalOperation: string;
  nodes: ResolutionNode[];
  state: ResolutionGraphState;
  fingerprint: UniversalFingerprint;
  idempotencyKey: string;
  createdAt: string;
  updatedAt?: string;
  metadata: ReviewJsonObject;
};

export type ResolutionGraphValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  dependencyId?: string;
  path?: string;
};

export type ResolutionGraphValidationResult = {
  valid: boolean;
  errors: ResolutionGraphValidationIssue[];
  warnings: ResolutionGraphValidationIssue[];
};

export type ResolutionGraphTopologicalSortResult = {
  valid: boolean;
  nodeIds: string[];
  layers: string[][];
  errors: ResolutionGraphValidationIssue[];
};

export type ResolutionNodeReadiness = {
  nodeId: string;
  ready: boolean;
  reasons: string[];
};

export type ResolutionNodeInput = {
  id?: string;
  operation: EntityOperation;
  state?: ResolutionNodeState;
  isResumeNode?: boolean;
  requiredForCompletion?: boolean;
  dependencyPolicy?: ResolutionDependencyPolicy;
};

export type BuildResolutionGraphInput = {
  caseId: string;
  caseVersion: number;
  producerId: string;
  originalOperation: string;
  nodes: ResolutionNodeInput[];
  metadata?: ReviewJsonObject;
  id?: string;
  idempotencyKey?: string;
  now?: () => string;
};
