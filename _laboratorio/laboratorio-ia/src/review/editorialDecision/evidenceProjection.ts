import type {EntityResolutionResult} from "../entityIdentity";
import type {GlobalResolutionInspectionEvidence} from "../globalResolution/inspection/types";
import type {TransversalResolutionPlan} from "../globalResolution/transversalPlanning";
import type {TransactionOperationalView} from "../transactions/orchestrator";
import type {AutonomousEditorialDecisionInput, AutonomousEditorialEvidence, AutonomousEditorialEvidenceSource} from "./types";

const unique = (values: readonly string[]): readonly string[] => Object.freeze([...new Set(values)].sort());
const evidenceId = (source: AutonomousEditorialEvidenceSource, value: string): string => `${source}:${value.slice(-16)}`;

function inspectionSummary(evidence: GlobalResolutionInspectionEvidence): string {
  const kinds = unique(evidence.observations.map((observation) => observation.kind));
  return `Inspección ${evidence.status}; observaciones: ${kinds.length ? kinds.join(", ") : "ninguna"}.`;
}

function identitySummary(resolution: EntityResolutionResult): string {
  return `Identidad ${resolution.entityType}: ${resolution.status}; candidatos: ${resolution.candidates.length}.`;
}

function planSummary(plan: TransversalResolutionPlan): string {
  const kinds = unique(plan.decisions.map((decision) => decision.decision));
  return `Plan transversal ${plan.plan.status}; decisiones: ${kinds.length ? kinds.join(", ") : "ninguna"}.`;
}

function transactionSummary(view: TransactionOperationalView): string {
  return `Transacción ${view.state}; ${view.progress.completed}/${view.progress.total} steps completados, ${view.nextReadySteps.length} preparados.`;
}

export function projectAutonomousEditorialEvidence(input: AutonomousEditorialDecisionInput): readonly AutonomousEditorialEvidence[] {
  const items = new Map<string, AutonomousEditorialEvidence>();
  for (const item of input.inspection ?? []) {
    const confidence = item.status === "observed" ? 0.9 : item.status === "ambiguous" ? 0.45 : item.status === "not_observed" ? 0.7 : 0.1;
    const projected = Object.freeze({id: evidenceId("inspection", item.fingerprint), source: "inspection" as const, kind: item.status, summary: inspectionSummary(item), fingerprint: item.fingerprint, confidence});
    items.set(projected.id, projected);
  }
  for (const item of input.identities ?? []) {
    const confidence = item.comparison ? Math.max(0, Math.min(1, item.comparison.score)) : item.status === "create_new" ? 0.7 : 0.2;
    const projected = Object.freeze({id: evidenceId("identity", item.resolutionFingerprint), source: "identity" as const, kind: `${item.entityType}:${item.status}`, summary: identitySummary(item), fingerprint: item.resolutionFingerprint, confidence});
    items.set(projected.id, projected);
  }
  if (input.resolution) {
    const projected = Object.freeze({id: evidenceId("resolution", input.resolution.decisionFingerprint), source: "resolution" as const, kind: input.resolution.plan.status, summary: planSummary(input.resolution), fingerprint: input.resolution.decisionFingerprint, confidence: input.resolution.plan.structurallyValid ? 0.95 : 0.3});
    items.set(projected.id, projected);
  }
  if (input.transaction) {
    const projected = Object.freeze({id: evidenceId("transaction", input.transaction.transactionFingerprint), source: "transaction" as const, kind: input.transaction.state, summary: transactionSummary(input.transaction), fingerprint: input.transaction.transactionFingerprint, confidence: 0.95});
    items.set(projected.id, projected);
  }
  return Object.freeze([...items.values()].sort((left, right) => left.id.localeCompare(right.id)));
}
