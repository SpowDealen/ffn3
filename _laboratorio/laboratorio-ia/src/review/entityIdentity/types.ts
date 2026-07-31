export const UNIVERSAL_ENTITY_TYPES = Object.freeze([
  "fighter",
  "event",
  "organization",
  "discipline",
  "weight_category",
  "fight",
  "news",
  "result",
] as const);

export type UniversalEntityType = typeof UNIVERSAL_ENTITY_TYPES[number];
export type IdentityConfidence = "very_high" | "high" | "medium" | "low";
export type IdentityDecision =
  | "exact_match"
  | "strong_match"
  | "probable_match"
  | "ambiguous"
  | "no_match"
  | "conflicting_identity"
  | "insufficient_evidence"
  | "unsupported_entity_type";
export type IdentityKeyStrength = "definitive" | "very_strong" | "strong" | "contextual" | "weak";
export type EntityAliasType = "official" | "nickname" | "abbreviation" | "transliteration" | "historical" | "editorial" | "source_specific" | "slug";
export type IdentityConflictCode =
  | "entity_type_mismatch"
  | "verified_external_id_conflict"
  | "birth_date_conflict"
  | "legal_name_conflict"
  | "organization_conflict"
  | "event_edition_conflict"
  | "event_date_conflict"
  | "discipline_conflict"
  | "weight_limit_conflict"
  | "division_conflict"
  | "ruleset_conflict"
  | "event_conflict"
  | "participants_conflict"
  | "fight_identity_conflict"
  | "result_scope_conflict"
  | "result_method_conflict";

export type IdentityProvenance = Readonly<{
  producer: string;
  source: string;
  field: string;
  extractionMethod: "explicit" | "catalog" | "parsed" | "inferred" | "fixture";
  observedAt?: string;
  confidence: number;
  verified: boolean;
}>;

export type NormalizedIdentityValue = Readonly<{
  originalValue: string;
  normalizedValue: string;
  transformations: readonly string[];
}>;

export type EntityAlias = Readonly<{
  aliasVersion: "1.0.0";
  value: string;
  normalizedValue: string;
  aliasType: EntityAliasType;
  locale?: string;
  source: string;
  confidence: number;
  verified: boolean;
  provenance: IdentityProvenance;
  fingerprint: string;
}>;

export type ExternalEntityIdentifier = Readonly<{
  identifierVersion: "1.0.0";
  source: string;
  namespace: string;
  value: string;
  entityType: UniversalEntityType;
  confidence: number;
  verified: boolean;
  fingerprint: string;
}>;

export type EntityIdentityKey = Readonly<{
  keyVersion: "1.0.0";
  keyType: string;
  strength: IdentityKeyStrength;
  fieldsUsed: readonly string[];
  normalizedValue: string;
  fingerprint: string;
}>;

export type SafeEntityContextValue = string | number | boolean | readonly string[];
export type SafeEntityContext = Readonly<Record<string, SafeEntityContextValue>>;
export type SafeRawIdentityField = Readonly<{field: string; value: string}>;

type BaseIdentity<T extends UniversalEntityType, A extends SafeEntityContext> = Readonly<{
  identityVersion: "1.0.0";
  entityType: T;
  source: string;
  primaryLabel: string;
  normalizedPrimaryLabel: string;
  rawInput: readonly SafeRawIdentityField[];
  normalizedFields: Readonly<Record<string, NormalizedIdentityValue>>;
  aliases: readonly EntityAlias[];
  externalIdentifiers: readonly ExternalEntityIdentifier[];
  identityKeys: readonly EntityIdentityKey[];
  context: SafeEntityContext;
  attributes: A;
  provenance: readonly IdentityProvenance[];
  fingerprint: string;
}>;

export type FighterIdentity = BaseIdentity<"fighter", SafeEntityContext & {
  givenName?: string; familyName?: string; nickname?: string; birthDate?: string; nationality?: string;
  organizations?: readonly string[]; discipline?: string; weightCategory?: string; slug?: string;
}>;
export type EventIdentity = BaseIdentity<"event", SafeEntityContext & {
  baseName: string; edition?: string; organization?: string; date?: string; city?: string; venue?: string;
  country?: string; mainEvent?: readonly string[]; officialUrl?: string; rescheduledFrom?: string;
}>;
export type OrganizationIdentity = BaseIdentity<"organization", SafeEntityContext & {
  officialName: string; abbreviation?: string; officialDomain?: string; country?: string; primaryDiscipline?: string;
}>;
export type DisciplineIdentity = BaseIdentity<"discipline", SafeEntityContext & {
  catalogId?: string; modality?: string; ruleset?: string;
}>;
export type WeightCategoryIdentity = BaseIdentity<"weight_category", SafeEntityContext & {
  limitKg?: number; limitLb?: number; discipline?: string; organization?: string; division?: string; ruleset?: string;
}>;
export type FightIdentity = BaseIdentity<"fight", SafeEntityContext & {
  eventKey?: string; eventDate?: string; participants: readonly string[]; category?: string; discipline?: string; phase?: string;
}>;
export type NewsIdentity = BaseIdentity<"news", SafeEntityContext & {
  canonicalUrl?: string; sourceId?: string; publisher?: string; publishedDate?: string;
  primaryEntities?: readonly string[]; relatedEvent?: string; contentFingerprint?: string;
}>;
export type ResultIdentity = BaseIdentity<"result", SafeEntityContext & {
  resultScope: "event" | "fight" | "editorial_summary"; eventKey?: string; fightKey?: string;
  participants?: readonly string[]; winner?: string; method?: string; round?: number; time?: string;
}>;

export type UniversalEntityIdentity =
  | FighterIdentity | EventIdentity | OrganizationIdentity | DisciplineIdentity
  | WeightCategoryIdentity | FightIdentity | NewsIdentity | ResultIdentity;

