import type { SchemaEvolutionProposal, SchemaEvolutionRisk, SchemaImpactArea, SchemaModelAlternative } from "../schemaEvolution";
import type { PreparedEntityDraft } from "../materialization";
import type { PreparedEntityRequirementReport } from "../schemaRequirements";
import type { ReviewCase } from "../types";

export type EvolutionComplexity = "none" | "low" | "medium" | "high" | "very_high";
export type EvolutionPriority = "low" | "normal" | "high" | "critical";
export type ImpactStatus = "confirmed" | "likely" | "possible" | "not_affected";
export type EstimationConfidence = "low" | "medium" | "high";
export type VerificationStatus = "provisional" | "partially_verified" | "verified";
export type ExistingDocumentAuditStatus = "not_started" | "partial" | "complete";
export type HoursRange = { min: number; max: number };

export type AuditedEditorialArtifacts = Partial<Record<"builders" | "queries" | "producers" | "laboratory", string[]>> & {
  affectedExistingDocumentEstimate?: number;
  knownAffectedDocumentIds?: string[];
  existingDocumentAuditStatus?: ExistingDocumentAuditStatus;
};

export type EvolutionImpactFinding = {
  area: SchemaImpactArea;
  status: ImpactStatus;
  evidence: string[];
  reason: string;
  requiresVerification: boolean;
};

export type EvolutionDependency = {
  id: string;
  label: string;
  area?: SchemaImpactArea;
  status: "required" | "needs_verification" | "satisfied";
  reason: string;
};

export type EvolutionSimulationStep = {
  id: string;
  order: number;
  area: SchemaImpactArea;
  action: string;
  reason: string;
  dependencyIds: string[];
  effort: HoursRange;
  rollbackAction: string;
};

export type MigrationSimulation = {
  required: boolean;
  preparedEntityCount: number;
  affectedExistingDocumentEstimate?: number;
  knownAffectedDocumentIds: string[];
  existingDocumentAuditStatus: ExistingDocumentAuditStatus;
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

export type OngoingEvolutionCost = {
  type: "editorial_blocking" | "manual_review" | "technical_debt" | "data_inaccuracy";
  description: string;
  severity: SchemaEvolutionRisk;
};

export type EvolutionCostEstimate = {
  complexity: EvolutionComplexity;
  changeCost: {
    auditHours: HoursRange;
    implementationHours: HoursRange;
    migrationHours: HoursRange;
    validationHours: HoursRange;
    totalHours: HoursRange;
  };
  ongoingCost: OngoingEvolutionCost[];
  confidence: EstimationConfidence;
  assumptions: string[];
  unknowns: string[];
  score: number;
};

export type EvolutionRiskAssessment = {
  technicalRisk: SchemaEvolutionRisk;
  editorialRiskOfInaction: SchemaEvolutionRisk;
  editorialChangeRisk: SchemaEvolutionRisk;
  migrationRisk: SchemaEvolutionRisk;
  operationalRisk: SchemaEvolutionRisk;
  overallRisk: SchemaEvolutionRisk;
  score: number;
  factors: string[];
  mitigations: string[];
  rollbackPossible: boolean;
};

export type EvolutionRoiAssessment = {
  score: number;
  status: VerificationStatus;
  reasons: string[];
};

export type EvolutionAlternativeSimulation = {
  id: string;
  proposalIdentity: string;
  alternativeId: string;
  alternativeType: SchemaModelAlternative["type"];
  title: string;
  summary: string;
  impacts: EvolutionImpactFinding[];
  steps: EvolutionSimulationStep[];
  dependencies: EvolutionDependency[];
  migration: MigrationSimulation;
  consequences: EditorialConsequences;
  cost: EvolutionCostEstimate;
  risk: EvolutionRiskAssessment;
  priority: EvolutionPriority;
  roi: EvolutionRoiAssessment;
  rollbackPossible: boolean;
  rollbackPlan: string;
  alternativeScore: number;
  editorialCoverage: number;
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
  preparedEntityCount: number;
  auditedArtifacts: AuditedEditorialArtifacts;
};
