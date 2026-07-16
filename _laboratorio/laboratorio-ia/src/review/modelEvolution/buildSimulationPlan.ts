import type { EvolutionDependency, EvolutionImpactFinding, EvolutionSimulationStep, HoursRange, MigrationSimulation } from "./types";

const LABELS: Partial<Record<EvolutionImpactFinding["area"], string>> = { builders: "Auditoría de builders", queries: "Inventario de consultas", producers: "Revisión de productores", existing_documents: "Estimación de documentos existentes", sanity_schema: "Diseño del contrato editorial", materialization: "Auditoría del materializador", laboratory: "Revisión del laboratorio", public_web: "Auditoría de web pública" };
const ACTIONS: Partial<Record<EvolutionImpactFinding["area"], string>> = { sanity_schema: "Diseñar y revisar el contrato propuesto", builders: "Adaptar los builders confirmados", queries: "Actualizar las consultas confirmadas", producers: "Adaptar los productores confirmados", materialization: "Actualizar y verificar la materialización", existing_documents: "Preparar una migración reversible", laboratory: "Actualizar las superficies confirmadas del laboratorio" };
const effort = (status: EvolutionImpactFinding["status"]): HoursRange => (status === "confirmed" ? { min: 4, max: 8 } : status === "likely" ? { min: 2, max: 4 } : { min: 1, max: 2 });

export function buildSimulationPlan(impacts: EvolutionImpactFinding[], migration: MigrationSimulation): { steps: EvolutionSimulationStep[]; dependencies: EvolutionDependency[] } {
  const active = impacts.filter((impact) => impact.status !== "not_affected");
  const dependencies: EvolutionDependency[] = [
    { id: "dep:editorial-approval", label: "Aprobación editorial humana", status: "required", reason: "4D6 simula consecuencias, pero no autoriza cambios." },
    ...active.map((impact) => ({
      id: `dep:${impact.area}`,
      label: LABELS[impact.area] ?? `Revisión de ${impact.area}`,
      area: impact.area,
      status: impact.requiresVerification ? "needs_verification" as const : "satisfied" as const,
      reason: impact.reason,
    })),
    ...(migration.required ? [{ id: "dep:migration-contract", label: "Diseño del contrato de migración", area: "existing_documents" as const, status: "required" as const, reason: migration.strategy }] : []),
  ];
  const deduplicated = [...new Map(dependencies.map((item) => [item.id, item])).values()].sort((left, right) => left.id.localeCompare(right.id));
  const steps = active.map((impact, index) => ({
    id: `step:${impact.area}`,
    order: index + 1,
    area: impact.area,
    action: impact.status === "possible" ? (LABELS[impact.area] ?? `Auditar ${impact.area}`) : (ACTIONS[impact.area] ?? `Adaptar ${impact.area}`),
    reason: impact.reason,
    dependencyIds: ["dep:editorial-approval", `dep:${impact.area}`].filter((id) => deduplicated.some((dependency) => dependency.id === id)),
    effort: effort(impact.status),
    rollbackAction: impact.area === "existing_documents" ? migration.rollbackPlan : `Restaurar el contrato anterior de ${impact.area}.`,
  }));
  return { steps, dependencies: deduplicated };
}
