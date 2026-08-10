import {getReviewCase} from "../../store/reviewStore";
import {initializeReviewCenterTransaction, recoverReviewCenterTransaction, runReviewCenterTransaction, type TransactionCenterDependencies} from "../../transactions/operationalCenter";
import type {TransactionOrchestrationResult} from "../../transactions/orchestrator";
import type {AutonomousLoopAu7Execution, AutonomousLoopTransactionHandoff, AutonomousLoopTransactionHandoffAdapter} from "./types";

const terminalSteps = new Set(["succeeded", "reused", "compensated", "skipped", "cancelled"]);
const empty = Object.freeze([] as string[]);

function blockedExecution(input: {transactionFingerprint?: string; transactionState?: string; reasonCodes: readonly string[]}): AutonomousLoopAu7Execution {
  return Object.freeze({status: "blocked", stopReason: input.reasonCodes.some((code) => code.includes("stale")) ? "transaction_stale" : input.reasonCodes.some((code) => code.includes("checkpoint")) ? "checkpoint_conflict" : "unexpected_result", transactionFingerprint: input.transactionFingerprint ?? "sha256-v1:unavailable", transactionState: input.transactionState ?? "blocked", executions: Object.freeze([]), blockerCodes: Object.freeze([...input.reasonCodes].sort()), authorizationRequired: empty, reconciliationRequired: empty, compensationRequired: empty});
}

function projectExecution(result: TransactionOrchestrationResult): AutonomousLoopAu7Execution {
  return Object.freeze({
    status: result.status,
    stopReason: result.stopReason,
    transactionFingerprint: result.view.transactionFingerprint,
    transactionState: result.view.state,
    executions: Object.freeze(result.executions.map((item) => Object.freeze({stepId: item.stepId, status: item.status, executorInvoked: item.executorInvoked, reconciliationRequired: item.reconciliationRequired}))),
    blockerCodes: Object.freeze(result.incidents.flatMap((item) => item.reasonCodes).sort()),
    authorizationRequired: Object.freeze([...result.view.authorizationRequired]),
    reconciliationRequired: Object.freeze([...result.view.reconciliationRequired]),
    compensationRequired: Object.freeze([...result.view.compensationRequired]),
  });
}

/** AU7-only bridge. Every effect remains inside runReviewCenterTransaction. */
export function createReviewCenterAu7LoopHandoff(dependencies: TransactionCenterDependencies = {}): AutonomousLoopTransactionHandoffAdapter {
  return Object.freeze({
    prepareOrReuse(input): AutonomousLoopTransactionHandoff {
      let reviewCase = getReviewCase(input.caseId);
      if (!reviewCase?.globalResolution) return {status: "blocked", strategyFingerprint: input.strategy.strategyFingerprint, checkpointFingerprint: "sha256-v1:unavailable", readySteps: [], pendingMandatoryStepIds: [], authorizationRequired: [], reconciliationRequired: [], compensationRequired: [], blockerCodes: ["global_checkpoint_absent"]};
      const initialCheckpointFingerprint = reviewCase.globalResolution.checkpointFingerprint;
      let center = recoverReviewCenterTransaction(reviewCase, dependencies);
      if (center.recovery === "absent" && center.canStart) {
        const initialized = initializeReviewCenterTransaction(reviewCase, dependencies);
        if (initialized.status !== "initialized" && initialized.status !== "already_initialized") return {status: initialized.status === "conflict" ? "stale" : "blocked", strategyFingerprint: input.strategy.strategyFingerprint, checkpointFingerprint: reviewCase.globalResolution.checkpointFingerprint, readySteps: [], pendingMandatoryStepIds: [], authorizationRequired: [], reconciliationRequired: [], compensationRequired: [], blockerCodes: initialized.reasons};
        reviewCase = getReviewCase(input.caseId) ?? reviewCase;
        center = recoverReviewCenterTransaction(reviewCase, dependencies);
      }
      const status: AutonomousLoopTransactionHandoff["status"] = center.state === "completed" ? "completed" : center.state === "stale" ? "stale" : center.state === "reconciliation_required" ? "reconciliation_required" : center.state === "compensation_required" ? "compensation_required" : center.state === "ready" ? "ready" : "blocked";
      const transaction = center.transaction;
      const operational = center.operational;
      const readySteps = operational?.nextReadySteps.map((descriptor) => {
        const step = transaction?.steps.find((item) => item.stepId === descriptor.stepId);
        return Object.freeze({stepId: descriptor.stepId, capability: descriptor.capability, mode: descriptor.mode, risk: descriptor.risk, authorization: step?.authorization ?? "human_required" as const});
      }) ?? [];
      return Object.freeze({
        status,
        strategyFingerprint: input.strategy.strategyFingerprint,
        transactionFingerprint: transaction?.transactionFingerprint,
        checkpointFingerprint: center.globalCheckpointFingerprint ?? reviewCase.globalResolution?.checkpointFingerprint ?? initialCheckpointFingerprint,
        transactionState: operational?.state ?? center.state,
        readySteps: Object.freeze(readySteps),
        pendingMandatoryStepIds: Object.freeze(center.steps.filter((step) => !terminalSteps.has(step.state)).map((step) => step.stepId).sort()),
        authorizationRequired: Object.freeze([...(operational?.authorizationRequired ?? [])]),
        reconciliationRequired: Object.freeze([...(operational?.reconciliationRequired ?? [])]),
        compensationRequired: Object.freeze([...(operational?.compensationRequired ?? [])]),
        blockerCodes: Object.freeze([...center.reasons].sort()),
      });
    },
    async run(input): Promise<AutonomousLoopAu7Execution> {
      const reviewCase = getReviewCase(input.caseId);
      if (!reviewCase?.globalResolution) return blockedExecution({transactionFingerprint: input.transactionFingerprint, reasonCodes: ["global_checkpoint_absent"]});
      const center = recoverReviewCenterTransaction(reviewCase, dependencies);
      if (center.globalCheckpointFingerprint !== input.checkpointFingerprint) return blockedExecution({transactionFingerprint: input.transactionFingerprint, transactionState: center.state, reasonCodes: ["checkpoint_conflict"]});
      if (center.transaction?.transactionFingerprint !== input.transactionFingerprint) return blockedExecution({transactionFingerprint: input.transactionFingerprint, transactionState: center.state, reasonCodes: ["transaction_stale"]});
      const executed = await runReviewCenterTransaction({reviewCase, mode: input.mode, stepId: input.stepId, stepIds: input.stepIds, maxSteps: input.maxSteps, dependencies, signal: input.signal});
      return "reasons" in executed ? blockedExecution({transactionFingerprint: input.transactionFingerprint, transactionState: center.state, reasonCodes: executed.reasons}) : projectExecution(executed);
    },
  });
}

export const autonomousLoopAu7HandoffSecurity = Object.freeze({directExecutorCalls: false, delegatesToOperationalCenter: true, automaticAuthorization: false, automaticReconciliation: false, automaticCompensation: false, editorialWritesOutsideAu7: false});
