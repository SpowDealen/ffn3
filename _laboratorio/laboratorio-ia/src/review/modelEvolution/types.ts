import type { SchemaEvolutionProposal, SchemaEvolutionRisk, SchemaImpactArea, SchemaModelAlternative } from "../schemaEvolution";
import type { PreparedEntityDraft } from "../materialization";
import type { PreparedEntityRequirementReport } from "../schemaRequirements";
import type { ReviewCase } from "../types";

export type EvolutionComplexity = "none" | "low" | "medium" | "high" | "very_high";
export type EvolutionPriority = "low" | "normal" | "high" | "critical";
export type SimulationChangeKind = "none" | "configuration" | "code" | "schema" | "data" | "editorial_process";

export type AuditedEditorialArtifacts = Partial<Record<"builders" | "queries" | "producers" | "laboratory", string[]>> & {
  estimatedDocumentCount?: number;
};

export type SimulationAreaImpact = {
  area: SchemaImpactArea;
  affected: boolean;
  changeKind: SimulationChangeKind;
  affectedArtifacts: string[];
  estimatedDocuments: number;
  reason: string;
};

export type EvolutionSimulationStep = {
  id: string;
  order: number;
  area: SchemaImpactArea;
  action: string;
  reason: string;
  dependencies: string[];
  estimatedHours: number;
  rollbackAction: string;
};

export type MigrationSimulation = {
  required: boolean;
  estimatedDocuments: number;
  strategy: string;
  validation: string[];
  rollbackPossible: boolean;
  rollbackPlan: string;
};

export type EditorialConsequences = {
  benefits: string[];
  drawbacks: string[];
  technicalDebtRemoved: string[];
  editorialChanges: string[];
};

export type EvolutionCost = {
  complexity: EvolutionComplexity;
  estimatedHours: number;
  engineeringHours: number;
  editorialHours: number;
  migrationHours: number;
  score: number;
};

export type EvolutionRiskAssessment = {
  level: SchemaEvolutionRisk;
  score: number;
  factors: string[];
  mitigations: string[];
  rollbackPossible: boolean;
};

export type EvolutionAlternativeSimulation = {
  id: string;
  proposalIdentity: string;
  alternativeId: string;
  alternativeType: SchemaModelAlternative["type"];
  title: string;
  summary: string;
  impacts: SimulationAreaImpact[];
  steps: EvolutionSimulationStep[];
  dependencies: string[];
  migration: MigrationSimulation;
  consequences: EditorialConsequences;
  cost: EvolutionCost;
  risk: EvolutionRiskAssessment;
  priority: EvolutionPriority;
  roi: number;
  rollbackPossible: boolean;
  rollbackPlan: string;
  alternativeScore: number;
};

export type ModelEvolutionSimulation = {
  id: string;
  proposalIdentity: string;
  proposalId: string;
  entityType: string;
  field: string;
  occurrenceCount: number;
  alternatives: EvolutionAlternativeSimulation[];
  recommendedSimulationId?: string;
};

export type ModelEvolutionResult = {
  caseId: string;
  status: "simulations_ready" | "no_proposals" | "invalid_input";
  simulations: ModelEvolutionSimulation[];
  generatedAt: string;
  warnings: string[];
};

export type ModelEvolutionInput = {
  proposals: SchemaEvolutionProposal[];
  reviewCase?: ReviewCase;
  schemaRequirements?: PreparedEntityRequirementReport;
  preparedEntities?: PreparedEntityDraft[];
  auditedArtifacts?: AuditedEditorialArtifacts;
  now?: () => string;
};

export type AlternativeSimulationContext = {
  proposal: SchemaEvolutionProposal;
  alternative: SchemaModelAlternative;
  auditedArtifacts: AuditedEditorialArtifacts;
};
