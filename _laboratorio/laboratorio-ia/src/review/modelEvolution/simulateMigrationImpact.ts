import type { AlternativeSimulationContext, MigrationSimulation, SimulationAreaImpact } from "./types";

export function simulateMigrationImpact({ proposal, alternative, auditedArtifacts }: AlternativeSimulationContext): { migration: MigrationSimulation; impact: SimulationAreaImpact } {
  const estimatedDocuments = alternative.requiresMigration ? Math.max(auditedArtifacts.estimatedDocumentCount ?? proposal.occurrenceCount, proposal.occurrenceCount) : 0;
  const required = alternative.requiresMigration;
  const rollbackPlan = required ? "Conservar una copia verificable del valor anterior y restaurarla tras validar el contrato previo." : "Retirar los cambios de código simulados; no existirían datos migrados que restaurar.";
  return {
    migration: {
      required,
      estimatedDocuments,
      strategy: required ? "Inventariar, transformar por lotes, validar referencias y activar mediante despliegue controlado." : "No se proyecta migración de documentos.",
      validation: required ? ["Recuento antes y después", "Integridad referencial", "Muestreo editorial", "Compatibilidad de lectura"] : ["Pruebas de regresión del contrato actual"],
      rollbackPossible: true,
      rollbackPlan,
    },
    impact: {
      area: "existing_documents",
      affected: required,
      changeKind: required ? "data" : "none",
      affectedArtifacts: required ? [`${estimatedDocuments} documento(s) estimado(s)`] : [],
      estimatedDocuments,
      reason: required ? "Los documentos existentes necesitarían una transformación explícita y reversible." : "Los documentos existentes permanecerían intactos.",
    },
  };
}
