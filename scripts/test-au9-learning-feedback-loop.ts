import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  learningFeedbackSecurity,
  processLearningFeedback,
  retrieveGovernedKnowledge,
  type AutonomousEditorialDecision,
  type EditorialEvidenceSufficiencyEvaluation,
  type AutonomyPolicyResult,
  type AutonomousResolutionStrategy,
  type LearningFeedbackInput,
  type DecisionOutcomeRecord,
  type UniversalTransactionPlan,
} from "../_laboratorio/laboratorio-ia/src/review";
import type {GlobalResolutionReconciliationAssessment} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/reconciliation";
import {computeUniversalFingerprint} from "../_laboratorio/laboratorio-ia/src/review/universal";

const NOW = "2026-08-10T10:00:00.000Z";
const fp = (value: string) => computeUniversalFingerprint(value);
const DECISION_FP = fp("decision");
const SUFFICIENCY_FP = fp("sufficiency");
const AUTONOMY_FP = fp("autonomy");
const STRATEGY_FP = fp("strategy");
const TRANSACTION_FP = fp("transaction");
let assertions = 0;
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const deepEqual = (actual: unknown, expected: unknown, message?: string): void => { assert.deepEqual(actual, expected, message); assertions += 1; };

function decision(kind: AutonomousEditorialDecision["decision"] = "reuse_existing"): AutonomousEditorialDecision {
  return {version: "1.1.0", caseId: "case:feedback", caseVersion: 4, decision: kind, decisionFingerprint: DECISION_FP, executionAllowed: false, writes: false} as AutonomousEditorialDecision;
}

function sufficiency(classification: EditorialEvidenceSufficiencyEvaluation["classification"] = "sufficient"): EditorialEvidenceSufficiencyEvaluation {
  return {version: "1.0.0", caseId: "case:feedback", caseVersion: 4, classification, evaluationFingerprint: SUFFICIENCY_FP, writes: false} as EditorialEvidenceSufficiencyEvaluation;
}

function autonomy(stale = false): AutonomyPolicyResult {
  return {schemaVersion: "1.0.0", level: "autonomous_supervised", decisionKind: "reuse_existing", decisionFingerprint: DECISION_FP, sufficiencyFingerprint: SUFFICIENCY_FP, stale, staleReasonCodes: stale ? ["stale_context"] : [], policyFingerprint: AUTONOMY_FP, executionAllowed: false, writes: false} as unknown as AutonomyPolicyResult;
}

function strategy(status: AutonomousResolutionStrategy["status"] = "ready"): AutonomousResolutionStrategy {
  return {schemaVersion: "1.0.0", caseId: "case:feedback", caseVersion: 4, status, decisionFingerprint: DECISION_FP, sufficiencyFingerprint: SUFFICIENCY_FP, autonomyFingerprint: AUTONOMY_FP, strategyFingerprint: STRATEGY_FP, executionAllowed: false, launchesTransactions: false, writes: false} as AutonomousResolutionStrategy;
}

function transaction(phase: UniversalTransactionPlan["phase"] = "completed", states: readonly string[] = ["reused"]): UniversalTransactionPlan {
  return {schemaVersion: "1.0.0", transactionId: "transaction:feedback", caseId: "case:feedback", caseVersion: 4, sourcePlanFingerprint: fp("plan"), transactionFingerprint: TRANSACTION_FP, transactionIdempotencyKey: `logical-transaction:${TRANSACTION_FP}`, phase, steps: states.map((state, index) => ({stepId: `step:${index}`, operationId: `operation:${index}`, operationKind: "reuse_entity", capability: "entity:reuse", entityType: "fighter", dependencies: [], mode: "external_effect", risk: "low", authorization: "explicit", idempotencyKey: `step:${index}`, compensation: "none", retry: "never", reconciliation: "inspect_on_uncertain", preExecutionValidationRequired: true, state, fingerprints: {operationFingerprint: fp(`operation:${index}`)}})), policies: {atomicity: "logical", consistency: "domain_enforced", isolation: "optimistic_fingerprint", durability: "checkpoint_based", allowAutomaticExecution: false, allowAutomaticRetry: false, allowAutomaticCompensation: false, maximumRisk: "medium", historyLimit: 100}, blockers: [], contextBinding: {caseId: "case:feedback", caseVersion: 4, sourcePlanFingerprint: fp("plan"), operationFingerprints: {}, creationGuardFingerprints: {}}, createdAt: NOW} as unknown as UniversalTransactionPlan;
}

