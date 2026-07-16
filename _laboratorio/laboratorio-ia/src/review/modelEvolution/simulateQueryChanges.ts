import type { AlternativeSimulationContext, SimulationAreaImpact } from "./types";

export function simulateQueryChanges({ proposal, alternative, auditedArtifacts }: AlternativeSimulationContext): SimulationAreaImpact {
  const affected = alternative.affectedAreas.includes("queries");
  return {
    area: "queries",
    affected,
    changeKind: affected ? "code" : "none",
    affectedArtifacts: affected ? [...(auditedArtifacts.queries ?? [`queries:${proposal.entityType}.${proposal.field}`])].sort() : [],
    estimatedDocuments: 0,
    reason: affected ? "Las proyecciones y filtros deberán leer la representación simulada." : "Las consultas conservarían su forma actual.",
  };
}
