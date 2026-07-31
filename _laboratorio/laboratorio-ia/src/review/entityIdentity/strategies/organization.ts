import {normalizeAcronym, normalizeDomain, normalizeIdentityText} from "../normalize";
import type {EntityIdentityStrategy, OrganizationIdentity, OrganizationIdentityInput} from "../types";
import {
  baseConflict, commonIdentity, comparison, evidence, externalIdentityKeys, finalizeIdentity, genericNoMatch,
  identityKey, labelRelation, matchingExternalId, normalizedContext, safeRaw,
} from "./shared";

function acronym(value: string): string {
  const normalized = normalizeAcronym(value).normalizedValue;
  if (/^[a-z0-9]{2,8}$/u.test(normalized)) return normalized;
  return normalizeIdentityText(value).normalizedValue.split(" ").map((part) => part[0]).join("");
}

function build(input: OrganizationIdentityInput): OrganizationIdentity {
  const officialName = input.officialName ?? input.primaryLabel;
  const abbreviation = input.abbreviation ? normalizeAcronym(input.abbreviation).normalizedValue : undefined;
  const domain = normalizeDomain(input.officialDomain);
  const common = commonIdentity(input, [
    ...(input.abbreviation ? [{value: input.abbreviation, type: "abbreviation" as const, confidence: .95, verified: true}] : []),
    ...(input.historicalNames ?? []).map((value) => ({value, type: "historical" as const, confidence: .9, verified: true})),
  ]);
  const context = normalizedContext({officialName, abbreviation, officialDomain: domain, country: input.country, primaryDiscipline: input.primaryDiscipline});
  const keys = [
    ...externalIdentityKeys(common.externalIdentifiers),
    identityKey("organization-official-name", "strong", ["officialName"], normalizeIdentityText(officialName).normalizedValue),
    ...(domain ? [identityKey("organization-official-domain", "very_strong", ["officialDomain"], domain)] : []),
  ];
  return finalizeIdentity<OrganizationIdentity>({
    ...common,
    entityType: "organization",
    rawInput: safeRaw({primaryLabel: input.primaryLabel, officialName, abbreviation: input.abbreviation, officialDomain: input.officialDomain, country: input.country}),
    normalizedFields: {primaryLabel: normalizeIdentityText(input.primaryLabel), officialName: normalizeIdentityText(officialName), ...(input.abbreviation ? {abbreviation: normalizeAcronym(input.abbreviation)} : {})},
    identityKeys: keys, context, attributes: context as OrganizationIdentity["attributes"],
  });
}

function compare(input: OrganizationIdentity, candidate: OrganizationIdentity) {
  const base = baseConflict(input, candidate);
  if (base) return base;
  if (matchingExternalId(input, candidate)) return comparison({decision: "exact_match", score: 1, input, candidate, matchedKeys: [evidence("key_match", "organization_external_id_exact", "definitive", "Coincide el ID externo de la organización.")]});
  if (input.attributes.officialDomain && input.attributes.officialDomain === candidate.attributes.officialDomain) return comparison({decision: "exact_match", score: .99, input, candidate, matchedKeys: [evidence("key_match", "official_domain_match", "very_strong", "Coincide el dominio oficial.")]});
  const labels = labelRelation(input, candidate);
  if (labels.verifiedAlias || labels.exact) return comparison({decision: "strong_match", score: .95, input, candidate, matchedKeys: [evidence("alias_match", "organization_name_alias_match", "strong", "Coinciden nombre oficial o alias verificado.")]});
  const leftAcronym = input.attributes.abbreviation ?? acronym(input.attributes.officialName);
  const rightAcronym = candidate.attributes.abbreviation ?? acronym(candidate.attributes.officialName);
  if (leftAcronym && leftAcronym === rightAcronym) return comparison({
    decision: input.normalizedPrimaryLabel.replace(/\s+/gu, "") === candidate.normalizedPrimaryLabel.replace(/\s+/gu, "")
      || input.attributes.country && candidate.attributes.country && input.attributes.country === candidate.attributes.country
      ? "strong_match" : "probable_match",
    score: input.normalizedPrimaryLabel.replace(/\s+/gu, "") === candidate.normalizedPrimaryLabel.replace(/\s+/gu, "")
      || input.attributes.country && candidate.attributes.country && input.attributes.country === candidate.attributes.country
      ? .9 : .7,
    input,
    candidate,
    supporting: [evidence("field_match", "organization_acronym_match", "contextual", "Coinciden las siglas; el contexto determina su fuerza.", "abbreviation")],
  });
  return genericNoMatch(input, candidate, labels.similarity);
}

export const organizationIdentityStrategy: EntityIdentityStrategy<"organization"> = Object.freeze({
  entityType: "organization", version: "1.0.0", build, compare,
  canCreate(identity: OrganizationIdentity) {
    const allowed = identity.normalizedPrimaryLabel.length >= 3 && Boolean(identity.attributes.officialDomain || identity.attributes.country || identity.provenance.some((item) => item.verified));
    return {allowed, reasonCodes: allowed ? ["organization_identity_sufficient"] : ["organization_context_required"]};
  },
});