function outcome(overrides: Partial<DecisionOutcomeRecord> = {}): DecisionOutcomeRecord {
  return {schemaVersion: 1, engineVersion: "AU7/1", id: "outcome:success", caseId: "case:feedback", issueId: "issue:identity", resolutionId: "resolution:identity", decisionFingerprint: DECISION_FP, contextFingerprint: fp("context"), inputFingerprint: fp("input"), evidenceFingerprint: fp("outcome-evidence"), correlationKey: "case:feedback:identity", producer: "review_center", source: "transaction_engine", entityType: "fighter", issueType: "missing_entity", decisionType: "reuse_existing", reviewSchemaVersion: 1, currentStatus: "operationally_confirmed", technicalStatus: "succeeded", structuralStatus: "valid", editorialStatus: "confirmed", operationalStatus: "completed", createdAt: NOW, updatedAt: NOW, confirmedAt: NOW, reconciliationRequired: false, conflicts: [], eventIds: ["event:completed"], ...overrides};
}

function reconciliation(status: GlobalResolutionReconciliationAssessment["status"], name: string = status): GlobalResolutionReconciliationAssessment {
  const base = {reconciliationCase: {caseId: "case:feedback", operationId: "operation:0"}, evidence: [], assessmentFingerprint: fp(`reconciliation:${name}`), missingEvidence: [], notification: "Reconciliación completada", repairAllowed: false, retryAllowed: false};
  if (status === "confirmed_succeeded") return {...base, status, outcome: {outcome: "succeeded"}, repairAllowed: true} as unknown as GlobalResolutionReconciliationAssessment;
  if (status === "already_reconciled") return {...base, status, outcome: {outcome: "succeeded"}} as unknown as GlobalResolutionReconciliationAssessment;
  return {...base, status} as unknown as GlobalResolutionReconciliationAssessment;
}

function input(overrides: Partial<LearningFeedbackInput> = {}): LearningFeedbackInput {
  return {caseVersion: 4, decision: decision(), sufficiency: sufficiency(), autonomy: autonomy(), strategy: strategy(), transaction: transaction(), outcome: outcome(), loop: {loopFingerprint: fp("loop")} as LearningFeedbackInput["loop"], ...overrides};
}

function retrieval(governance: NonNullable<ReturnType<typeof processLearningFeedback>["governance"]>) {
  return retrieveGovernedKnowledge({governance, query: {caseId: "case:feedback", evaluatedAt: NOW, entityTypes: ["fighter"], currentEvidenceFingerprints: [fp("current-evidence")]}});
}

