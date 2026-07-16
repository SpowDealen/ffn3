import type { AlternativeSimulationContext, EvolutionImpactFinding, MigrationSimulation } from "./types";

export function simulateMigrationImpact({ alternative, auditedArtifacts, preparedEntityCount }: AlternativeSimulationContext): { migration: MigrationSimulation; impact: EvolutionImpactFinding } {
  const required = alternative.requiresMigration;
  const auditStatus = auditedArtifacts.existingDocumentAuditStatus ?? "not_started";
  const knownIds = [...new Set(auditedArtifacts.knownAffectedDocumentIds ?? [])].sort();
  const estimate = auditedArtifacts.affectedExistingDocumentEstimate;
  const hasInventory = auditStatus !== "not_started" && (estimate !== undefined || knownIds.length > 0);
  const rollbackPlan = required ? "Conservar una copia verificable de los valores anteriores y restaurarlos antes de reactivar el contrato previo." : "Retirar el cambio de código simulado; no existirían datos migrados.";
  return {
    migration: {
      required,
      preparedEntityCount,
      affectedExistingDocumentEstimate: estimate,
      knownAffectedDocumentIds: knownIds,
      existingDocumentAuditStatus: auditStatus,
      strategy: required ? "Inventariar el dataset antes de definir lotes, transformación y validación referencial." : "No se proyecta migración de documentos.",
      validation: required ? ["Inventario previo", "Integridad referencial", "Muestreo editorial", "Compatibilidad de lectura"] : ["Pruebas de regresión del contrato actual"],
      rollbackPossible: true,
      rollbackPlan,
    },
    impact: {
      area: "existing_documents",
      status: !required ? "not_affected" : hasInventory ? (auditStatus === "complete" ? "confirmed" : "likely") : "possible",
      evidence: hasInventory ? [...knownIds, ...(estimate !== undefined ? [`Estimación auditada: ${estimate} documentos`] : [])] : [],
      reason: !required ? "Los documentos existentes permanecerían intactos." : hasInventory ? "Existe un inventario documental que permite estimar el alcance." : "Documentos existentes: pendiente de inventario. Los drafts preparados son casos de origen, no documentos a migrar.",
      requiresVerification: required && auditStatus !== "complete",
    },
  };
}
