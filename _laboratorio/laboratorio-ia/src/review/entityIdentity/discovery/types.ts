import type {EntityCandidate, UniversalEntityIdentity, UniversalEntityType} from "../types";

export const CANDIDATE_DISCOVERY_REQUEST_VERSION = "1.0.0" as const;
export const CANDIDATE_DISCOVERY_STRATEGY_IDS = Object.freeze([
  "external_id_exact", "canonical_label_exact", "normalized_label_exact", "alias_exact",
  "slug_exact", "contextual_key", "event_number", "organization_acronym", "weight_limit",
  "participant_pair", "canonical_url", "content_fingerprint", "broad_recall",
] as const);
export type CandidateDiscoveryStrategyId = typeof CANDIDATE_DISCOVERY_STRATEGY_IDS[number];
export type CandidateDiscoveryStatus = "complete" | "partial" | "truncated" | "unavailable" | "cancelled";
export type CandidateDiscoveryReason =
  | "limit_reached" | "adapter_unavailable" | "technical_failure" | "missing_context"
  | "unsupported_strategy" | "cancelled" | "early_exact_id" | "cost_policy" | "timeout";

export type CandidateDiscoveryStrategy = Readonly<{
  strategyId: CandidateDiscoveryStrategyId;
  strategyVersion: "1.0.0";
  entityTypes: readonly UniversalEntityType[];
  strength: "definitive" | "very_strong" | "strong" | "contextual" | "weak";
  phase: 1 | 2 | 3 | 4 | 5;
  priority: number;
  maxCandidates: number;
  requiredFields: readonly string[];
}>;

export type CandidateDiscoveryLimits = Readonly<{
  maxPerStrategy: number;
  maxTotal: number;
  maxStrategies: number;
  timeoutMs: number;
  maxAliases: number;
  maxKeys: number;
}>;

export type SafeProducerContext = Readonly<{
  producerId?: string;
  caseId?: string;
  caseVersion?: number;
  generation?: number;
  sourceHints?: readonly string[];
}>;

export type CandidateDiscoveryRequest = Readonly<{
  requestVersion: typeof CANDIDATE_DISCOVERY_REQUEST_VERSION;
  entityType: UniversalEntityType;
  identity: UniversalEntityIdentity;
  producerContext?: SafeProducerContext;
  source: string;
  capability: `resolve_identity:${UniversalEntityType}`;
  strategies: readonly CandidateDiscoveryStrategy[];
  limits: CandidateDiscoveryLimits;
  cursor?: string;
  requestFingerprint: string;
}>;

export type SafeCandidateDiscoveryAdapterDescriptor = Readonly<{
  adapterId: string;
  adapterVersion: string;
  source: string;
  capability: string;
  entityTypes: readonly UniversalEntityType[];
  priority: number;
  specificity: number;
  fingerprint: string;
}>;

export type SafeStrategyResult = Readonly<{
  strategyId: CandidateDiscoveryStrategyId;
  status: "executed" | "skipped";
  candidateCount: number;
  reason?: CandidateDiscoveryReason;
  fingerprint: string;
}>;

export type CandidateDiscoveryWarning = Readonly<{
  code: string;
  message: string;
  candidateId?: string;
  fingerprint: string;
}>;

export type CandidateVariant = Readonly<{
  documentId: string;
  state: "published" | "draft";
  identityFingerprint: string;
}>;

export type SafeDiscoveredCandidate = EntityCandidate & Readonly<{
  matchedByStrategies: readonly CandidateDiscoveryStrategyId[];
  bestStrategy: CandidateDiscoveryStrategyId;
  variants: readonly CandidateVariant[];
  deduplicationReasons: readonly string[];
}>;

export type CandidateDiscoveryAdapterResult = Readonly<{
  status: CandidateDiscoveryStatus;
  candidates: readonly SafeDiscoveredCandidate[];
  executedStrategies: readonly SafeStrategyResult[];
  skippedStrategies: readonly SafeStrategyResult[];
  warnings: readonly CandidateDiscoveryWarning[];
  truncated: boolean;
  reason?: CandidateDiscoveryReason;
  cursor?: string;
  adapterFingerprint: string;
  resultFingerprint: string;
}>;

export type CandidateDiscoveryResult = CandidateDiscoveryAdapterResult & Readonly<{
  requestFingerprint: string;
  adapterDescriptor: SafeCandidateDiscoveryAdapterDescriptor;
}>;

export type CandidateDiscoveryContext = Readonly<{signal?: AbortSignal}>;

export interface CandidateDiscoveryAdapter {
  readonly descriptor: SafeCandidateDiscoveryAdapterDescriptor;
  supports(request: CandidateDiscoveryRequest): boolean;
  discover(request: CandidateDiscoveryRequest, context: CandidateDiscoveryContext): Promise<CandidateDiscoveryAdapterResult>;
}

export type CandidateDiscoveryResolutionStatus =
  | "reuse" | "probable_match" | "ambiguous" | "conflicting_identity"
  | "insufficient_evidence" | "create_new" | "discovery_incomplete" | "discovery_unavailable";

export const candidateDiscoverySecurity = Object.freeze({
  readOnly: true, writes: false, mutations: false, arbitraryQueries: false,
  fullDocuments: false, secrets: false, localStorage: false, persistentCache: false,
});
