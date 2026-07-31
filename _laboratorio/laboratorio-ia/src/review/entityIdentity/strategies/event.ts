import {normalizeCanonicalUrl, normalizeEdition, normalizeIdentityDate, normalizeIdentityText, stripEventEditorialTitle} from "../normalize";
import type {EntityIdentityStrategy, EventIdentity, EventIdentityInput, IdentityEvidence} from "../types";
import {
  baseConflict, commonIdentity, comparison, evidence, externalIdentityKeys, finalizeIdentity, genericNoMatch,
  identityKey, labelRelation, matchingExternalId, normalizedContext, safeRaw, sameNormalized,
} from "./shared";

function inferredEdition(label: string): string | undefined {
  const match = stripEventEditorialTitle(label).match(/\b(\d+|[ivxlc]+)\b$/iu);
  return match ? normalizeEdition(match[1]) : undefined;
}

function build(input: EventIdentityInput): EventIdentity {
  const baseName = stripEventEditorialTitle(input.baseName ?? input.primaryLabel);
  const edition = normalizeEdition(input.edition) ?? inferredEdition(input.primaryLabel);
  const date = normalizeIdentityDate(input.date);
  const officialUrl = normalizeCanonicalUrl(input.officialUrl);
  const mainEvent = [...(input.mainEvent ?? [])].map((value) => normalizeIdentityText(value).normalizedValue).filter(Boolean).sort();
  const common = commonIdentity(input, input.baseName && input.baseName !== input.primaryLabel ? [{value: input.baseName, type: "official", confidence: .95, verified: true}] : []);
  const context = normalizedContext({baseName, edition, organization: input.organization, date, city: input.city, venue: input.venue, country: input.country, mainEvent, officialUrl, rescheduledFrom: normalizeIdentityDate(input.rescheduledFrom)});
  const keys = [
    ...externalIdentityKeys(common.externalIdentifiers),
    ...(input.organization && edition ? [identityKey("organization-plus-event-number", "very_strong", ["organization", "edition"], `${normalizeIdentityText(input.organization).normalizedValue}:${edition}`)] : []),
    ...(input.organization && date ? [identityKey("organization-plus-name-plus-date", "strong", ["organization", "baseName", "date"], `${normalizeIdentityText(input.organization).normalizedValue}:${baseName}:${date}`)] : []),
    ...(input.organization && date && mainEvent.length === 2 ? [identityKey("organization-plus-main-event-plus-date", "strong", ["organization", "mainEvent", "date"], `${normalizeIdentityText(input.organization).normalizedValue}:${mainEvent.join(":")}:${date}`)] : []),
  ];
  return finalizeIdentity<EventIdentity>({
    ...common,
    entityType: "event",
    rawInput: safeRaw({primaryLabel: input.primaryLabel, baseName: input.baseName, edition: input.edition, organization: input.organization, date: input.date, city: input.city, venue: input.venue, country: input.country, officialUrl: input.officialUrl}),
    normalizedFields: {primaryLabel: normalizeIdentityText(input.primaryLabel, {normalizeVersus: true}), baseName: normalizeIdentityText(baseName), ...(input.organization ? {organization: normalizeIdentityText(input.organization)} : {})},
    identityKeys: keys,
    context,
    attributes: context as EventIdentity["attributes"],
  });
}

function compare(input: EventIdentity, candidate: EventIdentity) {
  const base = baseConflict(input, candidate);
  if (base) return base;
  if (matchingExternalId(input, candidate)) return comparison({decision: "exact_match", score: 1, input, candidate, matchedKeys: [evidence("key_match", "external_event_id_exact", "definitive", "Coincide el ID externo del evento.")]});
  if (input.attributes.organization && candidate.attributes.organization && !sameNormalized(input.attributes.organization, candidate.attributes.organization)) return comparison({
    decision: "conflicting_identity", score: 0, input, candidate,
    conflicting: [evidence("conflict", "organization_conflict", "definitive", "Las organizaciones del evento son incompatibles.", "organization")],
    conflictCodes: ["organization_conflict"],
  });
  if (input.attributes.edition && candidate.attributes.edition && input.attributes.edition !== candidate.attributes.edition) return comparison({
    decision: "conflicting_identity", score: 0, input, candidate,
    conflicting: [evidence("conflict", "event_edition_conflict", "definitive", "Las ediciones del evento son distintas.", "edition")],
    conflictCodes: ["event_edition_conflict"],
  });
  const sameOrganization = Boolean(input.attributes.organization && candidate.attributes.organization && sameNormalized(input.attributes.organization, candidate.attributes.organization));
  if (sameOrganization && input.attributes.edition && input.attributes.edition === candidate.attributes.edition) return comparison({
    decision: "exact_match", score: .99, input, candidate,
    matchedKeys: [evidence("key_match", "organization_event_number_match", "very_strong", "Coinciden organización y número de evento.")],
  });
  const labels = labelRelation(input, candidate);
  const supporting: IdentityEvidence[] = [];
  if (input.attributes.date && input.attributes.date === candidate.attributes.date) supporting.push(evidence("context_match", "event_date_match", "strong", "Coincide la fecha.", "date"));
  if (input.attributes.mainEvent?.length === 2 && candidate.attributes.mainEvent?.length === 2 && input.attributes.mainEvent.join(":") === candidate.attributes.mainEvent.join(":")) supporting.push(evidence("context_match", "main_event_match", "contextual", "Coincide el combate principal.", "mainEvent"));
  if (sameOrganization && (labels.exact || labels.similarity >= .65) && supporting.length) return comparison({
    decision: "strong_match", score: .92, input, candidate, supporting,
    matchedKeys: [evidence("key_match", "organization_name_date_match", "strong", "Nombre base, organización y contexto son compatibles.")],
  });
  if (labels.exact && !sameOrganization) return comparison({
    decision: "insufficient_evidence", score: .6, input, candidate,
    missing: [evidence("missing", "event_organization_or_date_missing", "strong", "El título por sí solo no identifica el evento.")],
  });
  return genericNoMatch(input, candidate, labels.similarity);
}

export const eventIdentityStrategy: EntityIdentityStrategy<"event"> = Object.freeze({
  entityType: "event", version: "1.0.0", build, compare,
  canCreate(identity: EventIdentity) {
    const allowed = Boolean(identity.externalIdentifiers.length || identity.attributes.organization && (identity.attributes.edition || identity.attributes.date));
    return {allowed, reasonCodes: allowed ? ["event_identity_sufficient"] : ["event_organization_and_edition_or_date_required"]};
  },
});