type CommonIdentityInput<T extends UniversalEntityType> = {
  entityType: T;
  source: string;
  primaryLabel: string;
  aliases?: readonly Omit<EntityAlias, "aliasVersion" | "normalizedValue" | "fingerprint">[];
  externalIdentifiers?: readonly Omit<ExternalEntityIdentifier, "identifierVersion" | "entityType" | "fingerprint">[];
  provenance: readonly IdentityProvenance[];
};

export type FighterIdentityInput = CommonIdentityInput<"fighter"> & {
  givenName?: string; familyName?: string; nickname?: string; transliterations?: readonly string[];
  birthDate?: string; nationality?: string; organizations?: readonly string[]; discipline?: string;
  weightCategory?: string; slug?: string;
};
export type EventIdentityInput = CommonIdentityInput<"event"> & {
  baseName?: string; edition?: string | number; organization?: string; date?: string; city?: string; venue?: string;
  country?: string; mainEvent?: readonly string[]; officialUrl?: string; rescheduledFrom?: string;
};
export type OrganizationIdentityInput = CommonIdentityInput<"organization"> & {
  officialName?: string; abbreviation?: string; historicalNames?: readonly string[]; officialDomain?: string;
  country?: string; primaryDiscipline?: string;
};
export type DisciplineIdentityInput = CommonIdentityInput<"discipline"> & {
  catalogId?: string; catalogAliases?: readonly string[]; modality?: string; ruleset?: string;
};
export type WeightCategoryIdentityInput = CommonIdentityInput<"weight_category"> & {
  limit?: number; unit?: "kg" | "lb"; discipline?: string; organization?: string; division?: string; ruleset?: string;
};
export type FightIdentityInput = CommonIdentityInput<"fight"> & {
  eventKey?: string; eventDate?: string; participants: readonly string[]; category?: string; discipline?: string; phase?: string;
};
export type NewsIdentityInput = CommonIdentityInput<"news"> & {
  canonicalUrl?: string; sourceId?: string; publisher?: string; publishedDate?: string;
  primaryEntities?: readonly string[]; relatedEvent?: string; contentFingerprint?: string;
};
export type ResultIdentityInput = CommonIdentityInput<"result"> & {
  resultScope: "event" | "fight" | "editorial_summary"; eventKey?: string; fightKey?: string;
  participants?: readonly string[]; winner?: string; method?: string; round?: number; time?: string;
};
export type UniversalEntityIdentityInput =
  | FighterIdentityInput | EventIdentityInput | OrganizationIdentityInput | DisciplineIdentityInput
  | WeightCategoryIdentityInput | FightIdentityInput | NewsIdentityInput | ResultIdentityInput;

export type IdentityEvidenceKind = "key_match" | "field_match" | "alias_match" | "context_match" | "missing" | "conflict";
export type IdentityEvidence = Readonly<{
  kind: IdentityEvidenceKind;
  code: string;
  field?: string;
  strength: IdentityKeyStrength;
  summary: string;
  fingerprint: string;
}>;

export type IdentityComparisonResult = Readonly<{
  decision: IdentityDecision;
  score: number;
  matchedKeys: readonly IdentityEvidence[];
  supportingEvidence: readonly IdentityEvidence[];
  conflictingEvidence: readonly IdentityEvidence[];
  missingEvidence: readonly IdentityEvidence[];
  conflictCodes: readonly IdentityConflictCode[];
  confidence: IdentityConfidence;
  explanationCodes: readonly string[];
  inputFingerprint: string;
  candidateFingerprint: string;
  comparisonFingerprint: string;
}>;

export type EntityCandidate = Readonly<{
  candidateId: string;
  entityType: UniversalEntityType;
  identity: UniversalEntityIdentity;
  safeSummary: string;
  source: string;
  status?: string;
  fingerprint: string;
}>;

export type RankedEntityCandidate = Readonly<{candidate: EntityCandidate; comparison: IdentityComparisonResult}>;
export type EntityResolutionStatus = "reuse" | "probable_match" | "ambiguous" | "create_new" | "conflicting_identity" | "insufficient_evidence" | "unsupported";
export type EntityResolutionResult = Readonly<{
  status: EntityResolutionStatus;
  entityType: UniversalEntityType;
  candidateId?: string;
  comparison?: IdentityComparisonResult;
  candidates: readonly RankedEntityCandidate[];
  reasonCodes: readonly string[];
  inputFingerprint: string;
  resolutionFingerprint: string;
}>;

export type DuplicateClassification = "canonical" | "duplicate" | "possible_duplicate" | "conflicting_duplicate";
export type EntityDuplicateAssessment = Readonly<{
  classification: DuplicateClassification;
  candidateId: string;
  comparison: IdentityComparisonResult;
  evidenceFingerprint: string;
}>;

export interface EntityIdentityStrategy<T extends UniversalEntityType = UniversalEntityType> {
  readonly entityType: T;
  readonly version: string;
  build(input: Extract<UniversalEntityIdentityInput, {entityType: T}>): Extract<UniversalEntityIdentity, {entityType: T}>;
  compare(input: Extract<UniversalEntityIdentity, {entityType: T}>, candidate: Extract<UniversalEntityIdentity, {entityType: T}>): IdentityComparisonResult;
  canCreate(identity: Extract<UniversalEntityIdentity, {entityType: T}>): {allowed: boolean; reasonCodes: readonly string[]};
}

export const entityIdentitySecurity = Object.freeze({
  pure: true,
  deterministic: true,
  network: false,
  io: false,
  sanity: false,
  writes: false,
  localStorage: false,
  secrets: false,
  fullDocuments: false,
  fullPayloads: false,
} as const);
