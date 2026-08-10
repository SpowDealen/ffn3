import {generateTransversalPlanForReviewCase} from "../../globalResolution/transversalInteractive";
import type {AutonomousSupervisedLoopCheckpoint} from "../../globalResolution/checkpoint";
import {recoverReviewCenterTransaction} from "../../transactions";
import type {ReviewCase, ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint} from "../../universal";
import {evaluateAutonomousEditorialResolutionStrategy} from "../strategy";

export type AutonomousCenterVisibleState = "not_initialized" | "evaluating" | "investigating" | "planning" | "preparing_transaction" | "executing_supervised" | "observing" | "paused" | "authorization_required" | "reconciliation_required" | "compensation_required" | "human_review" | "blocked" | "completed" | "stale";
export type AutonomousCenterActionRequired = "none" | "continue" | "investigate" | "authorize" | "reconcile" | "compensate" | "human_review" | "regenerate";

export type AutonomousCenterHistoryEntry = Readonly<{
  iteration: number;
  decisionKind: string;
  sufficiencyStatus: string;
  autonomyLevel: string;
  strategyFingerprint: string;
  transactionFingerprint?: string;
  result: string;
  stopReason?: string;
  occurredAt?: string;
}>;

export type AutonomousReviewCenterModel = Readonly<{
  version: "1.0.0";
  caseId: string;
  state: AutonomousCenterVisibleState;
  actionRequired: AutonomousCenterActionRequired;
  staleReasons: readonly string[];
  evidence: readonly Readonly<{id: string; source: string; summary: string; fingerprint: string}>[];
  decision?: Readonly<{kind: string; explanation: string; risk: string; reasonCodes: readonly string[]; fingerprint: string}>;
  sufficiency?: Readonly<{status: string; canDecideNow: boolean; explanation: string; fingerprint: string}>;
  autonomy?: Readonly<{level: string; risk: string; reasons: readonly string[]; fingerprint: string}>;
  strategy?: Readonly<{status: string; fingerprint: string; steps: readonly Readonly<{id: string; kind: string; objective: string; dependencyIds: readonly string[]; risk: string; autonomy: string}>[]}>;
  transaction: Readonly<{state: string; completed: number; total: number; fingerprint?: string; ready: number; reconciliation: number; compensation: number; authorization: number}>;
  history: readonly AutonomousCenterHistoryEntry[];
  loop?: Readonly<{iteration: number; phase: string; stopReason?: string; fingerprint: string}>;
  contextFingerprint: string;
  noPayloads: true;
  noTokens: true;
  noRawErrors: true;
}>;

const fingerprint = (value: unknown): string => computeUniversalFingerprint(value as ReviewJsonValue);
const compact = <T>(items: readonly T[]): readonly T[] => Object.freeze([...items]);

/** Normalizes presentation history without retaining payloads. Useful for recovery and tests. */
export function compactAutonomousHistory(entries: readonly AutonomousCenterHistoryEntry[], cap = 25): readonly AutonomousCenterHistoryEntry[] {
  const bySemantic = new Map<string, AutonomousCenterHistoryEntry>();
  for (const entry of [...entries].sort((left, right) => left.iteration - right.iteration)) {
    const key = JSON.stringify({decisionKind: entry.decisionKind, sufficiencyStatus: entry.sufficiencyStatus, autonomyLevel: entry.autonomyLevel, strategyFingerprint: entry.strategyFingerprint, transactionFingerprint: entry.transactionFingerprint, result: entry.result, stopReason: entry.stopReason});
    bySemantic.set(key, entry);
  }
  return compact([...bySemantic.values()].sort((left, right) => left.iteration - right.iteration).slice(-Math.max(1, cap)));
}

function staleness(loop: AutonomousSupervisedLoopCheckpoint | undefined, current: {decision: string; sufficiency: string; autonomy: string; strategy: string; transaction?: string; context: string}): readonly string[] {
  if (!loop) return compact([]);
  const reasons = [
    loop.decisionFingerprint !== current.decision ? "decision_changed" : undefined,
    loop.sufficiencyFingerprint !== current.sufficiency ? "sufficiency_changed" : undefined,
    loop.autonomyFingerprint !== current.autonomy ? "autonomy_changed" : undefined,
    loop.strategyFingerprint !== current.strategy ? "strategy_changed" : undefined,
    loop.transactionFingerprint !== undefined && loop.transactionFingerprint !== current.transaction ? "transaction_changed" : undefined,
    loop.contextFingerprint !== undefined && loop.contextFingerprint !== current.context ? "case_or_manifest_changed" : undefined,
  ].filter((item): item is string => Boolean(item));
  return compact([...new Set(reasons)].sort());
}

