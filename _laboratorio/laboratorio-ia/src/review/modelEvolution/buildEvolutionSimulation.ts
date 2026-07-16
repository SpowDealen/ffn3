import { buildSimulationPlan } from "./buildSimulationPlan";
import { calculateEvolutionCost } from "./calculateEvolutionCost";
import { calculateEvolutionRisk } from "./calculateEvolutionRisk";
import { simulateBuilderChanges } from "./simulateBuilderChanges";
import { simulateEditorialConsequences } from "./simulateEditorialConsequences";
import { simulateMigrationImpact } from "./simulateMigrationImpact";
import { simulateProducerChanges } from "./simulateProducerChanges";
import { simulateQueryChanges } from "./simulateQueryChanges";
import { simulateSchemaEvolution } from "./simulateSchemaEvolution";
import type { AlternativeSimulationContext, EvolutionAlternativeSimulation, EvolutionImpactFinding, EvolutionPriority, ModelEvolutionInput, ModelEvolutionResult, VerificationStatus } from "./types";
import { validateEvolutionSimulation } from "./validateEvolutionSimulation";

function additionalImpacts(context: AlternativeSimulationContext): EvolutionImpactFinding[] {
  return context.alternative.affectedAreas
    .filter((area) => !["sanity_schema", "materialization", "builders", "queries", "producers", "existing_documents"].includes(area))
    .map((area) => {
      const evidence = area === "laboratory" ? [...(context.auditedArtifacts.laboratory ?? [])].sort() : [];
      return {
        area,
        status: evidence.length ? "confirmed" as const : "possible" as const,
        evidence,
        reason: evidence.length ? `La auditoría confirma consumidores en ${area}.` : `Debe auditarse si ${area} consume el contrato propuesto.`,
        requiresVerification: !evidence.length,
      };
    });
}

const priority = (roi: number, technicalRisk: number): EvolutionPriority => (roi >= 75 && technicalRisk < 90 ? "critical" : roi >= 60 ? "high" : roi >= 35 ? "normal" : "low");
const verificationStatus = (impacts: EvolutionImpactFinding[]): VerificationStatus => {
  const active = impacts.filter((item) => item.status !== "not_affected");
  if (active.every((item) => item.status === "confirmed")) return "verified";
  if (active.some((item) => item.status === "confirmed") && active.some((item) => item.status === "likely" || item.status === "possible")) return "partially_verified";
  return "provisional";
};

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
  const cost = calculateEvolutionCost(impacts, migrationResult.migration);
  const risk = calculateEvolutionRisk(context.proposal, context.alternative, impacts, migrationResult.migration);
  const consequences = simulateEditorialConsequences(context);
  const status = verificationStatus(impacts);
  const confirmed = impacts.filter((item) => item.status === "confirmed").length;
  const unresolved = impacts.filter((item) => item.status === "possible").length;
  const confidencePenalty = status === "provisional" ? 12 : status === "partially_verified" ? 5 : 0;
  const roiScore = Math.max(0, Math.min(100, Math.round(context.alternative.score * 0.72 + confirmed * 3 - unresolved * 2 - cost.score * 0.08 - risk.score * 0.08 - confidencePenalty)));
  const plan = buildSimulationPlan(impacts, migrationResult.migration);
  const id = `simulation:${context.proposal.id}:${context.alternative.id}`;
  return {
    id,
    proposalIdentity: context.proposal.identity,
    alternativeId: context.alternative.id,
    alternativeType: context.alternative.type,
    title: context.alternative.title,
    summary: context.alternative.description,
    impacts,
    steps: plan.steps,
    dependencies: plan.dependencies,
    migration: migrationResult.migration,
    consequences,
    cost,
    risk,
    priority: priority(roiScore, risk.score),
    roi: {
      score: roiScore,
      status,
      reasons: [
        `Valor editorial de la alternativa: ${context.alternative.score}/100.`,
        `${confirmed} impacto(s) confirmado(s) y ${unresolved} pendiente(s) de auditoría.`,
        `Coste provisional: ${cost.totalHours.min}–${cost.totalHours.max} h con confianza ${cost.confidence}.`,
        `Riesgo técnico ${risk.technicalRisk}; riesgo editorial de no actuar ${risk.editorialRisk}.`,
      ],
    },
    rollbackPossible: risk.rollbackPossible,
    rollbackPlan: migrationResult.migration.rollbackPlan,
    alternativeScore: context.alternative.score,
  };
}

export function buildEvolutionSimulation(input: ModelEvolutionInput): ModelEvolutionResult {
  const generatedAt = input.now?.() ?? new Date().toISOString();
  if (!input.proposals.length) return { caseId: "", status: "no_proposals", simulations: [], generatedAt, warnings: [] };
  const preparedEntityCount = input.preparedEntities?.length ?? input.schemaRequirements?.items.length ?? 0;
  const simulations = [...input.proposals]
    .sort((left, right) => left.identity.localeCompare(right.identity))
    .map((proposal) => {
      const alternatives = proposal.alternatives
        .map((alternative) => buildAlternative({ proposal, alternative, preparedEntityCount, auditedArtifacts: input.auditedArtifacts ?? {} }))
        .sort((left, right) => right.roi.score - left.roi.score || right.alternativeScore - left.alternativeScore || left.id.localeCompare(right.id));
      const explicit = alternatives.find((item) => item.alternativeId === proposal.recommendedAlternativeId);
      return { id: `simulation:${proposal.id}`, proposalIdentity: proposal.identity, proposalId: proposal.id, entityType: proposal.entityType, field: proposal.field, occurrenceCount: proposal.occurrenceCount, alternatives, recommendedSimulationId: explicit?.id ?? alternatives[0]?.id };
    });
  const result: ModelEvolutionResult = { caseId: input.reviewCase?.id ?? input.proposals[0]?.caseId ?? "", status: "simulations_ready", simulations, generatedAt, warnings: [] };
  const validation = validateEvolutionSimulation(result);
  return validation.valid ? result : { ...result, status: "invalid_input", warnings: validation.errors };
}
