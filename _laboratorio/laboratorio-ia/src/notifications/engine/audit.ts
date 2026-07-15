import type {
  NormalizedNotificationEvent,
  NotificationAudit,
  NotificationEvent,
  NotificationPolicy,
  NotificationPriority,
} from "./types";

function getChannelDecision(
  label: string,
  enabled: boolean,
): string {
  return `Canal ${label}: ${
    enabled ? "activo" : "omitido por política"
  }`;
}

export function buildNotificationAudit(
  event: NotificationEvent,
  priority: NotificationPriority,
  normalized: NormalizedNotificationEvent,
  policy: NotificationPolicy,
): NotificationAudit {
  const decisions = [
    `Prioridad: ${priority}`,
    `Nivel: ${normalized.level}`,
    getChannelDecision(
      "Activity Center",
      policy.channels.activityCenter,
    ),
    getChannelDecision("Telegram", policy.channels.telegram),
    `Agrupación: ${policy.group ? "sí" : "no"}`,
  ];

  if (policy.groupKey) {
    decisions.push(
      `Clave de agrupación: ${policy.groupKey}`,
    );
  }

  return Object.freeze({
    receivedAt: new Date().toISOString(),
    eventType: event.type,
    priority,
    channels: Object.freeze({
      activityCenter: policy.channels.activityCenter,
      telegram: policy.channels.telegram,
    }),
    grouped: policy.group,
    groupKey: policy.groupKey,
    normalizedLevel: normalized.level,
    normalizedKind: normalized.kind,
    decisions: Object.freeze(decisions),
  });
}
