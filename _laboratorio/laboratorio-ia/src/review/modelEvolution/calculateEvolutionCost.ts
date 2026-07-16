import type { EstimationConfidence, EvolutionComplexity, EvolutionCostEstimate, EvolutionImpactFinding, HoursRange, MigrationSimulation } from "./types";

const add = (...ranges: HoursRange[]): HoursRange => ({ min: ranges.reduce((sum, item) => sum + item.min, 0), max: ranges.reduce((sum, item) => sum + item.max, 0) });
const multiply = (range: HoursRange, count: number): HoursRange => ({ min: range.min * count, max: range.max * count });
const complexity = (max: number): EvolutionComplexity => (max === 0 ? "none" : max <= 12 ? "low" : max <= 32 ? "medium" : max <= 64 ? "high" : "very_high");

export function calculateEvolutionCost(impacts: EvolutionImpactFinding[], migration: MigrationSimulation): EvolutionCostEstimate {
  const confirmed = impacts.filter((item) => item.status === "confirmed").length;
  const likely = impacts.filter((item) => item.status === "likely").length;
  const possible = impacts.filter((item) => item.status === "possible").length;
  const unknowns = impacts.filter((item) => item.requiresVerification).map((item) => item.reason);
  const auditHours = add(multiply({ min: 1, max: 2 }, possible), multiply({ min: 1, max: 1 }, likely));
  const implementationHours = add(multiply({ min: 4, max: 8 }, confirmed), multiply({ min: 2, max: 4 }, likely));
  const inventoryKnown = migration.existingDocumentAuditStatus !== "not_started";
  const documentCount = migration.affectedExistingDocumentEstimate ?? migration.knownAffectedDocumentIds.length;
  const migrationHours = !migration.required ? { min: 0, max: 0 } : !inventoryKnown ? { min: 2, max: 6 } : { min: 2 + Math.ceil(documentCount / 100), max: 4 + Math.ceil(documentCount / 50) };
  const validationHours = confirmed + likely > 0 ? { min: Math.max(2, confirmed), max: Math.max(4, confirmed * 2 + likely) } : { min: 1, max: 2 };
  const totalHours = add(auditHours, implementationHours, migrationHours, validationHours);
  const confidence: EstimationConfidence = possible > 2 || migration.required && !inventoryKnown ? "low" : possible > 0 || likely > 0 || migration.existingDocumentAuditStatus === "partial" ? "medium" : "high";
  return {
    complexity: complexity(totalHours.max), auditHours, implementationHours, migrationHours, validationHours, totalHours, confidence,
    assumptions: ["Solo los impactos confirmados reciben coste completo de implementación.", "Los impactos posibles reciben únicamente coste de auditoría.", ...(migration.required ? ["La migración se considera reversible."] : [])],
    unknowns: [...new Set(unknowns)].sort(),
    score: Math.min(100, Math.round((totalHours.min + totalHours.max) / 2)),
  };
}
