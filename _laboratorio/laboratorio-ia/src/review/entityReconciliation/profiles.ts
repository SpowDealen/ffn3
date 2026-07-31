import {computeUniversalFingerprint} from "../universal";
import type {ReviewJsonObject, ReviewJsonValue} from "../types";
import {getEntityRelationships} from "./capabilities";
import type {DuplicatePair, EntityIdentityProfile, EntityKind, EntityProjection, EntityVariant, ExternalId, MatchConflict, MatchEvidence, ReferenceImpact} from "./types";

const fp = (value: unknown) => computeUniversalFingerprint(value as ReviewJsonValue);
const text = (value: unknown, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";
const normalize = (value: unknown) => text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("und").replace(/[^a-z0-9]+/g, " ").trim();
const stringList = (value: unknown) => Array.isArray(value) ? [...new Set(value.map((item) => text(item)).filter(Boolean))].sort() : [];
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const reference = (value: unknown) => object(value) ? text(value._ref ?? value.id) : text(value);
const logicalId = (id: string) => id.startsWith("drafts.") ? id.slice(7) : id;
const externalIds = (value: unknown): ExternalId[] => Array.isArray(value) ? value.flatMap((entry) => object(entry) && text(entry.namespace, 80) && text(entry.value, 120) ? [{namespace: text(entry.namespace, 80), value: text(entry.value, 120)}] : []).sort((a, b) => `${a.namespace}:${a.value}`.localeCompare(`${b.namespace}:${b.value}`)) : [];
const impact = (value: unknown, kind: EntityKind): ReferenceImpact => object(value) && ["known", "estimated", "unavailable", "truncated"].includes(String(value.status)) ? {status: value.status as ReferenceImpact["status"], count: typeof value.count === "number" && Number.isSafeInteger(value.count) && value.count >= 0 ? value.count : undefined, sampleDocumentIds: stringList(value.sampleDocumentIds).slice(0, 12), relationKinds: getEntityRelationships(kind).slice(), warning: text(value.warning) || undefined} : {status: "unavailable", sampleDocumentIds: [], relationKinds: getEntityRelationships(kind).slice(), warning: "Impacto relacional no inspeccionado."};

type Definition = {kind: EntityKind; schemaType: string; fields: readonly string[]; strategies: readonly string[]; context(record: Record<string, unknown>): ReviewJsonObject; conflicts(left: EntityProjection, right: EntityProjection): MatchConflict[]; contextual(left: EntityProjection, right: EntityProjection): MatchEvidence[]};
const same = (a: unknown, b: unknown) => Boolean(a && b && a === b);
const different = (a: unknown, b: unknown) => Boolean(a && b && a !== b);
const contextValue = (entity: EntityProjection, field: string) => entity.contexts[field];
const veto = (code: string, field: string, explanation: string): MatchConflict => ({code, field, explanation, blocking: true});
const evidence = (code: string, strategy: string, field: string, explanation: string, weight: number): MatchEvidence => ({code, strategy, field, explanation, weight});
const incompatibleExternalIds = (left: EntityProjection, right: EntityProjection) => left.externalIds.flatMap((a) => right.externalIds.some((b) => a.namespace === b.namespace && a.value !== b.value) ? [veto("external_id_conflict", "externalIds", `IDs ${a.namespace} incompatibles.`)] : []);

const definitions: Definition[] = [
  {kind: "fighter", schemaType: "luchador", fields: ["nombre", "slug", "apodo", "disciplina", "organizacion", "categoriaPeso"], strategies: ["external_id", "normalized_name", "alias", "slug", "discipline_context", "organization_context"],
    context: (r) => ({disciplineId: reference(r.disciplina), organizationId: reference(r.organizacion), weightCategory: text(r.categoriaPeso)}),
    conflicts: (a, b) => [...incompatibleExternalIds(a, b), ...(different(contextValue(a, "disciplineId"), contextValue(b, "disciplineId")) ? [veto("discipline_conflict", "disciplina", "Las disciplinas son incompatibles.")] : [])],
    contextual: (a, b) => [same(contextValue(a, "disciplineId"), contextValue(b, "disciplineId")) ? evidence("same_discipline", "discipline_context", "disciplina", "Misma disciplina.", 12) : null, same(contextValue(a, "organizationId"), contextValue(b, "organizationId")) ? evidence("same_organization", "organization_context", "organizacion", "Misma organización.", 10) : null].filter(Boolean) as MatchEvidence[]},
  {kind: "event", schemaType: "evento", fields: ["nombre", "slug", "fecha", "organizacion", "disciplina", "recinto", "ciudad", "pais"], strategies: ["external_id", "normalized_name", "slug", "date_organization", "venue_context"],
    context: (r) => ({date: text(r.fecha, 40).slice(0, 10), organizationId: reference(r.organizacion), disciplineId: reference(r.disciplina), venue: normalize(r.recinto), city: normalize(r.ciudad), country: normalize(r.pais)}),
    conflicts: (a, b) => [...incompatibleExternalIds(a, b), ...(different(contextValue(a, "date"), contextValue(b, "date")) ? [veto("date_conflict", "fecha", "Fechas distintas para un título potencialmente recurrente.")] : []), ...(different(contextValue(a, "organizationId"), contextValue(b, "organizationId")) ? [veto("organization_conflict", "organizacion", "Organizaciones distintas.")] : [])],
    contextual: (a, b) => [same(contextValue(a, "date"), contextValue(b, "date")) && same(contextValue(a, "organizationId"), contextValue(b, "organizationId")) ? evidence("same_date_organization", "date_organization", "fecha+organizacion", "Misma fecha y organización.", 32) : null].filter(Boolean) as MatchEvidence[]},
  {kind: "organization", schemaType: "organizacion", fields: ["nombre", "slug", "paisOrigen", "sitioWeb", "disciplinas"], strategies: ["external_id", "canonical_domain", "normalized_name", "alias", "slug", "country_context"],
    context: (r) => ({country: normalize(r.paisOrigen), domain: (() => { try { return new URL(text(r.sitioWeb)).hostname.replace(/^www\./, ""); } catch { return ""; } })()}),
    conflicts: (a, b) => [...incompatibleExternalIds(a, b), ...(different(contextValue(a, "country"), contextValue(b, "country")) ? [veto("country_conflict", "paisOrigen", "Países de origen incompatibles.")] : []), ...(different(contextValue(a, "domain"), contextValue(b, "domain")) ? [veto("domain_conflict", "sitioWeb", "Dominios canónicos incompatibles.")] : [])],
    contextual: (a, b) => [same(contextValue(a, "domain"), contextValue(b, "domain")) ? evidence("same_domain", "canonical_domain", "sitioWeb", "Mismo dominio canónico.", 45) : null, same(contextValue(a, "country"), contextValue(b, "country")) ? evidence("same_country", "country_context", "paisOrigen", "Mismo país de origen.", 8) : null].filter(Boolean) as MatchEvidence[]},
  {kind: "weight_category", schemaType: "categoriaPeso", fields: ["nombre", "slug", "disciplina", "modalidad", "grupoEdad", "sexo", "tipoLimite", "limitePeso", "unidad"], strategies: ["external_id", "normalized_name", "slug", "discipline_weight_range"],
    context: (r) => ({disciplineId: reference(r.disciplina), modality: normalize(r.modalidad), ageGroup: normalize(r.grupoEdad), sex: normalize(r.sexo), limitType: text(r.tipoLimite), weightLimit: typeof r.limitePeso === "number" ? r.limitePeso : null, unit: text(r.unidad)}),
    conflicts: (a, b) => [...incompatibleExternalIds(a, b), ...(["disciplineId", "sex", "limitType", "weightLimit", "unit"] as const).flatMap((field) => different(contextValue(a, field), contextValue(b, field)) ? [veto(`weight_${field}_conflict`, field, `Categorías incompatibles por ${field}.`)] : [])],
    contextual: (a, b) => same(contextValue(a, "disciplineId"), contextValue(b, "disciplineId")) && same(contextValue(a, "weightLimit"), contextValue(b, "weightLimit")) && same(contextValue(a, "unit"), contextValue(b, "unit")) ? [evidence("same_discipline_weight", "discipline_weight_range", "disciplina+peso", "Misma disciplina y límite de peso.", 38)] : []},
];

function buildProfile(definition: Definition): EntityIdentityProfile {
  return {...definition, requiredProjectionFields: definition.fields, allowedStrategies: definition.strategies,
    project(raw, adapterId) {
      if (!object(raw)) throw new Error("invalid_entity_projection");
      const id = text(raw._id, 180); if (!id) throw new Error("missing_document_id");
      const label = text(raw.nombre ?? raw.title); const normalizedLabel = normalize(label);
      const variant: EntityVariant["variant"] = id.startsWith("drafts.") ? "draft" : "published";
      const contexts = definition.context(raw);
      const safe = {label, normalizedLabel, aliases: stringList(raw.aliases ?? (raw.apodo ? [raw.apodo] : [])), slug: text(object(raw.slug) ? raw.slug.current : raw.slug, 96), externalIds: externalIds(raw.externalIds), contexts};
      const variantValue = {documentId: id, revision: text(raw._rev, 100) || undefined, variant, contentFingerprint: fp(safe)};
      return {kind: definition.kind, logicalId: logicalId(id), ...safe, variants: [variantValue], identityFingerprint: fp({kind: definition.kind, normalizedLabel, aliases: safe.aliases, slug: safe.slug, externalIds: safe.externalIds, contexts}), snapshotFingerprint: fp({logicalId: logicalId(id), safe, variantValue}), provenance: {adapterId, schemaType: definition.schemaType, observedFields: definition.fields.filter((field) => raw[field] !== undefined)}, referenceImpact: impact(raw.referenceImpact, definition.kind)};
    },
    blockKeys(entity) { return [...entity.externalIds.map((item) => `x:${item.namespace}:${normalize(item.value)}`), ...entity.aliases.map(normalize).filter((item) => item.length >= 4).map((item) => `a:${item}`), entity.slug ? `s:${entity.slug}` : "", entity.normalizedLabel.length >= 4 ? `n:${entity.normalizedLabel}` : ""].filter(Boolean).sort(); },
    compare(left, right) {
      const positive: MatchEvidence[] = [];
      for (const a of left.externalIds) if (right.externalIds.some((b) => a.namespace === b.namespace && a.value === b.value)) positive.push(evidence("same_external_id", "external_id", "externalIds", `Mismo ID externo ${a.namespace}.`, 70));
      if (left.normalizedLabel && left.normalizedLabel === right.normalizedLabel) positive.push(evidence("same_normalized_name", "normalized_name", "nombre", "Mismo nombre normalizado.", 22));
      if (left.slug && left.slug === right.slug) positive.push(evidence("same_slug", "slug", "slug", "Mismo slug.", 18));
      if (left.aliases.some((alias) => right.aliases.map(normalize).includes(normalize(alias)))) positive.push(evidence("same_alias", "alias", "aliases", "Alias coincidente.", 12));
      positive.push(...definition.contextual(left, right));
      const conflicts = definition.conflicts(left, right).sort((a, b) => a.code.localeCompare(b.code));
      const score = positive.reduce((sum, item) => sum + item.weight, 0);
      const missingFields = definition.fields.filter((field) => !left.provenance.observedFields.includes(field) || !right.provenance.observedFields.includes(field));
      const state: DuplicatePair["state"] = conflicts.some((item) => item.blocking) ? "blocked" : score >= 70 ? "candidate" : score >= 22 ? "needs_review" : "inconclusive";
      return {evidence: positive.sort((a, b) => a.code.localeCompare(b.code)), conflicts, missingFields, score, state};
    }};
}

export const ENTITY_IDENTITY_PROFILES = Object.freeze(Object.fromEntries(definitions.map((definition) => [definition.kind, buildProfile(definition)])) as Record<EntityKind, EntityIdentityProfile>);
export function getEntityIdentityProfile(kind: EntityKind): EntityIdentityProfile { return ENTITY_IDENTITY_PROFILES[kind]; }
