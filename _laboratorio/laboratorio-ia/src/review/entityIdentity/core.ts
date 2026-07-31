import {fingerprintEntityCandidate, fingerprintEntityResolution} from "./fingerprint";
import {EntityIdentityStrategyRegistry} from "./registry";
import {disciplineIdentityStrategy} from "./strategies/discipline";
import {eventIdentityStrategy} from "./strategies/event";
import {fightIdentityStrategy} from "./strategies/fight";
import {fighterIdentityStrategy} from "./strategies/fighter";
import {newsIdentityStrategy} from "./strategies/news";
import {organizationIdentityStrategy} from "./strategies/organization";
import {resultIdentityStrategy} from "./strategies/result";
import {unsupportedComparison} from "./strategies/shared";
import {weightCategoryIdentityStrategy} from "./strategies/weightCategory";
import type {
  EntityCandidate, EntityDuplicateAssessment, EntityIdentityStrategy, EntityResolutionResult,
  IdentityComparisonResult, RankedEntityCandidate, UniversalEntityIdentity, UniversalEntityIdentityInput, UniversalEntityType,
} from "./types";

export function createDefaultEntityIdentityStrategyRegistry(): EntityIdentityStrategyRegistry {
  const registry = new EntityIdentityStrategyRegistry();
  [
    fighterIdentityStrategy,
    eventIdentityStrategy,
    organizationIdentityStrategy,
    disciplineIdentityStrategy,
    weightCategoryIdentityStrategy,
    fightIdentityStrategy,
    newsIdentityStrategy,
    resultIdentityStrategy,
  ].forEach((strategy) => registry.register(strategy as EntityIdentityStrategy));
  return registry;
}

export function buildEntityIdentity(
  input: UniversalEntityIdentityInput,
  registry: EntityIdentityStrategyRegistry = createDefaultEntityIdentityStrategyRegistry(),
): UniversalEntityIdentity {
  const strategy = registry.get(input.entityType);
  if (!strategy) throw new Error(`entity_identity_strategy_missing:${input.entityType}`);
  return strategy.build(input as never);
}

export function compareEntityIdentity(
  input: UniversalEntityIdentity,
  candidate: UniversalEntityIdentity,
  registry: EntityIdentityStrategyRegistry = createDefaultEntityIdentityStrategyRegistry(),
): IdentityComparisonResult {
  if (input.entityType !== candidate.entityType) return unsupportedComparison(input, candidate);
  const strategy = registry.get(input.entityType);
  if (!strategy) return unsupportedComparison(input, candidate);
  return strategy.compare(input as never, candidate as never);
}

export function createEntityCandidate(input: Omit<EntityCandidate, "fingerprint">): EntityCandidate {
  if (!input.candidateId.trim() || input.entityType !== input.identity.entityType || !input.safeSummary.trim() || !input.source.trim()) throw new Error("entity_candidate_invalid");
  const semantic = {
    candidateId: input.candidateId.trim().slice(0, 160),
    entityType: input.entityType,
    identity: input.identity,
    safeSummary: input.safeSummary.replace(/https?:\/\/\S+/giu, "[url]").replace(/(?:token|secret|password)\s*[=:]\s*\S+/giu, "$1=[redacted]").slice(0, 240),
    source: input.source.trim().slice(0, 100),
    status: input.status?.slice(0, 80),
  };
  return Object.freeze({...semantic, fingerprint: fingerprintEntityCandidate(semantic)});
}

const rank = (decision: IdentityComparisonResult["decision"]) => ({
  exact_match: 0, strong_match: 1, probable_match: 2, ambiguous: 3,
  conflicting_identity: 4, insufficient_evidence: 5, no_match: 6, unsupported_entity_type: 7,
})[decision];

function finish(resolution: Omit<EntityResolutionResult, "resolutionFingerprint">): EntityResolutionResult {
  const semantic = {
    ...resolution,
    candidates: Object.freeze([...resolution.candidates].sort((left, right) =>
      rank(left.comparison.decision) - rank(right.comparison.decision)
      || right.comparison.score - left.comparison.score
      || left.candidate.candidateId.localeCompare(right.candidate.candidateId),
    )),
    reasonCodes: Object.freeze([...new Set(resolution.reasonCodes)].sort()),
  };
  return Object.freeze({...semantic, resolutionFingerprint: fingerprintEntityResolution(semantic)});
}

