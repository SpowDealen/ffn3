import type {InteractionCapability} from "../interactions/model";
import {buildNotificationPresentation} from "../notifications/presentation";
import type {LabNotification} from "../notifications/types";
import type {OperatorExperienceModel, OperatorSignal} from "../operator/model";
import type {ProcessExperiencePresentation} from "../processes/presentation";
import type {ReviewCase} from "../review/types";
import type {GlobalStatusModel, SubsystemStatus} from "../status/model";
import type {AgentAuthority, AgentAuthorityOwner, AgentCapability, AgentDependency, AgentNotification, AgentOperatorSignal, AgentProcess, AgentReview, AgentReviewCheckpoint, AgentTemporal} from "./model";

const TERMINAL_REVIEW = new Set(["resolved", "resumed", "dismissed"]);
const BLOCKED_TRANSACTION_PHASES = new Set(["blocked", "reconciliation_required", "compensation_failed"]);
const SENSITIVE_ASSIGNMENT = /\b(token|secret|password|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi;
const BEARER = /\bBearer\s+[^\s,;]+/gi;

export function agentSafeText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(BEARER, "Bearer [redacted]").replace(SENSITIVE_ASSIGNMENT, "$1=[redacted]").slice(0, 320);
}

function authority(owner: AgentAuthorityOwner, source: string): AgentAuthority {
  return Object.freeze({owner, source: agentSafeText(source) ?? "Existing authority"});
}

function authorityOwner(capability: InteractionCapability): AgentAuthorityOwner {
  const source = capability.authoritySource.toLowerCase();
  if (capability.intent === "navigate") return "ui_navigation";
  if (source.includes("notification")) return "notification_store";
  if (source.includes("au7") || source.includes("transaction")) return "au7_transaction";
  if (source.includes("au8") || source.includes("autonomous") || source.includes("supervised")) return "au8_supervised";
  if (source.includes("global status") || source.includes("les 4")) return "les4_live_checks";
  if (source.includes("review")) return "review_center";
  if (source.includes("process")) return "process_origin";
  return "existing_authority";
}

function reevaluation(capability: InteractionCapability): AgentCapability["reevaluate"] {
  if (capability.intent === "refresh") return Object.freeze(["global_status", "operator_signals"]);
  if (capability.intent === "retry") return Object.freeze(["notifications", "operator_signals"]);
  if (["execute", "resume", "cancel", "authorize", "confirm"].includes(capability.intent)) return Object.freeze(["processes", "review", "operator_signals"]);
  return Object.freeze([]);
}

export function projectAgentCapability(capability: InteractionCapability): AgentCapability {
  const destinationMissing = capability.intent === "navigate" && !capability.href;
  const availability = capability.busy ? "busy" : destinationMissing ? "unavailable" : capability.enabled ? "available" : "blocked";
  const reason = availability === "available" ? undefined : Object.freeze({code: availability === "busy" ? "capability_busy" : destinationMissing ? "destination_unavailable" : "authority_blocked", text: agentSafeText(capability.disabledReason)});
  return Object.freeze({
    id: capability.id,
    intent: capability.intent,
    label: agentSafeText(capability.label) ?? capability.intent,
    availability,
    available: availability === "available",
    blocked: availability === "blocked" || availability === "unavailable",
    busy: capability.busy,
    requiresAuthorization: capability.intent === "authorize" || capability.confirmation === "domain",
    destructive: capability.destructive,
    authority: authority(authorityOwner(capability), capability.authoritySource),
    reason,
    destination: capability.href,
    reevaluate: reevaluation(capability),
  });
}

