import type {ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import type {
  EntityAlias, EntityCandidate, EntityIdentityKey, EntityResolutionResult,
  ExternalEntityIdentifier, IdentityComparisonResult, SafeEntityContext, UniversalEntityIdentity,
} from "./types";

const fp = (value: unknown) => computeUniversalFingerprint(value as ReviewJsonValue);
const sortBy = <T>(values: readonly T[], key: (value: T) => string) => [...values].sort((left, right) => key(left).localeCompare(key(right)));

export const fingerprintEntityAlias = (alias: Omit<EntityAlias, "fingerprint">): string => fp({
  aliasVersion: alias.aliasVersion,
  normalizedValue: alias.normalizedValue,
  aliasType: alias.aliasType,
  locale: alias.locale,
  source: alias.source,
  confidence: alias.confidence,
  verified: alias.verified,
  provenance: {
    producer: alias.provenance.producer,
    source: alias.provenance.source,
    field: alias.provenance.field,
    extractionMethod: alias.provenance.extractionMethod,
    confidence: alias.provenance.confidence,
    verified: alias.provenance.verified,
  },
});
export const fingerprintExternalEntityIdentifier = (identifier: Omit<ExternalEntityIdentifier, "fingerprint">): string => fp(identifier);
export const fingerprintEntityIdentityKey = (key: Omit<EntityIdentityKey, "fingerprint">): string => fp({...key, fieldsUsed: [...key.fieldsUsed].sort()});
export const fingerprintEntityContext = (context: SafeEntityContext): string => fp(Object.fromEntries(Object.entries(context).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value])));

export function fingerprintEntityIdentity(identity: Omit<UniversalEntityIdentity, "fingerprint">): string {
  return fp({
    identityVersion: identity.identityVersion,
    entityType: identity.entityType,
    source: identity.source,
    normalizedPrimaryLabel: identity.normalizedPrimaryLabel,
    aliases: sortBy(identity.aliases, (value) => value.fingerprint),
    externalIdentifiers: sortBy(identity.externalIdentifiers, (value) => value.fingerprint),
    identityKeys: sortBy(identity.identityKeys, (value) => value.fingerprint),
    context: identity.context,
    attributes: identity.attributes,
    provenance: sortBy(identity.provenance.map(({observedAt: _observedAt, ...value}) => value), (value) => `${value.producer}:${value.source}:${value.field}:${value.extractionMethod}`),
  });
}

export const fingerprintEntityCandidate = (candidate: Omit<EntityCandidate, "fingerprint">): string => fp({
  candidateId: candidate.candidateId,
  entityType: candidate.entityType,
  identityFingerprint: candidate.identity.fingerprint,
  safeSummary: candidate.safeSummary,
  source: candidate.source,
  status: candidate.status,
});

export const fingerprintIdentityComparison = (comparison: Omit<IdentityComparisonResult, "comparisonFingerprint">): string => fp({
  ...comparison,
  matchedKeys: sortBy(comparison.matchedKeys, (value) => value.fingerprint),
  supportingEvidence: sortBy(comparison.supportingEvidence, (value) => value.fingerprint),
  conflictingEvidence: sortBy(comparison.conflictingEvidence, (value) => value.fingerprint),
  missingEvidence: sortBy(comparison.missingEvidence, (value) => value.fingerprint),
  conflictCodes: [...comparison.conflictCodes].sort(),
  explanationCodes: [...comparison.explanationCodes].sort(),
});

export const fingerprintEntityResolution = (resolution: Omit<EntityResolutionResult, "resolutionFingerprint">): string => fp({
  ...resolution,
  candidates: sortBy(resolution.candidates, (value) => `${value.comparison.comparisonFingerprint}:${value.candidate.candidateId}`),
  reasonCodes: [...resolution.reasonCodes].sort(),
});
