import {buildAutonomousReviewCenterModel, type AutonomousReviewCenterModel} from "../editorialDecision";
import {recoverTransversalPlanView, type TransversalPlanView} from "../globalResolution";
import {buildKnowledgeCenterViewModel, readKnowledgeCenterSnapshot, type KnowledgeCenterViewModel} from "../knowledge";
import {recoverReviewCenterTransaction, type TransactionCenterView} from "../transactions";
import type {ReviewCase, ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {NUCLEUS_RESOLUTION_VERSION, type BuildNucleusResolutionInput, type NucleusAuthorityFacts, type NucleusCompletion, type NucleusPrimaryAction, type NucleusPrimaryActionKind, type NucleusResolutionState, type NucleusResolutionViewModel, type NucleusRisk, type NucleusTimelineEvent} from "./types";

const fp = (value: unknown): string => computeUniversalFingerprint(value as ReviewJsonValue);
const unique = <T extends string>(values: readonly T[]): readonly T[] => Object.freeze([...new Set(values)].sort());
const short = (value?: string): string | undefined => value ? value.length <= 20 ? value : `${value.slice(0, 12)}…${value.slice(-6)}` : undefined;
const identityIssueKinds = new Set(["missing_entity", "ambiguous_reference", "duplicate_candidate"]);
const sourceAuthorities = Object.freeze(["AU2", "AU3", "AU4", "AU5", "AU6", "AU7", "AU8", "AU9"] as const);

export function deriveNucleusCompletion(facts: NucleusAuthorityFacts): NucleusCompletion {
  const gates = Object.freeze({supported: facts.supported, freshContext: !facts.stale, evidenceSufficient: facts.evidenceSufficient, noContradiction: !facts.contradiction, identityResolved: facts.identityResolved, strategyCompleted: facts.strategyCompleted, transactionCompletedOrNotRequired: !facts.transactionRequired || facts.transactionCompleted, noReconciliation: !facts.reconciliationPending, noCompensation: !facts.compensationPending, noAuthorization: !facts.authorizationPending, noBlocker: !facts.blocked, outcomeVerifiable: facts.outcomeVerifiable});
  const blockers = Object.freeze(Object.entries(gates).filter(([, ok]) => !ok).map(([code]) => code).sort());
  const eligible = blockers.length === 0;
  return Object.freeze({eligible, completed: eligible && facts.caseMarkedResolved, gates, blockers});
}

/** Priority is fail-closed and follows existing authorities; no state is persisted. */
export function deriveNucleusState(facts: NucleusAuthorityFacts): NucleusResolutionState {
  if (!facts.supported) return "unsupported";
  if (facts.stale) return "stale";
  if (facts.reconciliationPending) return "reconciliation_required";
  if (facts.compensationPending) return "compensation_required";
  if (facts.authorizationPending) return "awaiting_authorization";
  if (facts.humanReviewPending) return "human_review_required";
  if (facts.blocked || facts.contradiction) return "blocked";
  const completion = deriveNucleusCompletion(facts);
  if (completion.completed) return "completed";
  if (completion.eligible || facts.observing) return "observing";
  if (facts.transactionExecuting || facts.transactionStarted) return "executing";
  if (!facts.identityResolved) return "resolving_identity";
  if (facts.investigating) return "investigating";
  if (!facts.planReady) return "planning";
  if (facts.analyzing || facts.hasAnalysis) return "analyzing";
  return "idle";
}

const actionMeta: Readonly<Record<NucleusPrimaryActionKind, Omit<NucleusPrimaryAction, "reasonCodes">>> = Object.freeze({
  analyze: {kind: "analyze", label: "Analizar", actionClass: "pure_transform", risk: "low", target: "evidence", enabled: true},
  investigate: {kind: "investigate", label: "Investigar", actionClass: "read_only", risk: "low", target: "evidence", enabled: true},
  resolve_identity: {kind: "resolve_identity", label: "Resolver identidad", actionClass: "human_decision", risk: "medium", target: "resolution", enabled: true},
  generate_strategy: {kind: "generate_strategy", label: "Generar estrategia", actionClass: "pure_transform", risk: "low", target: "resolution", enabled: true},
  continue: {kind: "continue", label: "Continuar", actionClass: "external_effect", risk: "medium", target: "execution", enabled: true},
  authorize: {kind: "authorize", label: "Autorizar", actionClass: "human_decision", risk: "high", target: "execution", enabled: true},
  reconcile: {kind: "reconcile", label: "Reconciliar", actionClass: "human_decision", risk: "high", target: "execution", enabled: true},
  compensate: {kind: "compensate", label: "Compensar", actionClass: "human_decision", risk: "destructive", target: "execution", enabled: true},
  human_review: {kind: "human_review", label: "Revisar manualmente", actionClass: "human_decision", risk: "high", target: "case", enabled: true},
  regenerate: {kind: "regenerate", label: "Regenerar", actionClass: "pure_transform", risk: "low", target: "evidence", enabled: true},
  finish: {kind: "finish", label: "Finalizar", actionClass: "human_decision", risk: "medium", target: "case", enabled: true},
  none: {kind: "none", label: "Sin acción", actionClass: "read_only", risk: "low", target: "none", enabled: false},
});

export function derivePrimaryNucleusAction(state: NucleusResolutionState, facts: NucleusAuthorityFacts, reasonCodes: readonly string[] = []): NucleusPrimaryAction {
  const kind: NucleusPrimaryActionKind = state === "idle" ? "analyze" : state === "analyzing" ? "analyze" : state === "investigating" ? "investigate" : state === "resolving_identity" ? "resolve_identity" : state === "planning" ? "generate_strategy" : state === "awaiting_authorization" ? "authorize" : state === "executing" ? "continue" : state === "observing" ? deriveNucleusCompletion(facts).eligible ? "finish" : "continue" : state === "reconciliation_required" ? "reconcile" : state === "compensation_required" ? "compensate" : state === "human_review_required" || state === "blocked" ? "human_review" : state === "stale" ? "regenerate" : "none";
  return Object.freeze({...actionMeta[kind], reasonCodes: unique(reasonCodes), enabled: actionMeta[kind].enabled && state !== "unsupported"});
}

function normalizeRisk(value?: string): NucleusRisk {
  if (value === "destructive" || value === "critical") return "destructive";
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  return "low";
}

function evidenceStatus(autonomous: AutonomousReviewCenterModel, stale: boolean): NucleusResolutionViewModel["evidence"]["status"] {
  if (stale) return "stale";
  if (!autonomous.sufficiency) return "unavailable";
  const value = autonomous.sufficiency.status;
  if (value === "sufficient" || value === "partial" || value === "insufficient" || value === "contradictory" || value === "stale" || value === "unavailable") return value;
  return "unavailable";
}

function autonomyVisibility(model: AutonomousReviewCenterModel): NucleusResolutionViewModel["autonomy"]["visibility"] {
  if (model.state === "blocked") return "Bloqueado";
  if (model.state === "human_review" || model.autonomy?.level === "human_required") return "Requiere humano";
  if (model.state === "authorization_required" || model.autonomy?.level === "authorization_required") return "Requiere autorización";
  if (model.autonomy?.level === "supervised") return "Autónomo supervisado";
  return "Autónomo seguro";
}

function timeline(reviewCase: ReviewCase, autonomous: AutonomousReviewCenterModel, plan: TransversalPlanView, transaction: TransactionCenterView, knowledge: KnowledgeCenterViewModel): readonly NucleusTimelineEvent[] {
  const drafts: Omit<NucleusTimelineEvent, "id" | "fingerprint">[] = [{order: 10, kind: "case_detected", label: "Caso detectado", safeSummary: `Caso ${reviewCase.priority} registrado.`, occurredAt: reviewCase.createdAt}];
  if (autonomous.sufficiency) drafts.push({order: 20, kind: "evidence_evaluated", label: "Evidencia evaluada", safeSummary: `Suficiencia ${autonomous.sufficiency.status}.`});
  if (!reviewCase.issues.some((issue) => identityIssueKinds.has(issue.kind) && !reviewCase.resolutions.some((entry) => entry.issueId === issue.id))) drafts.push({order: 30, kind: "identity_resolved", label: "Identidad resuelta", safeSummary: "No quedan incidencias de identidad sin resolución."});
  if (autonomous.decision) drafts.push({order: 40, kind: "decision_made", label: "Decisión tomada", safeSummary: `${autonomous.decision.kind}; riesgo ${autonomous.decision.risk}.`});
  if (autonomous.strategy) drafts.push({order: 50, kind: "strategy_generated", label: "Estrategia generada", safeSummary: `${autonomous.strategy.steps.length} pasos; estado ${autonomous.strategy.status}.`});
  if (transaction.transaction) drafts.push({order: 60, kind: "transaction_prepared", label: "Transacción preparada", safeSummary: `${transaction.steps.length} steps; estado ${transaction.state}.`});
  autonomous.history.forEach((entry, index) => drafts.push({order: 70 + index, kind: "supervised_iteration", label: "Progreso supervisado", safeSummary: `Iteración ${entry.iteration}: ${entry.result}${entry.stopReason ? `; ${entry.stopReason}` : ""}.`, occurredAt: entry.occurredAt}));
  if (transaction.operational?.reconciliationRequired.length) drafts.push({order: 80, kind: "reconciliation", label: "Reconciliación requerida", safeSummary: `${transaction.operational.reconciliationRequired.length} steps requieren comprobación.`});
  if (knowledge.feedback.length) drafts.push({order: 90, kind: "knowledge_updated", label: "Experiencia actualizada", safeSummary: `${knowledge.feedback.length} registros de feedback gobernado.`});
  if (reviewCase.status === "resolved" || reviewCase.status === "resumed") drafts.push({order: 100, kind: "case_resolved", label: "Caso resuelto", safeSummary: "El lifecycle AU3 registra el cierre.", occurredAt: reviewCase.resolvedAt ?? reviewCase.resumedAt});
  const events = new Map<string, NucleusTimelineEvent>();
  for (const draft of drafts) {
    const semantic = {...draft, caseId: reviewCase.id, planFingerprint: plan.planFingerprint};
    const fingerprint = fp(semantic);
    events.set(fingerprint, Object.freeze({...draft, id: `nucleus-event:${fingerprint.slice(-18)}`, fingerprint: short(fingerprint)!}));
  }
  return Object.freeze([...events.values()].sort((a, b) => a.order - b.order || a.fingerprint.localeCompare(b.fingerprint)));
}

function buildFacts(reviewCase: ReviewCase, autonomous: AutonomousReviewCenterModel, plan: TransversalPlanView, transaction: TransactionCenterView, knowledge: KnowledgeCenterViewModel): NucleusAuthorityFacts {
  const unresolvedIdentity = reviewCase.issues.filter((issue) => identityIssueKinds.has(issue.kind) && !reviewCase.resolutions.some((entry) => entry.issueId === issue.id));
  const contradiction = autonomous.sufficiency?.status === "contradictory" || reviewCase.issues.some((issue) => issue.kind === "contradictory_data" && !reviewCase.resolutions.some((entry) => entry.issueId === issue.id)) || knowledge.conflicts.length > 0;
  const transactionRequired = Boolean(transaction.transaction && transaction.steps.length);
  const transactionCompleted = transaction.state === "completed";
  const outcomeVerifiable = transactionCompleted || reviewCase.resumeExecution?.status === "succeeded" || reviewCase.entityMaterialization?.status === "succeeded" || (!transactionRequired && reviewCase.resolutions.length >= reviewCase.issues.length);
  return Object.freeze({
    supported: reviewCase.subject.type !== "image",
    stale: reviewCase.status === "stale" || plan.status === "stale" || transaction.state === "stale" || autonomous.state === "stale" || knowledge.availability === "stale",
    hasAnalysis: Boolean(autonomous.decision || autonomous.sufficiency), analyzing: autonomous.state === "evaluating", investigating: autonomous.state === "investigating" || autonomous.decision?.kind === "investigate" || autonomous.sufficiency?.status === "insufficient" || autonomous.sufficiency?.status === "partial",
    identityResolved: unresolvedIdentity.length === 0,
    planReady: plan.status === "fresh" && plan.blockers.length === 0 && Boolean(autonomous.strategy),
    authorizationPending: autonomous.state === "authorization_required" || (transaction.operational?.authorizationRequired.length ?? 0) > 0,
    transactionRequired, transactionStarted: Boolean(transaction.transaction) && !["planned", "ready"].includes(transaction.state), transactionExecuting: transaction.state === "executing", transactionCompleted,
    observing: autonomous.state === "observing" || transactionCompleted,
    reconciliationPending: autonomous.state === "reconciliation_required" || transaction.state === "reconciliation_required",
    compensationPending: autonomous.state === "compensation_required" || transaction.state === "compensation_required",
    humanReviewPending: autonomous.state === "human_review",
    blocked: autonomous.state === "blocked" || transaction.state === "blocked" || plan.blockers.length > 0,
    caseMarkedResolved: reviewCase.status === "resolved" || reviewCase.status === "resumed",
    evidenceSufficient: autonomous.sufficiency?.status === "sufficient",
    contradiction,
    strategyCompleted: autonomous.loop?.phase === "completed" || transactionCompleted || (!transactionRequired && Boolean(autonomous.strategy) && plan.status === "fresh"),
    outcomeVerifiable,
  });
}

export function buildNucleusResolutionViewModel(input: BuildNucleusResolutionInput): NucleusResolutionViewModel {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const reviewCase = input.reviewCase;
  const autonomous = buildAutonomousReviewCenterModel(reviewCase, evaluatedAt);
  const plan = recoverTransversalPlanView(reviewCase);
  const transaction = recoverReviewCenterTransaction(reviewCase);
  const snapshot = readKnowledgeCenterSnapshot(reviewCase.context);
  const knowledge = buildKnowledgeCenterViewModel(snapshot, evaluatedAt, [reviewCase.subject.type]);
  const facts = buildFacts(reviewCase, autonomous, plan, transaction, knowledge);
  const state = deriveNucleusState(facts);
  const completion = deriveNucleusCompletion(facts);
  const pendingIssues = reviewCase.issues.filter((issue) => !reviewCase.resolutions.some((entry) => entry.issueId === issue.id));
  const planCounts = (kind: TransversalPlanView["operations"][number]["action"]) => plan.operations.filter((entry) => entry.action === kind).length;
  const contradictionCount = Number(facts.contradiction) + knowledge.conflicts.length;
  const reasonCodes = unique([...autonomous.staleReasons, ...plan.recoveryReasons, ...plan.blockers.map((entry) => entry.code), ...completion.blockers, ...(!facts.supported ? ["subject_not_supported"] : [])]);
  const primaryAction = derivePrimaryNucleusAction(state, facts, reasonCodes);
  const fingerprints = unique([autonomous.contextFingerprint, plan.planFingerprint, transaction.transaction?.transactionFingerprint, snapshot?.snapshotFingerprint].filter((entry): entry is string => Boolean(entry))).map((entry) => short(entry)!);
  const validated = planCounts("validate");
  const executed = transaction.operational?.progress.completed ?? 0;
  return Object.freeze({
    version: NUCLEUS_RESOLUTION_VERSION, caseId: reviewCase.id, caseVersion: reviewCase.version, state, severity: reviewCase.priority,
    progress: Object.freeze({completed: transaction.operational?.progress.completed ?? reviewCase.resolutions.length, total: transaction.operational?.progress.total ?? Math.max(reviewCase.issues.length, 1), percent: Math.round(100 * (transaction.operational?.progress.completed ?? reviewCase.resolutions.length) / Math.max(transaction.operational?.progress.total ?? reviewCase.issues.length, 1))}),
    primaryAction, facts,
    case: Object.freeze({title: reviewCase.title, problem: pendingIssues[0]?.message ?? (completion.completed ? "Caso resuelto." : "Revisión editorial pendiente."), pendingIssues: pendingIssues.length, resolvedIssues: reviewCase.resolutions.length}),
    evidence: Object.freeze({status: evidenceStatus(autonomous, facts.stale), safeSummary: autonomous.sufficiency?.explanation ?? "La evidencia todavía no ha sido evaluada.", sourceCount: autonomous.evidence.length, contradictionCount, fingerprints: Object.freeze(autonomous.evidence.map((entry) => short(entry.fingerprint)!).sort())}),
    identity: Object.freeze({resolved: facts.identityResolved, pending: pendingIssues.filter((issue) => identityIssueKinds.has(issue.kind)).length, safeSummary: facts.identityResolved ? "Identidad sin incidencias pendientes." : "La identidad requiere resolución explícita."}),
    resolution: Object.freeze({status: plan.status, reuse: planCounts("reuse"), create: planCounts("create"), investigate: planCounts("investigate"), blockers: Object.freeze(plan.blockers.map((entry) => entry.code).sort()), fingerprint: short(plan.planFingerprint)}),
    autonomy: Object.freeze({visibility: autonomyVisibility(autonomous), risk: normalizeRisk(autonomous.autonomy?.risk ?? autonomous.decision?.risk), reasonCodes: unique(autonomous.autonomy?.reasons ?? autonomous.decision?.reasonCodes ?? [])}),
    strategy: Object.freeze({status: autonomous.strategy?.status ?? "unavailable", stepCount: autonomous.strategy?.steps.length ?? 0, completed: facts.strategyCompleted, fingerprint: short(autonomous.strategy?.fingerprint)}),
    execution: Object.freeze({state: transaction.state, completed: transaction.operational?.progress.completed ?? 0, total: transaction.operational?.progress.total ?? transaction.steps.length, incidents: transaction.operational?.incidents.length ?? 0, authorization: transaction.operational?.authorizationRequired.length ?? 0, reconciliation: transaction.operational?.reconciliationRequired.length ?? 0, compensation: transaction.operational?.compensationRequired.length ?? 0, fingerprint: short(transaction.transaction?.transactionFingerprint)}),
    knowledge: Object.freeze({availability: knowledge.availability, relevant: knowledge.entries.filter((entry) => entry.actionable).length, recommendations: knowledge.recommendations.length, conflicts: knowledge.conflicts.length, feedback: knowledge.feedback.length, advisoryOnly: true, currentEvidencePrevails: true}),
    completion,
    completionSummary: Object.freeze({problem: pendingIssues[0]?.message ?? reviewCase.title, corrected: reviewCase.resolutions.length, reused: planCounts("reuse"), created: planCounts("create"), validated, executed, learned: knowledge.feedback.length, unsupported: facts.supported ? Object.freeze([]) : Object.freeze(["No soportado todavía: image."])}),
    timeline: timeline(reviewCase, autonomous, plan, transaction, knowledge), unsupported: facts.supported ? Object.freeze([]) : Object.freeze(["No soportado todavía: el Núcleo no inventa un fallback para imágenes."]), reasonCodes, fingerprints,
    sourceAuthorities, presentationOnly: true, persistsState: false, invokesExecutors: false, writes: false,
  });
}

export function buildNucleusSummary(model: NucleusResolutionViewModel): string { return `${model.case.problem} Estado ${model.state}; progreso ${model.progress.percent}%. Acción: ${model.primaryAction.label}.`; }
export function buildNucleusEvidenceSummary(model: NucleusResolutionViewModel): string { return `Evidencia ${model.evidence.status}; ${model.evidence.sourceCount} fuentes proyectadas y ${model.evidence.contradictionCount} contradicciones. ${model.evidence.safeSummary}`; }
export function buildNucleusResolutionSummary(model: NucleusResolutionViewModel): string { return `Identidad ${model.identity.resolved ? "resuelta" : "pendiente"}; ${model.resolution.reuse} reuse, ${model.resolution.create} create y ${model.resolution.investigate} investigaciones.`; }
export function buildNucleusExecutionSummary(model: NucleusResolutionViewModel): string { return `Ejecución ${model.execution.state}; ${model.execution.completed}/${model.execution.total} steps, ${model.execution.incidents} incidencias.`; }
export function buildNucleusKnowledgeSummary(model: NucleusResolutionViewModel): string { return `Experiencia relevante: ${model.knowledge.relevant} items y ${model.knowledge.recommendations} recomendaciones. La evidencia actual prevalece.`; }
export function buildNucleusCompletionSummary(model: NucleusResolutionViewModel): string { return model.completion.completed ? `Caso resuelto: ${model.completionSummary.corrected} correcciones, ${model.completionSummary.executed} operaciones y ${model.completionSummary.learned} aprendizajes gobernados.` : `Cierre pendiente: ${model.completion.blockers.join(" · ") || "validación humana final"}.`; }
