import {normalizeIdentityDate, normalizeIdentityText} from "../normalize";
import type {EntityIdentityStrategy, FighterIdentity, FighterIdentityInput, IdentityEvidence} from "../types";
import {
  baseConflict, commonIdentity, comparison, evidence, externalIdentityKeys, finalizeIdentity,
  genericNoMatch, identityKey, labelRelation, matchingExternalId, normalizedContext, normalizedField, safeRaw, sameNormalized,
} from "./shared";

function build(input: FighterIdentityInput): FighterIdentity {
  const common = commonIdentity(input, [
    ...(input.givenName && input.familyName ? [{value: `${input.givenName} ${input.familyName}`, type: "official" as const, confidence: .98, verified: true}] : []),
    ...(input.nickname ? [{value: input.nickname, type: "nickname" as const, confidence: .9}] : []),
    ...(input.transliterations ?? []).map((value) => ({value, type: "transliteration" as const, confidence: .85})),
    ...(input.slug ? [{value: input.slug.replace(/-/gu, " "), type: "slug" as const, confidence: .75}] : []),
  ]);
  const given = normalizedField(input.givenName);
  const family = normalizedField(input.familyName);
  const nickname = normalizedField(input.nickname);
  const birthDate = normalizeIdentityDate(input.birthDate);
  const context = normalizedContext({
    givenName: given?.normalizedValue,
    familyName: family?.normalizedValue,
    nickname: nickname?.normalizedValue,
    birthDate,
    nationality: input.nationality,
    organizations: input.organizations,
    discipline: input.discipline,
    weightCategory: input.weightCategory,
    slug: input.slug,
  });
  const keys = [
    ...externalIdentityKeys(common.externalIdentifiers),
    identityKey("canonical-full-name", "strong", ["primaryLabel"], common.normalizedPrimaryLabel),
    ...(birthDate ? [identityKey("full-name-plus-birth-date", "very_strong", ["primaryLabel", "birthDate"], `${common.normalizedPrimaryLabel}:${birthDate}`)] : []),
    ...(input.nationality ? [identityKey("full-name-plus-nationality", "contextual", ["primaryLabel", "nationality"], `${common.normalizedPrimaryLabel}:${normalizeIdentityText(input.nationality).normalizedValue}`)] : []),
    ...common.aliases.filter((alias) => alias.verified).map((alias) => identityKey("verified-alias", "strong", ["alias", "provenance"], alias.normalizedValue)),
  ];
  return finalizeIdentity<FighterIdentity>({
    ...common,
    entityType: "fighter",
    rawInput: safeRaw({primaryLabel: input.primaryLabel, givenName: input.givenName, familyName: input.familyName, nickname: input.nickname, birthDate: input.birthDate, nationality: input.nationality, slug: input.slug}),
    normalizedFields: Object.freeze(Object.fromEntries([["primaryLabel", normalizeIdentityText(input.primaryLabel)], ["givenName", given], ["familyName", family], ["nickname", nickname]].filter((entry): entry is [string, NonNullable<typeof given>] => Boolean(entry[1])))),
    identityKeys: keys,
    context,
    attributes: context,
  });
}

function compare(input: FighterIdentity, candidate: FighterIdentity) {
  const base = baseConflict(input, candidate);
  if (base) return base;
  if (input.attributes.birthDate && candidate.attributes.birthDate && input.attributes.birthDate !== candidate.attributes.birthDate) return comparison({
    decision: "conflicting_identity", score: 0, input, candidate,
    conflicting: [evidence("conflict", "birth_date_conflict", "definitive", "Las fechas de nacimiento son incompatibles.", "birthDate")],
    conflictCodes: ["birth_date_conflict"],
  });
  if (matchingExternalId(input, candidate)) return comparison({
    decision: "exact_match", score: 1, input, candidate,
    matchedKeys: [evidence("key_match", "external_id_exact", "definitive", "Coincide un identificador externo del mismo namespace.", "externalIdentifiers")],
  });
  const labels = labelRelation(input, candidate);
  const supporting: IdentityEvidence[] = [];
  if (input.attributes.nickname && candidate.attributes.nickname && sameNormalized(input.attributes.nickname, candidate.attributes.nickname)) {
    supporting.push(evidence("context_match", "nickname_compatible", "contextual", "El apodo es compatible.", "nickname"));
  }
  if (input.attributes.nationality && candidate.attributes.nationality && sameNormalized(input.attributes.nationality, candidate.attributes.nationality)) {
    supporting.push(evidence("context_match", "nationality_compatible", "contextual", "La nacionalidad aporta contexto compatible.", "nationality"));
  }
  if (labels.verifiedAlias) return comparison({
    decision: "strong_match", score: .96, input, candidate, supporting,
    matchedKeys: [evidence("alias_match", "verified_alias_match", "strong", "Coincide un alias verificado.", "aliases")],
  });
  if (labels.exact && !labels.surnameOnly) return comparison({
    decision: "strong_match", score: supporting.length ? .96 : .93, input, candidate, supporting,
    matchedKeys: [evidence("key_match", "canonical_name_match", "strong", "Coincide el nombre completo normalizado.", "primaryLabel")],
  });
  if (labels.initialSurname) return comparison({
    decision: "probable_match", score: .72, input, candidate,
    supporting: [evidence("field_match", "initial_surname_match", "weak", "Inicial y apellido son compatibles, pero no concluyentes.", "primaryLabel")],
    missing: [evidence("missing", "full_name_missing", "strong", "Falta el nombre completo.", "primaryLabel")],
  });
  if (labels.surnameOnly) return comparison({
    decision: "insufficient_evidence", score: .45, input, candidate,
    supporting: [evidence("field_match", "surname_only", "weak", "Sólo coincide el apellido.", "primaryLabel")],
    missing: [evidence("missing", "given_name_missing", "strong", "Un apellido aislado no identifica a una persona.", "givenName")],
  });
  if (labels.similarity >= .8) return comparison({
    decision: "probable_match", score: labels.similarity * .85, input, candidate,
    supporting: [evidence("field_match", "name_similarity", "weak", "Los nombres son similares, pendiente de contexto.", "primaryLabel")],
  });
  return genericNoMatch(input, candidate, labels.similarity);
}

export const fighterIdentityStrategy: EntityIdentityStrategy<"fighter"> = Object.freeze({
  entityType: "fighter",
  version: "1.0.0",
  build,
  compare,
  canCreate(identity: FighterIdentity) {
    const fullName = identity.normalizedPrimaryLabel.split(" ").length >= 2;
    const supported = Boolean(identity.externalIdentifiers.length || fullName && identity.provenance.some((item) => item.confidence >= .75));
    return {allowed: supported, reasonCodes: supported ? ["fighter_identity_sufficient"] : ["fighter_full_identity_required"]};
  },
});
