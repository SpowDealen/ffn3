import type { AlternativeSimulationContext, EvolutionImpactFinding } from "./types";

export function simulateProducerChanges({ alternative, auditedArtifacts }: AlternativeSimulationContext): EvolutionImpactFinding {
  const evidence = [...(auditedArtifacts.producers ?? [])].sort();
  const expected = alternative.affectedAreas.includes("producers");
  return {
    area: "producers",
    status: evidence.length ? "confirmed" : expected ? "possible" : "not_affected",
    evidence,
    reason: evidence.length ? "La auditoría identifica productores que emiten el campo." : expected ? "Debe verificarse qué productores escriben esta relación." : "La alternativa no proyecta cambios en productores.",
    requiresVerification: expected && !evidence.length,
  };
}
