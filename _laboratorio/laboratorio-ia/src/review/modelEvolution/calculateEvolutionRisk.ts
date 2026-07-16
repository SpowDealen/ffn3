import type { SchemaEvolutionProposal, SchemaModelAlternative } from "../schemaEvolution";
import type { EvolutionRiskAssessment, MigrationSimulation, SimulationAreaImpact } from "./types";

const BASE = { low: 20, medium: 42, high: 66, critical: 86 } as const;
const level = (score: number): EvolutionRiskAssessment["level"] => (score >= 80 ? "critical" : score >= 58 ? "high" : score >= 32 ? "medium" : "low");

export function calculateEvolutionRisk(proposal: SchemaEvolutionProposal, alternative: SchemaModelAlternative, impacts: SimulationAreaImpact[], migration: MigrationSimulation): EvolutionRiskAssessment {
  const affected = impacts.filter((item) => item.affected).length;
  const score = Math.max(0, Math.min(100, BASE[proposal.risk] + affected * 2 + (migration.required ? 8 : 0) - (alternative.type === "keep_current" ? 18 : 0)));
  return {
    level: level(score),
    score,
    factors: [...new Set([proposal.riskReason, ...alternative.risks, ...(migration.required ? [`Migración estimada de ${migration.estimatedDocuments} documento(s).`] : [])])],
    mitigations: migration.required ? ["Migración por lotes", "Validación previa", "Despliegue reversible"] : ["Pruebas de regresión", "Revisión editorial humana"],
    rollbackPossible: migration.rollbackPossible,
  };
}
