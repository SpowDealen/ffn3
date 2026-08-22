import {buildNotificationPresentation} from "../notifications/presentation";
import type {LabNotification} from "../notifications/types";
import type {ProcessExperiencePresentation} from "../processes/presentation";
import type {ReviewCase} from "../review/types";
import type {GlobalStatusModel, SubsystemStatus} from "../status/model";
import {compareOperatorSignals, type OperatorExperienceModel, type OperatorSignal, type OperatorSignalPriority} from "./model";

const TERMINAL_REVIEW = new Set(["resolved", "resumed", "dismissed"]);
const BLOCKED_TRANSACTION_PHASES = new Set(["blocked", "reconciliation_required", "compensation_failed"]);
const HEALTH_IDS = new Set<SubsystemStatus["id"]>(["runtime", "references", "telegram"]);

function signal(input: OperatorSignal): OperatorSignal {
  return Object.freeze(input);
}

function healthSignals(globalStatus: GlobalStatusModel): OperatorSignal[] {
  return globalStatus.subsystems.flatMap((subsystem) => {
    if (!HEALTH_IDS.has(subsystem.id) || !subsystem.currentIncidentCount || !["unavailable", "blocked", "degraded"].includes(subsystem.state)) return [];
    return [signal({
      id: `health:${subsystem.id}`,
      source: "health",
      sourceLabel: subsystem.label,
      title: `${subsystem.label} ${subsystem.state === "degraded" ? "degradado" : "bloqueado"}`,
      summary: subsystem.summary,
      reason: subsystem.reason,
      kind: subsystem.state === "degraded" ? "attention" : "blocker",
      priority: subsystem.effect === "unavailable" || subsystem.effect === "blocked" ? "immediate" : "high",
      temporal: "current",
      actionable: false,
      destination: subsystem.route,
      authoritySource: `Global Status · ${subsystem.label}`,
    })];
  });
}

function processSignals(processes: readonly ProcessExperiencePresentation[]): OperatorSignal[] {
  return processes.flatMap((process) => {
    if (process.temporal === "current" && process.state === "blocked") {
      return [signal({
        id: `process:${process.id}`,
        source: "process",
        sourceLabel: process.source,
        title: process.title,
        summary: process.intervention ?? "El proceso necesita revisión en su superficie de origen.",
        reason: process.blockedReason,
        kind: "blocker",
        priority: process.blockerKind === "infrastructure" ? "immediate" : "high",
        temporal: "current",
        actionable: process.retryAuthorized || process.cancelAuthorized,
        destination: "/actividad",
        authoritySource: process.source,
      })];
    }
    if (!process.isLive) return [];
    return [signal({
      id: `process:${process.id}`,
      source: "process",
      sourceLabel: process.source,
      title: process.title,
      summary: process.detail ?? process.purpose,
      kind: process.retryAuthorized || process.cancelAuthorized ? "action" : "active",
      priority: "normal",
      temporal: "current",
      actionable: process.retryAuthorized || process.cancelAuthorized,
      destination: "/actividad",
      authoritySource: process.source,
    })];
  });
}

function unresolvedBlockingIssue(reviewCase: ReviewCase): boolean {
  const resolved = new Set(reviewCase.resolutions.map((resolution) => resolution.issueId));
  return reviewCase.issues.some((issue) => issue.blocking && !resolved.has(issue.id));
}

