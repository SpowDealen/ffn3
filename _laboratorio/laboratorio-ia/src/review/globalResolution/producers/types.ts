import type {EntityOperation} from "../../entityOperations";
import type {ReviewCase, ReviewJsonValue} from "../../types";

export type ProducerCapabilityMode = "plan" | "simulate" | "execute" | "inspect" | "reconcile" | "retry";
export type ProducerAdapterKind =
  | "case_adapter"
  | "planner"
  | "request_builder"
  | "executor"
  | "reference_resolver"
  | "inspection_request_builder"
  | "reconciliation_contract"
  | "lifecycle_projection"
  | "ui_controller";

export type SafeProducerMetadata = Readonly<Record<string, string | number | boolean | readonly string[]>>;

export type GlobalResolutionCapabilityManifest = {
  capabilityId: string;
  capabilityVersion: string;
  description: string;
  operationKinds: EntityOperation["kind"][];
  requirements: string[];
  expectedEvidenceKinds: string[];
  supportsInspection: boolean;
  supportsReconciliation: boolean;
  requiresExplicitAuthorization: boolean;
  idempotencyPolicy: "not_applicable" | "required" | "supported";
};

export type ProducerCapabilityManifest = {
  capabilityId: string;
  capabilityVersion: string;
  operationKinds: EntityOperation["kind"][];
  modes: ProducerCapabilityMode[];
  requiresExplicitAuthorization: boolean;
  supportsIdempotency: boolean;
  supportsInspection: boolean;
  supportsReconciliation: boolean;
  requiredContext: string[];
  optionalContext?: string[];
  dependencies?: string[];
};

export type ProducerAdapterManifest = {
  adapterKind: ProducerAdapterKind;
  adapterId: string;
  adapterVersionRange?: string;
  capabilityIds?: string[];
  operationKinds?: EntityOperation["kind"][];
  priority?: number;
};

export type ProducerInspectorBinding = {
  capabilityId: string;
  inspectorId: string;
  inspectorVersionRange?: string;
  priority?: number;
  requiredEvidenceKinds?: string[];
};

export type ProducerExecutionPolicy = {
  maximumRisk: "none" | "low" | "medium" | "high";
  defaultAuthorization: "explicit" | "not_required";
  retryPolicy: "disabled" | "manual_after_confirmed_absence";
  allowAutomaticExecution: false;
};

export type ProducerAutonomyPolicy = {
  policyVersion: string;
  maximumAutonomousRisk: "low" | "medium";
  allowedAutonomousCapabilities: string[];
  supervisedCapabilities?: string[];
  requiresAuthorizationCapabilities: string[];
  forbiddenAutonomousCapabilities: string[];
};

export type ProducerCompatibilityManifest = {
  caseTypes: string[];
  contracts?: string[];
  sources?: string[];
  legacyProducerIds?: string[];
  minimumCheckpointManifestVersion?: string;
};

export type GlobalResolutionProducerManifest = {
  manifestVersion: string;
  producerId: string;
  producerVersion: string;
  displayName: string;
  family?: string;
  caseTypes: string[];
  capabilities: ProducerCapabilityManifest[];
  adapters: ProducerAdapterManifest[];
  inspectors: ProducerInspectorBinding[];
  executionPolicy: ProducerExecutionPolicy;
  autonomyPolicy?: ProducerAutonomyPolicy;
  compatibility: ProducerCompatibilityManifest;
  metadata?: SafeProducerMetadata;
};

export type RegisteredGlobalResolutionProducer = Readonly<{
  manifest: GlobalResolutionProducerManifest;
  fingerprint: string;
  warnings: ProducerManifestIssue[];
}>;

export type ProducerManifestIssue = {
  severity: "error" | "warning" | "info";
  code: string;
  path?: string;
  message: string;
};

export type ProducerManifestValidationResult = {
  valid: boolean;
  issues: ProducerManifestIssue[];
  fingerprint?: string;
};

export type ProducerCaseResolutionInput = {
  producerId?: string;
  producerVersion?: string;
  caseType?: string;
  source?: string;
  contractId?: string;
  metadata?: Readonly<Record<string, ReviewJsonValue>>;
};

export type ProducerResolution =
  | {status: "resolved"; producer: RegisteredGlobalResolutionProducer; provenance: "explicit" | "compatible" | "legacy"}
  | {status: "unsupported"; reason: string}
  | {status: "ambiguous"; producerIds: string[]; reason: string}
  | {status: "missing"; reason: string}
  | {status: "version_mismatch"; producerId: string; requestedVersion: string; availableVersions: string[]}
  | {status: "invalid_manifest"; reason: string};

export type ProducerLegacyCompatibility =
  | {status: "legacy_compatible"; producer: RegisteredGlobalResolutionProducer; provenance: string}
  | {status: "migration_recommended"; producer: RegisteredGlobalResolutionProducer; provenance: string}
  | {status: "migration_required"; reasons: string[]}
  | {status: "incompatible"; reasons: string[]};

export type ProducerCheckpointBinding = {
  producerId: string;
  producerVersion: string;
  manifestVersion: string;
  manifestFingerprint: string;
  capabilityVersions: Array<{capabilityId: string; capabilityVersion: string}>;
  adapterIds: string[];
};

export type ProducerCheckpointCompatibility =
  | {status: "compatible" | "legacy_compatible"; reasons: string[]}
  | {status: "stale" | "incompatible"; reasons: string[]};

export type ProducerAdapterImplementation<T = unknown> = {
  adapterId: string;
  version: string;
  adapterKind: ProducerAdapterKind;
  implementation: T;
};

export type ProducerAdapterResolution<T = unknown> =
  | {status: "resolved"; binding: ProducerAdapterManifest; adapter: ProducerAdapterImplementation<T>}
  | {status: "unsupported" | "missing" | "ambiguous" | "version_mismatch"; reason: string};

export type ProducerInspectorBindingResolution =
  | {status: "resolved"; binding: ProducerInspectorBinding}
  | {status: "unsupported" | "missing" | "ambiguous" | "version_mismatch"; reason: string};

export type ProducerPlanningContext = {
  producerId: string;
  producerVersion: string;
  manifestVersion: string;
  manifestFingerprint: string;
  availableCapabilities: string[];
  operationKinds: EntityOperation["kind"][];
  dependencies: string[];
  plannerAdapterIds: string[];
  executorAdapterIds: string[];
};

export type ProducerReviewCaseResolution = ProducerResolution & {reviewCase?: ReviewCase};
