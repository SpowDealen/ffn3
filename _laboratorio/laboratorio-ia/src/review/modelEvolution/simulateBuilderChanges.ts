import type { AlternativeSimulationContext, EvolutionImpactFinding } from "./types";

export function simulateBuilderChanges({ alternative, auditedArtifacts }: AlternativeSimulationContext): EvolutionImpactFinding {
  const evidence = [...(auditedArtifacts.builders ?? [])].sort();
  const expected = alternative.affectedAreas.includes("builders");
  return {
    area: "builders",
    status: evidence.length ? "confirmed" : expected ? "possible" : "not_affected",
    evidence,
    reason: evidence.length ? "La auditoría identifica builders consumidores del contrato." : expected ? "La alternativa podría afectar builders, pero todavía deben inventariarse." : "La alternativa no proyecta cambios en builders.",
    requiresVerification: expected && !evidence.length,
  };
}
