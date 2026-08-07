import type {UniversalEntityIdentity, UniversalEntityType} from "../types";
import type {CandidateDiscoveryStrategy, CandidateDiscoveryStrategyId} from "./types";

export type DiscoveryEntityType = "fighter" | "event" | "organization" | "weight_category";
export type DiscoveryProfileDescriptor = Readonly<{
  entityType: DiscoveryEntityType;
  schemaType: "luchador" | "evento" | "organizacion" | "categoriaPeso";
  profileVersion: "1.0.0";
  identityFields: readonly string[];
  contextFields: readonly string[];
  conflictFields: readonly string[];
  externalNamespaces: readonly string[];
  maxCandidates: 50;
  maxStrategies: 12;
  strategyOrder: readonly CandidateDiscoveryStrategyId[];
}>;

const descriptors = Object.freeze({
  fighter: Object.freeze({entityType: "fighter", schemaType: "luchador", profileVersion: "1.0.0", identityFields: Object.freeze(["nombre", "nombreCompleto", "apodo", "slug.current"]), contextFields: Object.freeze(["fechaNacimiento", "nacionalidad", "organizacion._ref", "disciplina._ref", "categoriaPeso._ref"]), conflictFields: Object.freeze(["fechaNacimiento", "disciplina._ref"]), externalNamespaces: Object.freeze(["ufc:fighter", "one:fighter", "bkfc:fighter", "fekm:athlete"]), maxCandidates: 50, maxStrategies: 12, strategyOrder: Object.freeze(["external_id_exact", "slug_exact", "canonical_label_exact", "normalized_label_exact", "alias_exact", "contextual_key", "broad_recall"])}),
  event: Object.freeze({entityType: "event", schemaType: "evento", profileVersion: "1.0.0", identityFields: Object.freeze(["nombre", "slug.current"]), contextFields: Object.freeze(["fecha", "organizacion._ref", "disciplina._ref", "recinto", "ciudad", "pais"]), conflictFields: Object.freeze(["fecha", "organizacion._ref"]), externalNamespaces: Object.freeze([]), maxCandidates: 50, maxStrategies: 12, strategyOrder: Object.freeze(["slug_exact", "event_number", "canonical_label_exact", "normalized_label_exact", "contextual_key", "broad_recall"])}),
  organization: Object.freeze({entityType: "organization", schemaType: "organizacion", profileVersion: "1.0.0", identityFields: Object.freeze(["nombre", "slug.current", "sitioWeb"]), contextFields: Object.freeze(["paisOrigen", "sede", "anioFundacion", "disciplinas[]._ref"]), conflictFields: Object.freeze(["sitioWeb", "paisOrigen"]), externalNamespaces: Object.freeze([]), maxCandidates: 50, maxStrategies: 12, strategyOrder: Object.freeze(["canonical_url", "slug_exact", "canonical_label_exact", "normalized_label_exact", "contextual_key", "broad_recall"])}),
  weight_category: Object.freeze({entityType: "weight_category", schemaType: "categoriaPeso", profileVersion: "1.0.0", identityFields: Object.freeze(["nombre", "slug.current"]), contextFields: Object.freeze(["disciplina._ref", "modalidad", "grupoEdad", "sexo", "tipoLimite", "limitePeso", "unidad"]), conflictFields: Object.freeze(["disciplina._ref", "modalidad", "grupoEdad", "sexo", "tipoLimite", "limitePeso", "unidad"]), externalNamespaces: Object.freeze([]), maxCandidates: 50, maxStrategies: 12, strategyOrder: Object.freeze(["weight_limit", "slug_exact", "canonical_label_exact", "normalized_label_exact", "contextual_key", "broad_recall"])}),
}) as Readonly<Record<DiscoveryEntityType, DiscoveryProfileDescriptor>>;

export function getCandidateDiscoveryProfile(entityType: UniversalEntityType): DiscoveryProfileDescriptor | undefined {
  return descriptors[entityType as DiscoveryEntityType];
}

const spec = (strategyId: CandidateDiscoveryStrategyId, entityType: DiscoveryEntityType, strength: CandidateDiscoveryStrategy["strength"], phase: CandidateDiscoveryStrategy["phase"], priority: number, requiredFields: readonly string[]): CandidateDiscoveryStrategy => Object.freeze({strategyId, strategyVersion: "1.0.0", entityTypes: Object.freeze([entityType]), strength, phase, priority, maxCandidates: strategyId === "broad_recall" ? 10 : 8, requiredFields: Object.freeze(requiredFields)});

function availableFields(identity: UniversalEntityIdentity): Set<string> {
  const fields = new Set<string>(["primaryLabel", "normalizedPrimaryLabel"]);
  if (identity.aliases.length) fields.add("aliases");
  if (identity.externalIdentifiers.length) fields.add("externalIdentifiers");
  for (const [key, value] of Object.entries(identity.attributes)) if (value !== undefined && value !== "" && (!Array.isArray(value) || value.length)) fields.add(`attributes.${key}`);
  return fields;
}

export function candidateDiscoveryStrategies(identity: UniversalEntityIdentity): CandidateDiscoveryStrategy[] {
  const profile = getCandidateDiscoveryProfile(identity.entityType);
  if (!profile) throw new Error(`candidate_discovery_profile_missing:${identity.entityType}`);
  const definitions: Partial<Record<CandidateDiscoveryStrategyId, CandidateDiscoveryStrategy>> = {
    external_id_exact: spec("external_id_exact", profile.entityType, "definitive", 1, 100, ["externalIdentifiers"]),
    canonical_url: spec("canonical_url", profile.entityType, "very_strong", 1, 95, ["attributes.officialDomain"]),
    slug_exact: spec("slug_exact", profile.entityType, "contextual", 2, 90, ["attributes.slug"]),
    event_number: spec("event_number", profile.entityType, "very_strong", 2, 88, ["attributes.organization", "attributes.edition"]),
    weight_limit: spec("weight_limit", profile.entityType, "strong", 2, 88, ["attributes.discipline", "attributes.limitKg"]),
    canonical_label_exact: spec("canonical_label_exact", profile.entityType, "strong", 3, 80, ["primaryLabel"]),
    normalized_label_exact: spec("normalized_label_exact", profile.entityType, "strong", 3, 78, ["normalizedPrimaryLabel"]),
    alias_exact: spec("alias_exact", profile.entityType, "strong", 3, 75, ["aliases"]),
    organization_acronym: spec("organization_acronym", profile.entityType, "contextual", 3, 70, ["primaryLabel"]),
    contextual_key: spec("contextual_key", profile.entityType, "contextual", 4, 60, ["primaryLabel"]),
    broad_recall: spec("broad_recall", profile.entityType, "weak", 5, 10, ["primaryLabel"]),
  };
  const present = availableFields(identity);
  return profile.strategyOrder.flatMap((strategyId) => {
    const value = definitions[strategyId];
    return value && value.requiredFields.every((field) => present.has(field)) ? [value] : [];
  });
}

export const candidateDiscoveryProfiles = Object.freeze(Object.values(descriptors));
