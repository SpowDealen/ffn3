import {resolveIdentityCapability} from "../core";
import type {UniversalEntityIdentity} from "../types";
import {fingerprintDiscoveryRequest} from "./fingerprint";
import {CANDIDATE_DISCOVERY_REQUEST_VERSION, type CandidateDiscoveryLimits, type CandidateDiscoveryRequest, type CandidateDiscoveryStrategy, type SafeProducerContext} from "./types";
import {candidateDiscoveryStrategies} from "./profiles";

export const DEFAULT_CANDIDATE_DISCOVERY_LIMITS: CandidateDiscoveryLimits = Object.freeze({
  maxPerStrategy: 8, maxTotal: 20, maxStrategies: 8, timeoutMs: 8_000, maxAliases: 12, maxKeys: 16,
});

export function fighterDiscoveryStrategies(identity: UniversalEntityIdentity): CandidateDiscoveryStrategy[] {
  if (identity.entityType !== "fighter") throw new Error("candidate_discovery_fighter_identity_required");
  return candidateDiscoveryStrategies(identity);
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
  cursor?: string;
  producerContext?: SafeProducerContext;
}): CandidateDiscoveryRequest {
  const source = (input.source ?? "sanity").trim();
  const limits = Object.freeze({...DEFAULT_CANDIDATE_DISCOVERY_LIMITS, ...input.limits});
  if (!source || limits.maxTotal < 1 || limits.maxTotal > 50 || limits.maxPerStrategy < 1 || limits.maxPerStrategy > 20 || limits.maxStrategies < 1 || limits.maxStrategies > 16 || limits.timeoutMs < 100 || limits.timeoutMs > 30_000) throw new Error("candidate_discovery_request_invalid");
  if (input.cursor !== undefined && (typeof input.cursor !== "string" || !input.cursor.trim() || input.cursor.length > 160)) throw new Error("candidate_discovery_cursor_invalid");
  const strategies = Object.freeze([...(input.strategies ?? candidateDiscoveryStrategies(input.identity))]
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
    cursor: input.cursor?.trim(),
  } as const;
  return Object.freeze({...semantic, requestFingerprint: fingerprintDiscoveryRequest(semantic)});
}
