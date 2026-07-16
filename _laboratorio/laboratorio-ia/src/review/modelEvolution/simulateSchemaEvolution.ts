import type { AlternativeSimulationContext, EvolutionImpactFinding } from "./types";

export function simulateSchemaEvolution({ proposal, alternative }: AlternativeSimulationContext): EvolutionImpactFinding[] {
  const changesSchema = !["keep_current", "fallback_policy"].includes(alternative.type);
  return [
    {
      area: "sanity_schema",
      status: changesSchema ? "confirmed" : "not_affected",
      evidence: changesSchema ? [`Propuesta 4D5 sobre ${proposal.entityType}.${proposal.field}`] : [],
      reason: changesSchema ? "La alternativa modifica explícitamente el contrato editorial diagnosticado." : "El schema permanecería sin cambios.",
      requiresVerification: false,
    },
    {
      area: "materialization",
      status: changesSchema ? "likely" : "not_affected",
      evidence: changesSchema ? [`El materializador consume el draft de ${proposal.entityType}`] : [],
      reason: changesSchema ? "El materializador probablemente deberá emitir la nueva representación; falta auditoría de implementación." : "La materialización conservaría el contrato actual.",
      requiresVerification: changesSchema,
    },
  ];
}
