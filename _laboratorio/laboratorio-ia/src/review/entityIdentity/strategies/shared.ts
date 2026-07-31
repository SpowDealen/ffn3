import {
  fingerprintEntityAlias,
  fingerprintEntityIdentity,
  fingerprintEntityIdentityKey,
  fingerprintExternalEntityIdentifier,
  fingerprintIdentityComparison,
} from "../fingerprint";
import {normalizeIdentityText, tokenSimilarity} from "../normalize";
import type {
  EntityAlias,
  EntityIdentityKey,
  ExternalEntityIdentifier,
  IdentityComparisonResult,
  IdentityConfidence,
  IdentityConflictCode,
  IdentityDecision,
  IdentityEvidence,
  IdentityKeyStrength,
  NormalizedIdentityValue,
  SafeEntityContext,
  SafeRawIdentityField,
  UniversalEntityIdentity,
  UniversalEntityIdentityInput,
} from "../types";
import type {ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint} from "../../universal";

const fp = (value: unknown) => computeUniversalFingerprint(value as ReviewJsonValue);
const cleanText = (value: string) => value.replace(/(?:token|secret|authorization|password)\s*[=:]\s*\S+/giu, "$1=[redacted]").replace(/https?:\/\/\S+/giu, "[url]").slice(0, 240);

export function evidence(
  kind: IdentityEvidence["kind"],
  code: string,
  strength: IdentityKeyStrength,
  summary: string,
  field?: string,
): IdentityEvidence {
  const semantic = {kind, code, strength, summary: cleanText(summary), field};
  return Object.freeze({...semantic, fingerprint: fp(semantic)});
}

export function comparison(input: {
  decision: IdentityDecision;
  score: number;
  input: UniversalEntityIdentity;
  candidate: UniversalEntityIdentity;
  matchedKeys?: readonly IdentityEvidence[];
  supporting?: readonly IdentityEvidence[];
  conflicting?: readonly IdentityEvidence[];
  missing?: readonly IdentityEvidence[];
  conflictCodes?: readonly IdentityConflictCode[];
  explanationCodes?: readonly string[];
}): IdentityComparisonResult {
  const confidence: IdentityConfidence = input.decision === "exact_match" ? "very_high"
    : input.decision === "strong_match" ? "high"
      : input.decision === "probable_match" ? "medium" : "low";
  const semantic = {
    decision: input.decision,
    score: Math.max(0, Math.min(1, Number(input.score.toFixed(4)))),
    matchedKeys: Object.freeze([...(input.matchedKeys ?? [])].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint))),
    supportingEvidence: Object.freeze([...(input.supporting ?? [])].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint))),
    conflictingEvidence: Object.freeze([...(input.conflicting ?? [])].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint))),
    missingEvidence: Object.freeze([...(input.missing ?? [])].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint))),
    conflictCodes: Object.freeze([...new Set(input.conflictCodes ?? [])].sort()),
    confidence,
    explanationCodes: Object.freeze([...new Set(input.explanationCodes ?? [input.decision])].sort()),
    inputFingerprint: input.input.fingerprint,
    candidateFingerprint: input.candidate.fingerprint,
  } as const;
  return Object.freeze({...semantic, comparisonFingerprint: fingerprintIdentityComparison(semantic)});
}

export function unsupportedComparison(input: UniversalEntityIdentity, candidate: UniversalEntityIdentity): IdentityComparisonResult {
  return comparison({
    decision: "unsupported_entity_type",
    score: 0,
    input,
    candidate,
    conflicting: [evidence("conflict", "entity_type_mismatch", "definitive", "Los tipos de entidad son incompatibles.", "entityType")],
    conflictCodes: ["entity_type_mismatch"],
  });
}

export function buildAliases(
  input: UniversalEntityIdentityInput,
  additional: readonly {value: string; type: EntityAlias["aliasType"]; verified?: boolean; confidence?: number; locale?: string}[] = [],
): EntityAlias[] {
  const sourceProvenance = input.provenance[0] ?? {
    producer: "unknown", source: input.source, field: "alias", extractionMethod: "explicit" as const, confidence: .5, verified: false,
  };
  const raw = [
    ...(input.aliases ?? []),
    ...additional.map((item) => ({
      value: item.value,
      aliasType: item.type,
      source: input.source,
      confidence: item.confidence ?? (item.verified ? .95 : .7),
      verified: item.verified ?? false,
      locale: item.locale,
      provenance: {...sourceProvenance, field: "alias", confidence: item.confidence ?? sourceProvenance.confidence, verified: item.verified ?? sourceProvenance.verified},
    })),
  ].slice(0, 32);
  const values = new Map<string, EntityAlias>();
  for (const alias of raw) {
    const safeValue = cleanText(alias.value);
    const normalizedValue = normalizeIdentityText(safeValue).normalizedValue;
    if (!normalizedValue) continue;
    const semantic = {
      aliasVersion: "1.0.0" as const,
      value: safeValue.trim().slice(0, 180),
      normalizedValue,
      aliasType: alias.aliasType,
      locale: alias.locale,
      source: alias.source.slice(0, 100),
      confidence: Math.max(0, Math.min(1, alias.confidence)),
      verified: alias.verified,
      provenance: alias.provenance,
    };
    const built = Object.freeze({...semantic, fingerprint: fingerprintEntityAlias(semantic)});
    const key = `${built.aliasType}:${built.normalizedValue}:${built.source}`;
    const current = values.get(key);
    if (!current || built.confidence > current.confidence) values.set(key, built);
  }
  return [...values.values()].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
}

