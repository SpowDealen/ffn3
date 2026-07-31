import {normalizeIdentityText, normalizeWeight} from "../normalize";
import type {EntityIdentityStrategy, WeightCategoryIdentity, WeightCategoryIdentityInput} from "../types";
import {baseConflict, commonIdentity, comparison, evidence, externalIdentityKeys, finalizeIdentity, genericNoMatch, identityKey, labelRelation, normalizedContext, safeRaw, sameNormalized} from "./shared";

const WEIGHT_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  welterweight: ["peso welter", "welter", "170 lb", "77 kg"],
  lightweight: ["peso ligero", "lightweight", "155 lb", "70.3 kg"],
  middleweight: ["peso medio", "middleweight", "185 lb", "83.9 kg"],
});

function inferredAliases(label: string): string[] {
  const normalized = normalizeIdentityText(label).normalizedValue;
  return Object.entries(WEIGHT_ALIASES).flatMap(([canonical, aliases]) =>
    canonical === normalized || aliases.some((alias) => normalizeIdentityText(alias).normalizedValue === normalized) ? [canonical, ...aliases] : [],
  );
}

function build(input: WeightCategoryIdentityInput): WeightCategoryIdentity {
  const weight = normalizeWeight(input.limit, input.unit);
  const common = commonIdentity(input, inferredAliases(input.primaryLabel).map((value) => ({value, type: "official" as const, confidence: .95, verified: true})));
  const context = normalizedContext({limitKg: weight.limitKg, limitLb: weight.limitLb, discipline: input.discipline, organization: input.organization, division: input.division, ruleset: input.ruleset});
  const keys = [
    ...externalIdentityKeys(common.externalIdentifiers),
    ...(weight.limitKg && input.discipline ? [identityKey("weight-limit-plus-discipline", "strong", ["limitKg", "discipline"], `${weight.limitKg}:${normalizeIdentityText(input.discipline).normalizedValue}`)] : []),
    ...(weight.limitKg && input.discipline && input.organization ? [identityKey("weight-limit-plus-regulatory-context", "very_strong", ["limitKg", "discipline", "organization", "division", "ruleset"], `${weight.limitKg}:${normalizeIdentityText(input.discipline).normalizedValue}:${normalizeIdentityText(input.organization).normalizedValue}:${normalizeIdentityText(input.division ?? "").normalizedValue}:${normalizeIdentityText(input.ruleset ?? "").normalizedValue}`)] : []),
  ];
  return finalizeIdentity<WeightCategoryIdentity>({
    ...common,
    entityType: "weight_category",
    rawInput: safeRaw({primaryLabel: input.primaryLabel, limit: input.limit, unit: input.unit, discipline: input.discipline, organization: input.organization, division: input.division, ruleset: input.ruleset}),
    normalizedFields: {primaryLabel: normalizeIdentityText(input.primaryLabel)},
    identityKeys: keys, context, attributes: context as WeightCategoryIdentity["attributes"],
  });
}

function incompatible(left?: string, right?: string) {
  return Boolean(left && right && !sameNormalized(left, right));
}

function compare(input: WeightCategoryIdentity, candidate: WeightCategoryIdentity) {
  const base = baseConflict(input, candidate);
  if (base) return base;
  if (incompatible(input.attributes.discipline, candidate.attributes.discipline)) return comparison({decision: "conflicting_identity", score: 0, input, candidate, conflicting: [evidence("conflict", "discipline_conflict", "definitive", "Las disciplinas son incompatibles.")], conflictCodes: ["discipline_conflict"]});
  if (incompatible(input.attributes.division, candidate.attributes.division)) return comparison({decision: "conflicting_identity", score: 0, input, candidate, conflicting: [evidence("conflict", "division_conflict", "definitive", "Las divisiones son incompatibles.")], conflictCodes: ["division_conflict"]});
  if (incompatible(input.attributes.ruleset, candidate.attributes.ruleset)) return comparison({decision: "conflicting_identity", score: 0, input, candidate, conflicting: [evidence("conflict", "ruleset_conflict", "definitive", "Los reglamentos son incompatibles.")], conflictCodes: ["ruleset_conflict"]});
  const leftKg = input.attributes.limitKg;
  const rightKg = candidate.attributes.limitKg;
  if (leftKg && rightKg && Math.abs(leftKg - rightKg) > .75) return comparison({decision: "conflicting_identity", score: 0, input, candidate, conflicting: [evidence("conflict", "weight_limit_conflict", "definitive", "Los límites de peso son incompatibles.")], conflictCodes: ["weight_limit_conflict"]});
  const labels = labelRelation(input, candidate);
  if (leftKg && rightKg && Math.abs(leftKg - rightKg) <= .75 && input.attributes.discipline && candidate.attributes.discipline) return comparison({
    decision: "strong_match", score: .95, input, candidate,
    matchedKeys: [evidence("key_match", "weight_limit_discipline_match", "strong", "Coinciden límite convertido y disciplina.")],
    supporting: labels.exact || labels.verifiedAlias ? [evidence("alias_match", "weight_category_alias_match", "contextual", "Los nombres de categoría son aliases compatibles.")] : [],
  });
  if (labels.verifiedAlias && input.attributes.discipline && candidate.attributes.discipline) return comparison({decision: "probable_match", score: .75, input, candidate, supporting: [evidence("alias_match", "weight_alias_without_limit", "contextual", "Coincide el alias, pero falta límite normativo.")]});
  return genericNoMatch(input, candidate, labels.similarity);
}

export const weightCategoryIdentityStrategy: EntityIdentityStrategy<"weight_category"> = Object.freeze({
  entityType: "weight_category", version: "1.0.0", build, compare,
  canCreate(identity: WeightCategoryIdentity) {
    const allowed = Boolean(identity.attributes.limitKg && identity.attributes.discipline && (identity.attributes.organization || identity.attributes.ruleset));
    return {allowed, reasonCodes: allowed ? ["weight_category_identity_sufficient"] : ["weight_limit_discipline_and_rules_required"]};
  },
});
