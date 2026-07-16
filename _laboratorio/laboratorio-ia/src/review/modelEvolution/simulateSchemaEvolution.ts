import type { AlternativeSimulationContext, SimulationAreaImpact } from "./types";

export function simulateSchemaEvolution({ proposal, alternative }: AlternativeSimulationContext): SimulationAreaImpact[] {
  const changesSchema = !["keep_current", "fallback_policy"].includes(alternative.type);
  return [
    {
      area: "sanity_schema",
      affected: changesSchema,
      changeKind: changesSchema ? "schema" : "none",
      affectedArtifacts: changesSchema ? [`${proposal.entityType}.${proposal.field}`] : [],
      estimatedDocuments: 0,
      reason: changesSchema ? `La alternativa ${alternative.type} requeriría diseñar y aprobar un cambio de modelo.` : "El modelo persistido se mantendría sin cambios.",
    },
    {
      area: "materialization",
      affected: changesSchema,
      changeKind: changesSchema ? "code" : "none",
      affectedArtifacts: changesSchema ? [proposal.entityType] : [],
      estimatedDocuments: 0,
      reason: changesSchema ? "La materialización tendría que emitir la nueva representación editorial." : "La materialización conservaría el contrato actual.",
    },
  ];
}
