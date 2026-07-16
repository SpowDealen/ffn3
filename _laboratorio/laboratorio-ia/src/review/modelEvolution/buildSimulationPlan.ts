import type { EvolutionSimulationStep, MigrationSimulation, SimulationAreaImpact } from "./types";

const ACTIONS: Partial<Record<SimulationAreaImpact["area"], string>> = {
  sanity_schema: "Diseñar y revisar el contrato de schema propuesto",
  builders: "Adaptar builders auditados",
  queries: "Actualizar consultas y proyecciones auditadas",
  producers: "Adaptar productores auditados",
  materialization: "Actualizar y verificar la materialización",
  existing_documents: "Ejecutar una migración controlada",
  laboratory: "Actualizar validaciones y vistas del laboratorio",
};

export function buildSimulationPlan(identity: string, impacts: SimulationAreaImpact[], migration: MigrationSimulation): EvolutionSimulationStep[] {
  return impacts
    .filter((impact) => impact.affected)
    .map((impact, index) => ({
      id: `${identity}:step:${impact.area}`,
      order: index + 1,
      area: impact.area,
      action: ACTIONS[impact.area] ?? `Adaptar ${impact.area}`,
      reason: impact.reason,
      dependencies: index === 0 ? ["Aprobación editorial humana"] : [`${identity}:step:${impacts.filter((item) => item.affected)[index - 1]?.area}`],
      estimatedHours: impact.area === "existing_documents" ? Math.max(4, Math.ceil(migration.estimatedDocuments / 50)) : impact.changeKind === "schema" ? 8 : 4,
      rollbackAction: impact.area === "existing_documents" ? migration.rollbackPlan : `Restaurar el contrato anterior de ${impact.area}.`,
    }));
}
