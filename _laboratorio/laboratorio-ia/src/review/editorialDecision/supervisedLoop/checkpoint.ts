import {fingerprintGlobalResolutionCheckpoint, validateGlobalResolutionCheckpoint, type AutonomousSupervisedLoopCheckpoint, type AutonomousSupervisedLoopHistoryEntry, type AutonomousSupervisedLoopPhase, type AutonomousSupervisedLoopStopReason, type GlobalResolutionCheckpoint} from "../../globalResolution/checkpoint";
import {getReviewCase, updateGlobalResolutionCheckpoint} from "../../store/reviewStore";
import type {ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint} from "../../universal";
import type {AutonomousLoopCheckpointApplication, AutonomousLoopRecoveryResult} from "./types";

const fingerprint = (value: unknown): string => computeUniversalFingerprint(value as ReviewJsonValue);
const fingerprintPattern = /^sha256-v1:[a-z0-9]+$/i;
const phases = new Set<AutonomousSupervisedLoopPhase>(["running", "paused", "blocked", "completed", "cancelled"]);
const stopReasons = new Set<AutonomousSupervisedLoopStopReason>([
  "insufficient_evidence", "contradictory_evidence", "stale_evidence", "authorization_required", "human_required",
  "reconciliation_required", "compensation_required", "high_risk", "destructive_risk", "unsupported_capability",
  "checkpoint_conflict", "transaction_stale", "strategy_stale", "unexpected_postcondition", "iteration_budget_reached",
  "no_progress", "cancellation", "persistence_conflict", "transaction_blocked", "explicit_continuation_required", "completed",
]);
const fp = (value: unknown): value is string => typeof value === "string" && fingerprintPattern.test(value);
const historyKey = (entry: AutonomousSupervisedLoopHistoryEntry): string => JSON.stringify({decisionKind: entry.decisionKind, sufficiencyStatus: entry.sufficiencyStatus, autonomyLevel: entry.autonomyLevel, phase: entry.phase, result: entry.result, stateFingerprint: entry.stateFingerprint, blockersFingerprint: entry.blockersFingerprint, decisionFingerprint: entry.decisionFingerprint, sufficiencyFingerprint: entry.sufficiencyFingerprint, autonomyFingerprint: entry.autonomyFingerprint, strategyFingerprint: entry.strategyFingerprint, transactionFingerprint: entry.transactionFingerprint, stopReason: entry.stopReason});

export function validateAutonomousSupervisedLoopCheckpoint(value: unknown): Readonly<{valid: boolean; reasons: readonly string[]} > {
  const reasons: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return {valid: false, reasons: ["autonomous_loop_checkpoint_invalid"]};
  const loop = value as Partial<AutonomousSupervisedLoopCheckpoint>;
  if (loop.schemaVersion !== 1 || typeof loop.loopId !== "string" || !loop.loopId.trim() || !fp(loop.loopFingerprint) || !Number.isInteger(loop.iteration) || Number(loop.iteration) < 1 || !phases.has(loop.phase as AutonomousSupervisedLoopPhase)
    || !fp(loop.decisionFingerprint) || !fp(loop.sufficiencyFingerprint) || !fp(loop.autonomyFingerprint) || !fp(loop.strategyFingerprint)
    || loop.transactionFingerprint !== undefined && !fp(loop.transactionFingerprint) || loop.contextFingerprint !== undefined && !fp(loop.contextFingerprint) || loop.stopReason !== undefined && !stopReasons.has(loop.stopReason) || !Array.isArray(loop.history)) reasons.push("autonomous_loop_checkpoint_shape_invalid");
  if (Array.isArray(loop.history)) {
    const history = loop.history as AutonomousSupervisedLoopHistoryEntry[];
    const chronological = history.every((entry, index) => Number.isInteger(entry.iteration) && entry.iteration >= 1 && (index === 0 || history[index - 1].iteration < entry.iteration));
    const entriesValid = history.every((entry) => phases.has(entry.phase) && fp(entry.stateFingerprint) && fp(entry.blockersFingerprint) && fp(entry.decisionFingerprint) && fp(entry.sufficiencyFingerprint) && fp(entry.autonomyFingerprint) && fp(entry.strategyFingerprint)
      && (entry.transactionFingerprint === undefined || fp(entry.transactionFingerprint)) && (entry.stopReason === undefined || stopReasons.has(entry.stopReason))
      && (entry.decisionKind === undefined || typeof entry.decisionKind === "string") && (entry.sufficiencyStatus === undefined || typeof entry.sufficiencyStatus === "string")
      && (entry.autonomyLevel === undefined || typeof entry.autonomyLevel === "string") && (entry.result === undefined || typeof entry.result === "string")
      && (entry.occurredAt === undefined || !Number.isNaN(Date.parse(entry.occurredAt))));
    const last = history.at(-1);
    if (history.length < 1 || history.length > 25 || !chronological || !entriesValid || !last || last.iteration !== loop.iteration || last.phase !== loop.phase
      || last.decisionFingerprint !== loop.decisionFingerprint || last.sufficiencyFingerprint !== loop.sufficiencyFingerprint || last.autonomyFingerprint !== loop.autonomyFingerprint
      || last.strategyFingerprint !== loop.strategyFingerprint || last.transactionFingerprint !== loop.transactionFingerprint || last.stopReason !== loop.stopReason) reasons.push("autonomous_loop_checkpoint_history_invalid");
  }
  if (loop.phase === "running" && loop.stopReason !== undefined || loop.phase !== "running" && loop.stopReason === undefined || loop.phase === "completed" && loop.stopReason !== "completed" || loop.phase === "cancelled" && loop.stopReason !== "cancellation") reasons.push("autonomous_loop_checkpoint_phase_invalid");
  return Object.freeze({valid: reasons.length === 0, reasons: Object.freeze([...new Set(reasons)].sort())});
}

