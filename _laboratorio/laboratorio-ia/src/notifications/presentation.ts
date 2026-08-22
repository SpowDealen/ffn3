import type {
  LabNotification,
  NotificationDeliveryStatus,
  NotificationPriority,
} from "./types";

export type NotificationAttentionTone =
  | "critical"
  | "error"
  | "warning"
  | "success";

export type NotificationPresentation = Readonly<{
  id: string;
  title: string;
  message: string;
  source: string;
  createdAt: string;
  effectiveAt: string;
  isHistorical: true;
  read: boolean;
  unread: boolean;
  priority?: NotificationPriority;
  tone: NotificationAttentionTone;
  attentionRank: number;
  group: Readonly<{
    key?: string;
    occurrences: number;
    updateCount: number;
    itemCount?: number;
    label?: string;
  }>;
  delivery: Readonly<{
    status?: NotificationDeliveryStatus;
    retryable: boolean;
  }>;
}>;

const ATTENTION_RANK: Record<NotificationAttentionTone, number> = {
  critical: 400,
  error: 300,
  warning: 200,
  success: 100,
};

function resolveTone(
  notification: LabNotification,
): NotificationAttentionTone {
  if (notification.priority === "critical") return "critical";
  if (notification.level === "error") return "error";
  if (
    notification.level === "review" ||
    notification.priority === "high"
  ) {
    return "warning";
  }

  return "success";
}

export function buildNotificationPresentation(
  notification: LabNotification,
  copy: {title?: string; message?: string} = {},
): NotificationPresentation {
  const tone = resolveTone(notification);
  const updateCount = Math.max(0, notification.updateCount ?? 0);
  const occurrences = updateCount + 1;
  const groupLabel = notification.groupKey && occurrences > 1
    ? `${occurrences} eventos agrupados`
    : undefined;

  return Object.freeze({
    id: notification.id,
    title: copy.title ?? notification.title,
    message: copy.message ?? notification.message,
    source: notification.source?.trim() || "Laboratorio",
    createdAt: notification.createdAt,
    effectiveAt: notification.updatedAt ?? notification.createdAt,
    isHistorical: true as const,
    read: notification.read,
    unread: !notification.read,
    priority: notification.priority,
    tone,
    attentionRank: ATTENTION_RANK[tone],
    group: Object.freeze({
      key: notification.groupKey,
      occurrences,
      updateCount,
      itemCount: notification.count,
      label: groupLabel,
    }),
    delivery: Object.freeze({
      status: notification.deliveryStatus,
      retryable: notification.deliveryStatus === "failed",
    }),
  });
}

function timestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function compareNotificationAttention(
  left: LabNotification,
  right: LabNotification,
): number {
  const leftPresentation = buildNotificationPresentation(left);
  const rightPresentation = buildNotificationPresentation(right);
  const attentionDifference =
    rightPresentation.attentionRank - leftPresentation.attentionRank;

  if (attentionDifference !== 0) return attentionDifference;
  if (left.read !== right.read) return left.read ? 1 : -1;

  const timeDifference =
    timestamp(rightPresentation.effectiveAt) -
    timestamp(leftPresentation.effectiveAt);

  return timeDifference !== 0
    ? timeDifference
    : left.id.localeCompare(right.id, "es-ES");
}

export function selectBellNotifications(
  notifications: readonly LabNotification[],
  limit = 5,
): LabNotification[] {
  return [...notifications]
    .sort(compareNotificationAttention)
    .slice(0, Math.max(0, limit));
}

export const notificationExperienceSecurity = Object.freeze({
  createsStore: false,
  retriesDelivery: false,
  persistsState: false,
});
