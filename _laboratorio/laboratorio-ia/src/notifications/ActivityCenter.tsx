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
import type {
  LabNotification,
  NotificationLevel,
} from "./types";

type LevelFilter = "all" | NotificationLevel;
type MetricFilter =
  | "sent"
  | "failed"
  | "pending"
  | "skipped"
  | "grouped";

const METRIC_CARDS: Array<{
  key: MetricFilter;
  icon: string;
  label: string;
}> = [
  {key: "sent", icon: "🟢", label: "Enviadas"},
  {key: "failed", icon: "🔴", label: "Fallidas"},
  {key: "pending", icon: "🟡", label: "Pendientes"},
  {key: "skipped", icon: "⚪", label: "Omitidas"},
  {key: "grouped", icon: "🔄", label: "Agrupadas"},
];

function normalizeSource(value: string): string {
  return value.trim().toLocaleLowerCase("es-ES");
}

function matchesMetricFilter(
  notification: LabNotification,
  metricFilter: MetricFilter | null,
): boolean {
  if (!metricFilter) return true;

  if (metricFilter === "grouped") {
    return (notification.updateCount ?? 0) > 0;
  }

  return notification.deliveryStatus === metricFilter;
}

function formatRelativeDate(value: string, now: number): string {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) return "";

  const seconds = Math.max(
    0,
    Math.floor((now - timestamp) / 1000),
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

const ActivityItem = memo(function ActivityItem({
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
    <article style={styles.activityItem}>
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

      <div style={styles.latestMeta}>
        <span>
          {notification.source
            ? `Origen: ${notification.source}`
            : "Origen: Laboratorio"}
        </span>

        <span>
          {formatRelativeDate(notification.createdAt, now)}
        </span>
      </div>
    </article>
  );
});

export default function ActivityCenter(): ReactElement {
  const [notifications, setNotifications] =
    useState<LabNotification[]>([]);
  const [now, setNow] = useState(Date.now());
  const [levelFilter, setLevelFilter] =
    useState<LevelFilter>("all");
  const [sourceFilter, setSourceFilter] =
    useState("all");
  const [metricFilter, setMetricFilter] =
    useState<MetricFilter | null>(null);

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

  const availableSources = useMemo(() => {
    const sources = new Map<string, string>();

    for (const notification of notifications) {
      const source = notification.source?.trim();

      if (source) {
        const key = normalizeSource(source);

        if (!sources.has(key)) {
          sources.set(key, source);
        }
      }
    }

    return [...sources.values()].sort((left, right) =>
      left.localeCompare(right, "es-ES", {
        sensitivity: "base",
      }),
    );
  }, [notifications]);

  const filteredNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        const matchesLevel =
          levelFilter === "all" ||
          notification.level === levelFilter;
        const matchesSource =
          sourceFilter === "all" ||
          (notification.source
            ? normalizeSource(notification.source) ===
              normalizeSource(sourceFilter)
            : false);
        const matchesMetric = matchesMetricFilter(
          notification,
          metricFilter,
        );

        return matchesLevel && matchesSource && matchesMetric;
      }),
    [levelFilter, metricFilter, notifications, sourceFilter],
  );

  const hasBaseFilters =
    levelFilter !== "all" || sourceFilter !== "all";
  const hasActiveFilters =
    hasBaseFilters || metricFilter !== null;

  const deliveryMetrics = useMemo(
    () =>
      notifications.reduce(
        (metrics, notification) => {
          if (notification.deliveryStatus === "sent") {
            metrics.sent += 1;
          } else if (notification.deliveryStatus === "failed") {
            metrics.failed += 1;
          } else if (notification.deliveryStatus === "pending") {
            metrics.pending += 1;
          } else if (notification.deliveryStatus === "skipped") {
            metrics.skipped += 1;
          }

          if ((notification.updateCount ?? 0) > 0) {
            metrics.grouped += 1;
          }

          return metrics;
        },
        {
          sent: 0,
          failed: 0,
          pending: 0,
          skipped: 0,
          grouped: 0,
        },
      ),
    [notifications],
  );

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

      <div style={styles.filterBar}>
        <label style={styles.filterField}>
          <span style={styles.filterLabel}>Nivel</span>
          <select
            value={levelFilter}
            onChange={(event) => {
              setLevelFilter(event.target.value as LevelFilter);
            }}
            style={styles.filterSelect}
          >
            <option value="all">Todos</option>
            <option value="success">Éxito</option>
            <option value="review">Revisión</option>
            <option value="error">Error</option>
          </select>
        </label>

        <label style={styles.filterField}>
          <span style={styles.filterLabel}>Fuente</span>
          <select
            value={sourceFilter}
            onChange={(event) => {
              setSourceFilter(event.target.value);
            }}
            style={styles.filterSelect}
          >
            <option value="all">Todas las fuentes</option>
            {availableSources.map((source) => (
              <option key={normalizeSource(source)} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>

        <span style={styles.resultCount}>
          {filteredNotifications.length}{" "}
          {filteredNotifications.length === 1
            ? "notificación"
            : "notificaciones"}
        </span>

        {hasBaseFilters ? (
          <button
            type="button"
            onClick={() => {
              setLevelFilter("all");
              setSourceFilter("all");
            }}
            style={styles.clearFilters}
          >
            Limpiar filtros
          </button>
        ) : null}
      </div>

      <div style={styles.metricsSection}>
        <div style={styles.metrics}>
          {METRIC_CARDS.map((metric) => {
            const isActive = metricFilter === metric.key;

            return (
              <button
                key={metric.key}
                type="button"
                onClick={() => setMetricFilter(metric.key)}
                style={{
                  ...styles.metric,
                  ...(isActive ? styles.metricActive : {}),
                }}
                aria-pressed={isActive}
              >
                <span style={styles.metricIcon} aria-hidden="true">
                  {metric.icon}
                </span>
                <span style={styles.metricValue}>
                  {deliveryMetrics[metric.key]}
                </span>
                <span style={styles.metricLabel}>
                  {metric.label}
                </span>
              </button>
            );
          })}
        </div>

        {metricFilter ? (
          <button
            type="button"
            onClick={() => setMetricFilter(null)}
            style={styles.resetMetrics}
          >
            Restablecer vista
          </button>
        ) : null}
      </div>

      <div style={styles.contentGrid}>
        <div style={styles.activityPanel}>
          {filteredNotifications.length > 0 ? (
            <div style={styles.activityList}>
              {filteredNotifications.map((notification) => (
                <ActivityItem
                  key={notification.id}
                  notification={notification}
                  now={now}
                />
              ))}
            </div>
          ) : (
            <div style={styles.emptyState}>
              <span style={styles.emptyIcon}>
                {hasActiveFilters ? "⌕" : "✓"}
              </span>

              <div>
                <strong>
                  {hasActiveFilters
                    ? "Sin coincidencias"
                    : "Sin actividad todavía"}
                </strong>
                <p style={styles.emptyText}>
                  {hasActiveFilters
                    ? "No hay notificaciones que coincidan con estos filtros."
                    : "Los análisis, borradores y errores aparecerán aquí al momento."}
                </p>
              </div>
            </div>
          )}
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

  filterBar: {
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    flexWrap: "wrap",
    padding: "12px 13px",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14,
    background: "rgba(5,8,12,0.24)",
  },

  filterField: {
    display: "grid",
    flex: "1 1 150px",
    gap: 5,
    minWidth: 0,
  },

  filterLabel: {
    color: "#7d8894",
    fontSize: 9,
    fontWeight: 750,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },

  filterSelect: {
    width: "100%",
    minHeight: 32,
    padding: "0 28px 0 9px",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 9,
    background: "#151b22",
    color: "#dce3ea",
    fontSize: 11,
  },

  resultCount: {
    flex: "0 0 auto",
    paddingBottom: 8,
    color: "#8994a0",
    fontSize: 10,
    whiteSpace: "nowrap",
  },

  clearFilters: {
    flex: "0 0 auto",
    marginBottom: 7,
    padding: 0,
    border: 0,
    background: "transparent",
    color: "#8dbcf5",
    fontSize: 10,
    fontWeight: 650,
    cursor: "pointer",
  },

  contentGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(min(100%, 230px), 1fr))",
    gap: 14,
  },

  activityPanel: {
    minWidth: 0,
    padding: 15,
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 15,
    background: "rgba(5,8,12,0.32)",
  },

  activityList: {
    display: "grid",
    maxHeight: 430,
    overflowY: "auto",
    overscrollBehavior: "contain",
  },

  activityItem: {
    padding: "12px 0",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
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

  metricsSection: {
    display: "grid",
    justifyItems: "end",
    gap: 8,
  },

  metrics: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(min(100%, 105px), 1fr))",
    gap: 8,
    width: "100%",
  },

  metric: {
    display: "grid",
    alignContent: "center",
    justifyItems: "center",
    minHeight: 88,
    padding: 10,
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14,
    background: "rgba(5,8,12,0.32)",
    color: "#f5f7fa",
    textAlign: "center",
    cursor: "pointer",
    transition:
      "border-color 140ms ease, background 140ms ease, transform 140ms ease",
  },

  metricActive: {
    borderColor: "rgba(96,165,250,0.52)",
    background: "rgba(59,130,246,0.13)",
    boxShadow: "inset 0 0 0 1px rgba(96,165,250,0.12)",
  },

  metricIcon: {
    marginBottom: 6,
    fontSize: 15,
    lineHeight: 1,
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

  resetMetrics: {
    padding: 0,
    border: 0,
    background: "transparent",
    color: "#8dbcf5",
    fontSize: 10,
    fontWeight: 650,
    cursor: "pointer",
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
