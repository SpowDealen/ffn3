import type { ModelEvolutionResult } from "./types";

export type EvolutionSimulationValidation = { valid: boolean; errors: string[] };
const duplicates = (values: string[]): boolean => new Set(values).size !== values.length;

export function validateEvolutionSimulation(result: ModelEvolutionResult): EvolutionSimulationValidation {
  const errors: string[] = [];
  if (duplicates(result.simulations.map((item) => item.id))) errors.push("simulation_ids_not_unique");
  for (const simulation of result.simulations) {
    if (!simulation.proposalIdentity) errors.push(`${simulation.id}:missing_identity`);
    if (!simulation.alternatives.length) errors.push(`${simulation.id}:missing_alternatives`);
    for (const alternative of simulation.alternatives) {
      const ranges = [alternative.cost.auditHours, alternative.cost.implementationHours, alternative.cost.migrationHours, alternative.cost.validationHours, alternative.cost.totalHours];
      if (ranges.some((range) => !Number.isInteger(range.min) || !Number.isInteger(range.max) || range.min < 0 || range.max < range.min)) errors.push(`${alternative.id}:invalid_cost_range`);
      if (alternative.roi.score < 0 || alternative.roi.score > 100) errors.push(`${alternative.id}:invalid_roi`);
      if (alternative.risk.score < 0 || alternative.risk.score > 100) errors.push(`${alternative.id}:invalid_risk`);
      if (alternative.risk.overallRisk === "critical" && alternative.rollbackPossible) errors.push(`${alternative.id}:reversible_risk_marked_critical`);
      if (duplicates(alternative.dependencies.map((item) => item.id)) || duplicates(alternative.dependencies.map((item) => item.label))) errors.push(`${alternative.id}:duplicate_dependencies`);
      if (alternative.dependencies.some((item) => item.label.includes(alternative.proposalIdentity) || item.label.includes(":step:"))) errors.push(`${alternative.id}:technical_dependency_label`);
      if (alternative.steps.some((step, index) => step.order !== index + 1)) errors.push(`${alternative.id}:unstable_step_order`);
      if (alternative.migration.existingDocumentAuditStatus === "not_started" && alternative.migration.affectedExistingDocumentEstimate !== undefined) errors.push(`${alternative.id}:unaudited_document_estimate`);
    }
  }
  try { JSON.stringify(result); } catch { errors.push("not_json_serializable"); }
  return { valid: errors.length === 0, errors };
}
