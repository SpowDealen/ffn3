import type {UniversalEntityIdentity} from "../entityIdentity";
import type {CandidateDiscoveryResult, DiscoveryResolutionResult, SafeProducerContext} from "../entityIdentity/discovery";
import type {CorpusScanRequest, EntityKind, ReconciliationScanResult} from "../entityReconciliation";
import type {ReviewCase} from "../types";
import type {GlobalResolutionPlan} from "../globalResolution";
import type {IdentityCreationAuthorization} from "../globalResolution/identityCreationGuard";

export const ENTITY_RESOLUTION_ENGINE_VERSION = 1 as const;
export const ENTITY_RESOLUTION_RULES_VERSION = "1.0.0" as const;
export const ENTITY_RESOLUTION_MODES = Object.freeze(["identity_lookup", "creation_preflight", "existing_reconciliation"] as const);
export type EntityResolutionMode = typeof ENTITY_RESOLUTION_MODES[number];
export type EntityResolutionEntityType = EntityKind;
export type EntityResolutionCapability = "identity_discovery" | "guarded_creation" | "reconciliation_scan";
export type EntityResolutionReadCompleteness = "complete" | "partial" | "truncated" | "unavailable" | "cancelled" | "not_applicable";
export type EngineResolutionStatus = "complete" | "partial" | "truncated" | "unavailable" | "cancelled" | "blocked" | "unsupported" | "stale" | "needs_review";

export type IdentityLookupEngineRequest = Readonly<{
  version: typeof ENTITY_RESOLUTION_ENGINE_VERSION;
  mode: "identity_lookup";
  entityType: EntityResolutionEntityType;
  producer: string;
  source: "sanity";
  identity: UniversalEntityIdentity;
  producerContext?: SafeProducerContext;
  limits?: Readonly<{maxTotal?: number; maxStrategies?: number; timeoutMs?: number}>;
  cursor?: string;
}>;

export type CreationPreflightEngineRequest = Readonly<{
  version: typeof ENTITY_RESOLUTION_ENGINE_VERSION;
  mode: "creation_preflight";
  entityType: EntityResolutionEntityType;
  producer: string;
  source: "sanity";
  plan: GlobalResolutionPlan;
  guardOperationId: string;
}>;
export type IdentityResolutionPreflightRequest = CreationPreflightEngineRequest;

export type ExistingReconciliationEngineRequest = Readonly<{
  version: typeof ENTITY_RESOLUTION_ENGINE_VERSION;
  mode: "existing_reconciliation";
  entityType: EntityResolutionEntityType;
  producer: string;
  source: "sanity" | "dev.in-memory";
  scan: CorpusScanRequest;
}>;

export type EngineRequest = IdentityLookupEngineRequest | CreationPreflightEngineRequest | ExistingReconciliationEngineRequest;

export type ResolutionError = Readonly<{code: string; reasonCode: string; message: string; retryable: boolean}>;
export type ResolutionCaseLink = Readonly<{
  caseId: string;
  caseVersion: number;
  entityType: EntityResolutionEntityType;
  mode: EntityResolutionMode;
  contextFingerprint: string;
  snapshotVersion: number;
  rulesVersion: string;
}>;
export type ResolutionWarning = Readonly<{code: string; message: string}>;
export type ResolutionProvenance = Readonly<{profileId: string; profileVersion: string; adapterId?: string; source: string; capability: EntityResolutionCapability}>;

type EngineResultBase = Readonly<{
  version: typeof ENTITY_RESOLUTION_ENGINE_VERSION;
  rulesVersion: typeof ENTITY_RESOLUTION_RULES_VERSION;
  entityType: EntityResolutionEntityType;
  mode: EntityResolutionMode;
  status: EngineResolutionStatus;
  completeness: EntityResolutionReadCompleteness;
  reasonCode: string;
  requestFingerprint: string;
  resultFingerprint: string;
  resolvedAt: string;
  durationMs: number;
  warnings: readonly ResolutionWarning[];
  provenance: ResolutionProvenance;
  caseLinks: readonly ResolutionCaseLink[];
  error?: ResolutionError;
}>;

export type IdentityLookupEngineResult = EngineResultBase & Readonly<{
  mode: "identity_lookup";
  identityLookup?: Readonly<{discovery: CandidateDiscoveryResult; resolution: DiscoveryResolutionResult}>;
}>;
export type CreationPreflightEngineResult = EngineResultBase & Readonly<{
  mode: "creation_preflight";
  creationPreflight?: Readonly<{authorization: IdentityCreationAuthorization; discovery: CandidateDiscoveryResult; createAuthorized: boolean}>;
}>;
export type ExistingReconciliationEngineResult = EngineResultBase & Readonly<{
  mode: "existing_reconciliation";
  existingReconciliation?: Readonly<{scan: ReconciliationScanResult; cases: readonly ReviewCase[]}>;
}>;
export type InvalidEngineResult = Readonly<{
  version: typeof ENTITY_RESOLUTION_ENGINE_VERSION;
  rulesVersion: typeof ENTITY_RESOLUTION_RULES_VERSION;
  entityType: "unknown";
  mode: "invalid_request";
  status: "blocked";
  completeness: "not_applicable";
  reasonCode: "request_invalid";
  requestFingerprint: string;
  resultFingerprint: string;
  resolvedAt: string;
  durationMs: number;
  warnings: readonly ResolutionWarning[];
  provenance: Readonly<{profileId: "unavailable"; profileVersion: "1.0.0"; source: "none"; capability: "identity_discovery"}>;
  caseLinks: readonly ResolutionCaseLink[];
  error: ResolutionError;
}>;
export type EngineResult = IdentityLookupEngineResult | CreationPreflightEngineResult | ExistingReconciliationEngineResult | InvalidEngineResult;

export type ResolutionProfileDescriptor = Readonly<{
  profileId: string;
  profileVersion: string;
  rulesVersion: string;
  entityType: EntityResolutionEntityType;
  schemaType: "luchador" | "evento" | "organizacion" | "categoriaPeso";
  modes: readonly EntityResolutionMode[];
  capabilities: readonly EntityResolutionCapability[];
  sourcesByMode: Readonly<Partial<Record<EntityResolutionMode, readonly string[]>>>;
  fingerprint: string;
}>;

export type ResolutionProfileExecution = Readonly<{
  status: EngineResolutionStatus;
  completeness: EntityResolutionReadCompleteness;
  reasonCode: string;
  warnings: readonly ResolutionWarning[];
  adapterId?: string;
  caseLinks?: readonly ResolutionCaseLink[];
  identityLookup?: IdentityLookupEngineResult["identityLookup"];
  creationPreflight?: CreationPreflightEngineResult["creationPreflight"];
  existingReconciliation?: ExistingReconciliationEngineResult["existingReconciliation"];
}>;

export type ResolutionProfileContext = Readonly<{signal?: AbortSignal; now: Date}>;
export interface ResolutionProfile {
  readonly descriptor: ResolutionProfileDescriptor;
  execute(request: EngineRequest, context: ResolutionProfileContext): Promise<ResolutionProfileExecution>;
}

export const entityResolutionSecurity = Object.freeze({readOnly: true, writes: false, mutations: false, merges: false, automaticDecisions: false, callerTokens: false, arbitraryQueries: false, fallbackToFighter: false});
