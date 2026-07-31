import {normalizeIdentityText} from "../normalize";
import type {DisciplineIdentity, DisciplineIdentityInput, EntityIdentityStrategy} from "../types";
import {baseConflict, commonIdentity, comparison, evidence, externalIdentityKeys, finalizeIdentity, genericNoMatch, identityKey, labelRelation, normalizedContext, safeRaw} from "./shared";

function build(input: DisciplineIdentityInput): DisciplineIdentity {
  const common = commonIdentity(input, (input.catalogAliases ?? []).map((value) => ({value, type: "official" as const, confidence: 1, verified: true})));
  const context = normalizedContext({catalogId: input.catalogId, modality: input.modality, ruleset: input.ruleset});
  return finalizeIdentity<DisciplineIdentity>({
    ...common,
    entityType: "discipline",
    rawInput: safeRaw({primaryLabel: input.primaryLabel, catalogId: input.catalogId, modality: input.modality, ruleset: input.ruleset}),
    normalizedFields: {primaryLabel: normalizeIdentityText(input.primaryLabel)},
    identityKeys: [...externalIdentityKeys(common.externalIdentifiers), ...(input.catalogId ? [identityKey("discipline-catalog-id", "definitive", ["catalogId"], input.catalogId)] : []), ...common.aliases.filter((alias) => alias.verified).map((alias) => identityKey("discipline-catalog-alias", "strong", ["alias"], alias.normalizedValue))],
    context, attributes: context as DisciplineIdentity["attributes"],
  });
}

function compare(input: DisciplineIdentity, candidate: DisciplineIdentity) {
  const base = baseConflict(input, candidate);
  if (base) return base;
  if (input.attributes.catalogId && input.attributes.catalogId === candidate.attributes.catalogId) return comparison({decision: "exact_match", score: 1, input, candidate, matchedKeys: [evidence("key_match", "discipline_catalog_id_match", "definitive", "Coincide el catálogo explícito.")]});
  const labels = labelRelation(input, candidate);
  if (labels.verifiedAlias || labels.exact) return comparison({decision: "strong_match", score: .96, input, candidate, matchedKeys: [evidence("alias_match", "discipline_catalog_alias_match", "strong", "Coincide un nombre o alias explícito de catálogo.")]});
  return genericNoMatch(input, candidate, 0);
}

export const disciplineIdentityStrategy: EntityIdentityStrategy<"discipline"> = Object.freeze({
  entityType: "discipline", version: "1.0.0", build, compare,
  canCreate(identity: DisciplineIdentity) {
    const allowed = Boolean(identity.attributes.catalogId || identity.aliases.some((alias) => alias.verified));
    return {allowed, reasonCodes: allowed ? ["discipline_catalog_identity_sufficient"] : ["discipline_catalog_evidence_required"]};
  },
});
