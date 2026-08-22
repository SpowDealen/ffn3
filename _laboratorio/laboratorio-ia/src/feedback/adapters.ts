import type {EditorialReadError} from "../lib/editorialReadError";
import type {LabNotification, NotificationLevel} from "../notifications/types";
import type {TelegramHealthResponse} from "../notifications/telegramHealth";
import type {LabProcess} from "../processes/types";
import {createGlobalFeedback, type GlobalFeedback, type GlobalFeedbackScope} from "./model";

export type EditorialPresentationStatus =
  | Readonly<{type: "idle"; message: ""}>
  | Readonly<{type: "success"; message: string}>
  | Readonly<{type: "error"; message: string; retryable?: boolean}>;

export function adaptEditorialStatusFeedback(
  status: EditorialPresentationStatus,
  options: Readonly<{
    scope?: Extract<GlobalFeedbackScope, "editorial" | "reference_entities">;
    source: string;
    operation: string;
    retrying?: boolean;
  }>,
): GlobalFeedback {
  const retrying = Boolean(options.retrying);
  return createGlobalFeedback({
    state: retrying ? "loading" : status.type,
    scope: options.scope ?? "editorial",
    hierarchy: "section",
    title: retrying ? "Reintentando la operación" : status.type === "idle" ? "En espera" : status.message,
    detail: retrying && status.type !== "idle" ? status.message : undefined,
    source: options.source,
    operation: options.operation,
    retryable: status.type === "error" && Boolean(status.retryable),
    action: status.type === "error" && status.retryable
      ? {id: "retry-editorial-operation", label: "Reintentar", kind: "retry", disabled: retrying}
      : undefined,
    isHistorical: false,
  });
}

export function adaptEditorialReadErrorFeedback(
  error: EditorialReadError,
  options: Readonly<{title: string; scope: GlobalFeedbackScope; source: string; operation: string; historical?: boolean; timestamp?: string}>,
): GlobalFeedback {
  return createGlobalFeedback({
    state: "error",
    scope: options.scope,
    hierarchy: "section",
    title: options.title,
    detail: error.message,
    source: options.source,
    operation: options.operation,
    retryable: error.retryable,
    action: error.retryable ? {id: "retry-read-operation", label: "Reintentar", kind: "retry"} : undefined,
    timestamp: options.timestamp,
    isHistorical: options.historical,
  });
}

export function adaptLabProcessFeedback(process: LabProcess): GlobalFeedback {
  const state = process.status === "running" ? "processing" : process.status === "success" ? "completed" : "error";
  const measured = typeof process.current === "number" && typeof process.total === "number";
  return createGlobalFeedback({
    state,
    scope: "process",
    hierarchy: "global",
    title: process.status === "success" ? "Proceso completado" : process.status === "error" ? "Proceso interrumpido" : process.label,
    detail: process.status === "success" ? undefined : process.detail,
    source: process.origin ?? "Panel IA · Process Store",
    operation: process.label,
    retryable: false,
    progress: process.status === "running"
      ? measured ? {kind: "determinate", current: process.current!, total: process.total!} : {kind: "indeterminate"}
      : measured ? {kind: "determinate", current: process.current!, total: process.total!} : undefined,
    timestamp: process.updatedAt ?? process.startedAt,
    isHistorical: process.status !== "running",
  });
}

const notificationStates: Readonly<Record<NotificationLevel, "success" | "warning" | "error">> = Object.freeze({
  success: "success",
  review: "warning",
  error: "error",
});

export function adaptNotificationFeedback(
  notification: LabNotification,
  presented?: Readonly<{title?: string; message?: string}>,
): GlobalFeedback {
  return createGlobalFeedback({
    state: notificationStates[notification.level],
    scope: "notification",
    hierarchy: "local",
    title: presented?.title ?? notification.title,
    detail: presented?.message ?? notification.message,
    source: notification.source ?? "Laboratorio",
    operation: notification.kind ?? "system",
    retryable: false,
    timestamp: notification.updatedAt ?? notification.createdAt,
    isHistorical: true,
  });
}

