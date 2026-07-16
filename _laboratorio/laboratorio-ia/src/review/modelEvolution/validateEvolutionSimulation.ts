import type { ModelEvolutionResult } from "./types";

export type EvolutionSimulationValidation = { valid: boolean; errors: string[] };
const duplicates = (values: string[]): boolean => new Set(values).size !== values.length;

export function validateEvolutionSimulation(result: ModelEvolutionResult): EvolutionSimulationValidation {
  const errors: string[] = [];
  if (duplicates(result.simulations.map((item) => item.id))) errors.push("simulation_ids_not_unique");
  for (const simulation of result.simulations) {
    if (!simulation.proposalIdentity) errors.push(`${simulation.id}:missing_identity`);
    if (!simulation.alternatives.length) errors.push(`${simulation.id}:missing_alternatives`);
    if (duplicates(simulation.alternatives.map((item) => item.id))) errors.push(`${simulation.id}:alternative_ids_not_unique`);
    for (const alternative of simulation.alternatives) {
      if (!Number.isFinite(alternative.cost.estimatedHours) || alternative.cost.estimatedHours < 0) errors.push(`${alternative.id}:invalid_hours`);
      if (alternative.roi < 0 || alternative.roi > 100) errors.push(`${alternative.id}:invalid_roi`);
      if (alternative.risk.score < 0 || alternative.risk.score > 100) errors.push(`${alternative.id}:invalid_risk`);
      if (duplicates(alternative.dependencies) || duplicates(alternative.consequences.benefits) || duplicates(alternative.consequences.drawbacks)) errors.push(`${alternative.id}:duplicate_values`);
      if (alternative.steps.some((step, index) => step.order !== index + 1)) errors.push(`${alternative.id}:unstable_step_order`);
    }
  }
  try {
    JSON.stringify(result);
  } catch {
    errors.push("not_json_serializable");
  }
  return { valid: errors.length === 0, errors };
}
