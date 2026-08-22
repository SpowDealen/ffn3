import type {
  CSSProperties,
  ReactElement,
} from "react";
import {retryNotificationDelivery} from "./store";
import type {LabNotification} from "./types";
import {presentTelegramDeliveryFailure} from "../lib/editorialReadError";
import {adaptRetryInteraction} from "../interactions/adapters";
import {InteractionButton} from "../interactions/InteractionPrimitives";

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
  const retryCapability = adaptRetryInteraction({id: `retry-notification-${notification.id}`, label: "Reintentar", authorized: status === "failed", source: "Notification Store · Telegram delivery"});

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
        <InteractionButton
          capability={retryCapability}
          onInvoke={() => { void retryNotificationDelivery(notification.id); }}
          style={styles.retryButton}
          showReason={false}
        />
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
