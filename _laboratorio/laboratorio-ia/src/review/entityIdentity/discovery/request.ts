import {resolveIdentityCapability} from "../core";
import type {UniversalEntityIdentity} from "../types";
import {fingerprintDiscoveryRequest} from "./fingerprint";
import {
  CANDIDATE_DISCOVERY_REQUEST_VERSION, CANDIDATE_DISCOVERY_STRATEGY_IDS,
  type CandidateDiscoveryLimits, type CandidateDiscoveryRequest, type CandidateDiscoveryStrategy,
  type CandidateDiscoveryStrategyId, type SafeProducerContext,
} from "./types";

export const DEFAULT_CANDIDATE_DISCOVERY_LIMITS: CandidateDiscoveryLimits = Object.freeze({
  maxPerStrategy: 8, maxTotal: 20, maxStrategies: 8, timeoutMs: 8_000, maxAliases: 12, maxKeys: 16,
});

const fighterStrategySpecs: Readonly<Record<CandidateDiscoveryStrategyId, Omit<CandidateDiscoveryStrategy, "strategyId"> | undefined>> = Object.freeze({
  external_id_exact: {strategyVersion: "1.0.0", entityTypes: ["fighter"], strength: "definitive", phase: 1, priority: 100, maxCandidates: 4, requiredFields: ["externalIdentifiers"]},
  canonical_label_exact: {strategyVersion: "1.0.0", entityTypes: ["fighter"], strength: "strong", phase: 3, priority: 80, maxCandidates: 8, requiredFields: ["primaryLabel"]},
  normalized_label_exact: {strategyVersion: "1.0.0", entityTypes: ["fighter"], strength: "strong", phase: 3, priority: 75, maxCandidates: 8, requiredFields: ["normalizedPrimaryLabel"]},
  alias_exact: {strategyVersion: "1.0.0", entityTypes: ["fighter"], strength: "strong", phase: 3, priority: 70, maxCandidates: 8, requiredFields: ["aliases"]},
  slug_exact: {strategyVersion: "1.0.0", entityTypes: ["fighter"], strength: "contextual", phase: 2, priority: 85, maxCandidates: 4, requiredFields: ["attributes.slug"]},
  contextual_key: {strategyVersion: "1.0.0", entityTypes: ["fighter"], strength: "contextual", phase: 4, priority: 60, maxCandidates: 8, requiredFields: ["primaryLabel"]},
  broad_recall: {strategyVersion: "1.0.0", entityTypes: ["fighter"], strength: "weak", phase: 5, priority: 10, maxCandidates: 10, requiredFields: ["primaryLabel"]},
  event_number: undefined, organization_acronym: undefined, weight_limit: undefined, participant_pair: undefined,
  canonical_url: undefined, content_fingerprint: undefined,
});

export function fighterDiscoveryStrategies(identity: UniversalEntityIdentity): CandidateDiscoveryStrategy[] {
  if (identity.entityType !== "fighter") throw new Error("candidate_discovery_fighter_identity_required");
  const present = new Set<string>([
    ...(identity.externalIdentifiers.length ? ["externalIdentifiers"] : []),
    ...(identity.primaryLabel ? ["primaryLabel", "normalizedPrimaryLabel"] : []),
    ...(identity.aliases.length ? ["aliases"] : []),
    ...(identity.attributes.slug ? ["attributes.slug"] : []),
  ]);
  return CANDIDATE_DISCOVERY_STRATEGY_IDS.flatMap((strategyId) => {
    const spec = fighterStrategySpecs[strategyId];
    if (!spec || !spec.requiredFields.every((field) => present.has(field))) return [];
    return [Object.freeze({strategyId, ...spec})];
  }).sort((a, b) => a.phase - b.phase || b.priority - a.priority || a.strategyId.localeCompare(b.strategyId));
}

function safeContext(value?: SafeProducerContext): SafeProducerContext | undefined {
  if (!value) return undefined;
  return Object.freeze({
    producerId: value.producerId?.trim().slice(0, 80),
    caseId: value.caseId?.trim().slice(0, 120),
    caseVersion: Number.isSafeInteger(value.caseVersion) ? value.caseVersion : undefined,
    generation: Number.isSafeInteger(value.generation) ? value.generation : undefined,
    sourceHints: Object.freeze((value.sourceHints ?? []).filter((item) => typeof item === "string").map((item) => item.trim().slice(0, 100)).filter(Boolean).slice(0, 12).sort()),
  });
}

export function buildCandidateDiscoveryRequest(input: {
  identity: UniversalEntityIdentity;
  source?: string;
  strategies?: readonly CandidateDiscoveryStrategy[];
  limits?: Partial<CandidateDiscoveryLimits>;
  producerContext?: SafeProducerContext;
}): CandidateDiscoveryRequest {
  const source = (input.source ?? "sanity").trim();
  const limits = Object.freeze({...DEFAULT_CANDIDATE_DISCOVERY_LIMITS, ...input.limits});
  if (!source || limits.maxTotal < 1 || limits.maxTotal > 50 || limits.maxPerStrategy < 1 || limits.maxPerStrategy > 20 || limits.maxStrategies < 1 || limits.maxStrategies > 16 || limits.timeoutMs < 100 || limits.timeoutMs > 30_000) throw new Error("candidate_discovery_request_invalid");
  const strategies = Object.freeze([...(input.strategies ?? fighterDiscoveryStrategies(input.identity))]
    .filter((item) => item.entityTypes.includes(input.identity.entityType))
    .sort((a, b) => a.phase - b.phase || b.priority - a.priority || a.strategyId.localeCompare(b.strategyId))
    .slice(0, limits.maxStrategies));
  if (!strategies.length) throw new Error("candidate_discovery_strategies_missing");
  const semantic = {
    requestVersion: CANDIDATE_DISCOVERY_REQUEST_VERSION,
    entityType: input.identity.entityType,
    identity: input.identity,
    producerContext: safeContext(input.producerContext),
    source: source.slice(0, 80),
    capability: resolveIdentityCapability(input.identity.entityType),
    strategies,
    limits,
  } as const;
  return Object.freeze({...semantic, requestFingerprint: fingerprintDiscoveryRequest(semantic)});
}
