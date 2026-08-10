import type {AutonomousSupervisedLoopCheckpoint, AutonomousSupervisedLoopPhase, AutonomousSupervisedLoopStopReason} from "../../globalResolution/checkpoint";
import type {TransactionOrchestrationMode} from "../../transactions";
import type {ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint} from "../../universal";
import {evaluateAutonomousEditorialResolutionStrategy} from "../strategy";
import {autonomousSupervisedLoopFingerprint, buildAutonomousSupervisedLoopCheckpoint, recoverAutonomousSupervisedLoop} from "./checkpoint";
import {
  AUTONOMOUS_SUPERVISED_LOOP_VERSION,
  type AutonomousInvestigationIntent,
  type AutonomousLoopIterationSummary,
  type AutonomousLoopObservation,
  type AutonomousLoopTransactionHandoff,
  type AutonomousSupervisedLoopResult,
  type RunAutonomousSupervisedLoopInput,
} from "./types";

const activeLoops = new Map<string, Promise<AutonomousSupervisedLoopResult>>();
const fingerprint = (value: unknown): string => computeUniversalFingerprint(value as ReviewJsonValue);
const sorted = (values: readonly string[]): string[] => [...new Set(values.filter(Boolean))].sort();

function result(input: {
  loopFingerprint: string;
  phase: AutonomousSupervisedLoopPhase;
  stopReason?: AutonomousSupervisedLoopStopReason;
  iteration: number;
  checkpoint?: AutonomousSupervisedLoopCheckpoint;
  governance?: AutonomousSupervisedLoopResult["governance"];
  iterations?: readonly AutonomousLoopIterationSummary[];
  joinedExistingRun?: boolean;
} & Pick<RunAutonomousSupervisedLoopInput, "caseId">): AutonomousSupervisedLoopResult {
  return Object.freeze({
    schemaVersion: AUTONOMOUS_SUPERVISED_LOOP_VERSION,
    loopId: `autonomous-loop:${input.caseId}:${input.loopFingerprint.slice(-16)}`,
    loopFingerprint: input.loopFingerprint,
    phase: input.phase,
    stopReason: input.stopReason,
    iteration: input.iteration,
    checkpoint: input.checkpoint,
    governance: input.governance,
    iterations: Object.freeze([...(input.iterations ?? [])]),
    joinedExistingRun: input.joinedExistingRun ?? false,
    explicitContinuationRequired: input.phase !== "completed" && input.phase !== "cancelled",
    autoResumed: false,
    directExecutorCalls: false,
    automaticReconciliation: false,
    automaticCompensation: false,
    persistedAuthorization: false,
    editorialWritesOutsideAu7: false,
    checkpointWritesViaAu3: true,
  });
}

function governanceStop(governance: NonNullable<AutonomousSupervisedLoopResult["governance"]>): AutonomousSupervisedLoopStopReason | undefined {
  const {decision, sufficiency, autonomy, strategy} = governance;
  if (sufficiency.classification === "contradictory") return "contradictory_evidence";
  if (sufficiency.classification === "stale" || autonomy.stale) return "stale_evidence";
  if (["insufficient", "unavailable", "partial"].includes(sufficiency.classification) || !sufficiency.canDecideNow) return "insufficient_evidence";
  if (decision.decision === "request_reconciliation" || strategy.status === "reconciliation_required") return "reconciliation_required";
  if (decision.decision === "request_compensation") return "compensation_required";
  if (decision.decision === "request_authorization" || autonomy.level === "authorization_required" || strategy.status === "authorization_required") return "authorization_required";
  if (autonomy.risk.aggregate === "destructive") return "destructive_risk";
  if (autonomy.risk.aggregate === "high") return "high_risk";
  if (autonomy.level === "human_required" || decision.decision === "escalate_to_human" || strategy.status === "human_required") return "human_required";
  if (autonomy.blockers.some((item) => item.code === "unsupported_capability" || item.code === "unknown_capability")) return "unsupported_capability";
  if (autonomy.level === "blocked" || decision.decision === "block" || strategy.status === "blocked") return "transaction_blocked";
  return undefined;
}

