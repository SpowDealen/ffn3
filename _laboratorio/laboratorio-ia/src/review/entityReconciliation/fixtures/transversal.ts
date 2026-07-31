import type {CorpusReadStatus, EntityKind} from "../types";

type SafeFixtureRecord = Readonly<Record<string, unknown>>;
const impact = (count: number, prefix: string, status: "known" | "estimated" | "truncated" | "unavailable" = "known") => Object.freeze({status, count: status === "unavailable" ? undefined : count, sampleDocumentIds: status === "unavailable" ? [] : Array.from({length: Math.min(count, 12)}, (_, index) => `${prefix}-ref-${index + 1}`), warning: status === "known" ? undefined : "Fixture de impacto incompleto."});

const fighter = [
  {_id: "fighter:unique", nombre: "Vera Única", slug: {current: "vera-unica"}, externalIds: [{namespace: "fixture:fighter", value: "unique"}], disciplina: "discipline:mma", organizacion: "organization:alpha", categoriaPeso: "category:straw", referenceImpact: impact(1, "fighter-unique")},
  {_id: "fighter:duplicate:a", nombre: "Ada Cross", slug: {current: "ada-cross"}, aliases: ["A. Cross"], externalIds: [{namespace: "fixture:fighter", value: "ada-7"}], disciplina: "discipline:mma", organizacion: "organization:alpha", categoriaPeso: "category:fly", referenceImpact: impact(3, "fighter-a")},
  {_id: "fighter:duplicate:b", nombre: "Ada Cross", slug: {current: "ada-cross-alt"}, aliases: ["A. Cross"], externalIds: [{namespace: "fixture:fighter", value: "ada-7"}], disciplina: "discipline:mma", organizacion: "organization:alpha", categoriaPeso: "category:fly", referenceImpact: impact(2, "fighter-b")},
  {_id: "fighter:conflict:a", nombre: "Alex Lee", externalIds: [{namespace: "fixture:fighter", value: "alex-1"}], disciplina: "discipline:mma", categoriaPeso: "category:welter", referenceImpact: impact(0, "fighter-ca")},
  {_id: "fighter:conflict:b", nombre: "Alex Lee", externalIds: [{namespace: "fixture:fighter", value: "alex-2"}], disciplina: "discipline:kickboxing", categoriaPeso: "category:light", referenceImpact: impact(0, "fighter-cb")},
  {_id: "drafts.fighter:variant", _rev: "draft-v2", nombre: "Nora Variant", slug: {current: "nora-variant"}, externalIds: [{namespace: "fixture:fighter", value: "variant"}], disciplina: "discipline:mma", referenceImpact: impact(1, "fighter-v")},
  {_id: "fighter:variant", _rev: "published-v1", nombre: "Nora V. Variant", slug: {current: "nora-variant"}, externalIds: [{namespace: "fixture:fighter", value: "variant"}], disciplina: "discipline:mma", referenceImpact: impact(1, "fighter-v")},
  {_id: "fighter:variant:other", nombre: "Nora Variant", slug: {current: "nora-variant-alt"}, externalIds: [{namespace: "fixture:fighter", value: "variant"}], disciplina: "discipline:mma", referenceImpact: impact(0, "fighter-vo")},
  {_id: "fighter:incomplete", nombre: "Persona Incompleta", referenceImpact: impact(0, "fighter-i", "unavailable")},
];
const event = [
  {_id: "event:unique", nombre: "Combat Summit 9", slug: {current: "combat-summit-9"}, fecha: "2026-09-01T18:00:00Z", organizacion: "organization:beta", disciplina: "discipline:mma", ciudad: "Madrid", pais: "España", referenceImpact: impact(1, "event-u")},
  {_id: "event:duplicate:a", nombre: "Arena Series 12", slug: {current: "arena-series-12"}, externalIds: [{namespace: "fixture:event", value: "arena-12"}], fecha: "2026-10-10T20:00:00Z", organizacion: "organization:alpha", disciplina: "discipline:mma", recinto: "Arena Norte", pais: "España", referenceImpact: impact(4, "event-a")},
  {_id: "event:duplicate:b", nombre: "Arena Series XII", aliases: ["Arena Series 12"], externalIds: [{namespace: "fixture:event", value: "arena-12"}], fecha: "2026-10-10T20:00:00Z", organizacion: "organization:alpha", disciplina: "discipline:mma", recinto: "Arena Norte", pais: "España", referenceImpact: impact(2, "event-b")},
  {_id: "event:recurring:a", nombre: "Fight Night", fecha: "2025-02-01T20:00:00Z", organizacion: "organization:alpha", disciplina: "discipline:mma", referenceImpact: impact(1, "event-ra")},
  {_id: "event:recurring:b", nombre: "Fight Night", fecha: "2026-02-01T20:00:00Z", organizacion: "organization:beta", disciplina: "discipline:kickboxing", referenceImpact: impact(1, "event-rb")},
  {_id: "drafts.event:variant", _rev: "draft-event", nombre: "Open Cup 4", slug: {current: "open-cup-4"}, fecha: "2026-11-02T18:00:00Z", organizacion: "organization:alpha", disciplina: "discipline:mma", referenceImpact: impact(0, "event-v")},
  {_id: "event:variant", _rev: "published-event", nombre: "Open Cup IV", slug: {current: "open-cup-4"}, fecha: "2026-11-02T18:00:00Z", organizacion: "organization:alpha", disciplina: "discipline:mma", referenceImpact: impact(0, "event-v")},
  {_id: "event:variant:other", nombre: "Open Cup 4", externalIds: [{namespace: "fixture:event", value: "open-cup-4"}], slug: {current: "open-cup-4"}, fecha: "2026-11-02T18:00:00Z", organizacion: "organization:alpha", disciplina: "discipline:mma", referenceImpact: impact(0, "event-vo")},
  {_id: "event:incomplete", nombre: "Evento sin fecha", referenceImpact: impact(0, "event-i", "unavailable")},
];
const organization = [
  {_id: "organization:unique", nombre: "Liga Boreal", slug: {current: "liga-boreal"}, paisOrigen: "España", sitioWeb: "https://liga-boreal.test", referenceImpact: impact(1, "org-u")},
  {_id: "organization:duplicate:a", nombre: "Combat Alliance", aliases: ["CA Europe"], externalIds: [{namespace: "fixture:organization", value: "ca-eu"}], paisOrigen: "España", sitioWeb: "https://combat-alliance.test", referenceImpact: impact(5, "org-a")},
  {_id: "organization:duplicate:b", nombre: "Combat Alliance Europe", aliases: ["CA Europe"], externalIds: [{namespace: "fixture:organization", value: "ca-eu"}], paisOrigen: "España", sitioWeb: "https://combat-alliance.test", referenceImpact: impact(2, "org-b")},
  {_id: "organization:conflict:a", nombre: "ACA", aliases: ["Absolute Combat Association"], externalIds: [{namespace: "fixture:organization", value: "aca-es"}], paisOrigen: "España", sitioWeb: "https://aca-es.test", referenceImpact: impact(1, "org-ca")},
  {_id: "organization:conflict:b", nombre: "ACA", aliases: ["Absolute Combat Association"], externalIds: [{namespace: "fixture:organization", value: "aca-us"}], paisOrigen: "USA", sitioWeb: "https://aca-us.test", referenceImpact: impact(1, "org-cb")},
  {_id: "drafts.organization:variant", _rev: "draft-org", nombre: "Northern Fighting", slug: {current: "northern-fighting"}, paisOrigen: "España", referenceImpact: impact(0, "org-v")},
  {_id: "organization:variant", _rev: "published-org", nombre: "Northern Fighting League", slug: {current: "northern-fighting"}, paisOrigen: "España", referenceImpact: impact(0, "org-v")},
  {_id: "organization:variant:other", nombre: "Northern Fighting", slug: {current: "northern-fighting"}, paisOrigen: "España", referenceImpact: impact(0, "org-vo")},
  {_id: "organization:incomplete", nombre: "Promoción Incompleta", referenceImpact: impact(0, "org-i", "unavailable")},
];
const weight_category = [
  {_id: "category:unique", nombre: "Peso átomo", slug: {current: "peso-atomo"}, disciplina: "discipline:mma", sexo: "femenino", tipoLimite: "hasta", limitePeso: 47.6, unidad: "kg", referenceImpact: impact(1, "cat-u")},
  {_id: "category:duplicate:a", nombre: "Peso ligero", externalIds: [{namespace: "fixture:category", value: "mma-light-70"}], disciplina: "discipline:mma", sexo: "masculino", tipoLimite: "hasta", limitePeso: 70.3, unidad: "kg", referenceImpact: impact(4, "cat-a")},
  {_id: "category:duplicate:b", nombre: "Ligero MMA", aliases: ["Peso ligero"], externalIds: [{namespace: "fixture:category", value: "mma-light-70"}], disciplina: "discipline:mma", sexo: "masculino", tipoLimite: "hasta", limitePeso: 70.3, unidad: "kg", referenceImpact: impact(2, "cat-b")},
  {_id: "category:conflict:a", nombre: "Peso ligero", disciplina: "discipline:mma", sexo: "masculino", tipoLimite: "hasta", limitePeso: 70.3, unidad: "kg", referenceImpact: impact(1, "cat-ca")},
  {_id: "category:conflict:b", nombre: "Peso ligero", disciplina: "discipline:kickboxing", sexo: "masculino", tipoLimite: "hasta", limitePeso: 60, unidad: "kg", referenceImpact: impact(1, "cat-cb")},
  {_id: "drafts.category:variant", _rev: "draft-cat", nombre: "Peso wélter", slug: {current: "peso-welter"}, disciplina: "discipline:mma", sexo: "masculino", tipoLimite: "hasta", limitePeso: 77.1, unidad: "kg", referenceImpact: impact(0, "cat-v")},
  {_id: "category:variant", _rev: "published-cat", nombre: "Wélter", slug: {current: "peso-welter"}, disciplina: "discipline:mma", sexo: "masculino", tipoLimite: "hasta", limitePeso: 77.1, unidad: "kg", referenceImpact: impact(0, "cat-v")},
  {_id: "category:variant:other", nombre: "Peso wélter", slug: {current: "peso-welter"}, disciplina: "discipline:mma", sexo: "masculino", tipoLimite: "hasta", limitePeso: 77.1, unidad: "kg", referenceImpact: impact(0, "cat-vo")},
  {_id: "category:incomplete", nombre: "Categoría Incompleta", referenceImpact: impact(0, "cat-i", "unavailable")},
];

export const AU5_TRANSVERSAL_FIXTURES: Readonly<Record<EntityKind, readonly SafeFixtureRecord[]>> = Object.freeze({fighter: Object.freeze(fighter), event: Object.freeze(event), organization: Object.freeze(organization), weight_category: Object.freeze(weight_category)});
export const AU5_TRANSVERSAL_READ_STATES: readonly CorpusReadStatus[] = Object.freeze(["complete", "partial", "truncated", "unavailable", "cancelled"]);
export function buildTransversalVolume(kind: EntityKind, count = 32): SafeFixtureRecord[] {
  return Array.from({length: Math.max(0, Math.min(count, 250))}, (_, index) => Object.freeze({_id: `${kind}:volume:${String(index).padStart(3, "0")}`, nombre: `${kind} fixture ${index}`, slug: {current: `${kind}-fixture-${index}`}, referenceImpact: impact(index % 3, `${kind}-volume-${index}`)}));
}
