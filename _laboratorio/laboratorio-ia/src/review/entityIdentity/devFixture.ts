import {buildEntityIdentity, classifyEntityDuplicate, createEntityCandidate, resolveEntityIdentity} from "./core";
import type {EntityCandidate, EntityDuplicateAssessment, EntityResolutionResult, UniversalEntityIdentity, UniversalEntityIdentityInput} from "./types";

export const ENTITY_IDENTITY_DEV_FIXTURE_ENABLED = Boolean(import.meta.env?.DEV);
export const ENTITY_IDENTITY_DEV_SCENARIOS = Object.freeze([
  "fighter_exact",
  "fighter_nickname",
  "fighter_initial",
  "fighter_surname_only",
  "fighter_external_conflict",
  "event_editorial_title",
  "event_location_variant",
  "event_other_edition",
  "organization_abbreviation",
  "weight_category_units",
] as const);
export type EntityIdentityDevScenario = typeof ENTITY_IDENTITY_DEV_SCENARIOS[number];

const provenance = (field: string, verified = true) => Object.freeze({
  producer: "entity_identity_dev_fixture",
  source: "synthetic_fixture",
  field,
  extractionMethod: "fixture" as const,
  confidence: verified ? .99 : .7,
  verified,
});

const fighter = (primaryLabel: string, extra: Partial<Extract<UniversalEntityIdentityInput, {entityType: "fighter"}>> = {}) => buildEntityIdentity({
  entityType: "fighter",
  source: "synthetic_fixture",
  primaryLabel,
  givenName: "Ilia",
  familyName: "Topuria",
  nationality: "España",
  discipline: "MMA",
  provenance: [provenance("primaryLabel")],
  ...extra,
});

const event = (primaryLabel: string, extra: Partial<Extract<UniversalEntityIdentityInput, {entityType: "event"}>> = {}) => buildEntityIdentity({
  entityType: "event",
  source: "synthetic_fixture",
  primaryLabel,
  organization: "UFC",
  edition: 308,
  date: "2024-10-26",
  city: "Abu Dhabi",
  mainEvent: ["Ilia Topuria", "Max Holloway"],
  provenance: [provenance("primaryLabel")],
  ...extra,
});

function pair(scenario: EntityIdentityDevScenario): {input: UniversalEntityIdentity; candidate: EntityCandidate} {
  if (scenario.startsWith("fighter")) {
    const candidateIdentity = fighter("Ilia Topuria", {
      externalIdentifiers: [{source: "fixture-authority", namespace: "athlete", value: "athlete-1", confidence: 1, verified: true}],
    });
    const input = scenario === "fighter_nickname" ? fighter("Ilia “El Matador” Topuria", {nickname: "El Matador"})
      : scenario === "fighter_initial" ? fighter("I. Topuria", {givenName: undefined})
        : scenario === "fighter_surname_only" ? fighter("Topuria", {givenName: undefined})
          : scenario === "fighter_external_conflict" ? fighter("Ilia Topuria", {
            externalIdentifiers: [{source: "fixture-authority", namespace: "athlete", value: "athlete-2", confidence: 1, verified: true}],
          })
            : fighter("Ilia Topuria", {
              externalIdentifiers: [{source: "fixture-authority", namespace: "athlete", value: "athlete-1", confidence: 1, verified: true}],
            });
    return {input, candidate: createEntityCandidate({candidateId: "fixture:fighter:canonical", entityType: "fighter", identity: candidateIdentity, safeSummary: "Luchador sintético canónico", source: "synthetic_fixture"})};
  }
  if (scenario.startsWith("event")) {
    const candidateIdentity = event("UFC 308");
    const input = scenario === "event_editorial_title" ? event("UFC 308: Topuria vs Holloway")
      : scenario === "event_location_variant" ? event("UFC 308 Abu Dhabi", {venue: "Fixture Arena"})
        : event("UFC 309", {edition: 309});
    return {input, candidate: createEntityCandidate({candidateId: "fixture:event:308", entityType: "event", identity: candidateIdentity, safeSummary: "Evento sintético 308", source: "synthetic_fixture"})};
  }
  if (scenario === "organization_abbreviation") {
    const input = buildEntityIdentity({entityType: "organization", source: "synthetic_fixture", primaryLabel: "U.F.C.", abbreviation: "UFC", provenance: [provenance("abbreviation")]});
    const identity = buildEntityIdentity({entityType: "organization", source: "synthetic_fixture", primaryLabel: "Ultimate Fighting Championship", officialName: "Ultimate Fighting Championship", abbreviation: "UFC", provenance: [provenance("officialName")]});
    return {input, candidate: createEntityCandidate({candidateId: "fixture:organization:ufc", entityType: "organization", identity, safeSummary: "Organización sintética", source: "synthetic_fixture"})};
  }
  const input = buildEntityIdentity({entityType: "weight_category", source: "synthetic_fixture", primaryLabel: "170 lb", limit: 170, unit: "lb", discipline: "MMA", organization: "fixture-org", provenance: [provenance("limit")]});
  const identity = buildEntityIdentity({entityType: "weight_category", source: "synthetic_fixture", primaryLabel: "Peso wélter", limit: 77.11, unit: "kg", discipline: "MMA", organization: "fixture-org", provenance: [provenance("limit")]});
  return {input, candidate: createEntityCandidate({candidateId: "fixture:weight:welter", entityType: "weight_category", identity, safeSummary: "Categoría sintética", source: "synthetic_fixture"})};
}

export type EntityIdentityDevFixtureResult = Readonly<{
  scenario: EntityIdentityDevScenario;
  input: UniversalEntityIdentity;
  candidate: EntityCandidate;
  resolution: EntityResolutionResult;
  duplicate: EntityDuplicateAssessment;
}>;

export function buildEntityIdentityDevFixtureResult(scenario: EntityIdentityDevScenario): EntityIdentityDevFixtureResult {
  const built = pair(scenario);
  return Object.freeze({
    scenario,
    ...built,
    resolution: resolveEntityIdentity(built.input, [built.candidate], {searchCompleted: true}),
    duplicate: classifyEntityDuplicate(built.input, built.candidate),
  });
}

export const entityIdentityDevFixtureSecurity = Object.freeze({
  devOnly: true,
  syntheticOnly: true,
  network: false,
  sanity: false,
  writes: false,
  localStorage: false,
  persistence: false,
  mutatesReviewCases: false,
} as const);
