import type {ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {consolidateKnowledge} from "./consolidate";
import {extractKnowledgeFromOutcome} from "./extract";
import type {FeedbackPartAssessment, FeedbackPartVerdict, FeedbackRecord, FeedbackStatus, LearningClassification, LearningFeedbackInput, LearningFeedbackResult, LearningObservation} from "./feedbackTypes";
import {LEARNING_FEEDBACK_LOOP_VERSION} from "./feedbackTypes";
import {governKnowledge} from "./governance";
import type {KnowledgeInvalidationDirective, KnowledgeReviewDirective, KnowledgeSupersessionDirective} from "./governanceTypes";
import type {KnowledgeFingerprint, KnowledgeItem} from "./types";

const fp = (value: unknown): KnowledgeFingerprint => computeUniversalFingerprint(value as ReviewJsonValue);
const unique = <T extends string>(values: readonly T[]): readonly T[] => Object.freeze([...new Set(values)].sort());
const successfulStates = new Set(["succeeded", "reused", "skipped", "compensated"]);
const failedStates = new Set(["failed", "compensation_failed"]);
const protectiveDecisions = new Set(["investigate", "wait_for_evidence", "request_authorization", "request_reconciliation", "request_compensation", "block", "escalate_to_human"]);

type Classification = Readonly<{
  status: FeedbackStatus;
  learning: LearningClassification;
  authority: boolean;
  eligible: boolean;
  reasons: readonly string[];
}>;

function contextReasons(input: LearningFeedbackInput): readonly string[] {
  const reasons: string[] = [];
  if (!Number.isInteger(input.caseVersion) || input.caseVersion < 0) reasons.push("case_version_invalid");
  if ([input.decision.caseId, input.sufficiency.caseId, input.strategy.caseId, input.transaction.caseId].some((caseId) => caseId !== input.outcome.caseId)) reasons.push("feedback_case_binding_mismatch");
  if (input.outcome.decisionFingerprint !== input.decision.decisionFingerprint || input.strategy.decisionFingerprint !== input.decision.decisionFingerprint || input.autonomy.decisionFingerprint !== input.decision.decisionFingerprint) reasons.push("feedback_decision_binding_mismatch");
  if (input.strategy.sufficiencyFingerprint !== input.sufficiency.evaluationFingerprint || input.autonomy.sufficiencyFingerprint !== input.sufficiency.evaluationFingerprint) reasons.push("feedback_sufficiency_binding_mismatch");
  if (input.strategy.autonomyFingerprint !== input.autonomy.policyFingerprint) reasons.push("feedback_autonomy_binding_mismatch");
  if (input.reconciliation?.some((entry) => entry.reconciliationCase.caseId !== input.outcome.caseId)) reasons.push("feedback_reconciliation_case_mismatch");
  return unique(reasons);
}

function classify(input: LearningFeedbackInput): Classification {
  const bindingReasons = contextReasons(input);
  if (bindingReasons.length) return {status: "no_learning", learning: "no_change", authority: false, eligible: false, reasons: bindingReasons};
  if (input.autonomy.stale || input.sufficiency.classification === "stale" || input.transactionRecovery?.status === "stale" || input.transactionRecovery?.status === "invalid") return {status: "no_learning", learning: "no_change", authority: false, eligible: false, reasons: Object.freeze(["stale_transaction_or_context"])};

  const reconciliation = input.reconciliation ?? [];
  const reconciledSuccess = reconciliation.some((entry) => entry.status === "confirmed_succeeded" || (entry.status === "already_reconciled" && Boolean(entry.outcome)));
  const reconciledAbsent = reconciliation.some((entry) => entry.status === "confirmed_not_applied");
  const reconciliationConflict = reconciliation.some((entry) => entry.status === "conflicting_evidence");
  const reconciliationUncertain = reconciliation.some((entry) => ["insufficient_evidence", "technical_failure", "unsupported", "stale_context"].includes(entry.status));
  const successSteps = input.transaction.steps.filter((step) => successfulStates.has(step.state));
  const failedSteps = input.transaction.steps.filter((step) => failedStates.has(step.state));
  const uncertainSteps = input.transaction.steps.filter((step) => step.state === "reconciliation_required");
  const executed = successSteps.length + failedSteps.length + uncertainSteps.length > 0;
  const correctBlock = protectiveDecisions.has(input.decision.decision) && ["blocked", "human_required", "authorization_required", "reconciliation_required", "investigation_required"].includes(input.strategy.status) && reconciledAbsent;

  if (reconciliationConflict) return {status: "contradicted", learning: "under_review", authority: false, eligible: false, reasons: Object.freeze(["reconciliation_evidence_conflicting"])};
  if (reconciliationUncertain || (uncertainSteps.length > 0 && !reconciledSuccess && !reconciledAbsent) || (input.outcome.reconciliationRequired && !reconciledSuccess && !reconciledAbsent)) return {status: "uncertain", learning: "no_change", authority: false, eligible: false, reasons: Object.freeze(["outcome_not_sufficiently_reconciled"])};
  if (!executed && !correctBlock) return {status: "no_learning", learning: "no_change", authority: false, eligible: false, reasons: Object.freeze(["decision_or_authorization_not_consumated"])};
  if (input.outcome.currentStatus === "superseded") return {status: "superseded", learning: "supersede", authority: true, eligible: true, reasons: Object.freeze(["real_outcome_superseded"])};
  if (correctBlock) return {status: "confirmed_success", learning: "reinforce", authority: true, eligible: true, reasons: Object.freeze(["strategy_block_confirmed_correct"])};
  if (input.transaction.phase === "partially_succeeded" || input.transaction.phase === "partially_compensated" || (successSteps.length > 0 && failedSteps.length > 0)) return {status: "partial_success", learning: "under_review", authority: true, eligible: true, reasons: Object.freeze(["transaction_partially_succeeded"])};
  if (reconciledAbsent) return {status: "confirmed_failure", learning: "invalidate", authority: true, eligible: true, reasons: Object.freeze(["reconciliation_confirmed_effect_not_applied"])};

  const failed = input.outcome.currentStatus === "failed" || input.outcome.currentStatus === "rejected" || input.outcome.technicalStatus === "failed" || input.outcome.structuralStatus === "invalid" || input.outcome.editorialStatus === "rejected" || input.outcome.operationalStatus === "failed" || failedSteps.length > 0;
  if (failed) {
    const explicitNegative = input.outcome.editorialStatus === "rejected" || /false|alias|candidate|duplicate|incorrect|wrong|invalid_reference|indebid/i.test(input.outcome.decisionType);
    return {status: "confirmed_failure", learning: explicitNegative ? "contradict" : "weaken", authority: true, eligible: true, reasons: Object.freeze([explicitNegative ? "confirmed_negative_feedback" : "confirmed_execution_failure"])};
  }
  const succeeded = reconciledSuccess || (input.transaction.phase === "completed" && input.outcome.operationalStatus === "completed") || (successSteps.length > 0 && input.outcome.editorialStatus === "confirmed");
  if (succeeded) return {status: "confirmed_success", learning: "reinforce", authority: true, eligible: true, reasons: Object.freeze([reconciledSuccess ? "reconciliation_confirmed_success" : "transaction_and_outcome_confirmed"])};
  return {status: "uncertain", learning: "no_change", authority: false, eligible: false, reasons: Object.freeze(["outcome_authority_not_confirmed"])};
}

function part(partName: FeedbackPartAssessment["part"], verdict: FeedbackPartVerdict, referenceFingerprint: KnowledgeFingerprint | undefined, reasonCodes: readonly string[]): FeedbackPartAssessment {
  const semantic = {part: partName, verdict, referenceFingerprint, reasonCodes: unique(reasonCodes)};
  return Object.freeze({...semantic, assessmentFingerprint: fp(semantic)});
}

function parts(input: LearningFeedbackInput, result: Classification, reconciliationFingerprint?: KnowledgeFingerprint): readonly FeedbackPartAssessment[] {
  const decisionVerdict: FeedbackPartVerdict = result.status === "confirmed_success" ? "correct" : result.status === "confirmed_failure" || result.status === "contradicted" ? "incorrect" : result.status === "partial_success" ? "partial" : "unverified";
  const strategyVerdict: FeedbackPartVerdict = result.status === "confirmed_success" ? "correct" : result.status === "confirmed_failure" ? "incorrect" : result.status === "partial_success" || result.learning === "under_review" ? "partial" : "unverified";
  const executionVerdict: FeedbackPartVerdict = result.status === "confirmed_success" ? "correct" : result.status === "confirmed_failure" ? "incorrect" : result.status === "partial_success" ? "partial" : result.status === "no_learning" ? "not_applicable" : "unverified";
  const reconciliationVerdict: FeedbackPartVerdict = input.reconciliation?.some((entry) => ["confirmed_succeeded", "confirmed_not_applied", "already_reconciled"].includes(entry.status)) ? "correct" : input.reconciliation?.some((entry) => entry.status === "conflicting_evidence") ? "partial" : "unverified";
  return Object.freeze([
    part("decision", decisionVerdict, input.decision.decisionFingerprint as KnowledgeFingerprint, [`decision_${decisionVerdict}`]),
    part("strategy", strategyVerdict, input.strategy.strategyFingerprint as KnowledgeFingerprint, [`strategy_${strategyVerdict}`]),
    part("execution", executionVerdict, input.transaction.transactionFingerprint as KnowledgeFingerprint, [`execution_${executionVerdict}`]),
    part("reconciliation", reconciliationVerdict, reconciliationFingerprint, [`reconciliation_${reconciliationVerdict}`]),
  ]);
}

function targetItems(input: LearningFeedbackInput): readonly KnowledgeItem[] {
  const active = input.knowledge?.governance?.activeItems ?? [];
  const requested = new Set(input.knowledge?.targetKnowledgeIds ?? []);
  const retrieved = input.knowledge?.retrieval ? new Set(input.knowledge.retrieval.candidates.map((candidate) => candidate.knowledgeId)) : undefined;
  return Object.freeze(active.filter((item) => requested.has(item.id) && (!retrieved || retrieved.has(item.id)) && Date.parse(input.outcome.updatedAt) >= Date.parse(item.createdAt)).sort((a, b) => a.knowledgeFingerprint.localeCompare(b.knowledgeFingerprint)));
}

function observationType(classification: LearningClassification): LearningObservation["type"] {
  if (classification === "reinforce") return "positive";
  if (["weaken", "contradict", "invalidate"].includes(classification)) return "negative";
  if (classification === "under_review") return "safety_review";
  if (classification === "supersede") return "mixed";
  return "no_learning";
}

/**
 * Compares AU8 intent with supplied AU7/AU4 outcomes and delegates all knowledge
 * materialization to B2 and lifecycle changes to B3.
 */
export function processLearningFeedback(input: LearningFeedbackInput): LearningFeedbackResult {
  const result = classify(input);
  const reconciliationFingerprints = unique((input.reconciliation ?? []).map((entry) => entry.assessmentFingerprint as KnowledgeFingerprint));
  const reconciliationFingerprint = reconciliationFingerprints.length ? fp(reconciliationFingerprints) : undefined;
  const analyzedExtraction = extractKnowledgeFromOutcome({caseVersion: input.caseVersion, outcome: input.outcome, decision: input.decision, sufficiency: input.sufficiency, autonomy: input.autonomy, strategy: input.strategy, transaction: input.transaction, loop: input.loop?.checkpoint, reconciliation: input.reconciliation, temporal: input.temporal});
  const existing = input.knowledge?.governance?.activeItems ?? [];
  const replayDeduplicated = existing.some((item) => item.references.some((reference) => reference.kind === "outcome" && (reference.id === input.outcome.id || reference.fingerprint === analyzedExtraction.outcomeFingerprint)) || item.observations.some((observation) => observation.observationFingerprint === analyzedExtraction.observations[0]?.observation.observationFingerprint));
  const extraction = result.eligible ? analyzedExtraction : undefined;
  const consolidation = result.eligible ? consolidateKnowledge({extractions: replayDeduplicated ? [] : [analyzedExtraction], existing}) : undefined;
  const targets = targetItems(input);
  const governanceItems = consolidation?.items ?? existing;
  const directiveTargets = Object.freeze(targets.map((target) => governanceItems.find((item) => item.id === target.id) ?? governanceItems.find((item) => item.domain === target.domain && item.subjectKey === target.subjectKey && item.claimCode === target.claimCode && item.kind === target.kind)).filter((item): item is KnowledgeItem => Boolean(item)));
  const evidenceFingerprints = unique([input.outcome.evidenceFingerprint as KnowledgeFingerprint, analyzedExtraction.outcomeFingerprint, ...reconciliationFingerprints]);
  const provenanceFingerprint = reconciliationFingerprint ?? analyzedExtraction.outcomeFingerprint;
  const invalidations: KnowledgeInvalidationDirective[] = result.learning === "invalidate" ? directiveTargets.map((item) => ({knowledgeId: item.id, reasonCode: "feedback_confirmed_invalid", occurredAt: input.outcome.updatedAt, evidenceFingerprints, provenanceFingerprint})) : [];
  const replacement = input.knowledge?.supersededByKnowledgeId;
  const originalReplacement = existing.find((item) => item.id === replacement);
  const governedReplacement = replacement ? governanceItems.find((item) => item.id === replacement) ?? (originalReplacement ? governanceItems.find((item) => item.domain === originalReplacement.domain && item.subjectKey === originalReplacement.subjectKey && item.claimCode === originalReplacement.claimCode && item.kind === originalReplacement.kind) : undefined) : undefined;
  const supersessions: KnowledgeSupersessionDirective[] = result.learning === "supersede" && governedReplacement ? directiveTargets.filter((item) => item.id !== governedReplacement.id).map((item) => ({knowledgeId: item.id, supersededById: governedReplacement.id, reasonCode: "feedback_confirmed_supersession", occurredAt: input.outcome.updatedAt, evidenceFingerprints, provenanceFingerprint})) : [];
  const requiresReview = result.learning === "under_review" || (result.learning === "supersede" && targets.length > 0 && supersessions.length === 0);
  const reviews: KnowledgeReviewDirective[] = requiresReview ? directiveTargets.map((item) => ({knowledgeId: item.id, reasonCodes: unique([result.learning === "supersede" ? "supersession_replacement_unavailable" : "feedback_requires_review", ...result.reasons]), occurredAt: input.outcome.updatedAt, provenanceFingerprint})) : [];
  const governance = governanceItems.length ? governKnowledge({items: governanceItems, evaluatedAt: input.outcome.updatedAt, invalidations, supersessions, reviews}) : undefined;
  const knowledgeFingerprints = unique((governance?.activeItems ?? consolidation?.items ?? []).map((item) => item.knowledgeFingerprint));
  const partAssessments = parts(input, result, reconciliationFingerprint);
  const recordReasons = unique([...result.reasons, ...(replayDeduplicated ? ["feedback_replay_deduplicated"] : []), ...(result.learning === "invalidate" && !targets.length ? ["invalidation_target_unavailable"] : []), ...(result.learning === "supersede" && !supersessions.length ? ["supersession_target_unavailable"] : [])]);
  const recordSemantic = {schemaVersion: LEARNING_FEEDBACK_LOOP_VERSION, caseId: input.outcome.caseId, caseVersion: input.caseVersion, status: result.status, classification: result.learning, decisionFingerprint: input.decision.decisionFingerprint as KnowledgeFingerprint, sufficiencyFingerprint: input.sufficiency.evaluationFingerprint as KnowledgeFingerprint, autonomyFingerprint: input.autonomy.policyFingerprint as KnowledgeFingerprint, strategyFingerprint: input.strategy.strategyFingerprint as KnowledgeFingerprint, transactionFingerprint: input.transaction.transactionFingerprint as KnowledgeFingerprint, outcomeFingerprint: analyzedExtraction.outcomeFingerprint, reconciliationFingerprint, loopFingerprint: input.loop?.loopFingerprint as KnowledgeFingerprint | undefined, knowledgeFingerprints, parts: partAssessments.map((entry) => entry.assessmentFingerprint), reasonCodes: recordReasons, learningEligible: result.eligible, outcomeAuthorityConfirmed: result.authority, advisoryOnly: true as const, requiresCurrentEvidence: true as const, replacesCurrentEvidence: false as const};
  const feedbackFingerprint = fp(recordSemantic);
  const feedback: FeedbackRecord = Object.freeze({...recordSemantic, feedbackId: `learning-feedback:${feedbackFingerprint.slice(-24)}`, parts: partAssessments, observedAt: input.outcome.updatedAt, feedbackFingerprint});
  const extractedObservation = extraction?.observations[0];
  const observationSemantic = {feedbackId: feedback.feedbackId, feedbackFingerprint, type: observationType(result.learning), classification: result.learning, outcomeFingerprint: analyzedExtraction.outcomeFingerprint, knowledgeObservationFingerprint: extractedObservation?.observation.observationFingerprint, extractionFingerprint: extraction?.extractionFingerprint, reasonCodes: recordReasons, learningEligible: result.eligible, createsPolicy: false as const, elevatesAuthority: false as const, advisoryOnly: true as const, requiresCurrentEvidence: true as const, replacesCurrentEvidence: false as const};
  const observationFingerprint = fp(observationSemantic);
  const observations = Object.freeze([Object.freeze({...observationSemantic, observationId: `learning-observation:${observationFingerprint.slice(-24)}`, observedAt: input.outcome.updatedAt, observationFingerprint})]);
  const resultSemantic = {schemaVersion: LEARNING_FEEDBACK_LOOP_VERSION, feedbackFingerprint, observationFingerprints: observations.map((entry) => entry.observationFingerprint), extractionFingerprint: extraction?.extractionFingerprint, consolidationFingerprint: consolidation?.consolidationFingerprint, governanceFingerprint: governance?.governanceFingerprint, replayDeduplicated, advisoryOnly: true as const, requiresCurrentEvidence: true as const, replacesCurrentEvidence: false as const, modifiesFutureDecisions: false as const, createsPolicy: false as const, autoAppliesRecommendations: false as const, writes: false as const};
  const resultFingerprint = fp(resultSemantic);
  return Object.freeze({...resultSemantic, feedback, observations, extraction, consolidation, governance, resultFingerprint});
}