function reviewSignals(cases: readonly ReviewCase[]): OperatorSignal[] {
  return cases.flatMap((reviewCase) => {
    if (TERMINAL_REVIEW.has(reviewCase.status)) return [];
    const transactionPhase = reviewCase.globalResolution?.transaction?.phase ?? "";
    const loopPhase = reviewCase.globalResolution?.autonomousLoop?.phase;
    const blocked = reviewCase.status === "stale" || reviewCase.status === "resume_failed" || BLOCKED_TRANSACTION_PHASES.has(transactionPhase) || loopPhase === "blocked" || unresolvedBlockingIssue(reviewCase);
    const active = reviewCase.status === "resuming" || ["executing", "compensating"].includes(transactionPhase) || loopPhase === "running";
    const priority: OperatorSignalPriority = reviewCase.priority === "critical" ? "immediate" : reviewCase.priority === "high" ? "high" : "normal";
    return [signal({
      id: `review:${reviewCase.id}`,
      source: "review",
      sourceLabel: "Centro de Revisión · AU7/AU8",
      title: reviewCase.title,
      summary: blocked ? "Requiere desbloqueo, decisión humana o reconciliación en el Centro de Revisión." : active ? "Operación supervisada en curso; conserva su autoridad de origen." : "Caso pendiente de decisión en el Centro de Revisión.",
      reason: blocked ? reviewCase.lastResumeError ?? reviewCase.issues.find((issue) => issue.blocking)?.message : undefined,
      kind: blocked ? "blocker" : active ? "active" : "attention",
      priority: blocked ? priority : active ? "normal" : priority,
      temporal: "current",
      actionable: false,
      destination: "/revision",
      authoritySource: "Centro de Revisión · AU7/AU8",
    })];
  });
}

function notificationSignals(notifications: readonly LabNotification[]): OperatorSignal[] {
  return notifications.flatMap((notification) => {
    const presentation = buildNotificationPresentation(notification);
    if (presentation.delivery.status !== "pending") return [];
    return [signal({
      id: `notification:${presentation.id}`,
      source: "notification",
      sourceLabel: presentation.source,
      title: presentation.title,
      summary: "Entrega pendiente; el registro permanece en Activity Center.",
      kind: "active",
      priority: "low",
      temporal: "current",
      actionable: false,
      destination: "/actividad",
      authoritySource: "Notification Experience",
    })];
  });
}

export function buildOperatorExperienceModel(input: Readonly<{
  globalStatus: GlobalStatusModel;
  notifications: readonly LabNotification[];
  processes: readonly ProcessExperiencePresentation[];
  reviewCases: readonly ReviewCase[];
}>): OperatorExperienceModel {
  const signals = [...healthSignals(input.globalStatus), ...processSignals(input.processes), ...reviewSignals(input.reviewCases), ...notificationSignals(input.notifications)];
  const attention = Object.freeze(signals.filter((entry) => entry.temporal === "current" && ["blocker", "attention", "action"].includes(entry.kind)).sort(compareOperatorSignals));
  const active = Object.freeze(signals.filter((entry) => entry.temporal === "current" && entry.kind === "active").sort(compareOperatorSignals));
  const checksPending = input.globalStatus.subsystems.some((subsystem) => HEALTH_IDS.has(subsystem.id) && subsystem.state === "recovering");
  const state = attention.length ? "attention" : active.length ? "active" : checksPending ? "unknown" : "clear";
  const labels = {attention: "Requiere atención", active: "Actividad en curso", clear: "Sin atención pendiente", unknown: "Estado por confirmar"} as const;
  const summaries = {
    attention: `${attention.length} señales actuales requieren revisión o navegación a su autoridad.`,
    active: `${active.length} operaciones están en curso sin bloqueo confirmado.`,
    clear: "Las señales vivas comprobadas no requieren intervención.",
    unknown: "Las comprobaciones vivas todavía no permiten confirmar un estado sano.",
  } as const;
  return Object.freeze({
    state,
    label: labels[state],
    summary: summaries[state],
    attention,
    active,
    nextBest: attention[0],
    currentAttentionCount: attention.length,
    activeCount: active.length,
    reviewPendingCount: input.reviewCases.filter((reviewCase) => !TERMINAL_REVIEW.has(reviewCase.status)).length,
    authorizedActionCount: signals.filter((entry) => entry.actionable).length,
    historicalCount: input.globalStatus.historicalRecordCount,
    presentationOnly: true,
  });
}

export const operatorAdaptersSecurity = Object.freeze({pure: true, readsOnlyArguments: true, createsStore: false, fetches: false, persists: false, writes: false, executes: false, retries: false, createsAuthority: false} as const);