function investigationIntent(governance: NonNullable<AutonomousSupervisedLoopResult["governance"]>): AutonomousInvestigationIntent | undefined {
  if (governance.decision.decision === "escalate_to_human") return "request_human";
  if (governance.decision.decision === "wait_for_evidence") return "wait_for_evidence";
  if (governance.strategy.status !== "investigation_required" && governance.decision.decision !== "investigate") return undefined;
  const supported = new Set<AutonomousInvestigationIntent>(["inspect_sanity", "inspect_source", "search_candidates", "compare_entities"]);
  for (const step of governance.strategy.steps) if (supported.has(step.kind as AutonomousInvestigationIntent)) return step.kind as AutonomousInvestigationIntent;
  return undefined;
}

function handoffStop(handoff: AutonomousLoopTransactionHandoff): AutonomousSupervisedLoopStopReason | undefined {
  if (handoff.status === "stale") return "transaction_stale";
  if (handoff.status === "reconciliation_required" || handoff.reconciliationRequired.length) return "reconciliation_required";
  if (handoff.status === "compensation_required" || handoff.compensationRequired.length) return "compensation_required";
  if (handoff.authorizationRequired.length) return "authorization_required";
  if (handoff.blockerCodes.some((code) => code.includes("checkpoint") && code.includes("conflict"))) return "checkpoint_conflict";
  if (handoff.status === "blocked" || handoff.blockerCodes.length) return "transaction_blocked";
  return undefined;
}

function stateFingerprint(input: {observation: AutonomousLoopObservation; governance: NonNullable<AutonomousSupervisedLoopResult["governance"]>; handoff?: AutonomousLoopTransactionHandoff}): {state: string; blockers: string; blockerCodes: string[]} {
  const blockerCodes = sorted([
    ...input.observation.blockerCodes,
    ...input.governance.decision.blockingReasons.map((item) => item.code),
    ...input.governance.autonomy.blockers.map((item) => item.code),
    ...input.governance.strategy.blockers,
    ...(input.handoff?.blockerCodes ?? []),
    ...(input.handoff?.authorizationRequired.map((id) => `authorization_required:${id}`) ?? []),
    ...(input.handoff?.reconciliationRequired.map((id) => `reconciliation_required:${id}`) ?? []),
    ...(input.handoff?.compensationRequired.map((id) => `compensation_required:${id}`) ?? []),
  ]);
  const blockers = fingerprint(blockerCodes);
  const state = fingerprint({
    evidenceFingerprint: input.observation.evidenceFingerprint,
    decision: input.governance.decision.decision,
    decisionFingerprint: input.governance.decision.decisionFingerprint,
    sufficiency: input.governance.sufficiency.classification,
    sufficiencyFingerprint: input.governance.sufficiency.evaluationFingerprint,
    autonomy: input.governance.autonomy.level,
    autonomyFingerprint: input.governance.autonomy.policyFingerprint,
    strategyFingerprint: input.governance.strategy.strategyFingerprint,
    transactionFingerprint: input.handoff?.transactionFingerprint,
    transactionState: input.handoff?.transactionState,
    transactionStatus: input.handoff?.status,
    pendingMandatoryStepIds: input.handoff?.pendingMandatoryStepIds,
    blockersFingerprint: blockers,
  });
  return {state, blockers, blockerCodes};
}

function executionStop(execution: Awaited<ReturnType<RunAutonomousSupervisedLoopInput["runtime"]["transactionHandoff"]["run"]>>): AutonomousSupervisedLoopStopReason | undefined {
  if (execution.stopReason === "reconciliation_required" || execution.reconciliationRequired.length) return "reconciliation_required";
  if (execution.stopReason === "compensation_required" || execution.compensationRequired.length) return "compensation_required";
  if (execution.stopReason === "authorization_required" || execution.authorizationRequired.length) return "authorization_required";
  if (execution.stopReason === "transaction_stale") return "transaction_stale";
  if (execution.stopReason === "checkpoint_conflict") return "checkpoint_conflict";
  if (execution.stopReason === "high_risk_requires_operator") return "high_risk";
  if (execution.stopReason === "destructive_risk_requires_operator") return "destructive_risk";
  if (execution.stopReason === "cancelled") return "cancellation";
  if (execution.stopReason === "unexpected_result" || execution.blockerCodes.some((code) => code.includes("postcondition"))) return "unexpected_postcondition";
  if (execution.status === "blocked") return "transaction_blocked";
  return undefined;
}