export function adaptTelegramHealthFeedback(input: Readonly<{
  health: TelegramHealthResponse | null;
  error?: string | null;
  checking: boolean;
  testRequested?: boolean;
}>): GlobalFeedback {
  if (input.checking || (!input.health && !input.error)) {
    return createGlobalFeedback({state: "loading", scope: "telegram", hierarchy: "section", title: "Comprobando Telegram", detail: "Consultando el diagnóstico en vivo sin exponer credenciales.", source: "Telegram Health", operation: "health_check", retryable: false, progress: {kind: "indeterminate"}, isHistorical: false});
  }
  if (input.error) {
    return createGlobalFeedback({state: "error", scope: "telegram", hierarchy: "section", title: "Telegram no está disponible", detail: input.error, source: "Telegram Health", operation: "health_check", retryable: true, action: {id: "retry-telegram-health", label: "Reintentar", kind: "retry"}, timestamp: input.health?.checkedAt, isHistorical: false});
  }
  const health = input.health!;
  if (!health.enabled) {
    return createGlobalFeedback({state: "warning", scope: "telegram", hierarchy: "section", title: "Telegram está deshabilitado", detail: "La entrega externa permanece desactivada por la configuración existente.", source: "Telegram Health", operation: "health_check", retryable: false, timestamp: health.checkedAt, isHistorical: false});
  }
  if (!health.configured) {
    return createGlobalFeedback({state: "blocked", scope: "telegram", hierarchy: "section", title: "Configuración de Telegram incompleta", detail: "Revisa la configuración del token y del chat antes de habilitar entregas.", source: "Telegram Health", operation: "health_check", retryable: false, timestamp: health.checkedAt, isHistorical: false});
  }
  if (health.deliveryMode === "sandbox") {
    return createGlobalFeedback({state: "success", scope: "sandbox", hierarchy: "section", title: "Sandbox seguro activo", detail: input.testRequested && health.skipped ? "La prueba se registró sin enviar mensajes externos." : "Telegram está aislado y no permite dispatches externos.", source: "Telegram Health", operation: "health_check", retryable: false, timestamp: health.checkedAt, isHistorical: false});
  }
  return createGlobalFeedback({
    state: health.ok ? "success" : "error",
    scope: "telegram",
    hierarchy: "section",
    title: health.ok ? "Telegram disponible" : "Telegram presenta una incidencia",
    detail: input.testRequested && health.ok && !health.skipped ? "La prueba se envió correctamente a Telegram." : "Diagnóstico de conectividad actualizado.",
    source: "Telegram Health",
    operation: "health_check",
    retryable: !health.ok,
    action: !health.ok ? {id: "retry-telegram-health", label: "Reintentar", kind: "retry"} : undefined,
    timestamp: health.checkedAt,
    isHistorical: false,
  });
}

export function adaptReviewOperationFeedback(input: Readonly<{kind: "status" | "error" | "processing"; message: string}>): GlobalFeedback {
  return createGlobalFeedback({
    state: input.kind === "processing" ? "processing" : input.kind === "error" ? "error" : "success",
    scope: "review",
    hierarchy: "local",
    title: input.kind === "processing" ? "Operación supervisada en curso" : input.kind === "error" ? "Operación no completada" : "Operación actualizada",
    detail: input.message,
    source: "Centro Transaccional AU7",
    operation: "supervised_transaction",
    retryable: false,
    isHistorical: false,
  });
}

export function adaptBatchFeedback(input: Readonly<{title: string; completed: number; failed: number; total: number; cancelled?: boolean}>): GlobalFeedback {
  const state = input.cancelled ? "cancelled" : input.failed > 0 && input.completed > 0 ? "partial" : input.failed > 0 ? "error" : input.completed >= input.total ? "completed" : "processing";
  return createGlobalFeedback({
    state,
    scope: "process",
    hierarchy: "section",
    title: input.title,
    detail: input.cancelled ? "La operación se canceló de forma segura." : input.failed > 0 ? `${input.failed} elemento${input.failed === 1 ? "" : "s"} no se completaron.` : undefined,
    source: "Batch existente",
    operation: "batch",
    retryable: false,
    progress: {kind: "determinate", current: input.completed + input.failed, total: input.total},
    isHistorical: false,
  });
}

export const globalFeedbackAdaptersSecurity = Object.freeze({pure: true, mutatesSources: false, createsStore: false, accessesNetwork: false, writesDomain: false, invokesExecutors: false} as const);
