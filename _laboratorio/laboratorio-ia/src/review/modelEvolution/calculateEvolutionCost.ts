import type { SchemaModelAlternative } from "../schemaEvolution";
import type { EstimationConfidence, EvolutionComplexity, EvolutionCostEstimate, EvolutionImpactFinding, HoursRange, MigrationSimulation, OngoingEvolutionCost } from "./types";

type CostProfile = { audit: HoursRange; implementation: HoursRange; validation: HoursRange };
const PROFILES: Record<SchemaModelAlternative["type"], CostProfile> = {
  keep_current: { audit: { min: 2, max: 4 }, implementation: { min: 0, max: 0 }, validation: { min: 0, max: 2 } },
  fallback_policy: { audit: { min: 2, max: 4 }, implementation: { min: 2, max: 6 }, validation: { min: 1, max: 3 } },
  make_optional: { audit: { min: 2, max: 4 }, implementation: { min: 4, max: 8 }, validation: { min: 2, max: 4 } },
  change_semantics: { audit: { min: 3, max: 6 }, implementation: { min: 7, max: 14 }, validation: { min: 3, max: 6 } },
  split_relationship: { audit: { min: 4, max: 8 }, implementation: { min: 10, max: 18 }, validation: { min: 4, max: 8 } },
  new_entity: { audit: { min: 5, max: 9 }, implementation: { min: 15, max: 26 }, validation: { min: 5, max: 9 } },
  new_document: { audit: { min: 6, max: 10 }, implementation: { min: 20, max: 32 }, validation: { min: 6, max: 10 } },
};
const add = (...ranges: HoursRange[]): HoursRange => ({ min: ranges.reduce((sum, item) => sum + item.min, 0), max: ranges.reduce((sum, item) => sum + item.max, 0) });
const multiply = (range: HoursRange, count: number): HoursRange => ({ min: range.min * count, max: range.max * count });
const complexity = (max: number): EvolutionComplexity => (max === 0 ? "none" : max <= 8 ? "low" : max <= 28 ? "medium" : max <= 56 ? "high" : "very_high");

const ongoingCosts = (alternative: SchemaModelAlternative): OngoingEvolutionCost[] => alternative.type === "keep_current" ? [
  { type: "editorial_blocking", description: "Continuarán bloqueadas altas legítimas que no encajen en una afiliación cerrada.", severity: "high" },
  { type: "manual_review", description: "Cada excepción seguirá requiriendo revisión editorial manual.", severity: "high" },
  { type: "data_inaccuracy", description: "Persistirá el riesgo de representar participación como afiliación falsa.", severity: "high" },
  { type: "technical_debt", description: "El acoplamiento semántico permanecerá en consumidores futuros.", severity: "high" },
] : [];

export function calculateEvolutionCost(alternative: SchemaModelAlternative, impacts: EvolutionImpactFinding[], migration: MigrationSimulation): EvolutionCostEstimate {
  const profile = PROFILES[alternative.type];
  const changesModel = alternative.type !== "keep_current";
  const confirmed = impacts.filter((item) => item.status === "confirmed").length;
  const likely = impacts.filter((item) => item.status === "likely").length;
  const possible = impacts.filter((item) => item.status === "possible").length;
  const unknowns = impacts.filter((item) => item.requiresVerification).map((item) => item.reason);
  const auditHours = changesModel ? add(profile.audit, multiply({ min: 1, max: 2 }, possible), multiply({ min: 1, max: 1 }, likely)) : profile.audit;
  const implementationHours = changesModel ? add(profile.implementation, multiply({ min: 2, max: 4 }, confirmed), multiply({ min: 1, max: 2 }, likely)) : { min: 0, max: 0 };
  const inventoryKnown = migration.existingDocumentAuditStatus !== "not_started";
  const documentCount = migration.affectedExistingDocumentEstimate ?? migration.knownAffectedDocumentIds.length;
  const migrationHours = !migration.required ? { min: 0, max: 0 } : !inventoryKnown ? { min: 2, max: 6 } : { min: 2 + Math.ceil(documentCount / 100), max: 4 + Math.ceil(documentCount / 50) };
  const validationHours = changesModel ? add(profile.validation, multiply({ min: 0, max: 1 }, Math.max(0, confirmed - 1))) : profile.validation;
  const totalHours = add(auditHours, implementationHours, migrationHours, validationHours);
  const confidence: EstimationConfidence = possible > 2 || migration.required && !inventoryKnown ? "low" : possible > 0 || likely > 0 || migration.existingDocumentAuditStatus === "partial" ? "medium" : "high";
  return {
    complexity: complexity(totalHours.max),
    changeCost: { auditHours, implementationHours, migrationHours, validationHours, totalHours },
    ongoingCost: ongoingCosts(alternative),
    confidence,
    assumptions: [`Perfil de coste aplicado: ${alternative.type}.`, "Los impactos posibles reciben únicamente coste de auditoría.", ...(migration.required ? ["La migración se considera reversible."] : [])],
    unknowns: [...new Set(unknowns)].sort(),
    score: Math.min(100, Math.round((totalHours.min + totalHours.max) / 2)),
  };
}
