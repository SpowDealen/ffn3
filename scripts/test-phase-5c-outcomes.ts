import assert from "node:assert/strict";
import {addReviewResolution, createReviewCase, removeReviewCase, setReviewCaseRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/store/reviewStore";
import type {ReviewCase, ReviewResolution} from "../_laboratorio/laboratorio-ia/src/review/types";
import {appendOutcomeEvent, buildContextFingerprint, buildDecisionFingerprint, canonicalizeOutcomeValue, confirmEditorialOutcome, correlateOutcome, createMemoryOutcomeRepository, ensureResolutionOutcome, evaluateEditorialOutcome, evaluateOperationalOutcome, evaluateStructuralOutcome, evaluateTechnicalOutcome, exportOutcomeLedger, failedOutcomes, getOutcomeEvents, getOutcomeRecords, migrateOutcomeLedger, observeMaterialization, observeResolutionApplied, observeResumeForCase, outcomesByCase, reconcileOutcome, rejectEditorialOutcome, setOutcomeRepositoryForTests, structurallyInvalid, technicallySucceededButUnconfirmed, validateOutcomeStore} from "../_laboratorio/laboratorio-ia/src/review/outcomes/index";

let cases: ReviewCase[] = [];
const restoreReview = setReviewCaseRepositoryForTests({load: () => structuredClone(cases), save: (value) => { cases = structuredClone(value as ReviewCase[]); }});
const outcomeRepository = createMemoryOutcomeRepository();
const restoreOutcomes = setOutcomeRepositoryForTests(outcomeRepository);
const now = "2026-07-17T10:00:00.000Z";
const reviewCase = createReviewCase({dedupeKey: "phase5c:test", module: "external.news", title: "Outcome test", priority: "normal", source: "Test", subject: {type: "external_news", id: "item-1"}, context: {producer: "external_news", payloadSnapshot: {title: "Test"}}, issues: [{id: "issue-1", kind: "missing_reference", valueKind: "discipline", label: "Disciplina", message: "Falta", required: true, blocking: true, candidates: [{id: "candidate-1", label: "Boxeo", value: "discipline-1", sanityId: "discipline-1"}]}]});
const resolution: ReviewResolution = {type: "link_reference", issueId: "issue-1", sanityId: "discipline-1"};
const updated = addReviewResolution(reviewCase.id, resolution);
assert.ok(updated);
assert.equal(getOutcomeRecords().length, 1, "guardar resolución crea record");
const record = getOutcomeRecords()[0];
assert.equal(getOutcomeEvents(record.id).filter((event) => event.type === "resolution_recorded").length, 1);
addReviewResolution(reviewCase.id, resolution);
assert.equal(getOutcomeEvents(record.id).filter((event) => event.type === "resolution_recorded").length, 1, "resolución repetida no duplica");

assert.deepEqual(canonicalizeOutcomeValue({b: 2, createdAt: now, a: 1}), {a: 1, b: 2});
assert.equal(buildContextFingerprint({b: 2, a: 1, createdAt: now}), buildContextFingerprint({a: 1, b: 2, createdAt: "2030-01-01T00:00:00Z"}));
const decisionA = buildDecisionFingerprint({issueType: "missing_reference", operation: "link_reference", resolution, producer: "external_news", schemaVersion: 1});
const decisionB = buildDecisionFingerprint({issueType: "missing_reference", operation: "link_reference", resolution: {...resolution, sanityId: "discipline-2"}, producer: "external_news", schemaVersion: 1});
assert.notEqual(decisionA, decisionB);

const appliedCase = updated as ReviewCase;
observeResolutionApplied(appliedCase, resolution);
const afterApplied = getOutcomeRecords()[0];
assert.equal(afterApplied.technicalStatus, "pending");
const duplicate = appendOutcomeEvent({outcomeId: record.id, caseId: record.caseId, type: "resolution_applied", stage: "application", status: "applied_internally", source: "autonomous_resolver", correlationKey: record.correlationKey, idempotencyKey: `resolution-applied:${record.id}`, operation: "link_reference"});
assert.equal(duplicate.duplicate, true);
assert.throws(() => appendOutcomeEvent({outcomeId: record.id, caseId: record.caseId, type: "resolution_applied", stage: "application", status: "different", source: "autonomous_resolver", correlationKey: record.correlationKey, idempotencyKey: `resolution-applied:${record.id}`, payload: {different: true}}));

assert.equal(evaluateTechnicalOutcome({executed: true, success: true, returnedIds: ["draft-1"]}).status, "succeeded");
assert.equal(evaluateTechnicalOutcome({executed: true, error: {code: "failed", message: "boom"}}).status, "failed");
assert.equal(evaluateTechnicalOutcome({executed: true, success: true, persisted: false, reconciliationRequired: true}).status, "pending");
assert.equal(evaluateStructuralOutcome({validation: {valid: true}}).status, "valid");
assert.equal(evaluateStructuralOutcome({validation: {valid: false, reasons: ["required"]}}).status, "invalid");
assert.equal(evaluateEditorialOutcome({}).status, "unknown");
assert.equal(evaluateEditorialOutcome({action: "confirm", actor: "editor", reason: "revisado"}).status, "confirmed");
assert.equal(evaluateEditorialOutcome({action: "reject", actor: "editor", reason: "incorrecto"}).status, "rejected");
assert.equal(evaluateOperationalOutcome({resumeCompleted: true, processClosed: true, draftId: "draft-1"}).status, "completed");

observeMaterialization(appliedCase, {type: "materialization_started", issueId: "issue-1", idempotencyKey: "mat:start", entityType: "discipline", status: "started", occurredAt: now});
observeMaterialization(appliedCase, {type: "materialization_succeeded", issueId: "issue-1", idempotencyKey: "mat:success", entityType: "discipline", entityId: "discipline-1", status: "existing", occurredAt: now});
observeResumeForCase(appliedCase, {type: "resume_started", idempotencyKey: "resume:start", status: "started", previewFingerprint: "preview-1", occurredAt: now});
observeResumeForCase(appliedCase, {type: "resume_succeeded", idempotencyKey: "resume:success", status: "succeeded", previewFingerprint: "preview-1", draftId: "draft-1", occurredAt: now});
const progressed = getOutcomeRecords()[0];
assert.equal(progressed.technicalStatus, "succeeded");
assert.equal(progressed.operationalStatus, "completed");
assert.notEqual(progressed.editorialStatus, "confirmed", "éxito técnico no confirma editorial");
confirmEditorialOutcome(progressed.id, "editor-1", "Confirmación humana explícita");
assert.equal(getOutcomeRecords()[0].editorialStatus, "confirmed");

const secondResolution: ReviewResolution = {type: "link_reference", issueId: "issue-1", sanityId: "discipline-2"};
const prospective = {...appliedCase, resolutions: [secondResolution]};
const second = ensureResolutionOutcome(prospective, secondResolution);
assert.equal(getOutcomeRecords().find((item) => item.id === progressed.id)?.currentStatus, "superseded");
assert.equal(correlateOutcome(getOutcomeRecords(), {outcomeId: second.id}).status, "exact");
assert.equal(correlateOutcome([...getOutcomeRecords(), {...second, id: `${second.id}:copy`}], {decisionFingerprint: second.decisionFingerprint}).status, "conflict");

const reconciliation = reconcileOutcome(second.id);
assert.equal(reconciliation.changed, false);
assert.equal(validateOutcomeStore().valid, true);
assert.equal(migrateOutcomeLedger({broken: true}).records.length, 0);
assert.equal(migrateOutcomeLedger(JSON.parse(JSON.stringify(exportOutcomeLedger()))).records.length, getOutcomeRecords().length);
assert.equal(outcomesByCase(getOutcomeRecords(), reviewCase.id).length, 2);
assert.equal(failedOutcomes(getOutcomeRecords()).length, 0);
assert.equal(structurallyInvalid(getOutcomeRecords()).length, 0);
assert.ok(technicallySucceededButUnconfirmed(getOutcomeRecords()).length >= 0);
assert.equal(JSON.stringify(exportOutcomeLedger()).includes("function"), false);
assert.ok(getOutcomeEvents(second.id).every((event, index, list) => index === 0 || list[index - 1].occurredAt <= event.occurredAt));

removeReviewCase(reviewCase.id);
assert.equal(getOutcomeRecords().length, 2, "outcome sobrevive a purga del caso");

const rejectionRepository = createMemoryOutcomeRepository();
restoreOutcomes();
const restoreRejection = setOutcomeRepositoryForTests(rejectionRepository);
cases = [];
const rejectionCase = createReviewCase({dedupeKey: "phase5c:reject", module: "external.news", title: "Reject", priority: "normal", subject: {type: "external_news"}, issues: [{id: "issue-r", kind: "invalid_value", label: "Value", message: "Invalid"}], context: {producer: "external_news"}});
const rejectionResolution: ReviewResolution = {type: "accept_value", issueId: "issue-r", reason: "test"};
const rejectionUpdated = addReviewResolution(rejectionCase.id, rejectionResolution) as ReviewCase;
const rejectionRecord = ensureResolutionOutcome(rejectionUpdated, rejectionResolution);
rejectEditorialOutcome(rejectionRecord.id, "editor", "Decisión incorrecta");
assert.equal(getOutcomeRecords()[0].currentStatus, "rejected");
assert.throws(() => appendOutcomeEvent({outcomeId: rejectionRecord.id, caseId: rejectionCase.id, type: "resolution_applied", stage: "application", status: "applied", source: "review_store", correlationKey: rejectionRecord.correlationKey, idempotencyKey: "invalid-transition"}));
restoreRejection();
restoreReview();
console.log("Phase 5C outcome and feedback tests: OK");
process.exit(0);
