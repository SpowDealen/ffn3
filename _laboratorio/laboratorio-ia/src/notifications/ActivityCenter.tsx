import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import {getNotificationVisual} from "./icons";
import NotificationDeliveryStatus from "./NotificationDeliveryStatus";
import NotificationAuditDetails from "./NotificationAuditDetails";
import NotificationGroupingMetadata from "./NotificationGroupingMetadata";
import NotificationPriorityBadge, {
  getNotificationPriorityPresentation,
} from "./NotificationPriorityBadge";
import {
  getNotifications,
  subscribeToNotifications,
} from "./store";
import {
  getTelegramHealth,
  testTelegramHealth,
  type TelegramHealthResponse,
} from "./telegramHealth";
import type {
  LabNotification,
  NotificationLevel,
  NotificationPriority,
} from "./types";

type LevelFilter = "all" | NotificationLevel;
type PriorityFilter =
  | "all"
  | "unassigned"
  | NotificationPriority;
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

const PRIORITY_METRIC_CARDS: Array<{
  key: NotificationPriority;
  label: string;
}> = [
  {key: "critical", label: "Críticas"},
  {key: "high", label: "Altas"},
  {key: "normal", label: "Normales"},
  {key: "low", label: "Bajas"},
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

function formatDeliveryDuration(milliseconds: number): string {
  if (milliseconds < 1_000) {
    return `${Math.round(milliseconds)} ms`;
  }

  if (milliseconds < 60_000) {
    return `${(milliseconds / 1_000).toFixed(1)} s`;
  }

  return `${(milliseconds / 60_000).toFixed(1)} min`;
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
  auditExpanded,
  onToggleAudit,
}: {
  notification: LabNotification;
  now: number;
  auditExpanded: boolean;
  onToggleAudit: (id: string) => void;
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
          <div style={styles.activityTitleRow}>
            <strong style={styles.latestTitle}>
              {notification.title}
            </strong>
            <NotificationPriorityBadge
              priority={notification.priority}
            />
          </div>

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

      <NotificationAuditDetails
        notification={notification}
        expanded={auditExpanded}
        onToggle={onToggleAudit}
      />
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
  const [priorityFilter, setPriorityFilter] =
    useState<PriorityFilter>("all");
  const [liveTelegramHealth, setLiveTelegramHealth] =
    useState<TelegramHealthResponse | null>(null);
  const [liveTelegramError, setLiveTelegramError] =
    useState<string | null>(null);
  const [isCheckingTelegram, setIsCheckingTelegram] =
    useState(false);
  const [lastCheckWasTest, setLastCheckWasTest] =
    useState(false);
  const [expandedAuditIds, setExpandedAuditIds] =
    useState<Set<string>>(() => new Set());

  const toggleNotificationAudit = useCallback((id: string) => {
    setExpandedAuditIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  useEffect(() => {
    let isActive = true;

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

    void getTelegramHealth()
      .then((health) => {
        if (!isActive) return;

        setLiveTelegramHealth(health);
        setLiveTelegramError(health.error ?? null);
      })
      .catch((error: unknown) => {
        if (!isActive) return;

        setLiveTelegramError(
          error instanceof Error
            ? error.message
            : "No se pudo comprobar Telegram.",
        );
      });

    return () => {
      isActive = false;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const availableIds = new Set(
      notifications.map((notification) => notification.id),
    );

    setExpandedAuditIds((current) => {
      const remainingIds = new Set(
        [...current].filter((id) => availableIds.has(id)),
      );

      return remainingIds.size === current.size
        ? current
        : remainingIds;
    });
  }, [notifications]);

  async function checkTelegram(): Promise<void> {
    setIsCheckingTelegram(true);
    setLiveTelegramError(null);
    setLastCheckWasTest(true);

    try {
      const health = await testTelegramHealth();
      setLiveTelegramHealth(health);
      setLiveTelegramError(health.error ?? null);
    } catch (error) {
      setLiveTelegramError(
        error instanceof Error
          ? error.message
          : "No se pudo comprobar Telegram.",
      );
    } finally {
      setIsCheckingTelegram(false);
    }
  }

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
        const matchesPriority =
          priorityFilter === "all" ||
          (priorityFilter === "unassigned"
            ? notification.priority === undefined
            : notification.priority === priorityFilter);

        return (
          matchesLevel &&
          matchesSource &&
          matchesMetric &&
          matchesPriority
        );
      }),
    [
      levelFilter,
      metricFilter,
      notifications,
      priorityFilter,
      sourceFilter,
    ],
  );

  const hasBaseFilters =
    levelFilter !== "all" ||
    sourceFilter !== "all" ||
    priorityFilter !== "all";
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

          if (notification.priority) {
            metrics[notification.priority] += 1;
          }

          return metrics;
        },
        {
          sent: 0,
          failed: 0,
          pending: 0,
          skipped: 0,
          grouped: 0,
          critical: 0,
          high: 0,
          normal: 0,
          low: 0,
        },
      ),
    [notifications],
  );

  const telegramHealth = useMemo(() => {
    const summary = notifications.reduce(
      (current, notification) => {
        if (notification.deliveryStatus === "sent") {
          current.sent += 1;

          const deliveredAt = notification.deliveredAt
            ? new Date(notification.deliveredAt).getTime()
            : Number.NaN;

          if (Number.isFinite(deliveredAt)) {
            current.latestSentAt = Math.max(
              current.latestSentAt,
              deliveredAt,
            );

            const createdAt = new Date(
              notification.createdAt,
            ).getTime();
            const duration = deliveredAt - createdAt;

            if (
              Number.isFinite(createdAt) &&
              duration >= 0
            ) {
              current.totalDeliveryDuration += duration;
              current.deliveryDurationCount += 1;
            }
          }
        } else if (notification.deliveryStatus === "failed") {
          current.failed += 1;

          const failedAt = new Date(
            notification.updatedAt ?? notification.createdAt,
          ).getTime();

          if (
            Number.isFinite(failedAt) &&
            failedAt > current.latestFailedAt
          ) {
            current.latestFailedAt = failedAt;
            current.latestFailureError =
              notification.deliveryError?.trim() || undefined;
          } else if (!current.fallbackFailureError) {
            current.fallbackFailureError =
              notification.deliveryError?.trim() || undefined;
          }
        }

        return current;
      },
      {
        sent: 0,
        failed: 0,
        latestSentAt: Number.NEGATIVE_INFINITY,
        latestFailedAt: Number.NEGATIVE_INFINITY,
        latestFailureError: undefined as string | undefined,
        fallbackFailureError: undefined as string | undefined,
        totalDeliveryDuration: 0,
        deliveryDurationCount: 0,
      },
    );

    const completedAttempts = summary.sent + summary.failed;
    const hasLatestSent = Number.isFinite(summary.latestSentAt);
    const hasLatestFailure = Number.isFinite(
      summary.latestFailedAt,
    );
    const channelStatus =
      completedAttempts === 0
        ? "Sin datos"
        : summary.failed > 0 &&
            (summary.sent === 0 ||
              (hasLatestFailure &&
                (!hasLatestSent ||
                  summary.latestFailedAt > summary.latestSentAt)))
          ? "Con incidencias"
          : "Operativo";
    const successRate =
      completedAttempts > 0
        ? `${((summary.sent / completedAttempts) * 100).toFixed(1)} %`
        : "—";
    const latestSent = hasLatestSent
      ? formatRelativeDate(
          new Date(summary.latestSentAt).toISOString(),
          now,
        )
      : "Sin entregas";
    const latestFailure = hasLatestFailure
      ? formatRelativeDate(
          new Date(summary.latestFailedAt).toISOString(),
          now,
        )
      : summary.failed > 0
        ? "Fecha no disponible"
        : "Sin fallos";
    const averageDelivery =
      summary.deliveryDurationCount > 0
        ? formatDeliveryDuration(
            summary.totalDeliveryDuration /
              summary.deliveryDurationCount,
          )
        : "—";

    return {
      channelStatus,
      successRate,
      latestSent,
      latestFailure,
      latestFailureError:
        hasLatestFailure
          ? summary.latestFailureError
          : summary.fallbackFailureError,
      averageDelivery,
    };
  }, [notifications, now]);

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

  const liveStatus = !liveTelegramHealth
    ? liveTelegramError
      ? "Error"
      : "Sin comprobar"
    : !liveTelegramHealth.enabled
      ? "Deshabilitado"
      : !liveTelegramHealth.configured
        ? "Configuración incompleta"
        : liveTelegramError
          ? "Error"
          : liveTelegramHealth.ok
            ? "Disponible"
            : "Error";
  const liveCheckedAt = liveTelegramHealth?.checkedAt
    ? formatRelativeDate(liveTelegramHealth.checkedAt, now)
    : "Sin comprobar";

  return (
    <section id="laboratory-status" style={styles.card}>
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

        <label style={styles.filterField}>
          <span style={styles.filterLabel}>Prioridad</span>
          <select
            value={priorityFilter}
            onChange={(event) => {
              setPriorityFilter(
                event.target.value as PriorityFilter,
              );
            }}
            style={styles.filterSelect}
          >
            <option value="all">Todas</option>
            <option value="critical">Crítica</option>
            <option value="high">Alta</option>
            <option value="normal">Normal</option>
            <option value="low">Baja</option>
            <option value="unassigned">Sin prioridad</option>
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
              setPriorityFilter("all");
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

      <section style={styles.priorityMetricsSection}>
        <span style={styles.priorityMetricsTitle}>
          Prioridades
        </span>
        <div style={styles.priorityMetrics}>
          {PRIORITY_METRIC_CARDS.map((metric) => {
            const presentation =
              getNotificationPriorityPresentation(metric.key);
            const isActive = priorityFilter === metric.key;

            return (
              <button
                key={metric.key}
                type="button"
                onClick={() => {
                  setPriorityFilter((current) =>
                    current === metric.key ? "all" : metric.key,
                  );
                }}
                style={{
                  ...styles.priorityMetric,
                  ...(isActive
                    ? styles.priorityMetricActive
                    : {}),
                }}
                aria-pressed={isActive}
              >
                <span aria-hidden="true">
                  {presentation.icon}
                </span>
                <strong style={styles.priorityMetricValue}>
                  {deliveryMetrics[metric.key]}
                </strong>
                <span style={styles.priorityMetricLabel}>
                  {metric.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section id="telegram-status" style={styles.telegramHealth}>
        <div style={styles.telegramHealthHeader}>
          <div>
            <strong style={styles.telegramHealthTitle}>
              Salud de Telegram
            </strong>
            <span style={styles.telegramHealthSubtitle}>
              Calculada sobre el historial local actual
            </span>
          </div>
        </div>

        <div style={styles.telegramHealthGrid}>
          <div style={styles.telegramHealthItem}>
            <span style={styles.telegramHealthLabel}>
              Estado del canal
            </span>
            <strong
              style={{
                ...styles.telegramHealthValue,
                ...(telegramHealth.channelStatus === "Operativo"
                  ? styles.telegramHealthOk
                  : telegramHealth.channelStatus === "Con incidencias"
                    ? styles.telegramHealthIssue
                    : styles.telegramHealthUnknown),
              }}
            >
              {telegramHealth.channelStatus}
            </strong>
          </div>

          <div style={styles.telegramHealthItem}>
            <span style={styles.telegramHealthLabel}>
              Tasa de éxito
            </span>
            <strong style={styles.telegramHealthValue}>
              {telegramHealth.successRate}
            </strong>
          </div>

          <div style={styles.telegramHealthItem}>
            <span style={styles.telegramHealthLabel}>
              Última entrega correcta
            </span>
            <strong style={styles.telegramHealthValue}>
              {telegramHealth.latestSent}
            </strong>
          </div>

          <div style={styles.telegramHealthItem}>
            <span style={styles.telegramHealthLabel}>
              Último fallo
            </span>
            <strong style={styles.telegramHealthValue}>
              {telegramHealth.latestFailure}
            </strong>
            {telegramHealth.latestFailureError ? (
              <span
                style={styles.telegramHealthError}
                title={telegramHealth.latestFailureError}
              >
                {telegramHealth.latestFailureError}
              </span>
            ) : null}
          </div>

          <div style={styles.telegramHealthItem}>
            <span style={styles.telegramHealthLabel}>
              Tiempo medio de entrega
            </span>
            <strong style={styles.telegramHealthValue}>
              {telegramHealth.averageDelivery}
            </strong>
          </div>
        </div>

        <div style={styles.liveTelegramSection}>
          <div style={styles.liveTelegramHeader}>
            <div>
              <strong style={styles.liveTelegramTitle}>
                Diagnóstico en vivo
              </strong>
              <span style={styles.telegramHealthSubtitle}>
                El estado no incluye ni expone credenciales
              </span>
            </div>

            <button
              type="button"
              disabled={isCheckingTelegram}
              onClick={() => {
                void checkTelegram();
              }}
              style={{
                ...styles.checkTelegramButton,
                ...(isCheckingTelegram
                  ? styles.checkTelegramButtonDisabled
                  : {}),
              }}
            >
              {isCheckingTelegram
                ? "Comprobando..."
                : "Comprobar Telegram"}
            </button>
          </div>

          <div style={styles.liveTelegramGrid}>
            <div style={styles.liveTelegramDatum}>
              <span style={styles.telegramHealthLabel}>
                Estado en vivo
              </span>
              <strong style={styles.telegramHealthValue}>
                {liveStatus}
              </strong>
            </div>

            <div style={styles.liveTelegramDatum}>
              <span style={styles.telegramHealthLabel}>
                Credenciales
              </span>
              <span style={styles.liveTelegramCredential}>
                Token:{" "}
                {liveTelegramHealth
                  ? liveTelegramHealth.tokenConfigured
                    ? "configurado"
                    : "no configurado"
                  : "—"}
              </span>
              <span style={styles.liveTelegramCredential}>
                Chat ID:{" "}
                {liveTelegramHealth
                  ? liveTelegramHealth.chatIdConfigured
                    ? "configurado"
                    : "no configurado"
                  : "—"}
              </span>
            </div>

            <div style={styles.liveTelegramDatum}>
              <span style={styles.telegramHealthLabel}>
                Última comprobación
              </span>
              <strong style={styles.telegramHealthValue}>
                {liveCheckedAt}
              </strong>
            </div>
          </div>

          {lastCheckWasTest &&
          liveTelegramHealth?.ok &&
          !liveTelegramHealth.skipped ? (
            <span style={styles.liveTelegramSuccess}>
              Prueba enviada correctamente a Telegram.
            </span>
          ) : null}

          {lastCheckWasTest && liveTelegramHealth?.skipped ? (
            <span style={styles.liveTelegramNotice}>
              La prueba se omitió porque Telegram está deshabilitado.
            </span>
          ) : null}

          {liveTelegramError ? (
            <span style={styles.liveTelegramError}>
              {liveTelegramError}
            </span>
          ) : null}
        </div>
      </section>

      <div style={styles.contentGrid}>
        <div style={styles.activityPanel}>
          {filteredNotifications.length > 0 ? (
            <div style={styles.activityList}>
              {filteredNotifications.map((notification) => (
                <ActivityItem
                  key={notification.id}
                  notification={notification}
                  now={now}
                  auditExpanded={expandedAuditIds.has(
                    notification.id,
                  )}
                  onToggleAudit={toggleNotificationAudit}
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

  activityTitleRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
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
    flex: "1 1 180px",
    minWidth: 0,
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

  priorityMetricsSection: {
    display: "grid",
    gap: 8,
  },

  priorityMetricsTitle: {
    color: "#7d8894",
    fontSize: 9,
    fontWeight: 750,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },

  priorityMetrics: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(min(100%, 110px), 1fr))",
    gap: 8,
  },

  priorityMetric: {
    display: "grid",
    gridTemplateColumns: "auto auto minmax(0, 1fr)",
    alignItems: "center",
    gap: 7,
    minHeight: 43,
    padding: "7px 10px",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 11,
    background: "rgba(5,8,12,0.26)",
    color: "#e2e7ec",
    textAlign: "left",
    cursor: "pointer",
  },

  priorityMetricActive: {
    borderColor: "rgba(96,165,250,0.5)",
    background: "rgba(59,130,246,0.12)",
    boxShadow: "inset 0 0 0 1px rgba(96,165,250,0.1)",
  },

  priorityMetricValue: {
    fontSize: 16,
    lineHeight: 1,
  },

  priorityMetricLabel: {
    overflow: "hidden",
    color: "#8994a0",
    fontSize: 9,
    fontWeight: 700,
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },

  telegramHealth: {
    display: "grid",
    gap: 11,
    padding: 14,
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 15,
    background: "rgba(5,8,12,0.24)",
  },

  telegramHealthHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  telegramHealthTitle: {
    display: "block",
    fontSize: 12,
    lineHeight: 1.3,
  },

  telegramHealthSubtitle: {
    display: "block",
    marginTop: 3,
    color: "#707b87",
    fontSize: 9,
    lineHeight: 1.4,
  },

  telegramHealthGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(min(100%, 145px), 1fr))",
    gap: 8,
  },

  telegramHealthItem: {
    display: "grid",
    alignContent: "start",
    gap: 5,
    minHeight: 68,
    padding: "10px 11px",
    border: "1px solid rgba(255,255,255,0.055)",
    borderRadius: 11,
    background: "rgba(255,255,255,0.025)",
  },

  telegramHealthLabel: {
    color: "#77828e",
    fontSize: 9,
    fontWeight: 700,
    lineHeight: 1.35,
  },

  telegramHealthValue: {
    color: "#e2e7ec",
    fontSize: 12,
    lineHeight: 1.35,
  },

  telegramHealthOk: {
    color: "#6ee7b7",
  },

  telegramHealthIssue: {
    color: "#fca5a5",
  },

  telegramHealthUnknown: {
    color: "#a8b1bb",
  },

  telegramHealthError: {
    display: "-webkit-box",
    overflow: "hidden",
    color: "#d88f8f",
    fontSize: 9,
    lineHeight: 1.35,
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },

  liveTelegramSection: {
    display: "grid",
    gap: 10,
    paddingTop: 12,
    borderTop: "1px solid rgba(255,255,255,0.065)",
  },

  liveTelegramHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },

  liveTelegramTitle: {
    display: "block",
    fontSize: 11,
    lineHeight: 1.35,
  },

  checkTelegramButton: {
    minHeight: 30,
    padding: "0 10px",
    border: "1px solid rgba(96,165,250,0.28)",
    borderRadius: 9,
    background: "rgba(59,130,246,0.1)",
    color: "#9bc5f8",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
  },

  checkTelegramButtonDisabled: {
    borderColor: "rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.035)",
    color: "#68737f",
    cursor: "default",
  },

  liveTelegramGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
    gap: 8,
  },

  liveTelegramDatum: {
    display: "grid",
    alignContent: "start",
    gap: 4,
    minHeight: 58,
    padding: "9px 10px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.02)",
  },

  liveTelegramCredential: {
    color: "#b2bbc4",
    fontSize: 10,
    lineHeight: 1.35,
  },

  liveTelegramSuccess: {
    color: "#6ee7b7",
    fontSize: 10,
    lineHeight: 1.4,
  },

  liveTelegramNotice: {
    color: "#c8b77c",
    fontSize: 10,
    lineHeight: 1.4,
  },

  liveTelegramError: {
    color: "#fca5a5",
    fontSize: 10,
    lineHeight: 1.4,
    overflowWrap: "anywhere",
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
