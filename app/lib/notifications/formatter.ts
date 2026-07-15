import type {
  NotificationLevel,
  ServerNotificationInput,
} from "./types";

const MAX_TITLE_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 900;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function getLevelPresentation(
  level: NotificationLevel,
): string {
  switch (level) {
    case "error":
      return "❌ Error del sistema";

    case "review":
      return "⚠️ Revisión necesaria";

    case "success":
      return "✅ Operación completada";

    case "info":
    default:
      return "ℹ️ Información";
  }
}

function formatDate(value?: string): string {
  if (!value) return "";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTelegramNotification(
  notification: ServerNotificationInput,
): string {
  const header = getLevelPresentation(notification.level);

  const title = escapeHtml(
    truncate(notification.title, MAX_TITLE_LENGTH),
  );

  const message = escapeHtml(
    truncate(notification.message, MAX_MESSAGE_LENGTH),
  );

  const source = notification.source?.trim()
    ? escapeHtml(notification.source.trim())
    : "";

  const lines: string[] = [
    `<b>${header}</b>`,
    "",
    `<b>${title}</b>`,
    message,
  ];

  const metadata: string[] = [];

  if (source) {
    metadata.push(`Fuente: ${source}`);
  }

  if (typeof notification.count === "number") {
    metadata.push(`Cantidad: ${notification.count}`);
  }

  const date = formatDate(notification.occurredAt);

  if (date) {
    metadata.push(`Fecha: ${date}`);
  }

  if (metadata.length > 0) {
    lines.push("", ...metadata);
  }

  if (notification.location?.label?.trim()) {
    lines.push(
      "",
      `Ubicación: ${escapeHtml(notification.location.label.trim())}`,
    );
  }

  return lines.join("\n");
}