async function runOnce(input: RunAutonomousSupervisedLoopInput, loopFingerprint: string): Promise<AutonomousSupervisedLoopResult> {
  if (!input.caseId.trim() || !Number.isInteger(input.maxIterations) || input.maxIterations < 1 || input.maxIterations > 100) throw new Error("autonomous_loop_input_invalid");
  const initialSnapshot = await input.runtime.checkpointApplication.load(input.caseId);
  const recovered = recoverAutonomousSupervisedLoop({checkpoint: initialSnapshot?.loop});
  const existing = initialSnapshot?.loop;
  if (existing && existing.loopFingerprint !== loopFingerprint) return result({caseId: input.caseId, loopFingerprint, phase: "blocked", stopReason: "checkpoint_conflict", iteration: existing.iteration, checkpoint: existing});
  if (existing && input.intent === "start" && existing.phase !== "completed" && existing.phase !== "cancelled") return result({caseId: input.caseId, loopFingerprint, phase: "paused", stopReason: "explicit_continuation_required", iteration: existing.iteration, checkpoint: existing});
  if (input.intent === "continue" && recovered.status === "absent") return result({caseId: input.caseId, loopFingerprint, phase: "blocked", stopReason: "checkpoint_conflict", iteration: 0});
  if (recovered.status === "invalid") return result({caseId: input.caseId, loopFingerprint, phase: "blocked", stopReason: "checkpoint_conflict", iteration: existing?.iteration ?? 0, checkpoint: existing});
  if (recovered.status === "terminal" && existing) return result({caseId: input.caseId, loopFingerprint, phase: existing.phase, stopReason: existing.stopReason, iteration: existing.iteration, checkpoint: existing});

  let previous = existing;
  let carriedObservation: AutonomousLoopObservation | undefined;
  let lastGovernance: AutonomousSupervisedLoopResult["governance"];
  const summaries: AutonomousLoopIterationSummary[] = [];
  let executedThisRun = 0;

  async function persistIteration(args: {
    observation: AutonomousLoopObservation;
    governance: NonNullable<AutonomousSupervisedLoopResult["governance"]>;
    handoff?: AutonomousLoopTransactionHandoff;
    phase: AutonomousSupervisedLoopPhase;
    stopReason?: AutonomousSupervisedLoopStopReason;
    action: AutonomousLoopIterationSummary["action"];
    investigationIntent?: AutonomousInvestigationIntent;
    transactionMode?: TransactionOrchestrationMode;
    effectConfirmed?: boolean;
    state: string;
    blockers: string;
  }): Promise<AutonomousSupervisedLoopResult | undefined> {
    const iteration = (previous?.iteration ?? 0) + 1;
    const checkpoint = buildAutonomousSupervisedLoopCheckpoint({
      caseId: input.caseId,
      loopFingerprint,
      iteration,
      phase: args.phase,
      decisionFingerprint: args.governance.decision.decisionFingerprint,
      sufficiencyFingerprint: args.governance.sufficiency.evaluationFingerprint,
      autonomyFingerprint: args.governance.autonomy.policyFingerprint,
      strategyFingerprint: args.governance.strategy.strategyFingerprint,
      transactionFingerprint: args.handoff?.transactionFingerprint,
      stopReason: args.stopReason,
      stateFingerprint: args.state,
      blockersFingerprint: args.blockers,
      decisionKind: args.governance.decision.decision,
      sufficiencyStatus: args.governance.sufficiency.classification,
      autonomyLevel: args.governance.autonomy.level,
      result: args.action,
      previous,
    });
    const persisted = await input.runtime.checkpointApplication.persist({caseId: input.caseId, checkpoint, expectedGlobalCheckpointFingerprint: args.observation.checkpointFingerprint});
    if (!persisted.persisted) return result({caseId: input.caseId, loopFingerprint, phase: "blocked", stopReason: persisted.conflict ? "persistence_conflict" : "checkpoint_conflict", iteration: previous?.iteration ?? 0, checkpoint: previous, governance: args.governance, iterations: summaries});
    previous = checkpoint;
    if (carriedObservation && persisted.checkpointFingerprint) carriedObservation = Object.freeze({...carriedObservation, checkpointFingerprint: persisted.checkpointFingerprint});
    summaries.push(Object.freeze({iteration, phase: args.phase, action: args.action, investigationIntent: args.investigationIntent, transactionMode: args.transactionMode, stopReason: args.stopReason, effectConfirmed: args.effectConfirmed ?? false, stateFingerprint: args.state}));
    if (args.phase !== "running") return result({caseId: input.caseId, loopFingerprint, phase: args.phase, stopReason: args.stopReason, iteration, checkpoint, governance: args.governance, iterations: summaries});
    return undefined;
  }

  while (executedThisRun < input.maxIterations) {
    if (input.signal?.aborted) {
      if (!lastGovernance || !previous) return result({caseId: input.caseId, loopFingerprint, phase: "cancelled", stopReason: "cancellation", iteration: previous?.iteration ?? 0, checkpoint: previous, governance: lastGovernance, iterations: summaries});
    }
    const observation = carriedObservation ?? await input.runtime.observe({caseId: input.caseId, signal: input.signal});
    carriedObservation = undefined;
    const governance = evaluateAutonomousEditorialResolutionStrategy(observation.facadeInput);
    lastGovernance = governance;
    executedThisRun += 1;

    let handoff: AutonomousLoopTransactionHandoff | undefined;
    const gate = input.signal?.aborted ? "cancellation" : governanceStop(governance);
    const intent = investigationIntent(governance);
    if (!gate && !intent) handoff = await input.runtime.transactionHandoff.prepareOrReuse({caseId: input.caseId, strategy: governance.strategy, signal: input.signal});
    const semantic = stateFingerprint({observation, governance, handoff});
    if (gate) {
      const phase: AutonomousSupervisedLoopPhase = gate === "cancellation" ? "cancelled" : ["authorization_required", "reconciliation_required", "compensation_required", "iteration_budget_reached"].includes(gate) ? "paused" : "blocked";
      const stopped = await persistIteration({observation, governance, phase, stopReason: gate, action: "none", state: semantic.state, blockers: semantic.blockers});
      return stopped!;
    }
    const previousState = previous?.history.at(-1)?.stateFingerprint;
    const sameState = previousState === semantic.state;
    if (sameState) {
      const stopped = await persistIteration({observation: {...observation, checkpointFingerprint: handoff?.checkpointFingerprint ?? observation.checkpointFingerprint}, governance, handoff, phase: "paused", stopReason: "no_progress", action: "none", state: semantic.state, blockers: semantic.blockers});
      return stopped!;
    }

    if (intent) {
      if (governance.autonomy.level !== "autonomous_safe") {
        const stopped = await persistIteration({observation, governance, phase: "blocked", stopReason: "transaction_blocked", action: "none", state: semantic.state, blockers: semantic.blockers});
        return stopped!;
      }
      const adapter = input.runtime.investigationAdapters.get(intent);
      if (!adapter || !adapter.readOnly || adapter.autonomy !== "autonomous_safe") {
        const stopped = await persistIteration({observation, governance, phase: "blocked", stopReason: "unsupported_capability", action: "none", investigationIntent: intent, state: semantic.state, blockers: semantic.blockers});
        return stopped!;
      }
      const investigated = await adapter.run({caseId: input.caseId, evidenceFingerprint: observation.evidenceFingerprint, signal: input.signal});
      if (investigated.status === "cancelled") {
        const stopped = await persistIteration({observation, governance, phase: "cancelled", stopReason: "cancellation", action: "investigation", investigationIntent: intent, state: semantic.state, blockers: semantic.blockers});
        return stopped!;
      }
      if (investigated.status === "blocked") {
        const stopped = await persistIteration({observation, governance, phase: "blocked", stopReason: "unsupported_capability", action: "investigation", investigationIntent: intent, state: semantic.state, blockers: fingerprint(sorted([...semantic.blockerCodes, ...investigated.reasonCodes]))});
        return stopped!;
      }
      carriedObservation = await input.runtime.observe({caseId: input.caseId, signal: input.signal});
      const budgetReached = executedThisRun >= input.maxIterations;
      const stopped = await persistIteration({observation: carriedObservation, governance, phase: budgetReached ? "paused" : "running", stopReason: budgetReached ? "iteration_budget_reached" : undefined, action: "investigation", investigationIntent: intent, state: semantic.state, blockers: semantic.blockers});
      if (stopped) return stopped;
      continue;
    }

    if (!handoff) throw new Error("autonomous_loop_handoff_missing");
    const handoffGate = handoff.strategyFingerprint !== governance.strategy.strategyFingerprint ? "strategy_stale" : handoffStop(handoff);
    const completionSafe = (handoff.status === "completed" || handoff.status === "unnecessary") && handoff.pendingMandatoryStepIds.length === 0 && handoff.authorizationRequired.length === 0 && handoff.reconciliationRequired.length === 0 && handoff.compensationRequired.length === 0 && handoff.blockerCodes.length === 0;
    if (completionSafe) {
      const completed = await persistIteration({observation: {...observation, checkpointFingerprint: handoff.checkpointFingerprint}, governance, handoff, phase: "completed", stopReason: "completed", action: "none", state: semantic.state, blockers: semantic.blockers});
      return completed!;
    }
    if (handoffGate) {
      const phase: AutonomousSupervisedLoopPhase = ["authorization_required", "reconciliation_required", "compensation_required"].includes(handoffGate) ? "paused" : "blocked";
      const stopped = await persistIteration({observation: {...observation, checkpointFingerprint: handoff.checkpointFingerprint}, governance, handoff, phase, stopReason: handoffGate, action: "none", state: semantic.state, blockers: semantic.blockers});
      return stopped!;
    }

    const safeReady = handoff.readySteps.filter((step) => step.authorization === "none" && step.risk !== "high" && step.risk !== "destructive").sort((left, right) => left.stepId.localeCompare(right.stepId));
    if (!handoff.transactionFingerprint || !safeReady.length) {
      const stopped = await persistIteration({observation: {...observation, checkpointFingerprint: handoff.checkpointFingerprint}, governance, handoff, phase: "blocked", stopReason: "transaction_blocked", action: "none", state: semantic.state, blockers: semantic.blockers});
      return stopped!;
    }
    const first = safeReady[0];
    let mode: TransactionOrchestrationMode = "single_step";
    let stepId: string | undefined = first.stepId;
    let stepIds: readonly string[] | undefined;
    let action: AutonomousLoopIterationSummary["action"] = "au7_single_step";
    if (governance.autonomy.level === "autonomous_supervised") {
      const batchable = safeReady.filter((step) => step.mode !== "external_effect");
      if (batchable.length > 1) { mode = "safe_batch"; stepId = undefined; stepIds = batchable.map((step) => step.stepId); action = "au7_safe_batch"; }
      else { mode = "supervised_run"; stepId = undefined; action = "au7_supervised_run"; }
    }
    const executed = await input.runtime.transactionHandoff.run({caseId: input.caseId, strategyFingerprint: governance.strategy.strategyFingerprint, transactionFingerprint: handoff.transactionFingerprint, checkpointFingerprint: handoff.checkpointFingerprint, mode, stepId, stepIds, maxSteps: mode === "safe_batch" ? stepIds?.length ?? 1 : 1, signal: input.signal});
    carriedObservation = await input.runtime.observe({caseId: input.caseId, signal: input.signal});
    const executionGate = executionStop(executed);
    const selectedModes = new Map(safeReady.map((step) => [step.stepId, step.mode]));
    const effectConfirmed = executed.executions.some((item) => item.executorInvoked && ["succeeded", "reused_existing", "already_completed"].includes(item.status) && selectedModes.get(item.stepId) === "external_effect");
    const budgetReached = !executionGate && executedThisRun >= input.maxIterations;
    const stopReason = executionGate ?? (budgetReached ? "iteration_budget_reached" : undefined);
    const phase: AutonomousSupervisedLoopPhase = stopReason === "cancellation" ? "cancelled" : stopReason ? ["authorization_required", "reconciliation_required", "compensation_required", "iteration_budget_reached"].includes(stopReason) ? "paused" : "blocked" : "running";
    const stopped = await persistIteration({observation: carriedObservation, governance, handoff: {...handoff, transactionFingerprint: executed.transactionFingerprint, transactionState: executed.transactionState, checkpointFingerprint: carriedObservation.checkpointFingerprint}, phase, stopReason, action, transactionMode: mode, effectConfirmed, state: semantic.state, blockers: fingerprint(sorted([...semantic.blockerCodes, ...executed.blockerCodes]))});
    if (stopped) return stopped;
  }
  throw new Error("autonomous_loop_iteration_control_unreachable");
}

/** Explicitly invoked supervised loop. Recovery alone never enters this function. */
export function runAutonomousSupervisedLoop(input: RunAutonomousSupervisedLoopInput): Promise<AutonomousSupervisedLoopResult> {
  const loopFingerprint = autonomousSupervisedLoopFingerprint({caseId: input.caseId, maxIterations: input.maxIterations});
  const key = `${input.caseId}:${loopFingerprint}`;
  const active = activeLoops.get(key);
  if (active) return active.then((value) => Object.freeze({...value, joinedExistingRun: true}));
  const running = runOnce(input, loopFingerprint).finally(() => activeLoops.delete(key));
  activeLoops.set(key, running);
  return running;
}

export function activeAutonomousSupervisedLoopCount(): number { return activeLoops.size; }
