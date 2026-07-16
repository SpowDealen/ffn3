import {appendOutcomeEvent, getOutcomeById, getOutcomeEvents} from "./outcomeStore";
import type {OutcomeReconciliationResult} from "./types";
export function reconcileOutcome(outcomeId: string, now = () => new Date().toISOString()): OutcomeReconciliationResult {
  const record = getOutcomeById(outcomeId); if (!record) throw new Error("outcome_not_found");
  const events = getOutcomeEvents(outcomeId); const findings: string[] = [];
  const started = events.filter((item) => ["materialization_started", "resume_started"].includes(item.type));
  const terminal = events.filter((item) => ["materialization_succeeded", "materialization_failed", "resume_succeeded", "resume_failed"].includes(item.type));
  if (started.length > terminal.length) findings.push("Existe una operación iniciada sin evento terminal demostrable.");
  if (record.documentReference && !events.some((item) => item.references.some((reference) => reference.id === record.documentReference))) findings.push("El snapshot contiene una referencia documental sin evento correlacionado.");
  if (!record.eventIds.every((id) => events.some((event) => event.id === id))) findings.push("El record referencia eventos ausentes.");
  if (!findings.length && !record.reconciliationRequired) return {record, changed: false, findings: ["El outcome es coherente con la evidencia local disponible."]};
  const result = appendOutcomeEvent({outcomeId, caseId: record.caseId, type: "outcome_reconciled", stage: "reconciliation", status: findings.length ? "uncertain" : "consistent", source: "reconciliation", correlationKey: record.correlationKey, idempotencyKey: `reconcile:${outcomeId}:${record.eventIds.length}:${findings.join("|")}`, occurredAt: now(), actor: {type: "system", label: "Reconciliación local read-only"}, operation: "inspect_local_ledger", payload: {findings}, validation: {valid: findings.length === 0, reasons: findings.length ? findings : ["Ledger coherente."]}, evidence: [], references: []});
  return {record: result.record, event: result.event, changed: true, findings};
}
export function supersedeOutcome(outcomeId: string, supersededBy: string, input: {actorId: string; reason: string; now?: () => string}) {
  const record = getOutcomeById(outcomeId); if (!record) throw new Error("outcome_not_found"); if (!getOutcomeById(supersededBy)) throw new Error("replacement_outcome_not_found"); if (!input.actorId.trim() || !input.reason.trim()) throw new Error("supersession_requires_actor_and_reason");
  return appendOutcomeEvent({outcomeId, caseId: record.caseId, type: "outcome_superseded", stage: "decision", status: "superseded", source: "human_confirmation", correlationKey: record.correlationKey, idempotencyKey: `supersede:${outcomeId}:${supersededBy}`, occurredAt: input.now?.(), actor: {type: "human", id: input.actorId}, operation: "supersede_decision", payload: {reason: input.reason}, references: [{type: "outcome", id: supersededBy}]});
}
