import type {EntityKind} from "./types";

export const ENTITY_RECONCILIATION_CAPABILITIES = [
  "identity_contract", "identity_discovery", "reconciliation_scan", "impact_analysis",
  "decision_workflow", "guarded_creation", "canonical_intake",
] as const;
export type EntityReconciliationCapability = typeof ENTITY_RECONCILIATION_CAPABILITIES[number];
export type EntityCapabilityLevel = "supported" | "contract_only" | "out_of_scope";
export type EntityCapabilityDescriptor = Readonly<{
  kind: EntityKind; schemaType: "luchador" | "evento" | "organizacion" | "categoriaPeso";
  capability: EntityReconciliationCapability; level: EntityCapabilityLevel; reasonCode: string;
  relationships: readonly string[];
}>;

const relationships: Record<EntityKind, readonly string[]> = Object.freeze({
  fighter: Object.freeze(["combate.luchadorRojo", "combate.luchadorAzul", "combate.ganador", "noticia.luchadoresRelacionados"]),
  event: Object.freeze(["combate.evento", "noticia.eventoRelacionado"]),
  organization: Object.freeze(["evento.organizacion", "luchador.organizacion", "noticia.organizacionRelacionada"]),
  weight_category: Object.freeze(["combate.categoriaPeso", "luchador.categoriaPeso"]),
});
const schemaTypes: Record<EntityKind, EntityCapabilityDescriptor["schemaType"]> = {fighter: "luchador", event: "evento", organization: "organizacion", weight_category: "categoriaPeso"};
const support = (kind: EntityKind, capability: EntityReconciliationCapability): EntityCapabilityLevel => {
  if (["identity_contract", "reconciliation_scan", "impact_analysis", "decision_workflow"].includes(capability)) return "supported";
  if (capability === "identity_discovery") return kind === "fighter" ? "supported" : "contract_only";
  return kind === "fighter" ? "supported" : "out_of_scope";
};
const reason = (kind: EntityKind, capability: EntityReconciliationCapability, level: EntityCapabilityLevel): string => {
  if (level === "supported") return capability === "guarded_creation" ? "fighter_identity_guard_connected" : capability === "canonical_intake" ? "fighter_producer_intake_connected" : "capability_implemented_and_tested";
  if (level === "contract_only") return `identity_discovery_adapter_not_connected:${kind}`;
  return `${capability}_not_authorized:${kind}`;
};

const descriptors = (Object.keys(schemaTypes) as EntityKind[]).flatMap((kind) => ENTITY_RECONCILIATION_CAPABILITIES.map((capability) => {
  const level = support(kind, capability);
  return Object.freeze({kind, schemaType: schemaTypes[kind], capability, level, reasonCode: reason(kind, capability, level), relationships: capability === "impact_analysis" ? relationships[kind] : Object.freeze([])});
}));

export const ENTITY_CAPABILITY_MATRIX = Object.freeze(descriptors);
export function getEntityCapability(kind: EntityKind, capability: EntityReconciliationCapability): EntityCapabilityDescriptor {
  const descriptor = ENTITY_CAPABILITY_MATRIX.find((item) => item.kind === kind && item.capability === capability);
  if (!descriptor) throw new Error("entity_capability_unknown");
  return descriptor;
}
export function requireEntityCapability(kind: EntityKind, capability: EntityReconciliationCapability): EntityCapabilityDescriptor {
  const descriptor = getEntityCapability(kind, capability);
  if (descriptor.level !== "supported") throw new Error(descriptor.reasonCode);
  return descriptor;
}
export function getEntityRelationships(kind: EntityKind): readonly string[] { return getEntityCapability(kind, "impact_analysis").relationships; }