function main(): void {
  const success = processLearningFeedback(input());
  equal(success.feedback.status, "confirmed_success"); equal(success.feedback.classification, "reinforce"); equal(success.feedback.learningEligible, true); equal(success.feedback.outcomeAuthorityConfirmed, true); equal(success.observations[0].type, "positive"); equal(success.extraction?.eligible, true); equal(success.consolidation?.items.length, 1); equal(success.governance?.activeItems.length, 1);
  equal(success.feedback.parts.find((entry) => entry.part === "decision")?.verdict, "correct"); equal(success.feedback.parts.find((entry) => entry.part === "strategy")?.verdict, "correct"); equal(success.feedback.parts.find((entry) => entry.part === "execution")?.verdict, "correct");
  equal(success.feedback.decisionFingerprint, DECISION_FP); equal(success.feedback.sufficiencyFingerprint, SUFFICIENCY_FP); equal(success.feedback.autonomyFingerprint, AUTONOMY_FP); equal(success.feedback.strategyFingerprint, STRATEGY_FP); equal(success.feedback.transactionFingerprint, TRANSACTION_FP); equal(success.feedback.loopFingerprint, fp("loop")); check(success.feedback.outcomeFingerprint.startsWith("sha256-v1:")); check(success.feedback.knowledgeFingerprints.length === 1);

  const secondOutcome = outcome({id: "outcome:success:2", evidenceFingerprint: fp("outcome-evidence:2"), inputFingerprint: fp("input:2")});
  const reinforced = processLearningFeedback(input({outcome: secondOutcome, knowledge: {governance: success.governance}}));
  equal(reinforced.feedback.classification, "reinforce"); equal(reinforced.consolidation?.reinforcements, 1); equal(reinforced.governance?.activeItems.length, 1); check((reinforced.governance?.activeItems[0].revision ?? 0) > 1); equal(reinforced.replayDeduplicated, false);
  const replayInput = input({outcome: secondOutcome, knowledge: {governance: reinforced.governance}});
  const replay = processLearningFeedback(replayInput); const replayAgain = processLearningFeedback(replayInput);
  equal(replay.replayDeduplicated, true); equal(replay.consolidation?.items.length, 1); equal(replay.governance?.activeItems[0].revision, reinforced.governance?.activeItems[0].revision); equal(replay.resultFingerprint, replayAgain.resultFingerprint); deepEqual(replay.feedback, replayAgain.feedback);

  const failure = processLearningFeedback(input({transaction: transaction("failed", ["failed"]), outcome: outcome({id: "outcome:failure", currentStatus: "rejected", technicalStatus: "failed", structuralStatus: "invalid", editorialStatus: "rejected", operationalStatus: "failed", failedAt: NOW, evidenceFingerprint: fp("failure")}), knowledge: {governance: reinforced.governance}}));
  equal(failure.feedback.status, "confirmed_failure"); equal(failure.feedback.classification, "contradict"); equal(failure.observations[0].type, "negative"); equal(failure.extraction?.observations[0].kind, "negative_evidence"); check((failure.governance?.conflicts.length ?? 0) > 0); equal(failure.governance?.activeItems.every((entry) => entry.validity.state === "contradictory"), true);

  const weakFailure = processLearningFeedback(input({transaction: transaction("failed", ["failed"]), outcome: outcome({id: "outcome:weak-failure", currentStatus: "failed", technicalStatus: "failed", editorialStatus: "unknown", operationalStatus: "failed", decisionType: "resume", evidenceFingerprint: fp("weak-failure")})}));
  equal(weakFailure.feedback.classification, "weaken"); equal(weakFailure.feedback.status, "confirmed_failure");

  const currentRetrieval = retrieval(reinforced.governance!); const targetId = currentRetrieval.candidates[0].knowledgeId;
  const partial = processLearningFeedback(input({transaction: transaction("partially_succeeded", ["succeeded", "failed"]), outcome: outcome({id: "outcome:partial", evidenceFingerprint: fp("partial")}), knowledge: {governance: reinforced.governance, retrieval: currentRetrieval, targetKnowledgeIds: [targetId]}}));
  equal(partial.feedback.status, "partial_success"); equal(partial.feedback.classification, "under_review"); equal(partial.observations[0].type, "safety_review"); check(partial.governance?.activeItems.some((entry) => entry.validity.state === "under_review"));

  const uncertain = processLearningFeedback(input({transaction: transaction("reconciliation_required", ["reconciliation_required"]), outcome: outcome({id: "outcome:uncertain", currentStatus: "technically_succeeded", editorialStatus: "pending_confirmation", operationalStatus: "pending", reconciliationRequired: true, evidenceFingerprint: fp("uncertain")})}));
  equal(uncertain.feedback.status, "uncertain"); equal(uncertain.feedback.classification, "no_change"); equal(uncertain.feedback.learningEligible, false); equal(uncertain.extraction, undefined); equal(uncertain.consolidation, undefined); equal(uncertain.observations[0].type, "no_learning");

  const stale = processLearningFeedback(input({transactionRecovery: {status: "stale", reasons: ["context_changed"], continuation: {}} as unknown as LearningFeedbackInput["transactionRecovery"]}));
  equal(stale.feedback.status, "no_learning"); equal(stale.feedback.classification, "no_change"); equal(stale.feedback.learningEligible, false); check(stale.feedback.reasonCodes.includes("stale_transaction_or_context"));
  const simulated = processLearningFeedback(input({transaction: transaction("planned", ["pending"]), outcome: outcome({currentStatus: "pending", technicalStatus: "pending", structuralStatus: "pending", editorialStatus: "pending_confirmation", operationalStatus: "pending"})}));
  equal(simulated.feedback.status, "no_learning"); check(simulated.feedback.reasonCodes.includes("decision_or_authorization_not_consumated")); equal(simulated.feedback.outcomeAuthorityConfirmed, false);

  const reconciledSuccess = processLearningFeedback(input({transaction: transaction("reconciliation_required", ["reconciliation_required"]), outcome: outcome({id: "outcome:reconciled-success", reconciliationRequired: true, evidenceFingerprint: fp("reconciled-success")}), reconciliation: [reconciliation("confirmed_succeeded")]}));
  equal(reconciledSuccess.feedback.status, "confirmed_success"); equal(reconciledSuccess.feedback.classification, "reinforce"); check(reconciledSuccess.feedback.reconciliationFingerprint); equal(reconciledSuccess.feedback.parts.find((entry) => entry.part === "reconciliation")?.verdict, "correct");

  const notApplied = processLearningFeedback(input({outcome: outcome({id: "outcome:not-applied", reconciliationRequired: true, evidenceFingerprint: fp("not-applied")}), reconciliation: [reconciliation("confirmed_not_applied")], knowledge: {governance: reinforced.governance, retrieval: currentRetrieval, targetKnowledgeIds: [targetId]}}));
  equal(notApplied.feedback.status, "confirmed_failure"); equal(notApplied.feedback.classification, "invalidate"); equal(notApplied.extraction?.observations[0].kind, "negative_evidence"); check(notApplied.governance?.activeItems.some((entry) => entry.validity.state === "invalidated")); check(notApplied.governance?.transitions.some((entry) => entry.kind === "invalidate"));

  const conflictReview = processLearningFeedback(input({outcome: outcome({id: "outcome:conflict", reconciliationRequired: true, evidenceFingerprint: fp("conflict")}), reconciliation: [reconciliation("conflicting_evidence")], knowledge: {governance: reinforced.governance, retrieval: currentRetrieval, targetKnowledgeIds: [targetId]}}));
  equal(conflictReview.feedback.status, "contradicted"); equal(conflictReview.feedback.classification, "under_review"); equal(conflictReview.feedback.learningEligible, false); equal(conflictReview.extraction, undefined); check(conflictReview.governance?.activeItems.some((entry) => entry.validity.state === "under_review"));

  const replacementBase = processLearningFeedback(input({outcome: outcome({id: "outcome:replacement", issueId: "issue:replacement", evidenceFingerprint: fp("replacement")})}));
  const combinedGovernance = replacementBase.governance!;
  const replacementId = combinedGovernance.activeItems[0].id;
  const originalWithReplacement = processLearningFeedback(input({outcome: outcome({id: "outcome:original-for-supersession", evidenceFingerprint: fp("original-supersession")}), knowledge: {governance: combinedGovernance}}));
  const originalItem = originalWithReplacement.governance!.activeItems.find((entry) => entry.subjectKey.includes("issue:identity"))!;
  const superseded = processLearningFeedback(input({outcome: outcome({id: "outcome:superseded", currentStatus: "superseded", supersededAt: NOW, supersededBy: "outcome:replacement", evidenceFingerprint: fp("superseded")}), knowledge: {governance: originalWithReplacement.governance, targetKnowledgeIds: [originalItem.id], supersededByKnowledgeId: replacementId}}));
  equal(superseded.feedback.status, "superseded"); equal(superseded.feedback.classification, "supersede"); check(superseded.governance?.activeItems.some((entry) => entry.validity.state === "superseded")); check(superseded.governance?.transitions.some((entry) => entry.kind === "supersede"));

  const blocked = processLearningFeedback(input({decision: decision("block"), strategy: strategy("blocked"), transaction: transaction("blocked", ["blocked"]), outcome: outcome({id: "outcome:blocked-correct", decisionType: "block", evidenceFingerprint: fp("blocked")}), reconciliation: [reconciliation("confirmed_not_applied", "blocked")]}));
  equal(blocked.feedback.status, "confirmed_success"); equal(blocked.feedback.classification, "reinforce"); check(blocked.feedback.reasonCodes.includes("strategy_block_confirmed_correct"));

  const temporalOutcome = outcome({id: "outcome:temporal", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z", confirmedAt: "2026-07-01T00:00:00.000Z", evidenceFingerprint: fp("temporal")});
  const temporalInput = input({outcome: temporalOutcome, temporal: {validFrom: "2026-07-01T00:00:00.000Z", validUntil: "2026-07-31T00:00:00.000Z"}});
  const temporal = processLearningFeedback(temporalInput);
  equal(temporal.extraction?.observations[0].temporal.state, "temporal"); equal(temporal.governance?.activeItems[0].validity.validUntil, "2026-07-31T00:00:00.000Z");
  const shiftedTemporal = processLearningFeedback({...temporalInput, outcome: {...temporalOutcome, createdAt: "2026-07-02T00:00:00.000Z", updatedAt: "2026-07-02T00:00:00.000Z", confirmedAt: "2026-07-02T00:00:00.000Z"}});
  equal(temporal.feedback.feedbackFingerprint, shiftedTemporal.feedback.feedbackFingerprint, "la fecha operacional no define identidad semántica"); equal(temporal.observations[0].observationFingerprint, shiftedTemporal.observations[0].observationFingerprint);

  for (const result of [success, reinforced, replay, failure, weakFailure, partial, uncertain, stale, simulated, reconciledSuccess, notApplied, conflictReview, superseded, blocked, temporal]) {
    equal(result.advisoryOnly, true); equal(result.requiresCurrentEvidence, true); equal(result.replacesCurrentEvidence, false); equal(result.modifiesFutureDecisions, false); equal(result.createsPolicy, false); equal(result.autoAppliesRecommendations, false); equal(result.writes, false); equal(result.observations[0].createsPolicy, false); equal(result.observations[0].elevatesAuthority, false);
  }
  equal(learningFeedbackSecurity.requiresRealOutcome, true); equal(learningFeedbackSecurity.learnsFromSimulation, false); equal(learningFeedbackSecurity.learnsFromUnexecutedDecision, false); equal(learningFeedbackSecurity.learnsFromStaleTransaction, false); equal(learningFeedbackSecurity.createsPolicy, false); equal(learningFeedbackSecurity.elevatesKnowledgeAuthority, false); equal(learningFeedbackSecurity.modifiesFutureDecisions, false); equal(learningFeedbackSecurity.createsMemoryEngine, false); equal(learningFeedbackSecurity.createsStores, false); equal(learningFeedbackSecurity.invokesExecutors, false); equal(learningFeedbackSecurity.accessesSanity, false); equal(learningFeedbackSecurity.accessesNetwork, false); equal(learningFeedbackSecurity.writes, false);
  const sources = ["feedback.ts", "feedbackTypes.ts"].map((file) => readFileSync(new URL(`../_laboratorio/laboratorio-ia/src/review/knowledge/${file}`, import.meta.url), "utf8")).join("\n");
  check(!/from ["'][^"']*(store|executor|sanity|planner|scheduler|memory)/i.test(sources)); check(!sources.includes("fetch(")); check(!sources.includes("localStorage")); check(!sources.includes("outcome.payload")); check(!sources.includes("autoApply"));
  console.log(`AU9 B5 learning feedback loop tests: OK (${assertions} assertions; outcome authority, positive/negative feedback, reconciliation, B2/B3 integration, idempotency, anti-overfitting, temporal behavior and zero writes)`);
}

main();
