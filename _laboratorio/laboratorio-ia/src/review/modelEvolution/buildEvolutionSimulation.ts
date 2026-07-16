import { buildSimulationPlan } from "./buildSimulationPlan";
import { calculateEvolutionCost } from "./calculateEvolutionCost";
import { calculateEvolutionRisk } from "./calculateEvolutionRisk";
import { simulateBuilderChanges } from "./simulateBuilderChanges";
import { simulateEditorialConsequences } from "./simulateEditorialConsequences";
import { simulateMigrationImpact } from "./simulateMigrationImpact";
import { simulateProducerChanges } from "./simulateProducerChanges";
import { simulateQueryChanges } from "./simulateQueryChanges";
import { simulateSchemaEvolution } from "./simulateSchemaEvolution";
import type { AlternativeSimulationContext, EvolutionAlternativeSimulation, EvolutionPriority, ModelEvolutionInput, ModelEvolutionResult, SimulationAreaImpact } from "./types";
import { validateEvolutionSimulation } from "./validateEvolutionSimulation";

const unique = (values: string[]): string[] => [...new Set(values)].sort();
const priority = (roi: number, risk: number): EvolutionPriority => (roi >= 75 && risk < 80 ? "critical" : roi >= 60 ? "high" : roi >= 35 ? "normal" : "low");

function additionalImpacts(context: AlternativeSimulationContext): SimulationAreaImpact[] {
  return context.alternative.affectedAreas
    .filter((area) => !["sanity_schema", "materialization", "builders", "queries", "producers", "existing_documents"].includes(area))
    .map((area) => ({
      area,
      affected: true,
      changeKind: area === "laboratory" || area === "review" || area === "preview" ? "code" : "editorial_process",
      affectedArtifacts: area === "laboratory" ? [...(context.auditedArtifacts.laboratory ?? ["laboratory:model-validation"])] : [area],
      estimatedDocuments: 0,
      reason: `La alternativa exige verificar y adaptar ${area}.`,
    }));
}

function buildAlternative(context: AlternativeSimulationContext): EvolutionAlternativeSimulation {
  const migrationResult = simulateMigrationImpact(context);
  const impacts = [
    ...simulateSchemaEvolution(context),
    simulateBuilderChanges(context),
    simulateQueryChanges(context),
    simulateProducerChanges(context),
    migrationResult.impact,
    ...additionalImpacts(context),
  ].sort((left, right) => left.area.localeCompare(right.area));
  const cost = calculateEvolutionCost(context.alternative, impacts, migrationResult.migration);
  const risk = calculateEvolutionRisk(context.proposal, context.alternative, impacts, migrationResult.migration);
  const consequences = simulateEditorialConsequences(context);
  const benefitSignal = Math.min(15, consequences.benefits.length * 3 + consequences.technicalDebtRemoved.length * 5);
  const roi = Math.max(0, Math.min(100, Math.round(context.alternative.score * 0.82 + benefitSignal - cost.score * 0.08 - risk.score * 0.05)));
  const id = `${context.proposal.identity}:${context.alternative.type}:${context.alternative.id}`;
  const steps = buildSimulationPlan(id, impacts, migrationResult.migration);
  return {
    id,
    proposalIdentity: context.proposal.identity,
    alternativeId: context.alternative.id,
    alternativeType: context.alternative.type,
    title: context.alternative.title,
    summary: context.alternative.description,
    impacts,
    steps,
    dependencies: unique(steps.flatMap((step) => step.dependencies)),
    migration: migrationResult.migration,
    consequences,
    cost,
    risk,
    priority: priority(roi, risk.score),
    roi,
    rollbackPossible: risk.rollbackPossible,
    rollbackPlan: migrationResult.migration.rollbackPlan,
    alternativeScore: context.alternative.score,
  };
}

export function buildEvolutionSimulation(input: ModelEvolutionInput): ModelEvolutionResult {
  const generatedAt = input.now?.() ?? new Date().toISOString();
  if (!input.proposals.length) return { caseId: "", status: "no_proposals", simulations: [], generatedAt, warnings: [] };
  const auditedArtifacts = {
    ...input.auditedArtifacts,
    estimatedDocumentCount: input.auditedArtifacts?.estimatedDocumentCount ?? input.preparedEntities?.length ?? input.schemaRequirements?.items.length,
  };
  const simulations = [...input.proposals]
    .sort((left, right) => left.identity.localeCompare(right.identity))
    .map((proposal) => {
      const alternatives = proposal.alternatives
        .map((alternative) => buildAlternative({ proposal, alternative, auditedArtifacts }))
        .sort((left, right) => right.roi - left.roi || right.alternativeScore - left.alternativeScore || left.id.localeCompare(right.id));
      const explicit = alternatives.find((item) => item.alternativeId === proposal.recommendedAlternativeId);
      return {
        id: `simulation:${proposal.identity}`,
        proposalIdentity: proposal.identity,
        proposalId: proposal.id,
        entityType: proposal.entityType,
        field: proposal.field,
        occurrenceCount: proposal.occurrenceCount,
        alternatives,
        recommendedSimulationId: explicit?.id ?? alternatives[0]?.id,
      };
    });
  const result: ModelEvolutionResult = { caseId: input.reviewCase?.id ?? input.proposals[0]?.caseId ?? "", status: "simulations_ready", simulations, generatedAt, warnings: [] };
  const validation = validateEvolutionSimulation(result);
  return validation.valid ? result : { ...result, status: "invalid_input", warnings: validation.errors };
}
