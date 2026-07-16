import type { AlternativeSimulationContext, SimulationAreaImpact } from "./types";

export function simulateBuilderChanges({ proposal, alternative, auditedArtifacts }: AlternativeSimulationContext): SimulationAreaImpact {
  const affected = alternative.affectedAreas.includes("builders");
  return {
    area: "builders",
    affected,
    changeKind: affected ? "code" : "none",
    affectedArtifacts: affected ? [...(auditedArtifacts.builders ?? [`builder:${proposal.entityType}`])].sort() : [],
    estimatedDocuments: 0,
    reason: affected ? "Los builders que producen el campo deben adaptarse al contrato simulado." : "No se detecta cambio de contrato para builders.",
  };
}
