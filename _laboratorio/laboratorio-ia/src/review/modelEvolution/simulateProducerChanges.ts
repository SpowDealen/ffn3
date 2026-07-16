import type { AlternativeSimulationContext, SimulationAreaImpact } from "./types";

export function simulateProducerChanges({ proposal, alternative, auditedArtifacts }: AlternativeSimulationContext): SimulationAreaImpact {
  const affected = alternative.affectedAreas.includes("producers");
  return {
    area: "producers",
    affected,
    changeKind: affected ? "code" : "none",
    affectedArtifacts: affected ? [...(auditedArtifacts.producers ?? [`producer:${proposal.entityType}`])].sort() : [],
    estimatedDocuments: 0,
    reason: affected ? "Cada productor deberá emitir datos compatibles con el modelo propuesto." : "Los productores no requieren cambios según el alcance conocido.",
  };
}
