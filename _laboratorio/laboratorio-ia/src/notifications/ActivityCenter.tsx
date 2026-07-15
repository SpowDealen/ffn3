import {
  memo,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import {getNotificationVisual} from "./icons";
import NotificationDeliveryStatus from "./NotificationDeliveryStatus";
import NotificationGroupingMetadata from "./NotificationGroupingMetadata";
import {
  getNotifications,
  subscribeToNotifications,
} from "./store";
import type {LabNotification} from "./types";

function formatRelativeDate(value: string): string {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) return "";

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 1000),
  );

  if (seconds < 10) return "Ahora";
  if (seconds < 60) return `Hace ${seconds} s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;

  return `Hace ${Math.floor(hours / 24)} d`;
}

function getStateLabel(
  errors: number,
  reviews: number,
): string {
  if (errors > 0) return `${errors} error${errors === 1 ? "" : "es"}`;
  if (reviews > 0) {
    return `${reviews} revisión${reviews === 1 ? "" : "es"} pendiente${reviews === 1 ? "" : "s"}`;
  }

  return "Todo en orden";
}

const LatestActivity = memo(function LatestActivity({
  notification,
  now,
}: {
  notification: LabNotification;
  now: number;
}): ReactElement {
  const visual = getNotificationVisual(
    notification.kind,
    notification.level,
  );

  return (
    <div style={styles.latestActivity}>
      <div
        style={{
          ...styles.latestIcon,
          background: visual.background,
          color: visual.color,
          borderColor: visual.borderColor,
        }}
        aria-hidden="true"
      >
        {visual.emoji}
      </div>

      <div style={styles.latestBody}>
        <span style={styles.latestEyebrow}>
          Última actividad
        </span>

        <strong style={styles.latestTitle}>
          {notification.title}
        </strong>

        <p style={styles.latestMessage}>
          {notification.message}
        </p>

        <NotificationGroupingMetadata
          notification={notification}
          now={now}
        />

        <NotificationDeliveryStatus
          notification={notification}
        />
      </div>
    </div>
  );
});

export default function ActivityCenter(): ReactElement {
  const [notifications, setNotifications] =
    useState<LabNotification[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    function refresh(): void {
      setNotifications(getNotifications());
      setNow(Date.now());
    }

    refresh();

    const unsubscribe = subscribeToNotifications(refresh);
    const timer = window.setInterval(
      () => setNow(Date.now()),
      30_000,
    );

    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);

  const latest = notifications[0];

  const reviewCount = useMemo(
    () =>
      notifications.filter(
        (notification) =>
          !notification.read &&
          notification.level === "review",
      ).length,
    [notifications],
  );

  const errorCount = useMemo(
    () =>
      notifications.filter(
        (notification) =>
          !notification.read &&
          notification.level === "error",
      ).length,
    [notifications],
  );

  const unreadCount = useMemo(
    () =>
      notifications.filter(
        (notification) => !notification.read,
      ).length,
    [notifications],
  );

  return (
    <section style={styles.card}>
      <div style={styles.headingRow}>
        <div>
          <p style={styles.eyebrow}>
            Centro de actividad
          </p>

          <h2 style={styles.title}>
            Estado del laboratorio
          </h2>
        </div>

        <div
          style={{
            ...styles.healthBadge,
            ...(errorCount > 0
              ? styles.healthError
              : reviewCount > 0
                ? styles.healthReview
                : styles.healthOk),
          }}
        >
          <span style={styles.healthDot} />
          {getStateLabel(errorCount, reviewCount)}
        </div>
      </div>

      <div style={styles.contentGrid}>
        <div style={styles.activityPanel}>
          {latest ? (
            <>
              <LatestActivity
                notification={latest}
                now={now}
              />

              <div style={styles.latestMeta}>
                <span>
                  {latest.source
                    ? `Origen: ${latest.source}`
                    : "Origen: Laboratorio"}
                </span>

                <span>
                  {formatRelativeDate(latest.createdAt)}
                </span>
              </div>
            </>
          ) : (
            <div style={styles.emptyState}>
              <span style={styles.emptyIcon}>✓</span>

              <div>
                <strong>Sin actividad todavía</strong>
                <p style={styles.emptyText}>
                  Los análisis, borradores y errores aparecerán aquí al momento.
                </p>
              </div>
            </div>
          )}
        </div>

        <div style={styles.metrics}>
          <div style={styles.metric}>
            <span style={styles.metricValue}>
              {unreadCount}
            </span>
            <span style={styles.metricLabel}>
              Pendientes
            </span>
          </div>

          <div style={styles.metric}>
            <span style={styles.metricValue}>
              {reviewCount}
            </span>
            <span style={styles.metricLabel}>
              Revisiones
            </span>
          </div>

          <div style={styles.metric}>
            <span style={styles.metricValue}>
              {errorCount}
            </span>
            <span style={styles.metricLabel}>
              Errores
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    display: "grid",
    gap: 16,
    padding: 18,
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025))",
  },

  headingRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },

  eyebrow: {
    margin: 0,
    color: "#88939f",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },

  title: {
    margin: "5px 0 0",
    fontSize: 18,
    lineHeight: 1.2,
  },

  healthBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    minHeight: 30,
    padding: "0 11px",
    border: "1px solid transparent",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
  },

  healthOk: {
    background: "rgba(52,211,153,0.1)",
    color: "#6ee7b7",
    borderColor: "rgba(52,211,153,0.18)",
  },

  healthReview: {
    background: "rgba(251,191,36,0.1)",
    color: "#fcd34d",
    borderColor: "rgba(251,191,36,0.18)",
  },

  healthError: {
    background: "rgba(248,113,113,0.1)",
    color: "#fca5a5",
    borderColor: "rgba(248,113,113,0.18)",
  },

  healthDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    background: "currentColor",
    boxShadow: "0 0 10px currentColor",
  },

  contentGrid: {
    display: "grid",
    gridTemplateColumns:
      "minmax(0, 1fr) minmax(230px, 0.42fr)",
    gap: 14,
  },

  activityPanel: {
    minWidth: 0,
    padding: 15,
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 15,
    background: "rgba(5,8,12,0.32)",
  },

  latestActivity: {
    display: "grid",
    gridTemplateColumns: "38px minmax(0, 1fr)",
    gap: 12,
    alignItems: "flex-start",
  },

  latestIcon: {
    display: "grid",
    placeItems: "center",
    width: 37,
    height: 37,
    border: "1px solid transparent",
    borderRadius: 11,
    fontSize: 17,
  },

  latestBody: {
    minWidth: 0,
  },

  latestEyebrow: {
    display: "block",
    marginBottom: 4,
    color: "#727e8a",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },

  latestTitle: {
    display: "block",
    overflow: "hidden",
    fontSize: 13,
    lineHeight: 1.35,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  latestMessage: {
    display: "-webkit-box",
    overflow: "hidden",
    margin: "5px 0 0",
    color: "#aeb7c0",
    fontSize: 11,
    lineHeight: 1.45,
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },

  latestMeta: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
    paddingTop: 11,
    borderTop: "1px solid rgba(255,255,255,0.06)",
    color: "#6f7a86",
    fontSize: 10,
  },

  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
  },

  metric: {
    display: "grid",
    alignContent: "center",
    justifyItems: "center",
    minHeight: 94,
    padding: 10,
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14,
    background: "rgba(5,8,12,0.32)",
    textAlign: "center",
  },

  metricValue: {
    fontSize: 22,
    fontWeight: 850,
    lineHeight: 1,
  },

  metricLabel: {
    marginTop: 7,
    color: "#7d8894",
    fontSize: 9,
    fontWeight: 750,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
  },

  emptyState: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
  },

  emptyIcon: {
    display: "grid",
    placeItems: "center",
    width: 36,
    height: 36,
    borderRadius: 11,
    background: "rgba(52,211,153,0.1)",
    color: "#6ee7b7",
    fontWeight: 900,
  },

  emptyText: {
    margin: "5px 0 0",
    color: "#707b87",
    fontSize: 11,
    lineHeight: 1.45,
  },

  "@media": {},
};