export function projectAgentDependencies(globalStatus: GlobalStatusModel): AgentDependency[] {
  return [...globalStatus.subsystems].sort((left, right) => left.id.localeCompare(right.id)).map((item) => Object.freeze({
    id: item.id,
    label: item.label,
    state: item.state,
    effect: item.effect,
    current: item.currentIncidentCount > 0 || item.isLive,
    live: item.isLive,
    reason: item.reason ? Object.freeze({code: item.reason, text: agentSafeText(item.detail ?? item.summary)}) : undefined,
    destination: item.route,
    checkedAt: item.checkedAt,
    activeCount: item.activeCount,
    currentIncidentCount: item.currentIncidentCount,
    historicalCount: item.historicalCount,
  }));
}

function projectSignal(item: OperatorSignal): AgentOperatorSignal {
  return Object.freeze({id: item.id, source: item.source, kind: item.kind, priority: item.priority, temporal: item.temporal, title: agentSafeText(item.title) ?? item.id, actionable: item.actionable, authority: authority(item.source === "process" ? "process_origin" : item.source === "review" ? "review_center" : item.source === "notification" ? "notification_store" : "les4_live_checks", item.authoritySource), reason: item.reason ? Object.freeze({code: item.reason, text: agentSafeText(item.summary)}) : undefined, destination: item.destination});
}

export function projectAgentOperator(model: OperatorExperienceModel): Readonly<{state: OperatorExperienceModel["state"]; nextBestSignalId?: string; attention: readonly AgentOperatorSignal[]; active: readonly AgentOperatorSignal[]}> {
  return Object.freeze({state: model.state, nextBestSignalId: model.nextBest?.id, attention: Object.freeze(model.attention.map(projectSignal)), active: Object.freeze(model.active.map(projectSignal))});
}

function processTemporal(process: ProcessExperiencePresentation): AgentTemporal {
  if (process.temporal === "historical") return "historical";
  if (process.temporal === "result") return "recent";
  return "current";
}

export function projectAgentProcesses(processes: readonly ProcessExperiencePresentation[]): AgentProcess[] {
  return [...processes].sort((left, right) => left.id.localeCompare(right.id)).map((item) => Object.freeze({
    id: item.id,
    title: agentSafeText(item.title) ?? item.id,
    state: item.state,
    temporal: processTemporal(item),
    active: item.isLive,
    source: agentSafeText(item.source) ?? "Process Experience",
    authority: authority("process_origin", item.source),
    reason: item.blockedReason ? Object.freeze({code: item.blockedReason, text: agentSafeText(item.intervention)}) : undefined,
    updatedAt: item.updatedAt,
    progress: Object.freeze(item.progress.kind === "determinate" ? {kind: item.progress.kind, current: item.progress.current, total: item.progress.total} : {kind: item.progress.kind}),
    actions: Object.freeze({retryAuthorized: item.retryAuthorized, cancelAuthorized: item.cancelAuthorized}),
    destination: "/actividad" as const,
  }));
}

export function projectAgentNotifications(notifications: readonly LabNotification[]): AgentNotification[] {
  return notifications.map((item) => buildNotificationPresentation(item)).sort((left, right) => left.id.localeCompare(right.id)).map((item) => Object.freeze({
    id: item.id,
    title: agentSafeText(item.title) ?? item.id,
    temporal: item.delivery.status === "pending" ? "current" as const : "historical" as const,
    unread: item.unread,
    priority: item.priority,
    tone: item.tone,
    source: agentSafeText(item.source) ?? "Notification Experience",
    effectiveAt: item.effectiveAt,
    deliveryStatus: item.delivery.status,
    retryAvailable: item.delivery.retryable,
    authority: authority("notification_store", "Notification Store"),
    destination: "/actividad" as const,
  }));
}

function unresolved(reviewCase: ReviewCase): ReviewCase["issues"] {
  const resolved = new Set(reviewCase.resolutions.map((item) => item.issueId));
  return reviewCase.issues.filter((item) => !resolved.has(item.id));
}