function mapState(input: {loop?: AutonomousSupervisedLoopCheckpoint; stale: readonly string[]; decision?: string; strategy?: string}): AutonomousCenterVisibleState {
  if (input.stale.length) return "stale";
  if (!input.loop) return "not_initialized";
  if (input.loop.phase === "completed") return "completed";
  if (input.loop.stopReason === "authorization_required") return "authorization_required";
  if (input.loop.stopReason === "reconciliation_required") return "reconciliation_required";
  if (input.loop.stopReason === "compensation_required") return "compensation_required";
  if (input.loop.stopReason === "human_required") return "human_review";
  if (input.loop.phase === "paused" || input.loop.phase === "cancelled") return "paused";
  if (input.loop.phase === "blocked") return "blocked";
  if (input.decision === "investigate" || input.strategy === "investigation_required") return "investigating";
  return "evaluating";
}

function actionFor(state: AutonomousCenterVisibleState): AutonomousCenterActionRequired {
  if (state === "not_initialized" || state === "stale") return "regenerate";
  if (state === "authorization_required") return "authorize";
  if (state === "reconciliation_required") return "reconcile";
  if (state === "compensation_required") return "compensate";
  if (state === "human_review" || state === "blocked") return "human_review";
  if (state === "investigating") return "investigate";
  if (state === "completed") return "none";
  return "continue";
}

