import {generateTransversalPlanForReviewCase} from "../../globalResolution/transversalInteractive";
import {getReviewCase, setGlobalResolutionCheckpoint, updateGlobalResolutionCheckpoint} from "../../store/reviewStore";
import {recoverReviewCenterTransaction} from "../../transactions";
import {computeUniversalFingerprint} from "../../universal";
import {createReviewCenterAu7LoopHandoff} from "../supervisedLoop/au7Handoff";
import {attachAutonomousSupervisedLoopCheckpoint, buildAutonomousSupervisedLoopCheckpoint, createReviewStoreAutonomousLoopCheckpointApplication} from "../supervisedLoop/checkpoint";
import type {AutonomousInvestigationAdapterRegistry, AutonomousLoopObservation, AutonomousSupervisedLoopRuntime} from "../supervisedLoop/types";
import type {ReviewJsonValue} from "../../types";
import {buildAutonomousReviewCenterModel} from "./model";

const fingerprint = (value: unknown): string => computeUniversalFingerprint(value as ReviewJsonValue);
const noInvestigationAdapters: AutonomousInvestigationAdapterRegistry = Object.freeze({get: () => undefined});

/** B6 runtime composition. AU6 provides planning, AU7 remains the only effect path. */
export function createReviewStoreAutonomousReviewCenterRuntime(now: () => string = () => new Date().toISOString()): AutonomousSupervisedLoopRuntime {
  return Object.freeze({
    async observe({caseId}): Promise<AutonomousLoopObservation> {
      const reviewCase = getReviewCase(caseId);
      if (!reviewCase?.globalResolution) throw new Error("autonomous_center_global_plan_required");
      const generated = generateTransversalPlanForReviewCase(reviewCase, now).transversal;
      const transaction = recoverReviewCenterTransaction(reviewCase);
      const model = buildAutonomousReviewCenterModel(reviewCase, now());
      return Object.freeze({
        facadeInput: {
          decisionInput: {case: {caseId: reviewCase.id, caseVersion: reviewCase.version, status: reviewCase.status, priority: reviewCase.priority}, evaluatedAt: now(), resolution: generated, transaction: transaction.operational},
          autonomy: {resolution: generated, transaction: transaction.transaction, transactionView: transaction.operational},
          strategy: {producerId: reviewCase.globalResolution.producer, originalOperation: reviewCase.globalResolution.plan.originalOperation, generatedAt: now(), resolution: generated, transaction: transaction.transaction, transactionView: transaction.operational},
        },
        evidenceFingerprint: fingerprint({context: model.contextFingerprint, evidence: model.sufficiency?.fingerprint}),
        checkpointFingerprint: reviewCase.globalResolution.checkpointFingerprint,
        blockerCodes: Object.freeze([...transaction.reasons]),
      });
    },
    transactionHandoff: createReviewCenterAu7LoopHandoff(),
    investigationAdapters: noInvestigationAdapters,
    checkpointApplication: createReviewStoreAutonomousLoopCheckpointApplication(now),
  });
}

/** Explicit regeneration only: rebuilds AU6 checkpoint and deliberately clears runtime approvals/loop continuation. */
export function regenerateAutonomousReviewCenter(caseId: string, now: () => string = () => new Date().toISOString()): {ok: boolean; reasonCodes: readonly string[]} {
  try {
    const reviewCase = getReviewCase(caseId);
    if (!reviewCase) return {ok: false, reasonCodes: ["review_case_absent"]};
    const generated = generateTransversalPlanForReviewCase(reviewCase, now);
    if (reviewCase.globalResolution) updateGlobalResolutionCheckpoint(reviewCase.id, reviewCase.version, () => generated.checkpoint, new Date(now()), reviewCase.globalResolution.checkpointFingerprint);
    else setGlobalResolutionCheckpoint(reviewCase.id, reviewCase.version, generated.checkpoint, new Date(now()));
    return {ok: true, reasonCodes: []};
  } catch (error) { return {ok: false, reasonCodes: [error instanceof Error ? error.message : "autonomous_center_regeneration_failed"]}; }
}

/** Pause is persisted in AU3; continuing is always a separate explicit B5 invocation. */
export function pauseAutonomousReviewCenter(caseId: string, now: () => string = () => new Date().toISOString()): {ok: boolean; reasonCodes: readonly string[]} {
  try {
    const reviewCase = getReviewCase(caseId);
    const loop = reviewCase?.globalResolution?.autonomousLoop;
    if (!reviewCase?.globalResolution || !loop || loop.phase === "completed") return {ok: false, reasonCodes: ["autonomous_loop_not_pausable"]};
    const last = loop.history.at(-1);
    if (!last) return {ok: false, reasonCodes: ["autonomous_loop_history_absent"]};
    const paused = buildAutonomousSupervisedLoopCheckpoint({caseId, loopFingerprint: loop.loopFingerprint, iteration: loop.iteration + 1, phase: "paused", stopReason: "explicit_continuation_required", decisionFingerprint: loop.decisionFingerprint, sufficiencyFingerprint: loop.sufficiencyFingerprint, autonomyFingerprint: loop.autonomyFingerprint, strategyFingerprint: loop.strategyFingerprint, transactionFingerprint: loop.transactionFingerprint, contextFingerprint: loop.contextFingerprint, stateFingerprint: last.stateFingerprint, blockersFingerprint: last.blockersFingerprint, decisionKind: last.decisionKind, sufficiencyStatus: last.sufficiencyStatus, autonomyLevel: last.autonomyLevel, result: "paused", occurredAt: now(), previous: loop});
    updateGlobalResolutionCheckpoint(caseId, reviewCase.version, (checkpoint) => checkpoint ? attachAutonomousSupervisedLoopCheckpoint({checkpoint, loop: paused, now: now()}) : undefined, new Date(now()), reviewCase.globalResolution.checkpointFingerprint);
    return {ok: true, reasonCodes: []};
  } catch (error) { return {ok: false, reasonCodes: [error instanceof Error ? error.message : "autonomous_loop_pause_failed"]}; }
}

export function stampAutonomousReviewCenterContext(caseId: string, contextFingerprint: string, now: () => string = () => new Date().toISOString()): void {
  const reviewCase = getReviewCase(caseId);
  const loop = reviewCase?.globalResolution?.autonomousLoop;
  if (!reviewCase?.globalResolution || !loop || loop.contextFingerprint === contextFingerprint) return;
  updateGlobalResolutionCheckpoint(caseId, reviewCase.version, (checkpoint) => checkpoint ? attachAutonomousSupervisedLoopCheckpoint({checkpoint, loop: {...loop, contextFingerprint}, now: now()}) : undefined, new Date(now()), reviewCase.globalResolution.checkpointFingerprint);
}