export function buildExternalIdentifiers(input: UniversalEntityIdentityInput): ExternalEntityIdentifier[] {
  const values = new Map<string, ExternalEntityIdentifier>();
  for (const identifier of (input.externalIdentifiers ?? []).slice(0, 32)) {
    const value = cleanText(identifier.value.trim()).slice(0, 180);
    const namespace = identifier.namespace.trim().toLowerCase().slice(0, 100);
    const source = identifier.source.trim().toLowerCase().slice(0, 100);
    if (!value || !namespace || !source) continue;
    const semantic = {
      identifierVersion: "1.0.0" as const,
      source,
      namespace,
      value,
      entityType: input.entityType,
      confidence: Math.max(0, Math.min(1, identifier.confidence)),
      verified: identifier.verified,
    };
    const built = Object.freeze({...semantic, fingerprint: fingerprintExternalEntityIdentifier(semantic)});
    values.set(`${source}:${namespace}:${value}`, built);
  }
  return [...values.values()].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
}

export function identityKey(keyType: string, strength: IdentityKeyStrength, fieldsUsed: readonly string[], normalizedValue: string): EntityIdentityKey {
  const semantic = {
    keyVersion: "1.0.0" as const,
    keyType,
    strength,
    fieldsUsed: Object.freeze([...new Set(fieldsUsed)].sort()),
    normalizedValue: normalizedValue.slice(0, 500),
  };
  return Object.freeze({...semantic, fingerprint: fingerprintEntityIdentityKey(semantic)});
}

export function externalIdentityKeys(identifiers: readonly ExternalEntityIdentifier[]): EntityIdentityKey[] {
  return identifiers.map((identifier) => identityKey(
    "external-id",
    identifier.verified ? "definitive" : "very_strong",
    ["entityType", "source", "namespace", "value"],
    `${identifier.entityType}:${identifier.source}:${identifier.namespace}:${identifier.value}`,
  ));
}

export function normalizedField(value?: string, options?: Parameters<typeof normalizeIdentityText>[1]): NormalizedIdentityValue | undefined {
  return value?.trim() ? normalizeIdentityText(value, options) : undefined;
}

export function safeRaw(fields: Readonly<Record<string, unknown>>): SafeRawIdentityField[] {
  return Object.entries(fields).flatMap(([field, value]) => {
    if (typeof value === "string" && value.trim()) return [{field, value: cleanText(value.trim())}];
    if (typeof value === "number" && Number.isFinite(value)) return [{field, value: String(value)}];
    return [];
  }).sort((a, b) => a.field.localeCompare(b.field)).slice(0, 32);
}

export function finalizeIdentity<T extends UniversalEntityIdentity>(identity: Omit<T, "fingerprint">): T {
  const semantic = {
    ...identity,
    rawInput: Object.freeze([...identity.rawInput]),
    normalizedFields: Object.freeze({...identity.normalizedFields}),
    aliases: Object.freeze([...identity.aliases].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint))),
    externalIdentifiers: Object.freeze([...identity.externalIdentifiers].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint))),
    identityKeys: Object.freeze([...identity.identityKeys].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint))),
    context: Object.freeze({...identity.context}),
    attributes: Object.freeze({...identity.attributes}),
    provenance: Object.freeze([...identity.provenance]),
  };
  return Object.freeze({...semantic, fingerprint: fingerprintEntityIdentity(semantic as Omit<UniversalEntityIdentity, "fingerprint">)}) as T;
}

export function commonIdentity<T extends UniversalEntityIdentityInput>(input: T, additionalAliases: Parameters<typeof buildAliases>[1] = []) {
  const safePrimaryLabel = cleanText(input.primaryLabel);
  const primary = normalizeIdentityText(safePrimaryLabel);
  return {
    identityVersion: "1.0.0" as const,
    entityType: input.entityType,
    source: input.source.slice(0, 100),
    primaryLabel: safePrimaryLabel.trim().slice(0, 240),
    normalizedPrimaryLabel: primary.normalizedValue,
    aliases: buildAliases(input, additionalAliases),
    externalIdentifiers: buildExternalIdentifiers(input),
    provenance: [...input.provenance],
  };
}