export function resolveEntityIdentity(
  input: UniversalEntityIdentity,
  candidates: readonly EntityCandidate[],
  options: {searchCompleted?: boolean; registry?: EntityIdentityStrategyRegistry} = {},
): EntityResolutionResult {
  const registry = options.registry ?? createDefaultEntityIdentityStrategyRegistry();
  const strategy = registry.get(input.entityType);
  if (!strategy) return finish({status: "unsupported", entityType: input.entityType, candidates: [], reasonCodes: ["strategy_missing"], inputFingerprint: input.fingerprint});
  const sameType = candidates.filter((candidate) => candidate.entityType === input.entityType && candidate.identity.entityType === input.entityType);
  const ranked: RankedEntityCandidate[] = sameType.map((candidate) => Object.freeze({candidate, comparison: strategy.compare(input as never, candidate.identity as never)}));
  const exact = ranked.filter(({comparison}) => comparison.decision === "exact_match");
  if (exact.length === 1) return finish({status: "reuse", entityType: input.entityType, candidateId: exact[0].candidate.candidateId, comparison: exact[0].comparison, candidates: ranked, reasonCodes: ["unique_exact_match"], inputFingerprint: input.fingerprint});
  if (exact.length > 1) return finish({status: "ambiguous", entityType: input.entityType, candidates: ranked, reasonCodes: ["multiple_exact_matches"], inputFingerprint: input.fingerprint});
  const strong = ranked.filter(({comparison}) => comparison.decision === "strong_match");
  if (strong.length === 1) return finish({status: "reuse", entityType: input.entityType, candidateId: strong[0].candidate.candidateId, comparison: strong[0].comparison, candidates: ranked, reasonCodes: ["unique_strong_match"], inputFingerprint: input.fingerprint});
  if (strong.length > 1) return finish({status: "ambiguous", entityType: input.entityType, candidates: ranked, reasonCodes: ["multiple_strong_matches"], inputFingerprint: input.fingerprint});
  const probable = ranked.filter(({comparison}) => comparison.decision === "probable_match");
  if (probable.length) return finish({status: probable.length > 1 ? "ambiguous" : "probable_match", entityType: input.entityType, candidates: ranked, reasonCodes: [probable.length > 1 ? "multiple_probable_matches" : "probable_match_requires_review"], inputFingerprint: input.fingerprint});
  const conflicts = ranked.filter(({comparison}) => comparison.decision === "conflicting_identity");
  if (conflicts.length) return finish({status: "conflicting_identity", entityType: input.entityType, candidates: ranked, reasonCodes: ["candidate_identity_conflict"], inputFingerprint: input.fingerprint});
  const incomplete = ranked.filter(({comparison}) => comparison.decision === "insufficient_evidence");
  if (incomplete.length || !options.searchCompleted) return finish({status: "insufficient_evidence", entityType: input.entityType, candidates: ranked, reasonCodes: [incomplete.length ? "candidate_may_be_same_entity" : "candidate_search_not_completed"], inputFingerprint: input.fingerprint});
  const create = strategy.canCreate(input as never);
  if (!create.allowed) return finish({status: "insufficient_evidence", entityType: input.entityType, candidates: ranked, reasonCodes: create.reasonCodes, inputFingerprint: input.fingerprint});
  return finish({status: "create_new", entityType: input.entityType, candidates: ranked, reasonCodes: ["search_complete_no_relevant_match", ...create.reasonCodes], inputFingerprint: input.fingerprint});
}

export function classifyEntityDuplicate(
  input: UniversalEntityIdentity,
  candidate: EntityCandidate,
  registry: EntityIdentityStrategyRegistry = createDefaultEntityIdentityStrategyRegistry(),
): EntityDuplicateAssessment {
  const comparison = compareEntityIdentity(input, candidate.identity, registry);
  const classification = comparison.decision === "exact_match" ? "duplicate"
    : comparison.decision === "strong_match" || comparison.decision === "probable_match" || comparison.decision === "insufficient_evidence" ? "possible_duplicate"
      : comparison.decision === "conflicting_identity" ? "conflicting_duplicate"
        : "canonical";
  return Object.freeze({
    classification,
    candidateId: candidate.candidateId,
    comparison,
    evidenceFingerprint: comparison.comparisonFingerprint,
  });
}

export function resolveIdentityCapability(entityType: UniversalEntityType): `resolve_identity:${UniversalEntityType}` {
  return `resolve_identity:${entityType}`;
}

export const universalEntityIdentityCompatibility = Object.freeze({
  version: "1.0.0",
  operationPrefix: "resolve_identity:",
  guardedCreationCapability: "create:luchador",
  currentMode: "contract_only",
  modifiesExecutors: false,
  futureFlow: Object.freeze(["detect_entity", "build_identity", "fetch_candidates", "resolve_identity", "reuse_review_or_create", "continue_graph"]),
});
