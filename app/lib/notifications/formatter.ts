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
): {
  icon: string;
  label: string;
} {
  switch (level) {
    case "error":
      return {
        icon: "🔴",
        label: "ERROR CRÍTICO",
      };

    case "review":
      return {
        icon: "🟠",
        label: "REVISIÓN NECESARIA",
      };

    case "success":
      return {
        icon: "🟢",
        label: "ÉXITO",
      };

    case "info":
    default:
      return {
        icon: "🔵",
        label: "INFORMACIÓN",
      };
  }
}

function formatDate(value?: string): string {
  const date = value ? new Date(value) : new Date();

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
  const presentation =
    getLevelPresentation(notification.level);

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
    `<b>${presentation.icon} ${presentation.label}</b>`,
    "",
  ];

  if (source) {
    lines.push(`<b>${source}</b>`);
  }

  lines.push(title);

  if (message && message !== notification.title.trim()) {
    lines.push("", message);
  }

  if (
    notification.level === "review" ||
    notification.level === "error"
  ) {
    lines.push(
      "",
      notification.level === "error"
        ? "<b>Acción necesaria:</b> revisa el fallo antes de continuar."
        : "<b>Acción recomendada:</b> supervisa este proceso.",
    );
  }

  if (notification.location?.label?.trim()) {
    lines.push(
      "",
      `📍 ${escapeHtml(notification.location.label.trim())}`,
    );
  }

  const date = formatDate(notification.occurredAt);

  if (date) {
    lines.push("", `🕒 ${escapeHtml(date)}`);
  }

  return lines.join("\n");
}