export function buildAutonomousSupervisedLoopCheckpoint(input: {
  caseId: string;
  loopFingerprint: string;
  iteration: number;
  phase: AutonomousSupervisedLoopPhase;
  decisionFingerprint: string;
  sufficiencyFingerprint: string;
  autonomyFingerprint: string;
  strategyFingerprint: string;
  transactionFingerprint?: string;
  contextFingerprint?: string;
  stopReason?: AutonomousSupervisedLoopStopReason;
  stateFingerprint: string;
  blockersFingerprint: string;
  decisionKind?: string;
  sufficiencyStatus?: string;
  autonomyLevel?: string;
  result?: string;
  occurredAt?: string;
  previous?: AutonomousSupervisedLoopCheckpoint;
}): AutonomousSupervisedLoopCheckpoint {
  const loopId = `autonomous-loop:${input.caseId}:${input.loopFingerprint.slice(-16)}`;
  if (input.previous && (input.previous.loopId !== loopId || input.previous.loopFingerprint !== input.loopFingerprint || input.iteration <= input.previous.iteration)) throw new Error("autonomous_loop_checkpoint_iteration_conflict");
  const entry: AutonomousSupervisedLoopHistoryEntry = {
    iteration: input.iteration,
    decisionKind: input.decisionKind,
    sufficiencyStatus: input.sufficiencyStatus,
    autonomyLevel: input.autonomyLevel,
    phase: input.phase,
    result: input.result ?? input.phase,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    stateFingerprint: input.stateFingerprint,
    blockersFingerprint: input.blockersFingerprint,
    decisionFingerprint: input.decisionFingerprint,
    sufficiencyFingerprint: input.sufficiencyFingerprint,
    autonomyFingerprint: input.autonomyFingerprint,
    strategyFingerprint: input.strategyFingerprint,
    transactionFingerprint: input.transactionFingerprint,
    stopReason: input.stopReason,
  };
  const prior = input.previous?.history ?? [];
  const history = prior.length && historyKey(prior.at(-1)!) === historyKey(entry) ? [...prior.slice(0, -1), entry] : [...prior, entry];
  const checkpoint: AutonomousSupervisedLoopCheckpoint = {
    schemaVersion: 1,
    loopId,
    loopFingerprint: input.loopFingerprint,
    iteration: input.iteration,
    phase: input.phase,
    decisionFingerprint: input.decisionFingerprint,
    sufficiencyFingerprint: input.sufficiencyFingerprint,
    autonomyFingerprint: input.autonomyFingerprint,
    strategyFingerprint: input.strategyFingerprint,
    transactionFingerprint: input.transactionFingerprint,
    contextFingerprint: input.contextFingerprint ?? input.previous?.contextFingerprint,
    stopReason: input.stopReason,
    history: history.slice(-25),
  };
  const validation = validateAutonomousSupervisedLoopCheckpoint(checkpoint);
  if (!validation.valid) throw new Error(`autonomous_loop_checkpoint_invalid:${validation.reasons.join(",")}`);
  return structuredClone(checkpoint);
}