export function matchingExternalId(left: UniversalEntityIdentity, right: UniversalEntityIdentity): boolean {
  const rightIds = new Set(right.externalIdentifiers.map((value) => `${value.source}:${value.namespace}:${value.value}`));
  return left.externalIdentifiers.some((value) => rightIds.has(`${value.source}:${value.namespace}:${value.value}`));
}

export function verifiedExternalConflict(left: UniversalEntityIdentity, right: UniversalEntityIdentity): boolean {
  for (const value of left.externalIdentifiers.filter((item) => item.verified)) {
    const sameNamespace = right.externalIdentifiers.filter((item) => item.verified && item.source === value.source && item.namespace === value.namespace);
    if (sameNamespace.length && sameNamespace.every((item) => item.value !== value.value)) return true;
  }
  return false;
}

export function labelValues(identity: UniversalEntityIdentity): Set<string> {
  return new Set([identity.normalizedPrimaryLabel, ...identity.aliases.map((alias) => alias.normalizedValue)].filter(Boolean));
}

export function labelRelation(left: UniversalEntityIdentity, right: UniversalEntityIdentity): {
  exact: boolean; verifiedAlias: boolean; similarity: number; surnameOnly: boolean; initialSurname: boolean;
} {
  const a = labelValues(left);
  const b = labelValues(right);
  const exactValues = [...a].filter((value) => b.has(value));
  const verified = left.aliases.some((alias) => alias.verified && b.has(alias.normalizedValue))
    || right.aliases.some((alias) => alias.verified && a.has(alias.normalizedValue));
  const similarity = Math.max(0, ...[...a].flatMap((one) => [...b].map((two) => tokenSimilarity(one, two))));
  const leftParts = left.normalizedPrimaryLabel.split(" ");
  const rightParts = right.normalizedPrimaryLabel.split(" ");
  const short = leftParts.length <= rightParts.length ? leftParts : rightParts;
  const long = leftParts.length <= rightParts.length ? rightParts : leftParts;
  const surnameOnly = short.length === 1 && long.at(-1) === short[0];
  const initialSurname = leftParts.length === 2 && rightParts.length === 2 && (
    leftParts[0].length === 1 && rightParts[0]?.startsWith(leftParts[0]) && leftParts[1] === rightParts[1]
    || rightParts[0].length === 1 && leftParts[0]?.startsWith(rightParts[0]) && rightParts[1] === leftParts[1]
  );
  return {exact: exactValues.length > 0, verifiedAlias: verified, similarity, surnameOnly, initialSurname: Boolean(initialSurname)};
}

export function sameNormalized(left?: string, right?: string): boolean {
  return Boolean(left && right && normalizeIdentityText(left).normalizedValue === normalizeIdentityText(right).normalizedValue);
}

export function contextValue(context: SafeEntityContext, key: string): string | undefined {
  const value = context[key];
  return typeof value === "string" ? value : undefined;
}

export function contextArray(context: SafeEntityContext, key: string): readonly string[] {
  const value = context[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function normalizedContext(values: Readonly<Record<string, string | number | boolean | readonly string[] | undefined>>): SafeEntityContext {
  return Object.freeze(Object.fromEntries(Object.entries(values).flatMap(([key, value]) => {
    if (value === undefined || value === "") return [];
    if (Array.isArray(value)) return [[key, Object.freeze(value.map((item) => normalizeIdentityText(String(item)).normalizedValue).filter(Boolean).sort())]];
    if (typeof value === "string") {
      const preserve = /(?:url|domain|fingerprint|id|key|date|time|edition|rescheduledfrom)$/iu.test(key);
      return [[key, preserve ? value.trim() : normalizeIdentityText(value).normalizedValue]];
    }
    return [[key, value]];
  }).sort((left, right) => String(left[0]).localeCompare(String(right[0])))) as SafeEntityContext);
}

export function baseConflict(
  input: UniversalEntityIdentity,
  candidate: UniversalEntityIdentity,
): IdentityComparisonResult | undefined {
  if (input.entityType !== candidate.entityType) return unsupportedComparison(input, candidate);
  if (verifiedExternalConflict(input, candidate)) return comparison({
    decision: "conflicting_identity",
    score: 0,
    input,
    candidate,
    conflicting: [evidence("conflict", "verified_external_id_conflict", "definitive", "Dos IDs verificados del mismo namespace son incompatibles.", "externalIdentifiers")],
    conflictCodes: ["verified_external_id_conflict"],
  });
  return undefined;
}

export function genericNoMatch(input: UniversalEntityIdentity, candidate: UniversalEntityIdentity, score = 0): IdentityComparisonResult {
  return comparison({decision: score > .4 ? "insufficient_evidence" : "no_match", score, input, candidate, explanationCodes: [score > .4 ? "identity_context_missing" : "identity_not_matched"]});
}

export const normalizedSetEquals = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