/** Pure B6 projection. It composes AU6/AU7/AU8 safe summaries and never executes or persists. */
export function buildAutonomousReviewCenterModel(reviewCase: ReviewCase, evaluatedAt = new Date().toISOString()): AutonomousReviewCenterModel {
  const transactionCenter = recoverReviewCenterTransaction(reviewCase);
  const generated = generateTransversalPlanForReviewCase(reviewCase, () => evaluatedAt).transversal;
  const facade = evaluateAutonomousEditorialResolutionStrategy({
    decisionInput: {case: {caseId: reviewCase.id, caseVersion: reviewCase.version, status: reviewCase.status, priority: reviewCase.priority}, evaluatedAt, resolution: generated, transaction: transactionCenter.operational},
    autonomy: {resolution: generated, transaction: transactionCenter.transaction, transactionView: transactionCenter.operational},
    strategy: {producerId: reviewCase.globalResolution?.producer ?? "review_center", originalOperation: reviewCase.globalResolution?.plan.originalOperation ?? "transversal_resolution", generatedAt: evaluatedAt, resolution: generated, transaction: transactionCenter.transaction, transactionView: transactionCenter.operational},
  });
  const loop = reviewCase.globalResolution?.autonomousLoop;
  const contextFingerprint = fingerprint({
    case: {id: reviewCase.id, version: reviewCase.version, updatedAt: reviewCase.updatedAt, status: reviewCase.status},
    evidence: facade.sufficiency.evaluationFingerprint,
    decision: facade.decision.decisionFingerprint,
    autonomy: facade.autonomy.policyFingerprint,
    strategy: facade.strategy.strategyFingerprint,
    transaction: transactionCenter.transaction?.transactionFingerprint,
    creationGuards: reviewCase.globalResolution?.identityGuards?.map((item) => "guardFingerprint" in item ? item.guardFingerprint : item.authorizationFingerprint) ?? [],
    producerManifest: reviewCase.globalResolution?.producerManifest?.manifestFingerprint,
    capabilities: reviewCase.globalResolution?.plan.capabilityRequirements.map((item) => `${item.id}:${item.support}`) ?? [],
    reconciliation: reviewCase.globalResolution?.history.filter((item) => item.kind.startsWith("reconciliation_")).map((item) => `${item.kind}:${item.status}`) ?? [],
  });
  const staleReasons = staleness(loop, {decision: facade.decision.decisionFingerprint, sufficiency: facade.sufficiency.evaluationFingerprint, autonomy: facade.autonomy.policyFingerprint, strategy: facade.strategy.strategyFingerprint, transaction: transactionCenter.transaction?.transactionFingerprint, context: contextFingerprint});
  const state = mapState({loop, stale: staleReasons, decision: facade.decision.decision, strategy: facade.strategy.status});
  const history = compactAutonomousHistory((loop?.history ?? []).map((entry) => Object.freeze({iteration: entry.iteration, decisionKind: entry.decisionKind ?? "not_recorded", sufficiencyStatus: entry.sufficiencyStatus ?? "not_recorded", autonomyLevel: entry.autonomyLevel ?? "not_recorded", strategyFingerprint: entry.strategyFingerprint, transactionFingerprint: entry.transactionFingerprint, result: entry.result ?? entry.phase, stopReason: entry.stopReason, occurredAt: entry.occurredAt})));
  const operational = transactionCenter.operational;
  return Object.freeze({
    version: "1.0.0", caseId: reviewCase.id, state, actionRequired: actionFor(state), staleReasons,
    evidence: compact(facade.decision.evidence.map((item) => Object.freeze({id: item.id, source: item.source, summary: item.summary, fingerprint: item.fingerprint}))),
    decision: Object.freeze({kind: facade.decision.decision, explanation: facade.decision.operatorExplanation, risk: facade.decision.risk, reasonCodes: compact([...facade.decision.foundations.map((item) => item.code), ...facade.decision.blockingReasons.map((item) => item.code)]), fingerprint: facade.decision.decisionFingerprint}),
    sufficiency: Object.freeze({status: facade.sufficiency.classification, canDecideNow: facade.sufficiency.canDecideNow, explanation: facade.decision.operatorExplanation, fingerprint: facade.sufficiency.evaluationFingerprint}),
    autonomy: Object.freeze({level: facade.autonomy.level, risk: facade.autonomy.risk.aggregate, reasons: compact([...facade.autonomy.reasons.map((item) => item.code), ...facade.autonomy.blockers.map((item) => item.code)]), fingerprint: facade.autonomy.policyFingerprint}),
    strategy: Object.freeze({status: facade.strategy.status, fingerprint: facade.strategy.strategyFingerprint, steps: compact(facade.strategy.steps.map((step) => Object.freeze({id: step.id, kind: step.kind, objective: step.objective, dependencyIds: compact(step.dependencyIds), risk: step.risk, autonomy: step.autonomy}))) }),
    transaction: Object.freeze({state: transactionCenter.state, completed: operational?.progress.completed ?? 0, total: operational?.progress.total ?? transactionCenter.steps.length, fingerprint: transactionCenter.transaction?.transactionFingerprint, ready: operational?.nextReadySteps.length ?? 0, reconciliation: operational?.reconciliationRequired.length ?? 0, compensation: operational?.compensationRequired.length ?? 0, authorization: operational?.authorizationRequired.length ?? 0}),
    history, loop: loop ? Object.freeze({iteration: loop.iteration, phase: loop.phase, stopReason: loop.stopReason, fingerprint: loop.loopFingerprint}) : undefined,
    contextFingerprint, noPayloads: true, noTokens: true, noRawErrors: true,
  });
}

export function buildAutonomousDecisionSummary(model: AutonomousReviewCenterModel): string { return model.decision ? `${model.decision.kind} · riesgo ${model.decision.risk}. ${model.decision.explanation}` : "Aún no hay una decisión recuperable."; }
export function buildEvidenceSummary(model: AutonomousReviewCenterModel): string { return model.sufficiency ? `Evidencia ${model.sufficiency.status}. ${model.sufficiency.explanation}` : "Sin evaluación de evidencia."; }
export function buildAutonomySummary(model: AutonomousReviewCenterModel): string { return model.autonomy ? `Autonomía ${model.autonomy.level}; riesgo ${model.autonomy.risk}.` : "Sin política de autonomía."; }
export function buildStrategySummary(model: AutonomousReviewCenterModel): string { return model.strategy ? `Estrategia ${model.strategy.status}; ${model.strategy.steps.length} pasos ordenados.` : "Sin estrategia recuperable."; }
export function buildLoopSummary(model: AutonomousReviewCenterModel): string { return model.loop ? `Iteración ${model.loop.iteration}; ${model.loop.phase}${model.loop.stopReason ? ` · ${model.loop.stopReason}` : ""}.` : "No iniciado. Abrir el caso no ejecuta nada."; }
