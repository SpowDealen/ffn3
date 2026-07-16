import type { SchemaEvolutionProposal, SchemaEvolutionRisk, SchemaModelAlternative } from "../schemaEvolution";
import type { EvolutionImpactFinding, EvolutionRiskAssessment, MigrationSimulation } from "./types";

const SCORE: Record<SchemaEvolutionRisk, number> = { low: 20, medium: 45, high: 70, critical: 95 };
const highest = (...levels: SchemaEvolutionRisk[]): SchemaEvolutionRisk => levels.sort((left, right) => SCORE[right] - SCORE[left])[0] ?? "low";

export function calculateEvolutionRisk(proposal: SchemaEvolutionProposal, alternative: SchemaModelAlternative, impacts: EvolutionImpactFinding[], migration: MigrationSimulation): EvolutionRiskAssessment {
  const changesModel = !["keep_current", "fallback_policy"].includes(alternative.type);
  const consumers = impacts.filter((item) => item.status === "confirmed" || item.status === "likely").length;
  const technicalRisk: SchemaEvolutionRisk = !changesModel ? "low" : alternative.type === "make_optional" && consumers <= 2 ? "medium" : alternative.requiresMigration || consumers > 2 ? "high" : "medium";
  const editorialRisk: SchemaEvolutionRisk = alternative.type === "keep_current" ? "high" : alternative.score >= 80 ? "low" : proposal.risk === "critical" ? "high" : proposal.risk;
  const migrationRisk: SchemaEvolutionRisk = !migration.required ? "low" : !migration.rollbackPossible ? "critical" : migration.existingDocumentAuditStatus === "not_started" ? "medium" : "high";
  const operationalRisk: SchemaEvolutionRisk = consumers > 4 ? "high" : consumers > 1 ? "medium" : "low";
  const irreversible = !migration.rollbackPossible;
  const overallRisk = irreversible ? "critical" : highest(technicalRisk, migrationRisk, operationalRisk);
  const score = irreversible ? 95 : Math.round((SCORE[technicalRisk] * 0.45) + (SCORE[migrationRisk] * 0.3) + (SCORE[operationalRisk] * 0.25));
  return {
    technicalRisk, editorialRisk, migrationRisk, operationalRisk, overallRisk, score,
    factors: [...new Set([proposal.riskReason, ...alternative.risks, ...(migration.required && migration.existingDocumentAuditStatus === "not_started" ? ["El dataset existente todavía no está inventariado."] : [])])],
    mitigations: migration.required ? ["Inventario previo", "Migración por lotes", "Validación antes de activar", "Rollback probado"] : ["Pruebas de regresión", "Revisión editorial humana"],
    rollbackPossible: migration.rollbackPossible,
  };
}
