import type {DecisionMemoryRecord, MemoryConfidenceLevel, OutcomeMemoryEligibility} from "./types";
import type {DecisionOutcomeRecord} from "../outcomes";

export function evaluateDecisionForMemory(outcome: DecisionOutcomeRecord) {
  const compatibilityAssessment = evaluateMemoryCompatibility(outcome);
  if (!(["confirmed", "rejected"] as string[]).includes(outcome.editorialStatus)) return {eligibility: "not_eligible" as const, eligible: false, reasons: [], blockedReasons: ["La decisión editorial aún no está confirmada ni rechazada."], targetStatus: undefined, confidenceInputs: {editorialStatus: outcome.editorialStatus}, proposedReusePolicy: "never" as const, compatibilityAssessment};
  const decision = outcome.editorialStatus as "confirmed" | "rejected";
  return {eligibility: "eligible" as const, eligible: true, decision, targetStatus: outcome.currentStatus === "superseded" ? "superseded" as const : decision, reasons: [`Outcome editorial ${decision} con procedencia trazable.`], blockedReasons: decision === "rejected" ? ["Una decisión rechazada nunca es reutilizable."] : [], confidenceInputs: {editorialStatus: decision, technicalStatus: outcome.technicalStatus, structuralStatus: outcome.structuralStatus, operationalStatus: outcome.operationalStatus}, proposedReusePolicy: decision === "rejected" ? "never" as const : "manual_only" as const, compatibilityAssessment};
}
export function evaluateOutcomeMemoryEligibility(outcome: DecisionOutcomeRecord): OutcomeMemoryEligibility { const result = evaluateDecisionForMemory(outcome); return {eligible: result.eligible, reasons: result.eligible ? result.reasons : result.blockedReasons, decision: result.decision}; }
export function confidenceLevel(score: number): MemoryConfidenceLevel { return score >= 75 ? "high" : score >= 45 ? "moderate" : score >= 20 ? "low" : "insufficient"; }
export function calculateIndividualConfidence(outcome: DecisionOutcomeRecord, decision: "confirmed" | "rejected"): DecisionMemoryRecord["confidence"] {
  if (decision === "rejected") return {score: 0, level: "insufficient", reasons: ["Una decisión rechazada se conserva como evidencia negativa y nunca es reutilizable."]};
  let score = 30; const reasons = ["Confirmación editorial humana: +30."];
  if (outcome.structuralStatus === "valid") { score += 10; reasons.push("Validación estructural: +10."); }
  if (outcome.technicalStatus === "succeeded") { score += 8; reasons.push("Resultado técnico satisfactorio: +8."); }
  if (outcome.operationalStatus === "completed") { score += 7; reasons.push("Confirmación operativa: +7."); }
  score = Math.min(score, 55); reasons.push("Tope individual 55: una sola experiencia no demuestra recurrencia.");
  return {score, level: confidenceLevel(score), reasons};
}
export function evaluateMemoryCompatibility(outcome: DecisionOutcomeRecord, context: {outcomeSchemaVersion?: number; reviewSchemaVersion?: number; engineVersions?: string[]; producers?: string[]; entityTypes?: string[]; issueTypes?: string[]; fingerprintVersion?: number} = {}): DecisionMemoryRecord["compatibility"] {
  if (!outcome.engineVersion || !outcome.producer || !outcome.issueType) return {status: "unknown", reasons: ["Faltan engine, productor o tipo de incidencia para demostrar compatibilidad."]};
  const expectedOutcome = context.outcomeSchemaVersion ?? 1; const expectedReview = context.reviewSchemaVersion ?? 1; const engines = context.engineVersions ?? ["5c.1"]; const producers = context.producers ?? [outcome.producer]; const entities = context.entityTypes ?? (outcome.entityType ? [outcome.entityType] : []); const issues = context.issueTypes ?? [outcome.issueType]; const fingerprint = context.fingerprintVersion ?? 1;
  const incompatible: string[] = [];
  if (outcome.schemaVersion !== expectedOutcome) incompatible.push(`Outcome schema ${outcome.schemaVersion} no coincide con ${expectedOutcome}.`);
  if (outcome.reviewSchemaVersion !== expectedReview) incompatible.push(`Review schema ${outcome.reviewSchemaVersion} no coincide con ${expectedReview}.`);
  if (!engines.includes(outcome.engineVersion)) incompatible.push(`Engine ${outcome.engineVersion} no está admitido.`);
  if (!producers.includes(outcome.producer)) incompatible.push(`Productor ${outcome.producer} no está admitido.`);
  if (outcome.entityType && !entities.includes(outcome.entityType)) incompatible.push(`Entidad ${outcome.entityType} no está admitida.`);
  if (!issues.includes(outcome.issueType)) incompatible.push(`Incidencia ${outcome.issueType} no está admitida.`);
  if (fingerprint !== 1) incompatible.push(`Fingerprint version ${fingerprint} no está soportada.`);
  return incompatible.length ? {status: "incompatible", reasons: incompatible} : {status: "compatible", reasons: [`Outcome schema ${outcome.schemaVersion}, Review schema ${outcome.reviewSchemaVersion}, engine ${outcome.engineVersion}, productor, entidad, incidencia y fingerprint v1 compatibles.`]};
}
