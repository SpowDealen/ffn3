import type {LabNotification} from "../notifications/types";
import {buildNotificationPresentation} from "../notifications/presentation";
import type {TelegramHealthResponse} from "../notifications/telegramHealth";
import type {ProcessExperiencePresentation} from "../processes/presentation";
import type {ReviewCase} from "../review/types";
import type {SubsystemStatus} from "./model";

export type RuntimeObservation = Readonly<{
  state: "checking" | "available" | "unavailable";
  checkedAt?: string;
  reason?: string;
}>;

export type ReferenceEntitiesObservation = Readonly<{
  state: "checking" | "available" | "unavailable";
  checkedAt?: string;
  entityCount?: number;
  reason?: string;
}>;

function status(input: SubsystemStatus): SubsystemStatus {
  return Object.freeze(input);
}

export function adaptRuntimeStatus(observation: RuntimeObservation): SubsystemStatus {
  if (observation.state === "checking") return status({id: "runtime", label: "Servicios del laboratorio", state: "recovering", effect: "recovering", summary: "Comprobando que las funciones principales estén disponibles.", route: "/editorial", activeCount: 0, currentIncidentCount: 0, historicalCount: 0, isLive: true});
  if (observation.state === "unavailable") return status({id: "runtime", label: "Servicios del laboratorio", state: "unavailable", effect: "unavailable", summary: "Las funciones principales no responden en este momento.", reason: observation.reason ?? "runtime_unreachable", route: "/editorial", checkedAt: observation.checkedAt, activeCount: 0, currentIncidentCount: 1, historicalCount: 0, isLive: true});
  return status({id: "runtime", label: "Servicios del laboratorio", state: "operational", effect: "none", summary: "Las funciones principales están disponibles.", route: "/editorial", checkedAt: observation.checkedAt, activeCount: 0, currentIncidentCount: 0, historicalCount: 0, isLive: true});
}

export function adaptReferenceEntitiesStatus(observation: ReferenceEntitiesObservation): SubsystemStatus {
  if (observation.state === "checking") return status({id: "references", label: "Datos editoriales", state: "recovering", effect: "recovering", summary: "Comprobando los datos disponibles para preparar contenidos.", route: "/editorial", activeCount: 0, currentIncidentCount: 0, historicalCount: 0, isLive: true});
  if (observation.state === "unavailable") return status({id: "references", label: "Datos editoriales", state: "blocked", effect: "blocked", summary: "Los datos necesarios para trabajar no están disponibles.", reason: observation.reason ?? "reference_entities_unavailable", route: "/editorial", checkedAt: observation.checkedAt, activeCount: 0, currentIncidentCount: 1, historicalCount: 0, isLive: true});
  return status({id: "references", label: "Datos editoriales", state: "operational", effect: "none", summary: `${observation.entityCount ?? 0} referencias disponibles.`, route: "/editorial", checkedAt: observation.checkedAt, activeCount: 0, currentIncidentCount: 0, historicalCount: 0, isLive: true});
}

export function adaptTelegramStatus(input: Readonly<{checking: boolean; health: TelegramHealthResponse | null; error?: string}>): SubsystemStatus {
  if (input.checking) return status({id: "telegram", label: "Telegram", state: "recovering", effect: "recovering", summary: "Comprobando el estado actual del canal.", route: "/telegram", activeCount: 0, currentIncidentCount: 0, historicalCount: 0, isLive: true});
  if (input.error || !input.health) return status({id: "telegram", label: "Telegram", state: "unavailable", effect: "degraded", summary: "La capacidad Telegram no está disponible.", reason: input.error ?? "telegram_health_unavailable", route: "/telegram", activeCount: 0, currentIncidentCount: 1, historicalCount: 0, isLive: true});
  const health = input.health;
  if (!health.enabled) return status({id: "telegram", label: "Telegram", state: "idle", effect: "none", summary: "Entrega externa deshabilitada por configuración.", route: "/telegram", checkedAt: health.checkedAt, activeCount: 0, currentIncidentCount: 0, historicalCount: 0, isLive: true});
  if (!health.configured) return status({id: "telegram", label: "Telegram", state: "blocked", effect: "degraded", summary: "Configuración de Telegram incompleta.", reason: "telegram_configuration_incomplete", route: "/telegram", checkedAt: health.checkedAt, activeCount: 0, currentIncidentCount: 1, historicalCount: 0, isLive: true});
  if (health.deliveryMode === "sandbox") return status({id: "telegram", label: "Telegram", state: "operational", effect: "none", summary: "Sandbox seguro; no se realizan entregas externas.", route: "/telegram", checkedAt: health.checkedAt, activeCount: 0, currentIncidentCount: 0, historicalCount: 0, isLive: true});
  if (!health.ok) return status({id: "telegram", label: "Telegram", state: "degraded", effect: "degraded", summary: "Telegram presenta una incidencia viva.", reason: health.error ?? "telegram_health_failed", route: "/telegram", checkedAt: health.checkedAt, activeCount: 0, currentIncidentCount: 1, historicalCount: 0, isLive: true});
  return status({id: "telegram", label: "Telegram", state: "operational", effect: "none", summary: "El canal está disponible.", route: "/telegram", checkedAt: health.checkedAt, activeCount: 0, currentIncidentCount: 0, historicalCount: 0, isLive: true});
}

