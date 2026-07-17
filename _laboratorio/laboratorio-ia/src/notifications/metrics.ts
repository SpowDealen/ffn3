import type {LabNotification, NotificationPriority} from "./types";

export type DeliveryMetrics = Record<"sent" | "failed" | "pending" | "skipped" | "grouped" | NotificationPriority, number>;
export type TelegramDeliveryHealth = {
  channelStatus: "Sin datos" | "Operativo" | "Con incidencias";
  successRate: number | null;
  averageDeliveryMs: number | null;
  latestSentAt?: string;
  latestFailedAt?: string;
  latestFailureError?: string;
};

export function calculateDeliveryMetrics(notifications: readonly LabNotification[]): DeliveryMetrics {
  return notifications.reduce<DeliveryMetrics>((metrics, notification) => {
    if (notification.deliveryStatus) metrics[notification.deliveryStatus] += 1;
    if ((notification.updateCount ?? 0) > 0) metrics.grouped += 1;
    if (notification.priority) metrics[notification.priority] += 1;
    return metrics;
  }, {sent: 0, failed: 0, pending: 0, skipped: 0, grouped: 0, critical: 0, high: 0, normal: 0, low: 0});
}

export function calculateTelegramDeliveryHealth(notifications: readonly LabNotification[]): TelegramDeliveryHealth {
  const sent = notifications.filter((item) => item.deliveryStatus === "sent");
  const failed = notifications.filter((item) => item.deliveryStatus === "failed");
  const sentTimes = sent.flatMap((item) => {
    if (!item.deliveredAt) return [];
    const value = new Date(item.deliveredAt).getTime();
    return Number.isFinite(value) ? [value] : [];
  });
  const failedWithTimes = failed.flatMap((item) => {
    const value = new Date(item.updatedAt ?? item.createdAt).getTime();
    return Number.isFinite(value) ? [{item, value}] : [];
  }).sort((a, b) => a.value - b.value);
  const latestSentTime = sentTimes.length ? Math.max(...sentTimes) : undefined;
  const latestFailed = failedWithTimes.at(-1);
  const completed = sent.length + failed.length;
  const durations = sent.flatMap((item) => {
    if (!item.deliveredAt) return [];
    const duration = new Date(item.deliveredAt).getTime() - new Date(item.createdAt).getTime();
    return Number.isFinite(duration) && duration >= 0 ? [duration] : [];
  });
  const latestFailureIsNewer = latestFailed !== undefined && (latestSentTime === undefined || latestFailed.value > latestSentTime);
  return {
    channelStatus: completed === 0 ? "Sin datos" : failed.length > 0 && (sent.length === 0 || latestFailureIsNewer) ? "Con incidencias" : "Operativo",
    successRate: completed ? (sent.length / completed) * 100 : null,
    averageDeliveryMs: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
    latestSentAt: latestSentTime === undefined ? undefined : new Date(latestSentTime).toISOString(),
    latestFailedAt: latestFailed === undefined ? undefined : new Date(latestFailed.value).toISOString(),
    latestFailureError: latestFailed?.item.deliveryError?.trim() || failed.find((item) => item.deliveryError?.trim())?.deliveryError?.trim(),
  };
}
