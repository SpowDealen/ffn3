import type {
  CSSProperties,
  ReactElement,
} from "react";
import {retryNotificationDelivery} from "./store";
import type {LabNotification} from "./types";
import {presentTelegramDeliveryFailure} from "../lib/editorialReadError";

const DELIVERY_LABELS = {
  pending: "🟡 Enviando a Telegram…",
  sent: "🟢 Enviado a Telegram",
  skipped: "⚪ Envío omitido",
  failed: "🔴 Error al enviar a Telegram",
} as const;

export default function NotificationDeliveryStatus({
  notification,
}: {
  notification: LabNotification;
}): ReactElement | null {
  const status = notification.deliveryStatus;

  if (!status) return null;

  const attempts = notification.deliveryAttempts ?? 0;
  const deliveryError = presentTelegramDeliveryFailure(
    notification.deliveryError,
  );
  const statusLabel =
    status === "skipped" &&
    notification.deliverySkipReason === "sandbox"
      ? "🟣 Telegram en sandbox — sin envío externo"
      : DELIVERY_LABELS[status];

  return (
    <div style={styles.container}>
      <span style={styles.status}>{statusLabel}</span>

      {status === "failed" && deliveryError ? (
        <span style={styles.error}>
          {deliveryError}
        </span>
      ) : null}

      {attempts > 1 ? (
        <span style={styles.attempts}>Intentos: {attempts}</span>
      ) : null}

      {status === "failed" ? (
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.disabled = true;
            void retryNotificationDelivery(notification.id);
          }}
          style={styles.retryButton}
        >
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: "grid",
    justifyItems: "start",
    gap: 4,
    marginTop: 9,
  },

  status: {
    color: "#98a3af",
    fontSize: 10,
    fontWeight: 650,
    lineHeight: 1.4,
  },

  error: {
    color: "#fca5a5",
    fontSize: 10,
    lineHeight: 1.4,
    overflowWrap: "anywhere",
  },

  attempts: {
    color: "#6f7a86",
    fontSize: 9,
    lineHeight: 1.4,
  },

  retryButton: {
    marginTop: 2,
    padding: 0,
    border: 0,
    background: "transparent",
    color: "#8dbcf5",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
  },

};
