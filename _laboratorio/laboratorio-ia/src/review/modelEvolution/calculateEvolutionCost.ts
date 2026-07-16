import type { EvolutionAlternativeSimulation, EvolutionComplexity, EvolutionCost, MigrationSimulation, SimulationAreaImpact } from "./types";
import type { SchemaModelAlternative } from "../schemaEvolution";

const BASE_HOURS: Record<SchemaModelAlternative["type"], number> = { keep_current: 2, fallback_policy: 8, make_optional: 18, change_semantics: 28, split_relationship: 38, new_entity: 52, new_document: 60 };
const complexity = (hours: number): EvolutionComplexity => (hours <= 2 ? "none" : hours <= 16 ? "low" : hours <= 32 ? "medium" : hours <= 56 ? "high" : "very_high");

export function calculateEvolutionCost(alternative: SchemaModelAlternative, impacts: SimulationAreaImpact[], migration: MigrationSimulation): EvolutionCost {
  const engineeringHours = BASE_HOURS[alternative.type] + impacts.filter((item) => item.affected && item.changeKind === "code").length * 4;
  const editorialHours = impacts.filter((item) => item.affected).length * 1.5;
  const migrationHours = migration.required ? 8 + Math.min(24, Math.ceil(migration.estimatedDocuments / 100) * 2) : 0;
  const estimatedHours = Math.round((engineeringHours + editorialHours + migrationHours) * 2) / 2;
  return { complexity: complexity(estimatedHours), estimatedHours, engineeringHours, editorialHours, migrationHours, score: Math.min(100, Math.round(estimatedHours * 1.35)) };
}

export type CostedSimulation = Pick<EvolutionAlternativeSimulation, "cost">;