function checkpointProjection(reviewCase: ReviewCase): AgentReviewCheckpoint | undefined {
  const checkpoint = reviewCase.globalResolution;
  if (!checkpoint) return undefined;
  return Object.freeze({
    id: checkpoint.id,
    schemaVersion: checkpoint.schemaVersion,
    caseVersion: checkpoint.caseVersion,
    phase: checkpoint.phase,
    checkpointFingerprint: checkpoint.checkpointFingerprint,
    planFingerprint: checkpoint.planFingerprint,
    graphFingerprint: checkpoint.graphFingerprint,
    snapshotFingerprint: checkpoint.snapshotFingerprint,
    updatedAt: checkpoint.updatedAt,
    transaction: checkpoint.transaction ? Object.freeze({id: checkpoint.transaction.transactionId, phase: checkpoint.transaction.phase, fingerprint: checkpoint.transaction.transactionFingerprint, checkpointFingerprint: checkpoint.transaction.checkpointFingerprint}) : undefined,
    supervisedLoop: checkpoint.autonomousLoop ? Object.freeze({id: checkpoint.autonomousLoop.loopId, phase: checkpoint.autonomousLoop.phase, fingerprint: checkpoint.autonomousLoop.loopFingerprint, iteration: checkpoint.autonomousLoop.iteration, stopReason: checkpoint.autonomousLoop.stopReason}) : undefined,
  });
}

export function projectAgentReview(cases: readonly ReviewCase[]): AgentReview[] {
  return [...cases].sort((left, right) => left.id.localeCompare(right.id)).map((item) => {
    const unresolvedIssues = unresolved(item);
    const transactionPhase = item.globalResolution?.transaction?.phase;
    const loopPhase = item.globalResolution?.autonomousLoop?.phase;
    const reasonCodes = [...new Set([
      ...unresolvedIssues.filter((issue) => issue.blocking).map((issue) => `issue:${issue.kind}`),
      ...(item.status === "stale" || item.status === "resume_failed" ? [`review:${item.status}`] : []),
      ...(transactionPhase && BLOCKED_TRANSACTION_PHASES.has(transactionPhase) ? [`transaction:${transactionPhase}`] : []),
      ...(loopPhase === "blocked" ? ["supervised_loop:blocked"] : []),
    ])].sort();
    const evidenceReferences = [...new Set([
      ...unresolvedIssues.filter((issue) => (issue.evidence?.length ?? 0) > 0).map((issue) => `review-issue:${issue.id}`),
      ...(item.globalResolution?.history ?? []).flatMap((entry) => entry.evidenceFingerprint ? [entry.evidenceFingerprint] : []),
    ])].sort();
    const owners: AgentAuthority[] = [authority("review_center", "Review Store / Centro de Revisión")];
    if (item.globalResolution?.transaction) owners.push(authority("au7_transaction", "AU7 Transaction Authority"));
    if (item.globalResolution?.autonomousLoop) owners.push(authority("au8_supervised", "AU8 Supervised Loop"));
    return Object.freeze({
      id: item.id,
      title: agentSafeText(item.title) ?? item.id,
      version: item.version,
      status: item.status,
      priority: item.priority,
      temporal: TERMINAL_REVIEW.has(item.status) ? "historical" as const : "current" as const,
      blocked: reasonCodes.length > 0,
      unresolvedIssueCount: unresolvedIssues.length,
      unresolvedBlockingCount: unresolvedIssues.filter((issue) => issue.blocking).length,
      reasonCodes: Object.freeze(reasonCodes),
      evidenceReferences: Object.freeze(evidenceReferences),
      updatedAt: item.updatedAt,
      authority: Object.freeze(owners),
      destination: "/revision" as const,
      checkpoint: checkpointProjection(item),
    });
  });
}

export const agentReadyAdaptersSecurity = Object.freeze({pure: true, readsOnlyArguments: true, serializable: true, createsStore: false, persists: false, fetches: false, writes: false, executes: false, retries: false, plans: false, decidesAutonomy: false, createsCheckpoint: false, exposesCredentials: false} as const);