export function adaptNotificationsStatus(notifications: readonly LabNotification[]): SubsystemStatus {
  const presentations = notifications.map((notification) => buildNotificationPresentation(notification));
  const pending = presentations.filter((notification) => notification.delivery.status === "pending").length;
  const unread = presentations.filter((notification) => notification.unread).length;
  const failed = presentations.filter((notification) => notification.delivery.status === "failed").length;
  return status({
    id: "notifications", label: "Entregas y avisos", state: pending ? "active" : "operational", effect: pending ? "active" : "none",
    summary: pending ? `${pending} entregas pendientes.` : "Historial disponible sin entregas pendientes.",
    detail: `${notifications.length} registros históricos · ${unread} sin leer · ${failed} fallos históricos.`, route: "/actividad",
    activeCount: pending, currentIncidentCount: 0, historicalCount: notifications.length, isLive: false,
  });
}

export function adaptProcessesStatus(processes: readonly ProcessExperiencePresentation[]): SubsystemStatus {
  const active = processes.filter((process) => process.isLive).length;
  const currentBlocked = processes.filter((process) => !process.isHistorical && process.state === "blocked");
  const infrastructureBlocked = currentBlocked.filter((process) => process.blockerKind === "infrastructure").length;
  if (currentBlocked.length) return status({id: "processes", label: "Procesos editoriales", state: "blocked", effect: infrastructureBlocked ? "degraded" : "attention", summary: `${currentBlocked.length} procesos necesitan una decisión.`, reason: infrastructureBlocked ? "process_infrastructure_blocked" : "process_domain_blocked", route: "/actividad", activeCount: active, currentIncidentCount: currentBlocked.length, historicalCount: processes.filter((process) => process.isHistorical).length, isLive: active > 0});
  if (active) return status({id: "processes", label: "Procesos editoriales", state: "active", effect: "active", summary: `${active} procesos en curso.`, route: "/actividad", activeCount: active, currentIncidentCount: 0, historicalCount: processes.filter((process) => process.isHistorical).length, isLive: true});
  return status({id: "processes", label: "Procesos editoriales", state: "idle", effect: "none", summary: "No hay procesos en curso.", route: "/actividad", activeCount: 0, currentIncidentCount: 0, historicalCount: processes.filter((process) => process.isHistorical).length, isLive: false});
}

export function adaptReviewStatus(cases: readonly ReviewCase[]): SubsystemStatus {
  // Compatibilidad interna certificada: la autoridad sigue siendo Review / AU7 / AU8.
  const current = cases.filter((reviewCase) => !["resolved", "resumed", "dismissed"].includes(reviewCase.status));
  const active = current.filter((reviewCase) => reviewCase.status === "resuming" || ["executing", "compensating"].includes(reviewCase.globalResolution?.transaction?.phase ?? "") || reviewCase.globalResolution?.autonomousLoop?.phase === "running");
  const blocked = current.filter((reviewCase) => reviewCase.status === "stale" || reviewCase.status === "resume_failed" || ["blocked", "reconciliation_required", "compensation_failed"].includes(reviewCase.globalResolution?.transaction?.phase ?? "") || reviewCase.globalResolution?.autonomousLoop?.phase === "blocked" || reviewCase.issues.some((issue) => issue.blocking && !reviewCase.resolutions.some((resolution) => resolution.issueId === issue.id)));
  if (blocked.length) return status({id: "review", label: "Revisiones", state: "blocked", effect: "degraded", summary: `${blocked.length} casos necesitan una decisión antes de continuar.`, reason: "review_capability_blocked", route: "/revision", activeCount: active.length, currentIncidentCount: blocked.length, historicalCount: cases.length - current.length, isLive: active.length > 0});
  if (active.length) return status({id: "review", label: "Revisiones", state: "active", effect: "active", summary: `${active.length} revisiones en curso.`, route: "/revision", activeCount: active.length, currentIncidentCount: 0, historicalCount: cases.length - current.length, isLive: true});
  if (current.length) return status({id: "review", label: "Revisiones", state: "attention", effect: "attention", summary: `${current.length} casos esperan una decisión.`, reason: "review_attention_required", route: "/revision", activeCount: 0, currentIncidentCount: 0, historicalCount: cases.length - current.length, isLive: true});
  return status({id: "review", label: "Revisiones", state: "idle", effect: "none", summary: "No hay casos pendientes.", route: "/revision", activeCount: 0, currentIncidentCount: 0, historicalCount: cases.length, isLive: false});
}

export const globalStatusAdaptersSecurity = Object.freeze({pure: true, readsOnlyArguments: true, fetches: false, persists: false, writes: false, executes: false, createsStore: false} as const);
