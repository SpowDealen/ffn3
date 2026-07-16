import type {DecisionOutcomeEvent, DecisionOutcomeRecord} from "./types";

function overall(record: DecisionOutcomeRecord): DecisionOutcomeRecord["currentStatus"] {
  if (record.supersededAt) return "superseded";
  if (record.editorialStatus === "rejected") return "rejected";
  if (record.technicalStatus === "failed" || record.structuralStatus === "invalid" || record.operationalStatus === "failed") return "failed";
  if (record.operationalStatus === "completed") return "operationally_confirmed";
  if (record.editorialStatus === "confirmed") return "editorially_confirmed";
  if (record.structuralStatus === "valid") return "structurally_validated";
  if (record.technicalStatus === "succeeded") return "technically_succeeded";
  return "pending";
}
export function reduceOutcomeEvent(record: DecisionOutcomeRecord, event: DecisionOutcomeEvent): DecisionOutcomeRecord {
  if (record.currentStatus === "superseded" && event.type !== "outcome_reconciled") throw new Error("Un outcome superseded solo admite reconciliación auditada.");
  if (record.currentStatus === "rejected" && !["outcome_reconciled", "outcome_superseded", "editorial_note_added"].includes(event.type)) throw new Error("El outcome rechazado no admite esta transición.");
  const next: DecisionOutcomeRecord = {...record, updatedAt: event.occurredAt, eventIds: [...record.eventIds, event.id]};
  if (["resolution_applied", "materialization_started", "resume_started"].includes(event.type)) next.technicalStatus = "pending";
  if (event.type === "resolution_applied") next.applicationReference = event.id;
  if (["materialization_succeeded", "resume_succeeded", "draft_created"].includes(event.type)) next.technicalStatus = "succeeded";
  if (["materialization_failed", "resume_failed", "outcome_failed"].includes(event.type)) { next.technicalStatus = "failed"; next.failedAt = event.occurredAt; }
  if (event.type === "structural_validation_passed") next.structuralStatus = "valid";
  if (event.type === "structural_validation_failed") { next.structuralStatus = "invalid"; next.failedAt = event.occurredAt; }
  if (event.type === "editorial_confirmation_requested") next.editorialStatus = "pending_confirmation";
  if (event.type === "editorial_confirmed") { next.editorialStatus = "confirmed"; next.confirmedAt = event.occurredAt; }
  if (event.type === "editorial_rejected") { next.editorialStatus = "rejected"; next.failedAt = event.occurredAt; }
  if (event.type === "resume_started") next.operationalStatus = "pending";
  if (["resume_succeeded", "operational_confirmation_recorded"].includes(event.type)) next.operationalStatus = "completed";
  if (event.type === "resume_failed") next.operationalStatus = "failed";
  if (event.type === "materialization_succeeded") next.materializationReference = event.references.find((item) => item.type === "entity")?.id;
  if (event.type === "resume_succeeded") next.resumeReference = event.references.find((item) => item.type === "resume")?.id ?? event.id;
  const document = event.references.find((item) => item.type === "draft" || item.type === "document"); if (document) next.documentReference = document.id;
  if (event.type === "outcome_superseded") { next.supersededAt = event.occurredAt; next.supersededBy = event.references.find((item) => item.type === "outcome")?.id; }
  if (event.error?.reconciliationRequired) next.reconciliationRequired = true;
  if (event.type === "outcome_reconciled") {
    if (event.validation?.valid) next.reconciliationRequired = false;
    else { next.reconciliationRequired = true; next.conflicts = [...new Set([...next.conflicts, ...(event.validation?.reasons ?? ["Reconciliación inconclusa."])])]; }
  }
  next.currentStatus = overall(next);
  return next;
}