export function attachAutonomousSupervisedLoopCheckpoint(input: {checkpoint: GlobalResolutionCheckpoint; loop: AutonomousSupervisedLoopCheckpoint; now: string}): GlobalResolutionCheckpoint {
  const loopValidation = validateAutonomousSupervisedLoopCheckpoint(input.loop);
  if (!loopValidation.valid || input.loop.loopId !== `autonomous-loop:${input.checkpoint.caseId}:${input.loop.loopFingerprint.slice(-16)}`) throw new Error("autonomous_loop_checkpoint_binding_invalid");
  const provisional = {...structuredClone(input.checkpoint), autonomousLoop: structuredClone(input.loop), updatedAt: input.now};
  const base = Object.fromEntries(Object.entries(provisional).filter(([key]) => !["id", "checkpointFingerprint", "createdAt", "updatedAt"].includes(key))) as Omit<GlobalResolutionCheckpoint, "id" | "checkpointFingerprint" | "createdAt" | "updatedAt">;
  const checkpointFingerprint = fingerprintGlobalResolutionCheckpoint(base);
  const next: GlobalResolutionCheckpoint = {...provisional, id: `global-resolution-checkpoint:${input.checkpoint.caseId}:${checkpointFingerprint.slice(-16)}`, checkpointFingerprint};
  const validation = validateGlobalResolutionCheckpoint(next);
  if (!validation.ok) throw new Error(`autonomous_loop_global_checkpoint_invalid:${validation.reasons.join(",")}`);
  return validation.value;
}

export function recoverAutonomousSupervisedLoop(input: {
  checkpoint?: AutonomousSupervisedLoopCheckpoint;
  current?: Partial<Pick<AutonomousSupervisedLoopCheckpoint, "decisionFingerprint" | "sufficiencyFingerprint" | "autonomyFingerprint" | "strategyFingerprint" | "transactionFingerprint">>;
}): AutonomousLoopRecoveryResult {
  if (!input.checkpoint) return Object.freeze({status: "absent", reasons: Object.freeze([]), canAutoResume: false, explicitContinuationRequired: false});
  const validation = validateAutonomousSupervisedLoopCheckpoint(input.checkpoint);
  if (!validation.valid) return Object.freeze({status: "invalid", checkpoint: input.checkpoint, reasons: validation.reasons, canAutoResume: false, explicitContinuationRequired: true});
  const stale = Object.entries(input.current ?? {}).filter(([, value]) => value !== undefined).filter(([key, value]) => input.checkpoint?.[key as keyof AutonomousSupervisedLoopCheckpoint] !== value).map(([key]) => `${key}_changed`).sort();
  const terminal = input.checkpoint.phase === "completed" || input.checkpoint.phase === "cancelled";
  return Object.freeze({status: stale.length ? "stale" : terminal ? "terminal" : "valid", checkpoint: structuredClone(input.checkpoint), reasons: Object.freeze(stale), canAutoResume: false, explicitContinuationRequired: !terminal});
}

/** Adapter over the existing AU3 ReviewCase checkpoint. It does not create another store. */
export function createReviewStoreAutonomousLoopCheckpointApplication(now: () => string = () => new Date().toISOString()): AutonomousLoopCheckpointApplication {
  return Object.freeze({
    load(caseId) {
      const reviewCase = getReviewCase(caseId);
      return reviewCase?.globalResolution ? {globalCheckpointFingerprint: reviewCase.globalResolution.checkpointFingerprint, loop: reviewCase.globalResolution.autonomousLoop ? structuredClone(reviewCase.globalResolution.autonomousLoop) : undefined} : undefined;
    },
    persist(input) {
      try {
        const reviewCase = getReviewCase(input.caseId);
        if (!reviewCase?.globalResolution) return {persisted: false, conflict: false, reasonCodes: ["global_checkpoint_absent"]};
        const updated = updateGlobalResolutionCheckpoint(reviewCase.id, reviewCase.version, (checkpoint) => checkpoint ? attachAutonomousSupervisedLoopCheckpoint({checkpoint, loop: input.checkpoint, now: now()}) : undefined, new Date(now()), input.expectedGlobalCheckpointFingerprint);
        return updated?.globalResolution?.autonomousLoop?.loopFingerprint === input.checkpoint.loopFingerprint
          ? {persisted: true, conflict: false, checkpointFingerprint: updated.globalResolution.checkpointFingerprint, reasonCodes: []}
          : {persisted: false, conflict: false, reasonCodes: ["autonomous_loop_checkpoint_not_saved"]};
      } catch (error) {
        const message = error instanceof Error ? error.message : "autonomous_loop_checkpoint_persist_failed";
        return {persisted: false, conflict: /cambi|conflict|mismatch|obsoleto/i.test(message), reasonCodes: [message]};
      }
    },
  });
}

export function autonomousSupervisedLoopFingerprint(input: {caseId: string; maxIterations: number}): string {
  return fingerprint({version: "1.0.0", caseId: input.caseId, supervision: "explicit"});
}
