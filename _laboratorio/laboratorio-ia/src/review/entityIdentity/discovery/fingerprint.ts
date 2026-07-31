import type {ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint} from "../../universal";
import type {
  CandidateDiscoveryAdapterResult, CandidateDiscoveryRequest, CandidateDiscoveryStrategy,
  CandidateDiscoveryWarning, SafeCandidateDiscoveryAdapterDescriptor, SafeDiscoveredCandidate, SafeStrategyResult,
} from "./types";

const fp = (value: unknown) => computeUniversalFingerprint(value as ReviewJsonValue);
const sorted = <T>(values: readonly T[], key: (value: T) => string) => [...values].sort((a, b) => key(a).localeCompare(key(b)));

export const fingerprintDiscoveryStrategy = (value: Omit<CandidateDiscoveryStrategy, never>) => fp({...value, entityTypes: [...value.entityTypes].sort(), requiredFields: [...value.requiredFields].sort()});
export const fingerprintAdapterDescriptor = (value: Omit<SafeCandidateDiscoveryAdapterDescriptor, "fingerprint">) => fp({...value, entityTypes: [...value.entityTypes].sort()});
export const fingerprintStrategyResult = (value: Omit<SafeStrategyResult, "fingerprint">) => fp(value);
export const fingerprintDiscoveryWarning = (value: Omit<CandidateDiscoveryWarning, "fingerprint">) => fp(value);
export const fingerprintDiscoveredCandidate = (value: SafeDiscoveredCandidate) => fp({
  candidateFingerprint: value.fingerprint,
  matchedByStrategies: [...value.matchedByStrategies].sort(),
  bestStrategy: value.bestStrategy,
  variants: sorted(value.variants, (item) => item.documentId),
  deduplicationReasons: [...value.deduplicationReasons].sort(),
});
export const fingerprintCandidateSet = (values: readonly SafeDiscoveredCandidate[]) => fp(sorted(values.map((value) => fingerprintDiscoveredCandidate(value)), String));
export const fingerprintDiscoveryRequest = (value: Omit<CandidateDiscoveryRequest, "requestFingerprint">) => fp({
  ...value,
  identity: value.identity.fingerprint,
  strategies: sorted(value.strategies.map(fingerprintDiscoveryStrategy), String),
});
export const fingerprintDiscoveryResult = (value: Omit<CandidateDiscoveryAdapterResult, "resultFingerprint">) => fp({
  ...value,
  candidates: fingerprintCandidateSet(value.candidates),
  executedStrategies: sorted(value.executedStrategies, (item) => item.fingerprint),
  skippedStrategies: sorted(value.skippedStrategies, (item) => item.fingerprint),
  warnings: sorted(value.warnings, (item) => item.fingerprint),
});
