import type { AlternativeSimulationContext, EvolutionImpactFinding } from "./types";

export function simulateQueryChanges({ alternative, auditedArtifacts }: AlternativeSimulationContext): EvolutionImpactFinding {
  const evidence = [...(auditedArtifacts.queries ?? [])].sort();
  const expected = alternative.affectedAreas.includes("queries");
  return {
    area: "queries",
    status: evidence.length ? "confirmed" : expected ? "possible" : "not_affected",
    evidence,
    reason: evidence.length ? "La auditoría identifica consultas consumidoras del campo." : expected ? "Debe inventariarse qué consultas leen o filtran esta relación." : "La alternativa no proyecta cambios en consultas.",
    requiresVerification: expected && !evidence.length,
  };
}
